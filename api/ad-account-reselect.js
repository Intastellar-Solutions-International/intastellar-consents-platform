/**
 * GET /api/ad-account-reselect?platform=google_ads&domain=example.com&org=123
 *
 * For connections that already have a stored access_token but no account_id selected.
 * Uses the stored token to list accessible ad accounts, creates a pending_ad_connections
 * record, and returns { pendingId } so the client can open the existing account picker.
 *
 * Required headers: Authorization: Bearer <token>, Organisation: <org_id>
 * Required env vars (microsoft_ads only): MICROSOFT_ADS_DEVELOPER_TOKEN
 */

import pkg from "pg";
const { Pool } = pkg;
import { fetchMicrosoftAdsAccounts } from "./_ad-platform-fetch.js";

let pool;
function getPool() {
    if (!pool) {
        pool = new Pool({
            connectionString: process.env.POSTGRES_URL,
            ssl: { rejectUnauthorized: false },
            max: 3,
        });
    }
    return pool;
}

function validateJwt(authHeader) {
    const match = (authHeader || "").match(/^Bearer\s+(.+)$/i);
    if (!match) return null;
    try {
        const decoded = Buffer.from(match[1], "base64").toString("utf8");
        const parts = decoded.split(".");
        if (parts.length !== 3) return null;
        const payload = JSON.parse(Buffer.from(parts[1], "base64").toString("utf8"));
        const now = Math.floor(Date.now() / 1000);
        const iss = payload.iss ?? "";
        if (iss === "Intastellar Account") {
            if ((payload.nbf && payload.nbf > now) || (payload.exp && payload.exp < now)) return null;
        } else if (iss === "Intastellar Cron") {
            if (payload.sub !== "cron_scan_domains" || (payload.exp && payload.exp < now)) return null;
        } else {
            return null;
        }
        return payload;
    } catch { return null; }
}

const ALLOWED_ORIGINS = [
    "https://www.intastellarconsents.com",
    "https://www.consentsmanagement.com",
    "https://consentsplatform.com",
    "http://localhost:8080",
    "http://localhost:3000",
];

function setCors(req, res) {
    const origin = req.headers.origin || "";
    if (ALLOWED_ORIGINS.includes(origin)) res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Authorization,Organisation,Content-Type");
}

async function ensurePendingTable(db) {
    await db.query(`
        CREATE TABLE IF NOT EXISTS pending_ad_connections (
            id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
            organisation_id  INTEGER     NOT NULL,
            domain           TEXT        NOT NULL,
            platform         TEXT        NOT NULL,
            accounts         JSONB       NOT NULL DEFAULT '[]',
            access_token     TEXT        NOT NULL,
            refresh_token    TEXT,
            token_expires_at TIMESTAMPTZ,
            scopes           TEXT,
            created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            expires_at       TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '15 minutes'
        )
    `);
}

