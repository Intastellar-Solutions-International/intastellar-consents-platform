/**
 * POST /api/report-pdf
 *
 * Renders a Quick report (consent audit, consent summary or compliance
 * snapshot) to PDF. Consent figures come from the PHP API and the scan from
 * /api/pre-consent-transfers, both called with the caller's own credentials,
 * so those endpoints keep deciding what this organisation may read.
 *
 * Headers: Authorization (Bearer), Organisation, ExcludeBots ("0" includes bots)
 * Body:    { reportType: "audit"|"summary"|"snapshot", domain, fromDate, toDate }
 */

import { domainToASCII } from "node:url";
import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";
import { buildReportHtml, REPORT_TYPES, esc } from "./_report-html.js";

const CONSENT_API = "https://apis.intastellarsolutions.com/analytics/gdpr";
const SCAN_API = "https://www.intastellarconsents.com/api/pre-consent-transfers";
const YMD = /^\d{4}-\d{2}-\d{2}$/;
const ALLOWED_ORIGINS = [
    "https://www.intastellarconsents.com",
    "https://www.consentsmanagement.com",
    "https://consentsplatform.com",
    "http://localhost:8080",
    "http://localhost:3000",
];
const FONT_HOSTS = ["fonts.googleapis.com", "fonts.gstatic.com"];

class ReportError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}

function setCors(req, res) {
    const origin = req.headers.origin || "";
    if (ALLOWED_ORIGINS.includes(origin)) {
        res.setHeader("Access-Control-Allow-Origin", origin);
    }
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Authorization, Organisation, Content-Type, ExcludeBots");
    res.setHeader("Access-Control-Max-Age", "86400");
}

function validateJwt(authHeader) {
    const match = (authHeader || "").match(/^Bearer\s+(.+)$/i);
    if (!match) return null;
    try {
        const parts = Buffer.from(match[1], "base64").toString("utf8").split(".");
        if (parts.length !== 3) return null;
        const payload = JSON.parse(Buffer.from(parts[1], "base64").toString("utf8"));
        const now = Math.floor(Date.now() / 1000);
        if ((payload.exp && payload.exp < now) || (payload.nbf && payload.nbf > now)) return null;
        return payload;
    } catch {
        return null;
    }
}

async function fetchConsentApi(endpoint, req, domain, fromDate, toDate) {
    const response = await fetch(`${CONSENT_API}/${endpoint}`, {
        method: "POST",
        headers: {
            Authorization: req.headers.authorization,
            Organisation: req.headers.organisation,
            "Content-Type": "application/json",
            Domains: domain,
            FromDate: fromDate,
            ToDate: toDate,
            ExcludeBots: req.headers.excludebots ?? "",
        },
        body: JSON.stringify({ workspaceId: null }),
    });
    if (response.status === 401 || response.status === 403) throw new ReportError(401, "Unauthorized");
    if (!response.ok) throw new ReportError(502, "Consent data could not be loaded.");
    const data = await response.json().catch(() => null);
    if (data === "Err_Login_Expired") throw new ReportError(401, "Unauthorized");
    if (data == null || typeof data !== "object" || data.error != null) throw new ReportError(502, "Consent data could not be loaded.");
    return data;
}

/** The latest scan, or null when the domain has none. */
async function fetchScan(req, domain) {
    const response = await fetch(`${SCAN_API}?domain=${encodeURIComponent(domain)}`, {
        headers: { Authorization: req.headers.authorization, Organisation: req.headers.organisation },
    });
    if (response.status === 404) return null;
    if (response.status === 401) throw new ReportError(401, "Unauthorized");
    if (!response.ok) throw new ReportError(502, "Scan data could not be loaded.");
    return response.json();
}

async function renderPdf(html, title, domain) {
    let browser;
    try {
        browser = await puppeteer.launch({
            args: chromium.args,
            defaultViewport: chromium.defaultViewport,
            executablePath: await chromium.executablePath(),
            headless: chromium.headless,
        });
        const page = await browser.newPage();
        // The HTML holds third-party strings from scans: nothing in it may run
        // or reach the network, apart from the report's fonts.
        await page.setJavaScriptEnabled(false);
        await page.setRequestInterception(true);
        page.on("request", (request) => {
            const url = request.url();
            let allowed = url === "about:blank" || url.startsWith("data:");
            try { allowed = allowed || FONT_HOSTS.includes(new URL(url).hostname); } catch { /* blocked */ }
            if (allowed) request.continue(); else request.abort();
        });
        // If the fonts are slow the report still renders, with Arial.
        await page.setContent(html, { waitUntil: "networkidle0", timeout: 12000 }).catch(() => {});
        const footer = `<div style="width:100%;padding:0 16mm;display:flex;justify-content:space-between;font:7.5pt Arial,sans-serif;color:#5f5f5f"><span>${esc(domain)} · ${esc(title)}</span><span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>`;
        return await page.pdf({
            printBackground: true,
            preferCSSPageSize: true,
            displayHeaderFooter: true,
            headerTemplate: "<span></span>",
            footerTemplate: footer,
        });
    } finally {
        if (browser) await browser.close().catch(() => {});
    }
}

export default async function handler(req, res) {
    setCors(req, res);
    if (req.method === "OPTIONS") return res.status(204).end();
    if (req.method !== "POST") {
        res.setHeader("Allow", "POST, OPTIONS");
        return res.status(405).json({ error: "Method not allowed" });
    }
    if (!validateJwt(req.headers.authorization)) return res.status(401).json({ error: "Unauthorized" });
    if (!parseInt(req.headers.organisation || "0", 10)) return res.status(400).json({ error: "Missing Organisation header" });

    const { reportType, domain: rawDomain, fromDate, toDate } = req.body || {};
    const domain = domainToASCII(String(rawDomain || "").trim().toLowerCase());
    if (!Object.hasOwn(REPORT_TYPES, reportType)) return res.status(400).json({ error: "Unknown report type" });
    if (!domain) return res.status(400).json({ error: "Missing domain" });
    if (!YMD.test(fromDate || "") || !YMD.test(toDate || "") || fromDate > toDate) return res.status(400).json({ error: "Invalid date range" });

    try {
        const needsConsent = reportType !== "snapshot";
        const needsScan = reportType !== "summary";
        const [consent, countries, scan] = await Promise.all([
            needsConsent ? fetchConsentApi("getInteractions", req, domain, fromDate, toDate) : null,
            needsConsent ? fetchConsentApi("interactionsByCountry", req, domain, fromDate, toDate) : null,
            needsScan ? fetchScan(req, domain) : null,
        ]);
        const type = REPORT_TYPES[reportType];
        const html = buildReportHtml(reportType, {
            domain, fromDate, toDate,
            generatedAt: new Date(),
            excludeBots: req.headers.excludebots !== "0",
            consent,
            countries: countries?.data?.Countries || [],
            scan,
        });
        const pdf = await renderPdf(html, type.title, domain);
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `attachment; filename="${type.filename}_${domain}_${fromDate}_to_${toDate}.pdf"`);
        res.setHeader("Cache-Control", "private, no-store");
        return res.status(200).send(Buffer.from(pdf));
    } catch (err) {
        if (err instanceof ReportError) return res.status(err.status).json({ error: err.message });
        console.error("[report-pdf]", err.message);
        return res.status(500).json({ error: "The report could not be generated." });
    }
}
