/**
 * POST /api/pre-consent-scan
 *
 * Triggers a pre-consent scan for a domain. Called directly by the frontend.
 * Validates the Intastellar Bearer JWT (iss/nbf/exp checks, same as PHP).
 *
 * Headers:
 *   Authorization  Bearer <token>
 *   Organisation   <organisation_id>
 *
 * Body: { domain, workspaceId? }
 *
 * Env vars (set in Vercel project settings):
 *   POSTGRES_URL  — Neon connection string (EU Frankfurt)
 */

import chromium from "chrome-aws-lambda";
import puppeteer from "puppeteer-core";
import pkg from "pg";
const { Pool } = pkg;

// ── DB pool (reused across warm invocations) ──────────────────────────────────
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

// ── Tracker list ──────────────────────────────────────────────────────────────
const TRACKERS = [
    // Analytics
    { domains: ["google-analytics.com", "analytics.google.com"], service: "Google Analytics",      category: "analytics"      },
    { domains: ["googletagmanager.com"],                          service: "Google Tag Manager",    category: "analytics"      },
    { domains: ["hotjar.com"],                                    service: "Hotjar",                category: "analytics"      },
    { domains: ["amplitude.com"],                                 service: "Amplitude",             category: "analytics"      },
    { domains: ["mixpanel.com"],                                  service: "Mixpanel",              category: "analytics"      },
    { domains: ["segment.io", "segment.com", "cdn.segment.com"], service: "Segment",               category: "analytics"      },
    { domains: ["fullstory.com", "fullstory.io"],                 service: "FullStory",             category: "analytics"      },
    { domains: ["clarity.ms"],                                    service: "Microsoft Clarity",     category: "analytics"      },
    { domains: ["mouseflow.com"],                                 service: "Mouseflow",             category: "analytics"      },
    { domains: ["heapanalytics.com"],                             service: "Heap",                  category: "analytics"      },
    { domains: ["logrocket.com", "lr-ingest.io"],                 service: "LogRocket",             category: "analytics"      },
    { domains: ["smartlook.com"],                                 service: "Smartlook",             category: "analytics"      },
    { domains: ["crazyegg.com"],                                  service: "Crazy Egg",             category: "analytics"      },
    { domains: ["kissmetrics.com"],                               service: "Kissmetrics",           category: "analytics"      },
    { domains: ["clicky.com"],                                    service: "Clicky",                category: "analytics"      },
    { domains: ["matomo.cloud", "matomo.org"],                    service: "Matomo",                category: "analytics"      },
    { domains: ["plausible.io"],                                  service: "Plausible",             category: "analytics"      },
    { domains: ["statcounter.com"],                               service: "StatCounter",           category: "analytics"      },

    // Advertising
    { domains: ["connect.facebook.net", "graph.facebook.com"],   service: "Facebook / Meta Pixel", category: "advertising"    },
    { domains: ["googleadservices.com", "doubleclick.net", "googlesyndication.com", "google.com/pagead"], service: "Google Ads", category: "advertising" },
    { domains: ["ads.linkedin.com", "snap.licdn.com"],           service: "LinkedIn Insight Tag",  category: "advertising"    },
    { domains: ["analytics.twitter.com", "static.ads-twitter.com", "ads.twitter.com"], service: "Twitter / X Pixel", category: "advertising" },
    { domains: ["tr.snapchat.com", "sc-static.net"],             service: "Snapchat Pixel",        category: "advertising"    },
    { domains: ["bat.bing.com"],                                  service: "Microsoft Advertising", category: "advertising"    },
    { domains: ["analytics.tiktok.com", "vm.tiktok.com"],        service: "TikTok Pixel",          category: "advertising"    },
    { domains: ["criteo.com", "criteo.net"],                      service: "Criteo",                category: "advertising"    },
    { domains: ["outbrain.com"],                                  service: "Outbrain",              category: "advertising"    },
    { domains: ["taboola.com"],                                   service: "Taboola",               category: "advertising"    },
    { domains: ["amazon-adsystem.com", "assoc-amazon.com"],      service: "Amazon Advertising",    category: "advertising"    },
    { domains: ["adsrvr.org", "thetradedesk.com"],               service: "The Trade Desk",        category: "advertising"    },
    { domains: ["rubiconproject.com"],                            service: "Magnite (Rubicon)",     category: "advertising"    },
    { domains: ["pubmatic.com"],                                  service: "PubMatic",              category: "advertising"    },
    { domains: ["openx.net", "openx.com"],                       service: "OpenX",                 category: "advertising"    },
    { domains: ["hs-analytics.net", "hs-scripts.com", "hubspot.com", "hubspot.net"], service: "HubSpot", category: "advertising" },
    { domains: ["pardot.com"],                                    service: "Salesforce Pardot",     category: "advertising"    },
    { domains: ["scorecardresearch.com"],                         service: "Comscore",              category: "advertising"    },
    { domains: ["adnxs.com", "xandr.com"],                       service: "Xandr / AppNexus",      category: "advertising"    },
    { domains: ["zemanta.com"],                                   service: "Zemanta",               category: "advertising"    },
    { domains: ["adform.net"],                                    service: "Adform",                category: "advertising"    },

    // Social widgets
    { domains: ["platform.twitter.com", "syndication.twitter.com"], service: "Twitter / X Widgets", category: "social"       },
    { domains: ["platform.linkedin.com"],                         service: "LinkedIn Widgets",      category: "social"         },
    { domains: ["apis.google.com", "accounts.google.com"],       service: "Google Sign-In",        category: "social"         },
    { domains: ["disqus.com", "disquscdn.com"],                   service: "Disqus",                category: "social"         },
    { domains: ["addthis.com"],                                   service: "AddThis",               category: "social"         },
    { domains: ["sharethis.com"],                                 service: "ShareThis",             category: "social"         },

    // Fingerprinting
    { domains: ["fingerprintjs.com", "fpjs.io", "fingerprint.com"], service: "FingerprintJS",      category: "fingerprinting" },
    { domains: ["seon.io"],                                       service: "SEON",                  category: "fingerprinting" },

    // Functional / chat
    { domains: ["widget.intercom.io", "intercom.io"],            service: "Intercom",              category: "functional"     },
    { domains: ["zendesk.com", "zdassets.com"],                  service: "Zendesk",               category: "functional"     },
    { domains: ["js.driftt.com", "drift.com"],                   service: "Drift",                 category: "functional"     },
    { domains: ["tawk.to"],                                       service: "Tawk.to",               category: "functional"     },
    { domains: ["crisp.chat"],                                    service: "Crisp",                 category: "functional"     },

    // CDN / fonts
    { domains: ["fonts.googleapis.com", "fonts.gstatic.com"],    service: "Google Fonts",          category: "cdn"            },
    { domains: ["ajax.googleapis.com"],                           service: "Google CDN",            category: "cdn"            },
    { domains: ["cdn.jsdelivr.net"],                              service: "jsDelivr CDN",          category: "cdn"            },
    { domains: ["cdnjs.cloudflare.com"],                          service: "Cloudflare CDN",        category: "cdn"            },
];

