/**
 * GET /api/ad-oauth-callback?code=...&state=...
 *
 * Called by OAuth providers after the user grants (or denies) access.
 * Validates state, exchanges the authorisation code for tokens, stores
 * them in the database, then redirects the user back to the reconcile page.
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
            clientId = process.env.GOOGLE_ADS_CLIENT_ID;
            clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET;
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

async function fetchAccountInfo(platform, accessToken) {
    try {
        switch (platform) {
            case "google_ads": {
                const resp = await fetch(
                    "https://googleads.googleapis.com/v18/customers:listAccessibleCustomers",
                    {
                        headers: {
                            Authorization: `Bearer ${accessToken}`,
                            "developer-token": process.env.GOOGLE_ADS_DEVELOPER_TOKEN || "",
                        },
                    }
                );
                if (!resp.ok) return { accountId: null, accountLabel: "Google Ads" };
                const data = await resp.json();
                const firstId = (data.resourceNames?.[0] || "").replace("customers/", "");
                return { accountId: firstId || null, accountLabel: firstId ? `Google Ads (${firstId})` : "Google Ads" };
            }
            case "meta_ads": {
                const resp = await fetch(
                    "https://graph.facebook.com/v18.0/me/adaccounts?fields=id,name&limit=1",
                    { headers: { Authorization: `Bearer ${accessToken}` } }
                );
                if (!resp.ok) return { accountId: null, accountLabel: "Meta Ads" };
                const data = await resp.json();
                const account = data.data?.[0];
                return {
                    accountId: account?.id || null,
                    accountLabel: account?.name ? `${account.name}` : "Meta Ads",
                };
            }
            case "linkedin_ads": {
                const resp = await fetch(
                    "https://api.linkedin.com/rest/adAccounts?q=search&search.status.values[0]=ACTIVE&count=1",
                    { headers: { Authorization: `Bearer ${accessToken}`, "LinkedIn-Version": "202312" } }
                );
                if (!resp.ok) return { accountId: null, accountLabel: "LinkedIn Ads" };
                const data = await resp.json();
                const account = data.elements?.[0];
                return {
                    accountId: account?.id ? String(account.id) : null,
                    accountLabel: account?.name || "LinkedIn Ads",
                };
            }
            case "microsoft_ads":
                return { accountId: null, accountLabel: "Microsoft Ads" };
            default:
                return { accountId: null, accountLabel: platform };
        }
    } catch {
        return { accountId: null, accountLabel: platform.replace(/_/g, " ") };
    }
}

export default async function handler(req, res) {
    if (req.method !== "GET") return res.status(405).send("Method not allowed");

    const { code, state, error } = req.query;
    const stateData = state ? verifyState(state) : null;
    const platform = stateData?.platform || "";
    const domain = stateData?.domain || "";
    const orgId = stateData?.orgId;
    const returnPath = stateData?.returnPath || "";

    const successBase = returnPath
        ? `${APP_BASE}${returnPath}`
        : `${APP_BASE}/reports/reconcile`;

    if (error || !code || !stateData || !platform || !domain || !orgId) {
        const msg = error || "oauth_failed";
        return res.redirect(302, `${successBase}?oauth_error=${encodeURIComponent(msg)}&platform=${encodeURIComponent(platform)}`);
    }

    try {
        const tokens = await exchangeCode(platform, code);
        const { accountId, accountLabel } = await fetchAccountInfo(platform, tokens.accessToken);
        const expiresAt = tokens.expiresIn
            ? new Date(Date.now() + tokens.expiresIn * 1000).toISOString()
            : null;

        const db = getPool();
        // Ensure table exists (may not have been created yet via ad-connections endpoint)
        await db.query(`
            CREATE TABLE IF NOT EXISTS ad_platform_connections (
                id               SERIAL PRIMARY KEY,
                organisation_id  INTEGER NOT NULL,
                domain           TEXT    NOT NULL,
                platform         TEXT    NOT NULL,
                account_id       TEXT,
                account_label    TEXT,
                access_token     TEXT,
                refresh_token    TEXT,
                token_expires_at TIMESTAMPTZ,
                scopes           TEXT,
                created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                UNIQUE (organisation_id, domain, platform)
            )
        `);

        await db.query(
            `INSERT INTO ad_platform_connections
                (organisation_id, domain, platform, account_id, account_label, access_token, refresh_token, token_expires_at, scopes)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
             ON CONFLICT (organisation_id, domain, platform) DO UPDATE SET
                account_id       = EXCLUDED.account_id,
                account_label    = EXCLUDED.account_label,
                access_token     = EXCLUDED.access_token,
                refresh_token    = COALESCE(EXCLUDED.refresh_token, ad_platform_connections.refresh_token),
                token_expires_at = EXCLUDED.token_expires_at,
                scopes           = EXCLUDED.scopes,
                updated_at       = NOW()`,
            [orgId, domain, platform, accountId, accountLabel, tokens.accessToken, tokens.refreshToken, expiresAt, tokens.scope]
        );

        return res.redirect(302,
            `${successBase}?oauth_success=${encodeURIComponent(platform)}&oauth_domain=${encodeURIComponent(domain)}`
        );
    } catch (err) {
        console.error("[ad-oauth-callback]", platform, err.message);
        return res.redirect(302,
            `${successBase}?oauth_error=${encodeURIComponent(err.message)}&platform=${encodeURIComponent(platform)}`
        );
    }
}
