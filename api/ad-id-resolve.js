/**
 * GET /api/ad-id-resolve?platform=google_ads&id=24162255752&domain=example.com
 * GET /api/ad-id-resolve?platform=meta_ads&id=24162255752&domain=example.com
 *
 * Resolves a numeric platform object ID (from utm_campaign / utm_content
 * ValueTrack / Meta dynamic URL parameters) to a human-readable name.
 *
 * Google Ads: tries campaign → ad group → ad in sequence via GAQL.
 * Meta Ads:   single Graph API node lookup — Meta figures out the type itself.
 *
 * Returns:
 *   { type: "campaign"|"ad_group"|"ad_set"|"ad", id, name, parentName?, campaignName? }
 *
 * Required headers: Authorization: Bearer <token>, Organisation: <org_id>
 */

import pkg from "pg";
const { Pool } = pkg;
import { tryRefreshToken, fetchGoogleAdsObjectById, fetchMetaAdsObjectById, fetchMicrosoftAdsObjectById } from "./_ad-platform-fetch.js";

let pool;
function getPool() {
    if (!pool) {
        pool = new Pool({
            connectionString: process.env.POSTGRES_URL,
            ssl: { rejectUnauthorized: false },
            max: 1,
            idleTimeoutMillis: 10_000,
            connectionTimeoutMillis: 5_000,
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
        if (payload.iss !== "Intastellar Account") return null;
        if ((payload.nbf && payload.nbf > now) || (payload.exp && payload.exp < now)) return null;
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
    res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Authorization,Organisation,Content-Type");
}

const SUPPORTED = new Set(["google_ads", "meta_ads", "microsoft_ads"]);

export default async function handler(req, res) {
    setCors(req, res);
    if (req.method === "OPTIONS") return res.status(204).end();
    if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

    const jwt = validateJwt(req.headers.authorization);
    if (!jwt) return res.status(401).json({ error: "Unauthorized" });

    const orgId = parseInt(req.headers.organisation || req.headers.organization || "", 10);
    if (!orgId) return res.status(400).json({ error: "Organisation header required" });

    const platform = String(req.query.platform || "").trim();
    const id       = String(req.query.id       || "").trim().replace(/\D/g, "");
    const domain   = String(req.query.domain   || "").trim().toLowerCase();

    if (!SUPPORTED.has(platform)) {
        return res.status(400).json({ error: `Unsupported platform "${platform}". Supported: google_ads, meta_ads, microsoft_ads` });
    }
    if (!id)     return res.status(400).json({ error: "id query param required (numeric)" });
    if (!domain) return res.status(400).json({ error: "domain query param required" });

    const db = getPool();
    const { rows } = await db.query(
        `SELECT account_id, login_customer_id, access_token, refresh_token, token_expires_at
         FROM ad_platform_connections
         WHERE organisation_id = $1 AND LOWER(domain) = LOWER($2) AND platform = $3
           AND account_id IS NOT NULL AND access_token IS NOT NULL
         LIMIT 1`,
        [orgId, domain, platform]
    );
    if (!rows.length) {
        return res.status(404).json({ error: `No connected ${platform} account found for ${domain}` });
    }

    let conn = { ...rows[0], platform, organisation_id: orgId, domain };
    try { conn = await tryRefreshToken(db, conn); } catch { /* use existing token */ }

    try {
        const result = platform === "google_ads"
            ? await fetchGoogleAdsObjectById(conn, id)
            : platform === "microsoft_ads"
            ? await fetchMicrosoftAdsObjectById(conn, id)
            : await fetchMetaAdsObjectById(conn, id);

        if (!result) return res.status(404).json({ error: `No object found for id ${id} in ${platform}` });
        return res.status(200).json(result);
    } catch (err) {
        return res.status(502).json({ error: err.message });
    }
}