const CATEGORY_ORDER = { advertising: 0, fingerprinting: 1, analytics: 2, social: 3, functional: 4, cdn: 5, "third-party": 6 };

function classifyHost(hostname) {
    for (const entry of TRACKERS) {
        for (const pattern of entry.domains) {
            if (hostname === pattern || hostname.endsWith("." + pattern)) {
                return { service: entry.service, category: entry.category };
            }
        }
    }
    return null;
}

// ── Scan logic ────────────────────────────────────────────────────────────────
async function scanDomain(domain) {
    const startMs = Date.now();
    const browser = await puppeteer.launch({
        args: chromium.args,
        defaultViewport: chromium.defaultViewport,
        executablePath: await chromium.executablePath,
        headless: chromium.headless,
    });

    try {
        const page = await browser.newPage();
        await page.setCacheEnabled(false);
        await page.setUserAgent(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        );
        await page.setRequestInterception(true);

        const targetRoot = domain.split(".").slice(-2).join(".");
        const seen = new Map();

        page.on("request", (req) => {
            try {
                const u = new URL(req.url());
                const host = u.hostname;
                const hostRoot = host.split(".").slice(-2).join(".");
                if (hostRoot !== targetRoot && !seen.has(host)) {
                    seen.set(host, {
                        host,
                        resourceType: req.resourceType(),
                        url: req.url().split("?")[0].slice(0, 200),
                    });
                }
            } catch {}
            req.continue().catch(() => {});
        });

        try {
            await page.goto(`https://${domain}`, { waitUntil: "networkidle2", timeout: 25000 });
        } catch (e) {
            if (!e.message.includes("timeout") && !e.message.includes("Navigation")) throw e;
        }

        await browser.close();

        const transfers = [];
        for (const [host, info] of seen) {
            const match = classifyHost(host);
            transfers.push({
                host,
                service:      match?.service   || host,
                category:     match?.category  || "third-party",
                resourceType: info.resourceType,
            });
        }
        transfers.sort((a, b) => (CATEGORY_ORDER[a.category] ?? 6) - (CATEGORY_ORDER[b.category] ?? 6));

        return { transfers, durationMs: Date.now() - startMs, error: null };
    } catch (err) {
        await browser.close().catch(() => {});
        return { transfers: [], durationMs: Date.now() - startMs, error: err.message };
    }
}

