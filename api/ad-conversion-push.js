import { getPool } from "./_db.js";
import { tryRefreshToken } from "./_ad-platform-fetch.js";
/**
 * GET  /api/ad-conversion-push?domain=  — list recent push records for the org
 * POST /api/ad-conversion-push          — process pending conversions and push to ad platforms
 *
 * Required headers: Authorization: Bearer <token>, Organisation: <org_id>
 *
 * POST body (all optional):
 *   { domain, limit, ids }
 *   domain  — restrict to a specific domain (otherwise all pending for the org)
 *   limit   — max rows to process in one call (default 50)
 *   ids     — array of specific push record IDs to retry
 *
 * Token refresh for every platform (Google, Meta, Microsoft) goes through the
 * shared tryRefreshToken() in _ad-platform-fetch.js — the same helper
 * cron-ad-sync.js and ad-conversion-actions.js already use. Meta's case there
 * does the fb_exchange_token long-lived-token exchange; this file used to
 * reimplement its own narrower refresh (Google + Microsoft only, no Meta
 * case at all) which is why expired Meta connections used to fail forever
 * instead of refreshing.
 *
 * Required env vars (platform-specific):
 *   GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET         — Google Ads token refresh
 *   META_ADS_CLIENT_ID / META_ADS_CLIENT_SECRET     — Meta long-lived token exchange
 *   MICROSOFT_ADS_CLIENT_ID / MICROSOFT_ADS_CLIENT_SECRET — Microsoft Ads token refresh
 *   (Google Ads uses the Data Manager API — no developer token needed)
 */
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
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Authorization,Organisation,Content-Type");
}

// ── Token refresh ─────────────────────────────────────────────────────────────
// Delegates to the shared tryRefreshToken (_ad-platform-fetch.js), which
// handles Google/Microsoft's standard refresh_token grant AND Meta's
// fb_exchange_token long-lived-token exchange — the single source of truth
// also used by cron-ad-sync.js and ad-conversion-actions.js.

async function getValidToken(db, connection) {
    const refreshed = await tryRefreshToken(db, connection).catch(() => connection);
    return refreshed.access_token || null;
}

// ── Platform push functions ───────────────────────────────────────────────────

// Google's standard API error shape wraps the useful part behind a generic
// top-level message ("There was a problem with the request.") — the actual
// reason (e.g. a specific field violation) lives in error.details, which the
// previous version of this code never looked at. This unwraps it, and always
// attaches the full raw body as err.response so the caller can persist it
// (previously only the message string was ever kept — the raw response
// was discarded on every failure, which is why past failures here were
// undiagnosable without re-running with better logging).
function apiError(resp, json, fallbackMsg) {
    const topMsg = json?.error?.message || json?.message || fallbackMsg || `HTTP ${resp.status}`;
    const details = json?.error?.details;
    const detailMsg = Array.isArray(details) && details.length
        ? details.map(d => {
            if (Array.isArray(d.fieldViolations)) {
                return d.fieldViolations.map(v => `${v.field || "?"}: ${v.description || v.reason || ""}`).join("; ");
            }
            return d.reason || d.message || JSON.stringify(d).slice(0, 200);
        }).join(" | ")
        : null;
    const err = new Error(detailMsg ? `${topMsg} — ${detailMsg}` : topMsg);
    err.response = json;
    return err;
}

async function pushGoogleAds(connection, token, push) {
    if (!connection.conversion_action) throw new Error("No conversion_action configured for this Google Ads connection");

    const customerId = (connection.account_id || "").replace(/-/g, "");
    if (!customerId) throw new Error("No account_id (customer ID) on connection");

    // conversion_action is stored as a resource name e.g. customers/123/conversionActions/456;
    // Data Manager API wants only the numeric ID as productDestinationId.
    const conversionActionId = (connection.conversion_action || "").split("/").pop();
    if (!conversionActionId) throw new Error("Could not parse numeric conversion action ID from: " + connection.conversion_action);

    const destination = {
        reference: "ga-conv",
        operatingAccount: { accountType: "GOOGLE_ADS", accountId: customerId },
        productDestinationId: conversionActionId,
    };
    if (connection.login_customer_id) {
        destination.loginAccount = {
            accountType: "GOOGLE_ADS",
            accountId: connection.login_customer_id.replace(/-/g, ""),
        };
    }

    const event = {
        destinationReferences: ["ga-conv"],
        eventSource: "WEB", // required (proto field event_source) — every conversion
                            // tracked here comes from intaAnalytics.track() on a page,
                            // so this is always "WEB", never a value we need per-push.
        adIdentifiers: { gclid: push.click_id },
        eventTimestamp: new Date(push.conversion_time).toISOString(),
        ...(push.value_usd != null && {
            conversionValue: Number(push.value_usd),
            currency: push.currency || "EUR",
        }),
    };

    const resp = await fetch(
        "https://datamanager.googleapis.com/v1/events:ingest",
        {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
            body: JSON.stringify({ destinations: [destination], events: [event] }),
        }
    );
    const json = await resp.json().catch(() => ({}));

    if (!resp.ok) throw apiError(resp, json);

    return json;
}