async function fetchAllAccounts(platform, accessToken) {
    switch (platform) {
            case "google_ads": {
                const devToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN || "";

                const gadsSearch = (customerId, query, loginCustomerId) => {
                    const headers = {
                        Authorization: `Bearer ${accessToken}`,
                        "developer-token": devToken,
                        "Content-Type": "application/json",
                    };
                    if (loginCustomerId) headers["login-customer-id"] = String(loginCustomerId);
                    return fetch(
                        `https://googleads.googleapis.com/v25/customers/${customerId}/googleAds:search`,
                        { method: "POST", headers, body: JSON.stringify({ query }) }
                    ).then(r => r.json()).catch(() => ({ results: [] }));
                };

                const listResp = await fetch(
                    "https://googleads.googleapis.com/v25/customers:listAccessibleCustomers",
                    { headers: { Authorization: `Bearer ${accessToken}`, "developer-token": devToken } }
                );
                if (!listResp.ok) {
                    const body = await listResp.text().catch(() => "");
                    throw new Error(`Google Ads API ${listResp.status}: ${body.slice(0, 300)}`);
                }
                const listData = await listResp.json();
                const resourceNames = listData.resourceNames || [];
                if (resourceNames.length === 0) return [];

                const ids = resourceNames.slice(0, 30).map(r => r.replace("customers/", ""));

                const infoResults = await Promise.allSettled(ids.map(id =>
                    gadsSearch(id, "SELECT customer.id, customer.descriptive_name, customer.manager, customer.currency_code FROM customer LIMIT 1")
                ));

                const accounts = [];
                const seen = new Set();

                await Promise.allSettled(ids.map(async (id, i) => {
                    const res = infoResults[i];
                    const row = res.status === "fulfilled" ? res.value?.results?.[0]?.customer : null;
                    const name = row?.descriptiveName || `Account ${id}`;
                    const isManager = row?.manager === true;
                    const currency = row?.currencyCode || null;

                    if (!isManager) {
                        if (!seen.has(id)) {
                            seen.add(id);
                            accounts.push({ id, name, currency });
                        }
                    } else {
                        const subResp = await gadsSearch(
                            id,
                            "SELECT customer_client.client_customer, customer_client.descriptive_name, customer_client.manager, customer_client.status, customer_client.currency_code FROM customer_client WHERE customer_client.status = 'ENABLED' AND customer_client.manager = FALSE",
                            id
                        ).catch(() => ({ results: [] }));

                        const subClients = subResp.results || [];
                        if (subClients.length > 0) {
                            for (const subRow of subClients) {
                                const client = subRow.customerClient;
                                if (!client) continue;
                                const clientId = String(client.clientCustomer || "").replace("customers/", "");
                                if (!clientId || seen.has(clientId)) continue;
                                seen.add(clientId);
                                accounts.push({
                                    id: clientId,
                                    name: `${client.descriptiveName || `Account ${clientId}`} (via ${name})`,
                                    loginCustomerId: id,
                                    currency: client.currencyCode || null,
                                });
                            }
                        } else {
                            if (!seen.has(id)) {
                                seen.add(id);
                                accounts.push({ id, name: `${name} (Manager)`, currency, loginCustomerId: null });
                            }
                        }
                    }
                }));

                return accounts.sort((a, b) => a.name.localeCompare(b.name));
            }

            case "meta_ads": {
                const resp = await fetch(
                    "https://graph.facebook.com/v26.0/me/adaccounts?fields=id,name,account_status&limit=50",
                    { headers: { Authorization: `Bearer ${accessToken}` } }
                );
                if (!resp.ok) return [];
                const data = await resp.json();
                return (data.data || []).map(a => ({
                    id: a.id,
                    name: a.name || a.id,
                    status: a.account_status === 1 ? "active" : "inactive",
                }));
            }

            case "linkedin_ads": {
                const resp = await fetch(
                    "https://api.linkedin.com/rest/adAccounts?q=search&count=50",
                    { headers: { Authorization: `Bearer ${accessToken}`, "LinkedIn-Version": "202406" } }
                );
                if (!resp.ok) return [];
                const data = await resp.json();
                return (data.elements || []).map(a => ({
                    id: String(a.id),
                    name: a.name || `Account ${a.id}`,
                    status: a.status || "",
                }));
            }

            case "microsoft_ads":
                return await fetchMicrosoftAdsAccounts(accessToken);

            default:
                return [];
    }
}

