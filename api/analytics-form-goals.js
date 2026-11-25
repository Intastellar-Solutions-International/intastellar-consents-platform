import { getPool } from "./_db.js";
import { requireMember } from "./_member-auth.js";
import { FORM_GOALS_DDL } from "./_conversions.js";

/**
 * /api/analytics-form-goals — what a form's submissions count as. By default
 * every form submit is a lead; a form can get a lead type ("Demo", "Trial")
 * so reports tell them apart, or be marked "not a lead" (a newsletter), which
 * drops it from conversions everywhere (tierCaseSql in _conversions.js).
 *
 *   GET    ?domain=                     → { goals: [{ formId, leadType, counts }], leadTypes: [...] }
 *   PUT    ?domain=  { formId, leadType?, counts }  → the saved goal
 *   DELETE ?domain=&formId=             → back to a plain lead
 *
 * Signed in: Authorization + Organisation (requireMember).
 */
const ALLOWED_ORIGINS = [
    "https://www.intastellarconsents.com",
    "https://www.consentsmanagement.com",
    "https://consentsplatform.com",
    "http://localhost:8080",
    "http://localhost:3000",
];

/** Body → { formId, leadType, counts }, or { error }. */
export function cleanGoal(body) {
    const formId = String(body?.formId || "").trim().slice(0, 200);
    if (!formId) return { error: "formId is required" };
    const counts = body?.counts !== false;
    const leadType = counts ? String(body?.leadType || "").replace(/\s+/g, " ").trim().slice(0, 60) || null : null;
    return { formId, leadType, counts };
}

const shape = (r) => ({ formId: r.form_id, leadType: r.lead_type, counts: r.counts });

export async function handleFormGoals(db, member, method, query, body) {
    await db.query(FORM_GOALS_DDL);
    const { rows: sites } = await db.query(
        "SELECT id FROM analytics_sites WHERE organisation_id = $1 AND LOWER(domain) = LOWER($2) AND active = true LIMIT 1",
        [member.organisationId, String(query.domain || "").trim()],
    );
    if (!sites.length) return { status: 404, body: { error: "No analytics site for this domain" } };
    const siteId = sites[0].id;

    if (method === "GET") {
        const { rows } = await db.query(
            "SELECT form_id, lead_type, counts FROM analytics_form_goals WHERE site_id = $1 AND organisation_id = $2 ORDER BY form_id",
            [siteId, member.organisationId],
        );
        const goals = rows.map(shape);
        const leadTypes = [...new Set(goals.map((g) => g.leadType).filter(Boolean))].sort();
        return { status: 200, body: { goals, leadTypes } };
    }
    if (method === "PUT") {
        const goal = cleanGoal(body);
        if (goal.error) return { status: 400, body: { error: goal.error } };
        const { rows } = await db.query(
            `INSERT INTO analytics_form_goals (site_id, organisation_id, form_id, lead_type, counts, updated_by, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, NOW())
             ON CONFLICT (site_id, form_id) DO UPDATE SET
               lead_type = EXCLUDED.lead_type, counts = EXCLUDED.counts,
               updated_by = EXCLUDED.updated_by, updated_at = NOW()
             WHERE analytics_form_goals.organisation_id = EXCLUDED.organisation_id
             RETURNING form_id, lead_type, counts`,
            [siteId, member.organisationId, goal.formId, goal.leadType, goal.counts, member.email || null],
        );
        if (!rows.length) return { status: 404, body: { error: "Not found" } };
        return { status: 200, body: shape(rows[0]) };
    }
    if (method === "DELETE") {
        const formId = String(query.formId || "").trim();
        if (!formId) return { status: 400, body: { error: "formId is required" } };
        await db.query(
            "DELETE FROM analytics_form_goals WHERE site_id = $1 AND organisation_id = $2 AND form_id = $3",
            [siteId, member.organisationId, formId],
        );
        return { status: 204, body: null };
    }
    return { status: 405, body: { error: "Method not allowed" } };
}

export default async function handler(req, res) {
    const origin = req.headers.origin || "";
    if (ALLOWED_ORIGINS.includes(origin)) {
        res.setHeader("Access-Control-Allow-Origin", origin);
        res.setHeader("Vary", "Origin");
    }
    res.setHeader("Access-Control-Allow-Methods", "GET, PUT, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Authorization, Organisation, X-User-Email, Content-Type");
    res.setHeader("Cache-Control", "no-store");
    if (req.method === "OPTIONS") return res.status(204).end();
    const member = await requireMember(req);
    if (member.error) return res.status(member.status).json({ error: member.error });
    try {
        const out = await handleFormGoals(getPool(), member, req.method, req.query || {}, req.body);
        if (out.status === 204) return res.status(204).end();
        return res.status(out.status).json(out.body);
    } catch (err) {
        console.error("[analytics-form-goals]", err.message);
        return res.status(500).json({ error: "Request failed" });
    }
}