async function pushMetaAds(connection, token, push) {
    // conversion_action holds the Pixel ID here (picked in Settings → the same
    // generic "where to send conversions" slot Google Ads' conversion action
    // uses) — NOT connection.account_id, which is the ad account (act_...)
    // used for reading spend reports. A Pixel and an ad account are different
    // Meta objects with different ID namespaces; sending events to an ad
    // account ID fails with "Object with ID 'act_...' does not exist...".
    const pixelId = connection.conversion_action;
    if (!pixelId) throw new Error("No Meta Pixel configured for this connection — select one in Settings → Analytics Settings → Conversion actions");

    // Map internal event names to Meta standard events
    const META_EVENT_MAP = {
        purchase:  "Purchase",
        lead:      "Lead",
        signup:    "CompleteRegistration",
        subscribe: "Subscribe",
        checkout:  "InitiateCheckout",
        addtocart: "AddToCart",
    };
    const eventName = META_EVENT_MAP[(push.event_name || "").toLowerCase()] || "Purchase";

    const userData = { fbclid: push.click_id, fbc: `fb.1.${Date.now()}.${push.click_id}` };
    const customData = {};
    if (push.value_usd != null) {
        customData.value    = Number(push.value_usd);
        customData.currency = push.currency || "EUR";
    }

    const eventData = {
        data: [{
            event_name:    eventName,
            event_time:    Math.floor(new Date(push.conversion_time).getTime() / 1000),
            action_source: "website",
            user_data:     userData,
            ...(Object.keys(customData).length ? { custom_data: customData } : {}),
        }],
        access_token: token,
    };

    const resp = await fetch(
        `https://graph.facebook.com/v19.0/${pixelId}/events`,
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(eventData),
        }
    );
    const json = await resp.json().catch(() => ({}));
    if (!resp.ok) throw apiError(resp, json);
    if (json.error) throw apiError(resp, json, "Meta API error");

    return json;
}

async function pushMicrosoftAds(connection, token, push) {
    // Microsoft Ads offline conversions require a SOAP call to the BulkService
    // or a REST call to the Campaign Management API — both are significantly
    // more complex than Google/Meta. This stub queues the record for manual
    // review until the Microsoft Ads REST path is implemented.
    const accountId  = connection.account_id;
    const goalName   = connection.conversion_action || "Purchase";
    if (!accountId) throw new Error("No account_id on Microsoft Ads connection");

    // Microsoft Ads Offline Conversions API (REST preview)
    const body = {
        ConversionGoalName: goalName,
        MicrosoftClickId:   push.click_id,
        ConversionTime:     new Date(push.conversion_time).toISOString(),
        ConversionValue:    push.value_usd != null ? Number(push.value_usd) : undefined,
        ConversionCurrencyCode: push.currency || "EUR",
    };

    const resp = await fetch(
        "https://campaign.api.bingads.microsoft.com/api/advertiser/campaign/v1/ApplyOfflineConversions",
        {
            method: "POST",
            headers: {
                "Content-Type":  "application/json",
                "Authorization": `Bearer ${token}`,
                "CustomerAccountId": accountId,
            },
            body: JSON.stringify([body]),
        }
    );
    const json = await resp.json().catch(() => ({}));
    if (!resp.ok) throw apiError(resp, json);
    return json;
}

async function dispatchPush(db, connection, push) {
    const token = await getValidToken(db, connection);
    if (!token) throw new Error("Could not obtain a valid access token");

    switch (connection.platform) {
        case "google_ads":    return await pushGoogleAds(connection, token, push);
        case "meta_ads":      return await pushMetaAds(connection, token, push);
        case "microsoft_ads": return await pushMicrosoftAds(connection, token, push);
        default: throw new Error(`Unsupported platform: ${connection.platform}`);
    }
}

