/**
 * Vercel Cron entrypoint: verifies Vercel CRON_SECRET, then triggers the CMP
 * domain classification job on apis.intastellarsolutions.com.
 *
 * Vercel project env (required):
 *   CRON_SECRET              — auto-provided for Cron in production; verify Authorization: Bearer …
 *   DOMAIN_CLASSIFICATION_CRON_TOKEN — must match DOMAIN_CLASSIFICATION_CRON_TOKEN on the PHP host
 *
 * Optional:
 *   DOMAIN_CLASSIFICATION_ENDPOINT — default https://apis.intastellarsolutions.com/cmp/domainClassification
 *   DOMAIN_CLASSIFICATION_FETCH_MS — upstream fetch timeout in ms (default 240000)
 */

const DEFAULT_ENDPOINT = "https://apis.intastellarsolutions.com/cmp/domainClassification";

export default async function handler(req, res) {
    if (req.method !== "GET" && req.method !== "POST") {
        res.setHeader("Allow", "GET, POST");
        return res.status(405).json({ error: "Method not allowed" });
    }

    const secret = process.env.CRON_SECRET;
    const auth = req.headers.authorization || "";
    if (!secret || auth !== `Bearer ${secret}`) {
        return res.status(401).json({ error: "Unauthorized" });
    }

    const remoteToken = process.env.DOMAIN_CLASSIFICATION_CRON_TOKEN || "";
    if (!remoteToken) {
        return res.status(500).json({
            error: "Missing DOMAIN_CLASSIFICATION_CRON_TOKEN (must match PHP DOMAIN_CLASSIFICATION_CRON_TOKEN).",
        });
    }

    const baseUrl = (process.env.DOMAIN_CLASSIFICATION_ENDPOINT || DEFAULT_ENDPOINT).replace(/\/$/, "");
    const url = new URL(baseUrl.includes("://") ? baseUrl : `https://${baseUrl}`);
    url.searchParams.set("cron_token", remoteToken);

    const timeoutMs = Math.min(
        900000,
        Math.max(5000, Number(process.env.DOMAIN_CLASSIFICATION_FETCH_MS) || 240000)
    );
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);

    try {
        const upstream = await fetch(url.toString(), {
            method: "GET",
            headers: {
                Accept: "application/json",
                "X-Cron-Token": remoteToken,
            },
            signal: ac.signal,
        });
        clearTimeout(timer);
        const text = await upstream.text();
        let body;
        try {
            body = text ? JSON.parse(text) : null;
        } catch {
            body = { _nonJson: text.slice(0, 800) };
        }
        return res.status(upstream.ok ? 200 : upstream.status).json({
            ok: upstream.ok,
            upstreamStatus: upstream.status,
            body,
        });
    } catch (e) {
        clearTimeout(timer);
        const aborted = e && (e.name === "AbortError" || String(e).includes("aborted"));
        return res.status(504).json({
            ok: false,
            error: aborted ? `Upstream timeout after ${timeoutMs}ms` : e.message || String(e),
        });
    }
}
