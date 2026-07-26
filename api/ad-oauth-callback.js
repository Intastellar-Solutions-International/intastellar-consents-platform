/**
 * GET /api/ad-oauth-callback?code=...&state=...
 *
 * Called by OAuth providers after the user grants (or denies) access.
 * Validates state, exchanges the code for tokens, fetches ALL accessible
 * ad accounts, stores them in a short-lived pending record, then redirects
 * the user to the account picker UI.
 *
 * Required env vars: same as ad-oauth-start.js plus POSTGRES_URL
 */

import pkg from "pg";
const { Pool } = pkg;
import { createHmac } from "crypto";

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

const REDIRECT_URI = process.env.OAUTH_REDIRECT_URI
    || "https://www.intastellarconsents.com/api/ad-oauth-callback";

const APP_BASE = "https://www.intastellarconsents.com";

function verifyState(state) {
    try {
        if (!state || !state.includes(".")) return null;
        const lastDot = state.lastIndexOf(".");
        const encoded = state.slice(0, lastDot);
        const sig = state.slice(lastDot + 1);
        const secret = process.env.OAUTH_STATE_SECRET || "changeme-set-OAUTH_STATE_SECRET-in-env";
        const expected = createHmac("sha256", secret).update(encoded).digest("hex").slice(0, 16);
        if (sig !== expected) return null;
        return JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    } catch { return null; }
}

async function exchangeCode(platform, code) {
    let url, clientId, clientSecret;
    switch (platform) {
        case "google_ads":
            url = "https://oauth2.googleapis.com/token";
            clientId = process.env.GOOGLE_CLIENT_ID;
            clientSecret = process.env.GOOGLE_CLIENT_SECRET;
            break;
        case "meta_ads":
            url = "https://graph.facebook.com/v18.0/oauth/access_token";
            clientId = process.env.META_ADS_CLIENT_ID;
            clientSecret = process.env.META_ADS_CLIENT_SECRET;
            break;
        case "linkedin_ads":
            url = "https://www.linkedin.com/oauth/v2/accessToken";
            clientId = process.env.LINKEDIN_ADS_CLIENT_ID;
            clientSecret = process.env.LINKEDIN_ADS_CLIENT_SECRET;
            break;
        case "microsoft_ads":
            url = "https://login.microsoftonline.com/common/oauth2/v2.0/token";
            clientId = process.env.MICROSOFT_ADS_CLIENT_ID;
            clientSecret = process.env.MICROSOFT_ADS_CLIENT_SECRET;
            break;
        default:
            throw new Error(`Unknown platform: ${platform}`);
    }
    if (!clientId || !clientSecret) throw new Error(`${platform} credentials not configured on server`);

    const body = new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: REDIRECT_URI,
        grant_type: "authorization_code",
    });

    const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
    });
    const data = await resp.json();
    if (!resp.ok || data.error) throw new Error(data.error_description || data.error || `Token exchange failed (${resp.status})`);
    return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token || null,
        expiresIn: data.expires_in || null,
        scope: data.scope || null,
    };
}

// Returns [{ id, name, loginCustomerId?, currency? }] for all accessible ad accounts on the platform.
async function fetchAllAccounts(platform, accessToken) {
    try {
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
                        `https://googleads.googleapis.com/v18/customers/${customerId}/googleAds:search`,
                        { method: "POST", headers, body: JSON.stringify({ query }) }
                    ).then(r => r.json()).catch(() => ({ results: [] }));
                };

                const listResp = await fetch(
                    "https://googleads.googleapis.com/v18/customers:listAccessibleCustomers",
                    { headers: { Authorization: `Bearer ${accessToken}`, "developer-token": devToken } }
                );
                if (!listResp.ok) return [];
                const listData = await listResp.json();
                const resourceNames = listData.resourceNames || [];
                if (resourceNames.length === 0) return [];

                const ids = resourceNames.slice(0, 30).map(r => r.replace("customers/", ""));

                // Fetch customer info for all top-level IDs
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
                        // Direct client account — queryable without login-customer-id
                        if (!seen.has(id)) {
                            seen.add(id);
                            accounts.push({ id, name, currency });
                        }
                    } else {
                        // Manager (MCC) account — expand to sub-clients
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
                                const clientName = client.descriptiveName || `Account ${clientId}`;
                                accounts.push({
                                    id: clientId,
                                    name: `${clientName} (via ${name})`,
                                    loginCustomerId: id,
                                    currency: client.currencyCode || null,
                                });
                            }
                        } else {
                            // No sub-clients found (or query failed) — include the manager itself as fallback
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
                    "https://graph.facebook.com/v18.0/me/adaccounts?fields=id,name,account_status&limit=50",
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

            case "microsoft_ads": {
                // Microsoft Ads uses a SOAP API; token is valid — let the user confirm manually
                return [{ id: "default", name: "Microsoft Ads (confirm in dashboard)" }];
            }

            default:
                return [];
        }
    } catch (err) {
        console.error("[fetchAllAccounts]", platform, err.message);
        return [];
    }
}

