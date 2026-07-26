/**
 * GET /api/ad-oauth-start?platform=google_ads&domain=example.com&returnPath=/gdpr/reports/view/example.com/reconcile
 *
 * Returns { authUrl } — the frontend redirects the user there to authorise.
 *
 * Required headers: Authorization: Bearer <token>, Organisation: <org_id>
 *
 * Required env vars (one set per platform you want to support):
 *   GOOGLE_ADS_CLIENT_ID, GOOGLE_ADS_CLIENT_SECRET
 *   META_ADS_CLIENT_ID,   META_ADS_CLIENT_SECRET
 *   LINKEDIN_ADS_CLIENT_ID, LINKEDIN_ADS_CLIENT_SECRET
 *   MICROSOFT_ADS_CLIENT_ID, MICROSOFT_ADS_CLIENT_SECRET
 *   OAUTH_STATE_SECRET   — shared secret for HMAC-signed state param
 *   OAUTH_REDIRECT_URI   — defaults to https://www.intastellarconsents.com/api/ad-oauth-callback
 *
 * OAuth app registration:
 *   Each platform requires a registered OAuth 2.0 application. Set the
 *   Redirect URI in each platform's developer console to the value of
 *   OAUTH_REDIRECT_URI.
 */

import { createHmac, randomBytes } from "crypto";

const REDIRECT_URI = process.env.OAUTH_REDIRECT_URI
    || "https://www.intastellarconsents.com/api/ad-oauth-callback";

function validateJwt(authHeader) {
    const match = (authHeader || "").match(/^Bearer\s+(.+)$/i);
    if (!match) return null;
    try {
        const parts = match[1].split(".");
        if (parts.length !== 3) return null;
        const payload = JSON.parse(Buffer.from(parts[1], "base64").toString("utf8"));
        const now = Math.floor(Date.now() / 1000);
        if (payload.iss !== "Intastellar Account" || (payload.nbf || 0) > now || (payload.exp || 0) < now) return null;
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

function buildState({ platform, domain, orgId, returnPath }) {
    const nonce = randomBytes(12).toString("hex");
    const data = JSON.stringify({ platform, domain, orgId, returnPath, nonce });
    const encoded = Buffer.from(data).toString("base64url");
    const secret = process.env.OAUTH_STATE_SECRET || "changeme-set-OAUTH_STATE_SECRET-in-env";
    const sig = createHmac("sha256", secret).update(encoded).digest("hex").slice(0, 16);
    return `${encoded}.${sig}`;
}

function buildAuthUrl(platform, state) {
    const redirectUri = encodeURIComponent(REDIRECT_URI);

    switch (platform) {
        case "google_ads": {
            const clientId = process.env.GOOGLE_ADS_CLIENT_ID;
            if (!clientId) return null;
            const scope = encodeURIComponent("https://www.googleapis.com/auth/adwords");
            return `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(clientId)}&redirect_uri=${redirectUri}&response_type=code&scope=${scope}&state=${state}&access_type=offline&prompt=consent`;
        }
        case "meta_ads": {
            const clientId = process.env.META_ADS_CLIENT_ID;
            if (!clientId) return null;
            const scope = encodeURIComponent("ads_read,ads_management");
            return `https://www.facebook.com/v18.0/dialog/oauth?client_id=${encodeURIComponent(clientId)}&redirect_uri=${redirectUri}&scope=${scope}&state=${state}`;
        }
        case "linkedin_ads": {
            const clientId = process.env.LINKEDIN_ADS_CLIENT_ID;
            if (!clientId) return null;
            const scope = encodeURIComponent("r_ads_reporting r_organization_social");
            return `https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id=${encodeURIComponent(clientId)}&redirect_uri=${redirectUri}&scope=${scope}&state=${state}`;
        }
        case "microsoft_ads": {
            const clientId = process.env.MICROSOFT_ADS_CLIENT_ID;
            if (!clientId) return null;
            const scope = encodeURIComponent("https://ads.microsoft.com/msads.manage offline_access");
            return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=${encodeURIComponent(clientId)}&response_type=code&redirect_uri=${redirectUri}&scope=${scope}&state=${state}`;
        }
        default:
            return null;
    }
}

export default async function handler(req, res) {
    setCors(req, res);
    if (req.method === "OPTIONS") return res.status(204).end();
    if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

    // Accept JWT from Authorization header OR ?token query param (direct-link mode)
    const jwt = validateJwt(req.headers.authorization)
        || validateJwt(req.query.token ? `Bearer ${req.query.token}` : "");
    if (!jwt) return res.status(401).json({ error: "Unauthorized" });

    // Accept org from header OR ?org query param
    const orgId = parseInt(
        req.headers.organisation || req.headers.organization || req.query.org || "0", 10
    );
    if (!orgId) return res.status(400).json({ error: "Organisation header or ?org param required" });

    const { platform, domain, returnPath } = req.query;
    if (!platform || !domain) return res.status(400).json({ error: "platform and domain are required" });

    const state = buildState({ platform, domain, orgId, returnPath: returnPath || "" });
    const authUrl = buildAuthUrl(platform, state);

    if (!authUrl) {
        const errBase = returnPath
            ? `${REDIRECT_URI.replace("/api/ad-oauth-callback", "")}${returnPath}`
            : `${REDIRECT_URI.replace("/api/ad-oauth-callback", "")}/settings/ad-connections`;
        // In direct-link mode, redirect back with error instead of returning JSON
        if (req.query.token) {
            return res.redirect(302,
                `${errBase}?oauth_error=${encodeURIComponent(`${platform} OAuth credentials are not configured on the server`)}&platform=${encodeURIComponent(platform)}`
            );
        }
        return res.status(503).json({
            error: `${platform} OAuth is not configured on this server. Set the required environment variables.`,
            missingConfig: true,
        });
    }

    // Direct-link mode (token in query param): redirect immediately to OAuth provider
    if (req.query.token) {
        return res.redirect(302, authUrl);
    }

    // Fetch mode (token in Authorization header): return JSON so the client can redirect
    return res.status(200).json({ authUrl });
}
