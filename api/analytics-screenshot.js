/**
 * GET /api/analytics-screenshot?domain=<domain>&path=<pathname>
 *
 * Returns a JPEG screenshot (1280×720) of the given page. Only domains that
 * belong to the requesting organisation are allowed — prevents arbitrary URL
 * capture (SSRF). The response is browser-cached for 1 hour (private, no CDN)
 * so repeated dashboard views don't re-launch Chromium.
 *
 * Requires: Authorization: Bearer <token>   Organisation: <org_id>
 */

import { getPool } from "./_db.js";
import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";

const ALLOWED_ORIGINS = [
    "https://www.intastellarconsents.com",
    "https://www.consentsmanagement.com",
    "https://analytics.consentsmanagement.com",
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

// Patterns to block during screenshot — tracking/analytics scripts that add
// latency without affecting visual output. CSS, images, and fonts are allowed.
const BLOCK_RE = /google-analytics\.com|googletagmanager\.com|hotjar\.com|connect\.facebook\.net|doubleclick\.net|bat\.bing\.com|analytics\.twitter\.com|tr\.snapchat\.com|analytics\.tiktok\.com|clarity\.ms|mouseflow\.com|fullstory\.com|logrocket\.com/;

export default async function handler(req, res) {
    setCors(req, res);
    if (req.method === "OPTIONS") return res.status(204).end();

    const payload = validateJwt(req.headers.authorization);
    if (!payload) return res.status(401).json({ error: "Unauthorized" });

    const orgId = parseInt(req.headers.organisation, 10);
    if (!orgId || isNaN(orgId)) return res.status(400).json({ error: "Missing Organisation header" });

    if (req.method !== "GET") return res.status(405).end();

    const { domain, path: rawPath, fullPage: fullPageParam } = req.query;
    const fullPage = fullPageParam === "1" || fullPageParam === "true";
    if (!domain || typeof domain !== "string") return res.status(400).json({ error: "domain required" });

    // Sanitise path: must be a root-relative pathname, no protocol or host.
    let pagePath = "/";
    try {
        const raw = String(rawPath || "/").trim();
        // Reject anything that looks like a URL scheme (javascript:, data:, etc.)
        if (/^[a-z][a-z0-9+\-.]*:/i.test(raw)) throw new Error("scheme");
        const parsed = new URL(raw, "https://placeholder.invalid");
        pagePath = parsed.pathname || "/";
    } catch {
        pagePath = "/";
    }

    // Verify the requesting org owns this domain
    const db = getPool();
    const siteRes = await db.query(
        `SELECT id FROM analytics_sites WHERE domain = $1 AND organisation_id = $2 LIMIT 1`,
        [domain, orgId]
    ).catch(() => ({ rows: [] }));
    if (!siteRes.rows.length) return res.status(403).json({ error: "Domain not found" });

    const targetUrl = `https://${domain}${pagePath}`;

    let browser;
    try {
        browser = await puppeteer.launch({
            args: chromium.args,
            defaultViewport: { width: 1280, height: 720, deviceScaleFactor: 1 },
            executablePath: await chromium.executablePath(),
            headless: chromium.headless,
        });

        const page = await browser.newPage();

        // Block heavyweight tracking scripts to keep load time short
        await page.setRequestInterception(true);
        page.on("request", r => {
            if (BLOCK_RE.test(r.url())) { r.abort(); return; }
            r.continue();
        });

        await page.setUserAgent(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
        );

        // Tell the Intastellar banner (and any banner honouring this flag)
        // to suppress itself so the screenshot shows the actual page content.
        await page.evaluateOnNewDocument(() => {
            window.__ICS_SCAN__ = true;
        });

        await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 20000 });

        // Brief pause for CSS transitions and web fonts to settle
        await new Promise(r => setTimeout(r, 1200));

        const screenshot = await page.screenshot({
            type: "jpeg",
            quality: 82,
            ...(fullPage ? { fullPage: true } : { clip: { x: 0, y: 0, width: 1280, height: 720 } }),
        });

        await browser.close();
        browser = null;

        // Private browser-cache for 1 hour — no CDN caching because auth is required.
        res.setHeader("Content-Type", "image/jpeg");
        res.setHeader("Cache-Control", "private, max-age=3600");
        res.setHeader("X-Content-Type-Options", "nosniff");
        return res.status(200).send(Buffer.from(screenshot));

    } catch (err) {
        console.error("analytics-screenshot error:", err.message);
        if (browser) await browser.close().catch(() => {});
        return res.status(500).json({ error: "Screenshot failed" });
    }
}