export default async function handler(req, res) {
    setCors(req, res);
    if (req.method === "OPTIONS") return res.status(204).end();

    const jwt = validateJwt(req.headers.authorization || "");
    if (!jwt) return res.status(401).json({ error: "Unauthorized" });

    const orgId = parseInt(
        req.headers.organisation || req.headers.organization || req.query.org || "0", 10
    );
    if (!orgId) return res.status(400).json({ error: "Organisation header or ?org param required" });

    const db = getPool();

    if (req.method === "POST") {
        const { platform, domain, accountId, accountLabel } = req.body || {};
        if (!platform || !domain || !accountId) {
            return res.status(400).json({ error: "platform, domain, and accountId are required" });
        }

        let tokenRow = null;
        const { rows: fr } = await db.query(
            `SELECT access_token, refresh_token, token_expires_at, scopes
             FROM ad_platform_connections
             WHERE organisation_id=$1 AND domain=$2 AND platform=$3 AND access_token IS NOT NULL`,
            [orgId, domain, platform]
        );
        if (fr.length) {
            tokenRow = fr[0];
        } else {
            const { rows: pr } = await db.query(
                `SELECT access_token, refresh_token, token_expires_at, scopes
                 FROM pending_ad_connections
                 WHERE organisation_id=$1 AND domain=$2 AND platform=$3
                 ORDER BY created_at DESC LIMIT 1`,
                [orgId, domain, platform]
            );
            if (pr.length) tokenRow = pr[0];
        }

        if (!tokenRow) {
            return res.status(404).json({ error: "No stored token. Please reconnect via OAuth first." });
        }

        const cleanId = String(accountId).replace(/\D/g, "");
        await db.query(`
            INSERT INTO ad_platform_connections
                (organisation_id, domain, platform, account_id, account_label,
                 access_token, refresh_token, token_expires_at, scopes)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
            ON CONFLICT (organisation_id, domain, platform) DO UPDATE SET
                account_id        = EXCLUDED.account_id,
                account_label     = EXCLUDED.account_label,
                access_token      = EXCLUDED.access_token,
                refresh_token     = COALESCE(EXCLUDED.refresh_token, ad_platform_connections.refresh_token),
                token_expires_at  = EXCLUDED.token_expires_at,
                scopes            = EXCLUDED.scopes,
                updated_at        = NOW()
        `, [orgId, domain, platform, cleanId, accountLabel || cleanId,
            tokenRow.access_token, tokenRow.refresh_token,
            tokenRow.token_expires_at, tokenRow.scopes]);

        return res.status(200).json({ ok: true, accountId: cleanId });
    }

    if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

    const { platform, domain } = req.query;
    if (!platform || !domain) return res.status(400).json({ error: "platform and domain are required" });

    // Look in finalized connections first, fall back to pending_ad_connections
    // (pending is where the token lives when accounts=[] was stored during OAuth callback)
    let tokenRow = null;

    const { rows: finalizedRows } = await db.query(
        `SELECT access_token, refresh_token, token_expires_at, scopes
         FROM ad_platform_connections
         WHERE organisation_id=$1 AND domain=$2 AND platform=$3 AND access_token IS NOT NULL`,
        [orgId, domain, platform]
    );
    if (finalizedRows.length) {
        tokenRow = finalizedRows[0];
    } else {
        const { rows: pendingRows } = await db.query(
            `SELECT access_token, refresh_token, token_expires_at, scopes
             FROM pending_ad_connections
             WHERE organisation_id=$1 AND domain=$2 AND platform=$3
             ORDER BY created_at DESC LIMIT 1`,
            [orgId, domain, platform]
        );
        if (pendingRows.length) tokenRow = pendingRows[0];
    }

    if (!tokenRow) {
        return res.status(404).json({ error: "No stored token found. Please reconnect via OAuth." });
    }

    const { access_token, refresh_token, token_expires_at, scopes } = tokenRow;

    let accounts;
    try {
        accounts = await fetchAllAccounts(platform, access_token);
    } catch (err) {
        return res.status(502).json({ error: err.message });
    }

    if (!accounts.length) {
        return res.status(200).json({ accounts: [], pendingId: null, message: "No ad accounts found on this Google login. The token may be expired — try reconnecting." });
    }

    await ensurePendingTable(db);
    const { rows: pending } = await db.query(
        `INSERT INTO pending_ad_connections
            (organisation_id, domain, platform, accounts, access_token, refresh_token, token_expires_at, scopes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         RETURNING id`,
        [orgId, domain, platform, JSON.stringify(accounts),
         access_token, refresh_token, token_expires_at, scopes]
    );

    return res.status(200).json({ pendingId: pending[0].id, accounts });
}