// ── Handler ───────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
    setCors(req, res);
    if (req.method === "OPTIONS") return res.status(204).end();

    const jwt = validateJwt(req.headers.authorization);
    if (!jwt) return res.status(401).json({ error: "Unauthorized" });

    const orgId = parseInt(req.headers.organisation || req.headers.organization || "0", 10);
    if (!orgId) return res.status(400).json({ error: "Organisation header required" });

    const db = getPool();

    // ── GET: return recent push records ──────────────────────────────────────
    if (req.method === "GET") {
        const domain = req.query.domain || null;
        const limit  = Math.min(parseInt(req.query.limit || "200", 10), 500);

        const rows = domain
            ? await db.query(
                `SELECT p.id, p.platform, p.click_id, p.event_name, p.value_usd, p.currency,
                        p.status, p.error_message, p.pushed_at, p.created_at, p.site_id,
                        s.domain
                 FROM analytics_conversion_pushes p
                 JOIN analytics_sites s ON s.id = p.site_id
                 WHERE p.organisation_id=$1 AND s.domain=$2
                 ORDER BY p.created_at DESC LIMIT $3`,
                [orgId, domain, limit]
              ).then(r => r.rows)
            : await db.query(
                `SELECT p.id, p.platform, p.click_id, p.event_name, p.value_usd, p.currency,
                        p.status, p.error_message, p.pushed_at, p.created_at, p.site_id,
                        s.domain
                 FROM analytics_conversion_pushes p
                 JOIN analytics_sites s ON s.id = p.site_id
                 WHERE p.organisation_id=$1
                 ORDER BY p.created_at DESC LIMIT $2`,
                [orgId, limit]
              ).then(r => r.rows);

        const stats = { pending: 0, sent: 0, failed: 0 };
        for (const r of rows) stats[r.status] = (stats[r.status] || 0) + 1;

        return res.status(200).json({ pushes: rows, stats });
    }

    // ── POST: process pending conversions ────────────────────────────────────
    if (req.method !== "POST") return res.status(405).end();

    let body = {};
    try {
        body = typeof req.body === "object" && req.body !== null
            ? req.body
            : JSON.parse(req.body || "{}");
    } catch { return res.status(400).json({ error: "Invalid JSON" }); }

    const domain = body.domain || null;
    const limit  = Math.min(parseInt(body.limit || "50", 10), 100);
    const ids    = Array.isArray(body.ids) ? body.ids.map(Number).filter(Boolean) : null;
    // See docs/analytics-audit-plan.md item 9 — explicit, so a caller that
    // wants to retry failed rows (not just pending ones) can ask for that
    // without processPendingPushes's default (used by the unattended cron
    // sweep in cron-ad-conversion-push.js) silently changing to also retry
    // every permanently-failed row on every single run.
    const statuses = Array.isArray(body.statuses) ? body.statuses : null;

    const result = await processPendingPushes(db, { orgId, domain, limit, ids, statuses });
    return res.status(200).json(result);
}

// Only these two are ever safe to (re)send — "sent" must never be retried.
const STATUSES_RETRIABLE = new Set(["pending", "failed"]);

// Normalizes a caller-supplied status list down to the subset that's ever
// safe to retry, deduped, defaulting to ["pending"] when empty/invalid/
// omitted — the single rule both the manual endpoint and
// processPendingPushes' own default rely on, rather than two copies that
// could silently drift (see docs/analytics-audit-plan.md item 9 — the bug
// this item fixes was exactly this kind of mismatch between what a caller
// asked for and what the query actually filtered on).
export function resolveRetryStatuses(rawStatuses) {
    const cleaned = Array.isArray(rawStatuses)
        ? [...new Set(rawStatuses)].filter(s => STATUSES_RETRIABLE.has(s))
        : [];
    return cleaned.length ? cleaned : ["pending"];
}