async function ensureConnectionTable(db) {
    await db.query(`
        CREATE TABLE IF NOT EXISTS ad_platform_connections (
            id               SERIAL      PRIMARY KEY,
            organisation_id  INTEGER     NOT NULL,
            domain           TEXT        NOT NULL,
            platform         TEXT        NOT NULL,
            account_id       TEXT,
            account_label    TEXT,
            login_customer_id TEXT,
            account_currency TEXT,
            access_token     TEXT,
            refresh_token    TEXT,
            token_expires_at TIMESTAMPTZ,
            scopes           TEXT,
            created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE (organisation_id, domain, platform)
        )
    `);
    // Add new columns to existing tables if upgrading from older schema
    await db.query(`ALTER TABLE ad_platform_connections ADD COLUMN IF NOT EXISTS login_customer_id TEXT`).catch(() => {});
    await db.query(`ALTER TABLE ad_platform_connections ADD COLUMN IF NOT EXISTS account_currency TEXT`).catch(() => {});
}

async function saveConnection(db, { orgId, domain, platform, accountId, accountLabel, loginCustomerId, currency, accessToken, refreshToken, expiresAt, scope }) {
    await db.query(
        `INSERT INTO ad_platform_connections
            (organisation_id, domain, platform, account_id, account_label, login_customer_id, account_currency, access_token, refresh_token, token_expires_at, scopes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         ON CONFLICT (organisation_id, domain, platform) DO UPDATE SET
            account_id        = EXCLUDED.account_id,
            account_label     = EXCLUDED.account_label,
            login_customer_id = EXCLUDED.login_customer_id,
            account_currency  = EXCLUDED.account_currency,
            access_token      = EXCLUDED.access_token,
            refresh_token     = COALESCE(EXCLUDED.refresh_token, ad_platform_connections.refresh_token),
            token_expires_at  = EXCLUDED.token_expires_at,
            scopes            = EXCLUDED.scopes,
            updated_at        = NOW()`,
        [orgId, domain, platform, accountId, accountLabel,
         loginCustomerId || null, currency || null,
         accessToken, refreshToken, expiresAt, scope]
    );
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

export default async function handler(req, res) {
    if (req.method !== "GET") return res.status(405).send("Method not allowed");

    const { code, state, error } = req.query;
    const stateData = state ? verifyState(state) : null;
    const platform = stateData?.platform || "";
    const domain = stateData?.domain || "";
    const orgId = stateData?.orgId;
    const returnPath = stateData?.returnPath || "";

    const returnBase = returnPath
        ? `${APP_BASE}${returnPath}`
        : `${APP_BASE}/settings/ad-connections`;

    if (error || !code || !stateData || !platform || !domain || !orgId) {
        const msg = error || "oauth_failed";
        return res.redirect(302, `${returnBase}?oauth_error=${encodeURIComponent(msg)}&platform=${encodeURIComponent(platform)}`);
    }

    try {
        const tokens = await exchangeCode(platform, code);
        const accounts = await fetchAllAccounts(platform, tokens.accessToken);
        const expiresAt = tokens.expiresIn
            ? new Date(Date.now() + tokens.expiresIn * 1000).toISOString()
            : null;

        const db = getPool();
        await ensurePendingTable(db);

        // If only one account, skip picker and save directly
        if (accounts.length === 1) {
            await ensureConnectionTable(db);
            const acc = accounts[0];
            await saveConnection(db, {
                orgId, domain, platform,
                accountId: acc.id,
                accountLabel: acc.name,
                loginCustomerId: acc.loginCustomerId || null,
                currency: acc.currency || null,
                accessToken: tokens.accessToken,
                refreshToken: tokens.refreshToken,
                expiresAt,
                scope: tokens.scope,
            });
            return res.redirect(302,
                `${returnBase}?oauth_success=${encodeURIComponent(platform)}&oauth_domain=${encodeURIComponent(domain)}`
            );
        }

        // Multiple accounts → save pending and redirect to picker
        const { rows } = await db.query(
            `INSERT INTO pending_ad_connections
                (organisation_id, domain, platform, accounts, access_token, refresh_token, token_expires_at, scopes)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
             RETURNING id`,
            [orgId, domain, platform, JSON.stringify(accounts),
             tokens.accessToken, tokens.refreshToken, expiresAt, tokens.scope]
        );
        const pendingId = rows[0].id;

        return res.redirect(302,
            `${returnBase}?select_account=${pendingId}&platform=${encodeURIComponent(platform)}&domain=${encodeURIComponent(domain)}`
        );
    } catch (err) {
        console.error("[ad-oauth-callback]", platform, err.message);
        return res.redirect(302,
            `${returnBase}?oauth_error=${encodeURIComponent(err.message)}&platform=${encodeURIComponent(platform)}`
        );
    }
}
