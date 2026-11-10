import { getPool } from "./_db.js";
import { requireMember } from "./_member-auth.js";
import { ensureDsrTables, listRequests, getRequest, createRequest, saveAction, validateNewRequest, applyAction } from "./_dsr.js";

/**
 * /api/dsr — the organisation's data subject requests.
 *
 * GET            → { requests }
 * GET ?id=       → { request, events }
 * POST { action: "create", ... } or a workflow step { action, id, ... }
 *
 * Headers: Authorization (Bearer), Organisation, X-User-Email
 */
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
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Authorization, Organisation, Content-Type, X-User-Email");
    res.setHeader("Access-Control-Max-Age", "86400");
}

const validId = (id) => /^\d{1,18}$/.test(String(id ?? ""));

export default async function handler(req, res) {
    setCors(req, res);
    if (req.method === "OPTIONS") return res.status(204).end();
    if (req.method !== "GET" && req.method !== "POST") {
        res.setHeader("Allow", "GET, POST, OPTIONS");
        return res.status(405).json({ error: "Method not allowed" });
    }
    const member = await requireMember(req);
    if (member.error) return res.status(member.status).json({ error: member.error });
    const { organisationId, email } = member;
    res.setHeader("Cache-Control", "private, no-store");

    try {
        const db = getPool();
        await ensureDsrTables(db);

        if (req.method === "GET") {
            if (req.query?.id === undefined) return res.json({ requests: await listRequests(db, organisationId) });
            const found = validId(req.query.id) ? await getRequest(db, organisationId, req.query.id) : null;
            return found ? res.json(found) : res.status(404).json({ error: "Request not found" });
        }

        const body = req.body || {};
        if (body.action === "create") {
            const values = validateNewRequest(body);
            if (values.error) return res.status(400).json({ error: values.error });
            return res.status(201).json({ request: await createRequest(db, organisationId, email, values) });
        }

        const found = validId(body.id) ? await getRequest(db, organisationId, body.id) : null;
        if (!found) return res.status(404).json({ error: "Request not found" });
        const step = applyAction(found.request, body);
        if (step.error) return res.status(400).json({ error: step.error });
        const request = await saveAction(db, organisationId, email, found.request, step);
        if (!request) return res.status(409).json({ error: "This request was just changed by someone else. Reload and try again." });
        return res.json(await getRequest(db, organisationId, request.id));
    } catch (err) {
        console.error("[dsr]", err.message);
        return res.status(500).json({ error: "Internal server error" });
    }
}