// ── Core processing — org-scoped for the manual/JWT caller above, org-agnostic
// (orgId omitted) for the cron job in cron-ad-conversion-push.js ─────────────
export async function processPendingPushes(db, { orgId = null, domain = null, limit = 50, ids = null, statuses = null } = {}) {
    // Fetch pending push records
    let pushes;
    if (ids?.length) {
        const params = [ids];
        let where = `p.id = ANY($1)`;
        if (orgId) { params.push(orgId); where += ` AND p.organisation_id=$${params.length}`; }
        pushes = await db.query(
            `SELECT p.*, s.domain AS site_domain
             FROM analytics_conversion_pushes p
             JOIN analytics_sites s ON s.id = p.site_id
             WHERE ${where}`,
            params
        ).then(r => r.rows);
    } else {
        // Default to 'pending' only — the unattended cron sweep (no explicit
        // `statuses`) must never auto-retry 'failed' rows on every run, or a
        // permanently-broken config (e.g. "no ad platform connection found")
        // would get hammered against the ad platform's API forever. A caller
        // that explicitly wants failed rows retried (the UI's bulk button)
        // passes statuses: ['pending','failed'].
        const params = [resolveRetryStatuses(statuses)];
        const conditions = [`p.status = ANY($1)`];
        if (orgId)  { params.push(orgId);  conditions.push(`p.organisation_id=$${params.length}`); }
        if (domain) { params.push(domain); conditions.push(`s.domain=$${params.length}`); }
        params.push(limit);
        pushes = await db.query(
            `SELECT p.*, s.domain AS site_domain
             FROM analytics_conversion_pushes p
             JOIN analytics_sites s ON s.id = p.site_id
             WHERE ${conditions.join(" AND ")}
             ORDER BY p.created_at LIMIT $${params.length}`,
            params
        ).then(r => r.rows);
    }

    if (!pushes.length) return { processed: 0, sent: 0, failed: 0, results: [] };

    // Load ad platform connections (scoped to org when given, across all orgs
    // for the cron sweep otherwise) — one query, reused across every push below.
    const platforms = [...new Set(pushes.map(p => p.platform))];
    const connParams = [platforms];
    let connWhere = `platform = ANY($1)`;
    if (orgId) { connParams.push(orgId); connWhere += ` AND organisation_id=$${connParams.length}`; }
    const { rows: connections } = await db.query(
        `SELECT * FROM ad_platform_connections WHERE ${connWhere}`,
        connParams
    ).catch(() => ({ rows: [] }));

    // Index by org + platform + domain — including organisation_id keeps this
    // safe even when connections span multiple orgs (cron sweep), in case two
    // orgs ever end up with same-named domains.
    const connByKey = {};
    for (const c of connections) {
        connByKey[`${c.organisation_id}:${c.platform}:${c.domain}`] = c;
        if (!connByKey[`${c.organisation_id}:${c.platform}:`]) {
            connByKey[`${c.organisation_id}:${c.platform}:`] = c;
        }
    }

    const results = [];

    for (const push of pushes) {
        const conn = connByKey[`${push.organisation_id}:${push.platform}:${push.site_domain}`]
                  || connByKey[`${push.organisation_id}:${push.platform}:`];

        if (!conn) {
            await db.query(
                `UPDATE analytics_conversion_pushes
                 SET status='failed', error_message=$1, pushed_at=NOW() WHERE id=$2`,
                ["No ad platform connection found for this domain", push.id]
            ).catch(() => {});
            results.push({ id: push.id, platform: push.platform, status: "failed", error: "No connection found" });
            continue;
        }

        try {
            const platformResp = await dispatchPush(db, conn, push);
            await db.query(
                `UPDATE analytics_conversion_pushes
                 SET status='sent', pushed_at=NOW(), platform_response=$1, error_message=NULL
                 WHERE id=$2`,
                [JSON.stringify(platformResp), push.id]
            ).catch(() => {});
            results.push({ id: push.id, platform: push.platform, status: "sent" });
        } catch (err) {
            const msg = (err.message || "Unknown error").slice(0, 500);
            // err.response (set by apiError() in the push functions above) is the
            // full raw API error body — kept here so a failure can actually be
            // diagnosed afterwards instead of only having the truncated message
            // string, which is all this used to store.
            await db.query(
                `UPDATE analytics_conversion_pushes
                 SET status='failed', error_message=$1, platform_response=$2, pushed_at=NOW() WHERE id=$3`,
                [msg, err.response ? JSON.stringify(err.response) : null, push.id]
            ).catch(() => {});
            results.push({ id: push.id, platform: push.platform, status: "failed", error: msg });
        }
    }

    const sent   = results.filter(r => r.status === "sent").length;
    const failed = results.filter(r => r.status === "failed").length;

    return { processed: results.length, sent, failed, results };
}
