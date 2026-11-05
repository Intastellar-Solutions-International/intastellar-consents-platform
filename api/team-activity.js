/**
 * /api/team-activity — Team insights (Growth plan and up)
 *
 * POST  records that the signed-in member opened a platform section.
 *       body: { section, path, domain, name, email }
 *       The member is the token's email when it carries one, else body.email
 *       (Intastellar tokens don't reliably include it). Tokens are decoded,
 *       not signature-verified, on this platform either way.
 *       Sent by src/Functions/teamActivity.js on every route change; the
 *       same member + section + domain is only stored once per 10 minutes.
 *
 * GET   ?from=YYYY-MM-DD&to=YYYY-MM-DD   (default: last 30 days)
 *       200 { from, to, totals, members, sections, domains, daily }
 *       402 when the organisation's plan doesn't include Team insights.
 *
 * Only which sections and domains a member opened is stored — no page
 * content, inputs or clicks. Rows older than RETENTION_DAYS are deleted.
 *
 * Requires Authorization: Bearer <token>   Organisation: <org_id>
 */

import { getPool } from "./_db.js";
import { setCors, requestOrganisation, organisationHasPlan } from "./_stripe.js";

const RETENTION_DAYS = 365;
const DEDUPE_MINUTES = 10;
const SECTION_RE = /^[a-z0-9][a-z0-9/-]{0,63}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function ensureTables(db) {
    await db.query(`
        CREATE TABLE IF NOT EXISTS team_activity (
            id              BIGSERIAL    PRIMARY KEY,
            organisation_id INTEGER      NOT NULL,
            user_email      VARCHAR(255) NOT NULL,
            user_name       VARCHAR(120),
            section         VARCHAR(64)  NOT NULL,
            path            VARCHAR(255),
            domain          VARCHAR(255),
            created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_team_activity_org_time ON team_activity (organisation_id, created_at);
    `);
}

function safeDate(str, fallback) {
    const d = new Date(str);
    return str && !isNaN(d.getTime()) ? d.toISOString().slice(0, 10) : fallback;
}

const clip = (value, max) => {
    const s = typeof value === "string" ? value.trim() : "";
    return s ? s.slice(0, max) : null;
};

export default async function handler(req, res) {
    setCors(req, res, "GET, POST");
    if (req.method === "OPTIONS") return res.status(204).end();
    if (req.method !== "GET" && req.method !== "POST") {
        res.setHeader("Allow", "GET, POST");
        return res.status(405).json({ error: "Method not allowed" });
    }
    res.setHeader("Cache-Control", "no-store");

    const auth = requestOrganisation(req);
    if (auth.error === 401) return res.status(401).json({ error: "Unauthorized" });
    if (auth.error) return res.status(400).json({ error: "Organisation header required" });
    const { organisationId, email } = auth;

    try {
        const db = getPool();
        await ensureTables(db);
        return req.method === "POST"
            ? await record(db, req, res, organisationId, email)
            : await insights(db, req, res, organisationId);
    } catch (err) {
        console.error("[team-activity]", err.message);
        return res.status(500).json({ error: "Internal server error" });
    }
}

async function record(db, req, res, organisationId, email) {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const member = (email || clip(body.email, 255) || "").toLowerCase();
    if (!EMAIL_RE.test(member)) return res.status(400).json({ error: "Member email required" });
    const section = clip(body.section, 64);
    if (!section || !SECTION_RE.test(section)) return res.status(400).json({ error: "Invalid section" });
    const domain = clip(body.domain, 255)?.toLowerCase() || null;

    // Each of $2/$4/$6 appears twice: once in the INSERT target list (typed
    // varchar by the column it's inserted into) and once in the dedupe
    // subquery's WHERE clause (typed text by plain `=`/IS NOT DISTINCT FROM
    // operator resolution). Postgres won't unify those into one type for a
    // single bind parameter and throws 42P08 "inconsistent types deduced for
    // parameter $N" — explicit casts make both occurrences agree.
    await db.query(
        `INSERT INTO team_activity (organisation_id, user_email, user_name, section, path, domain)
         SELECT $1, $2::text, $3, $4::text, $5, $6::text
         WHERE NOT EXISTS (
             SELECT 1 FROM team_activity
             WHERE organisation_id = $1 AND user_email = $2::text AND section = $4::text
               AND domain IS NOT DISTINCT FROM $6::text
               AND created_at > NOW() - INTERVAL '${DEDUPE_MINUTES} minutes'
         )`,
        [organisationId, member, clip(body.name, 120), section, clip(body.path, 255), domain]
    );

    // Cheap retention: roughly one write in a hundred prunes old rows.
    if (Math.random() < 0.01) {
        await db.query(`DELETE FROM team_activity WHERE created_at < NOW() - INTERVAL '${RETENTION_DAYS} days'`).catch(() => {});
    }
    return res.status(204).end();
}

