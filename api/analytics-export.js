import { getPool } from "./_db.js";
import { requireMember } from "./_member-auth.js";

/**
 * /api/analytics-export — a site's raw analytics rows, one page at a time
 * (the dashboard's "Export CSV" builds the file in the browser, so no
 * response-size limit applies; agencies can call it as an API too).
 *
 *   GET ?domain=&from=YYYY-MM-DD&to=YYYY-MM-DD&dataset=pageviews|events[&after=<cursor>][&excludeBots=0]
 *     → { columns: [...], rows: [[...]], next: <cursor> | null }
 *
 * Signed in: Authorization + Organisation (requireMember).
 *
 * What leaves: the path (never the full URL — query strings can carry
 * e-mail addresses or tokens), referrer host, UTM tags, coarse location and
 * device, and the pseudonymous session id of consenting visits. Not: ad
 * click ids, network (ASN) data, user agents.
 */
const ALLOWED_ORIGINS = [
    "https://www.intastellarconsents.com",
    "https://www.consentsmanagement.com",
    "https://consentsplatform.com",
    "http://localhost:8080",
    "http://localhost:3000",
];
export const PAGE_SIZE = 5000;
const MAX_DAYS = 366;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export const DATASETS = {
    pageviews: {
        table: "analytics_events",
        columns: [
            ["time", "received_at"], ["consent", "consent_level"], ["path", "pathname"], ["host", "page_host"],
            ["title", "title"], ["referrer", "referrer_host"],
            ["utm_source", "utm_source"], ["utm_medium", "utm_medium"], ["utm_campaign", "utm_campaign"], ["utm_content", "utm_content"],
            ["country", "country_code"], ["region", "region"], ["device", "device_type"], ["browser", "browser_family"], ["os", "os_family"],
            ["language", "language"], ["duration_sec", "duration_sec"], ["scroll_depth", "scroll_depth"],
            ["new_visitor", "is_new_visitor"], ["embedded", "is_embedded"], ["dimensions", "custom_dims::text"], ["session_id", "session_id"],
        ],
        // Same "suspected bot" rule as the reports (hosting network, no consent).
        botFilter: "NOT (is_hosting_ip IS TRUE AND consent_level <> 'full')",
    },
    events: {
        table: "analytics_custom_events",
        columns: [
            ["time", "received_at"], ["consent", "consent_level"], ["name", "name"],
            ["value", "ROUND(value_cents / 100.0, 2)"], ["currency", "currency"], ["transaction_id", "transaction_id"],
            ["path", "pathname"], ["country", "country_code"], ["device", "device_type"], ["source", "source"],
            ["session_id", "session_id"],
        ],
        botFilter: null,
    },
};

const validDay = (d) => DAY_RE.test(String(d || "")) && !Number.isNaN(Date.parse(d));

/** → { status, body } — the endpoint without HTTP, for tests. */
export async function exportPage(db, member, query) {
    const dataset = DATASETS[query.dataset];
    if (!dataset) return { status: 400, body: { error: `dataset must be one of: ${Object.keys(DATASETS).join(", ")}` } };
    if (!validDay(query.from) || !validDay(query.to)) return { status: 400, body: { error: "from and to (YYYY-MM-DD) are required" } };
    const days = (Date.parse(query.to) - Date.parse(query.from)) / 864e5;
    if (days < 0 || days > MAX_DAYS) return { status: 400, body: { error: `The range must be 0–${MAX_DAYS} days` } };
    const after = query.after == null || query.after === "" ? 0 : Number(query.after);
    if (!Number.isSafeInteger(after) || after < 0) return { status: 400, body: { error: "Invalid cursor" } };

    const { rows: sites } = await db.query(
        "SELECT id FROM analytics_sites WHERE organisation_id = $1 AND LOWER(domain) = LOWER($2) AND active = true LIMIT 1",
        [member.organisationId, String(query.domain || "").trim()],
    );
    if (!sites.length) return { status: 404, body: { error: "No analytics site for this domain" } };

    const toExclusive = new Date(Date.parse(query.to) + 864e5).toISOString().slice(0, 10);
    const bots = dataset.botFilter && String(query.excludeBots ?? "1") !== "0" ? `AND ${dataset.botFilter}` : "";
    const select = dataset.columns.map(([name, expr]) => `${expr} AS "${name}"`).join(", ");
    const { rows } = await db.query(
        `SELECT id, ${select} FROM ${dataset.table}
          WHERE site_id = $1 AND received_at >= $2 AND received_at < $3 AND id > $4 ${bots}
          ORDER BY id LIMIT ${PAGE_SIZE}`,
        [sites[0].id, query.from, toExclusive, after],
    );
    const columns = dataset.columns.map(([name]) => name);
    return {
        status: 200,
        body: {
            columns,
            rows: rows.map((r) => columns.map((c) => (r[c] instanceof Date ? r[c].toISOString() : r[c] ?? null))),
            next: rows.length === PAGE_SIZE ? String(rows[rows.length - 1].id) : null,
        },
    };
}

export default async function handler(req, res) {
    const origin = req.headers.origin || "";
    if (ALLOWED_ORIGINS.includes(origin)) {
        res.setHeader("Access-Control-Allow-Origin", origin);
        res.setHeader("Vary", "Origin");
    }
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Authorization, Organisation, X-User-Email, ExcludeBots, Content-Type");
    res.setHeader("Cache-Control", "no-store");
    if (req.method === "OPTIONS") return res.status(204).end();
    if (req.method !== "GET") {
        res.setHeader("Allow", "GET");
        return res.status(405).json({ error: "Method not allowed" });
    }
    const member = await requireMember(req);
    if (member.error) return res.status(member.status).json({ error: member.error });
    try {
        const out = await exportPage(getPool(), member, req.query || {});
        return res.status(out.status).json(out.body);
    } catch (err) {
        console.error("[analytics-export]", err.message);
        return res.status(500).json({ error: "Export failed" });
    }
}
