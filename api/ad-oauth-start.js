/**
 * GET /api/ad-oauth-start?platform=google_ads&domain=example.com&org=123&returnPath=/path
 *
 * 302-redirects to the OAuth provider login page.
 * No JWT required — security is provided by the HMAC-signed state param,
 * which the callback endpoint verifies before storing any tokens.
 *
 * Required env vars (one set per platform):
 *   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
 *   META_ADS_CLIENT_ID,   META_ADS_CLIENT_SECRET
 *   LINKEDIN_CLIENT_ID, LINKEDIN_CLIENT_SECRET
 *   MICROSOFT_ADS_CLIENT_ID, MICROSOFT_ADS_CLIENT_SECRET
 *   OAUTH_STATE_SECRET   — shared HMAC secret
 *   OAUTH_REDIRECT_URI   — defaults to https://www.intastellarconsents.com/api/ad-oauth-callback
 */

import { createHmac, randomBytes } from "crypto";

const REDIRECT_URI = process.env.OAUTH_REDIRECT_URI
    || "https://www.intastellarconsents.com/api/ad-oauth-callback";

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
            const clientId = process.env.GOOGLE_CLIENT_ID;
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
            const clientId = process.env.LINKEDIN_CLIENT_ID;
            if (!clientId) return null;
            const scope = encodeURIComponent("r_ads r_ads_reporting");
            return `https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id=${encodeURIComponent(clientId)}&redirect_uri=${redirectUri}&scope=${scope}&state=${state}`;
        }
        case "google_analytics": {
            const clientId = process.env.GOOGLE_CLIENT_ID;
            if (!clientId) return null;
            const scope = encodeURIComponent("https://www.googleapis.com/auth/analytics.readonly");
            return `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(clientId)}&redirect_uri=${redirectUri}&response_type=code&scope=${scope}&state=${state}&access_type=offline&prompt=consent`;
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

    const { platform, domain, returnPath, org } = req.query;
    if (!platform || !domain) return res.status(400).json({ error: "platform and domain are required" });

    const orgId = parseInt(org || req.headers.organisation || req.headers.organization || "0", 10);
    if (!orgId) return res.status(400).json({ error: "org param is required" });

    // The orgId is embedded in an HMAC-signed state — the callback verifies
    // the signature, so no JWT validation is needed at this step.
    const state = buildState({ platform, domain, orgId, returnPath: returnPath || "" });
    const authUrl = buildAuthUrl(platform, state);

    if (!authUrl) {
        return res.status(503).json({ error: `${platform} OAuth is not configured on this server` });
    }

    return res.status(200).json({ authUrl });
}