async function insights(db, req, res, organisationId) {
    if (!(await organisationHasPlan(db, organisationId, "growth"))) {
        return res.status(402).json({ error: "Team insights require the Growth plan", code: "plan_required" });
    }

    const today = new Date().toISOString().slice(0, 10);
    const from = safeDate(req.query.from, new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10));
    const to = safeDate(req.query.to, today);
    const toExclusive = new Date(new Date(to).getTime() + 86400000).toISOString().slice(0, 10);
    const params = [organisationId, from, toExclusive];
    const RANGE = `organisation_id = $1 AND created_at >= $2 AND created_at < $3`;

    const [members, memberSections, memberDomains, sections, domains, daily, domainCount] = await Promise.all([
        db.query(`
            SELECT user_email,
                   (ARRAY_AGG(user_name ORDER BY created_at DESC) FILTER (WHERE user_name IS NOT NULL))[1] AS user_name,
                   MAX(created_at)                                      AS last_active,
                   COUNT(DISTINCT (created_at AT TIME ZONE 'UTC')::date) AS active_days,
                   COUNT(*)                                             AS visits
            FROM team_activity WHERE ${RANGE}
            GROUP BY user_email ORDER BY last_active DESC`, params),
        db.query(`
            SELECT user_email, section, COUNT(*) AS visits
            FROM team_activity WHERE ${RANGE}
            GROUP BY user_email, section`, params),
        db.query(`
            SELECT user_email, domain, COUNT(*) AS visits
            FROM team_activity WHERE ${RANGE} AND domain IS NOT NULL
            GROUP BY user_email, domain`, params),
        db.query(`
            SELECT section, COUNT(*) AS visits, COUNT(DISTINCT user_email) AS members
            FROM team_activity WHERE ${RANGE}
            GROUP BY section ORDER BY visits DESC LIMIT 25`, params),
        db.query(`
            SELECT domain, COUNT(*) AS visits, COUNT(DISTINCT user_email) AS members,
                   MAX(created_at) AS last_visit
            FROM team_activity WHERE ${RANGE} AND domain IS NOT NULL
            GROUP BY domain ORDER BY visits DESC LIMIT 25`, params),
        db.query(`
            SELECT TO_CHAR((created_at AT TIME ZONE 'UTC')::date, 'YYYY-MM-DD') AS date,
                   COUNT(DISTINCT user_email) AS members, COUNT(*) AS visits
            FROM team_activity WHERE ${RANGE}
            GROUP BY 1 ORDER BY 1`, params),
        db.query(`SELECT COUNT(DISTINCT domain) AS n FROM team_activity WHERE ${RANGE}`, params),
    ]);

    // Each member's three most-visited sections and domains.
    const topBy = (rows, key) => {
        const out = new Map();
        for (const r of rows) {
            if (!out.has(r.user_email)) out.set(r.user_email, []);
            out.get(r.user_email).push({ [key]: r[key], visits: Number(r.visits) });
        }
        for (const list of out.values()) list.sort((a, b) => b.visits - a.visits).splice(3);
        return out;
    };
    const sectionsByMember = topBy(memberSections.rows, "section");
    const domainsByMember = topBy(memberDomains.rows, "domain");

    const memberRows = members.rows.map(r => ({
        email:        r.user_email,
        name:         r.user_name,
        last_active:  r.last_active,
        active_days:  Number(r.active_days),
        visits:       Number(r.visits),
        top_sections: sectionsByMember.get(r.user_email) || [],
        top_domains:  domainsByMember.get(r.user_email) || [],
    }));

    return res.status(200).json({
        from, to,
        totals: {
            active_members: memberRows.length,
            visits:         memberRows.reduce((n, m) => n + m.visits, 0),
            domains:        Number(domainCount.rows[0]?.n || 0),
        },
        members:  memberRows,
        sections: sections.rows.map(r => ({ section: r.section, visits: Number(r.visits), members: Number(r.members) })),
        domains:  domains.rows.map(r => ({ domain: r.domain, visits: Number(r.visits), members: Number(r.members), last_visit: r.last_visit })),
        daily:    daily.rows.map(r => ({ date: r.date, members: Number(r.members), visits: Number(r.visits) })),
    });
}