// ── JWT validation (mirrors PHP — checks claims only, no signature) ────────────
function validateJwt(authHeader) {
    const match = (authHeader || "").match(/^Bearer\s+(.+)$/i);
    if (!match) return null;
    try {
        const parts = Buffer.from(match[1], "base64").toString("utf8").split(".");
        if (parts.length !== 3) return null;
        const payload = JSON.parse(Buffer.from(parts[1], "base64").toString("utf8"));
        const now = Math.floor(Date.now() / 1000);
        if (payload.iss !== "Intastellar Account" || (payload.nbf || 0) > now || (payload.exp || 0) < now) return null;
        return payload;
    } catch {
        return null;
    }
}

// ── CORS ──────────────────────────────────────────────────────────────────────
const ALLOWED_ORIGINS = [
    "https://www.intastellarconsents.com",
    "https://consentsplatform.com",
    "http://localhost:8080",
    "http://localhost:3000",
];

function setCors(req, res) {
    const origin = req.headers.origin || "";
    if (ALLOWED_ORIGINS.includes(origin)) {
        res.setHeader("Access-Control-Allow-Origin", origin);
    }
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Authorization, Organisation, Content-Type");
    res.setHeader("Access-Control-Max-Age", "86400");
}

// ── Handler ───────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
    setCors(req, res);

    if (req.method === "OPTIONS") {
        return res.status(204).end();
    }

    if (req.method !== "POST") {
        res.setHeader("Allow", "POST, OPTIONS");
        return res.status(405).json({ error: "Method not allowed" });
    }

    if (!validateJwt(req.headers["authorization"])) {
        return res.status(401).json({ error: "Unauthorized" });
    }

    const organisationId = parseInt(req.headers["organisation"] || "0", 10);
    if (!organisationId) {
        return res.status(400).json({ error: "Missing Organisation header" });
    }

    const { domain, workspaceId } = req.body || {};
    if (!domain || typeof domain !== "string") {
        return res.status(400).json({ error: "domain is required" });
    }
    if (!organisationId) {
        return res.status(400).json({ error: "organisationId is required" });
    }

    const cleanDomain = domain.trim().toLowerCase().replace(/^https?:\/\//, "").split("/")[0];
    const { transfers, durationMs, error } = await scanDomain(cleanDomain);

    const status    = error ? "failed" : "completed";
    const scannedAt = new Date().toISOString().slice(0, 19).replace("T", " ");

    try {
        await getPool().query(
            `INSERT INTO pre_consent_scans
                (domain, organisation_id, workspace_id, scanned_at, scan_duration_ms, status, transfers, error_message)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [cleanDomain, organisationId, workspaceId || null, scannedAt, durationMs, status, JSON.stringify(transfers), error || null]
        );
    } catch (dbErr) {
        console.error("[pre-consent-scan] DB write failed:", dbErr.message);
    }

    res.json({
        domain:                cleanDomain,
        scanned_at:            scannedAt,
        scan_duration_ms:      durationMs,
        status,
        pre_consent_transfers: transfers,
        ...(error ? { error } : {}),
    });
}
