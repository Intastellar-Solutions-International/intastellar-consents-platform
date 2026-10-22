/**
 * GET/POST /api/cron-ad-conversion-push
 *
 * Vercel cron — drains analytics_conversion_pushes (queued by api/a.js whenever
 * a tracked conversion event arrives with a gclid/msclkid/fbclid and the
 * visitor granted Advertisement consent) by pushing each one to the matching
 * ad platform via api/ad-conversion-push.js's processPendingPushes().
 *
 * Without this, conversions queue into analytics_conversion_pushes but nothing
 * automatically sends them — they'd only go out if someone manually POSTed
 * /api/ad-conversion-push for their own org.
 *
 * Two auth modes (mirrors cron-ad-sync.js):
 *   1. Vercel cron: Authorization: Bearer <CRON_SECRET>  — sweeps every org.
 *   2. Manual trigger from the dashboard: Authorization: Bearer <JWT> +
 *      Organisation header + optional ?domain= — scoped to the caller's org.
 *
 * Required env vars:
 *   CRON_SECRET            — Vercel sends this automatically
 *   GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET       — Google Ads token refresh
 *   MICROSOFT_ADS_CLIENT_ID / MICROSOFT_ADS_CLIENT_SECRET — Microsoft Ads token refresh
 *
 * Optional env vars:
 *   CRON_AD_CONVERSION_PUSH_LIMIT — max rows per run (default 300, cap 1000)
 *
 * NOTE ON SCHEDULE: vercel.json currently sets this to run hourly. Every other
 * cron in this project runs once daily, which may mean this project is on a
 * Vercel plan that only supports daily cron frequency — if the hourly schedule
 * is rejected at deploy or silently coerced, drop it to a daily "0 * * * *" ->
 * "0 H * * *" slot instead. Conversions still queue correctly either way; a
 * less frequent sweep just means ad platforms see them later.
 */

import { getPool } from "./_db.js";
import { processPendingPushes } from "./ad-conversion-push.js";

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

const DEFAULT_LIMIT = Math.min(
    parseInt(process.env.CRON_AD_CONVERSION_PUSH_LIMIT || "300", 10),
    1000
);

export default async function handler(req, res) {
    if (req.method !== "GET" && req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    const secret = process.env.CRON_SECRET;
    const isCronCall = secret && req.headers.authorization === `Bearer ${secret}`;
    const jwt = !isCronCall ? validateJwt(req.headers.authorization) : null;

    if (!isCronCall && !jwt) {
        return res.status(401).json({ error: "Unauthorized" });
    }

    // Cron sweep: no org filter, drains across every organisation.
    // Manual trigger: scoped to the caller's own org (+ optional domain).
    const orgId  = jwt ? parseInt(req.headers.organisation || "", 10) || null : null;
    const domain = jwt ? (req.query.domain || "").trim().toLowerCase() || null : null;
    const limit  = jwt
        ? Math.min(parseInt(req.query.limit || "50", 10), 100)
        : DEFAULT_LIMIT;

    const db = getPool();
    const result = await processPendingPushes(db, { orgId, domain, limit });

    return res.status(200).json(result);
}
