import { Readable } from "stream";
import { getPool } from "./_db.js";
import { requireMember } from "./_member-auth.js";
import {
    ensureEvidenceTables, listDocuments, getDocument, saveDocument, deleteDocument, fileHeaders, validateUpload,
    validateInvite, createInvite, renewInviteToken, revokeInvite, listInvites, listAccessLog, VENDOR_TYPES, ORGANISATION_TYPES,
} from "./_evidence.js";
import { inviteEmail, sendEvidenceEmail } from "./_evidence-mail.js";

/**
 * /api/evidence — the organisation's evidence catalog and the control persons it invited.
 *
 * GET                       → { documents, invites, log, types }
 * GET ?file=ID[&download=1] → the file, inline for the preview unless download
 * POST { action: "upload", vendor?, doc_type, title?, filename, content_type, data (base64) }
 * POST { action: "delete", id }
 * POST { action: "invite", email, name?, note?, expires_on, organisation_name }
 * POST { action: "resend", id } → a new room link (the old one stops working)
 * POST { action: "revoke", id }
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

async function sendFile(res, db, organisationId, id, download) {
    const doc = await getDocument(db, organisationId, id);
    if (!doc) return res.status(404).json({ error: "Document not found" });
    const { get } = await import("@vercel/blob");
    const result = await get(doc.blob_path, { access: "private" });
    if (!result?.stream) return res.status(404).json({ error: "Document not found" });
    for (const [name, value] of Object.entries(fileHeaders(doc, download))) res.setHeader(name, value);
    return Readable.fromWeb(result.stream).pipe(res);
}

async function catalog(db, organisationId) {
    const [documents, invites, log] = await Promise.all([listDocuments(db, organisationId), listInvites(db, organisationId), listAccessLog(db, organisationId)]);
    return { documents, invites, log, types: { vendor: VENDOR_TYPES, organisation: ORGANISATION_TYPES } };
}

export default async function handler(req, res) {
    const origin = req.headers.origin || "";
    if (ALLOWED_ORIGINS.includes(origin)) res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Authorization, Organisation, Content-Type, X-User-Email");
    if (req.method === "OPTIONS") return res.status(204).end();
    if (req.method !== "GET" && req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

    const member = await requireMember(req);
    if (member.error) return res.status(member.status).json({ error: member.error });
    const { organisationId, email } = member;
    res.setHeader("Cache-Control", "private, no-store");

    try {
        const db = getPool();
        await ensureEvidenceTables(db);
        if (req.method === "GET") {
            if (req.query.file) return await sendFile(res, db, organisationId, String(req.query.file), req.query.download === "1");
            return res.json(await catalog(db, organisationId));
        }

        const body = req.body || {};
        if (body.action === "upload") {
            const upload = validateUpload(body);
            if (upload.error) return res.status(400).json({ error: upload.error });
            const { put } = await import("@vercel/blob");
            const document = await saveDocument(db, organisationId, upload, email, put);
            return res.json({ document, ...(await catalog(db, organisationId)) });
        }
        if (body.action === "delete") {
            const { del } = await import("@vercel/blob");
            if (!await deleteDocument(db, organisationId, String(body.id ?? ""), del)) return res.status(404).json({ error: "Document not found" });
            return res.json(await catalog(db, organisationId));
        }
        if (body.action === "invite") {
            const invite = validateInvite(body);
            if (invite.error) return res.status(400).json({ error: invite.error });
            const created = await createInvite(db, organisationId, invite, email);
            const sent = await sendEvidenceEmail(invite.email, inviteEmail({ ...created.invite, organisation_name: invite.organisationName }, created.token));
            return res.json({ sent, ...(await catalog(db, organisationId)) });
        }
        if (body.action === "resend") {
            const renewed = await renewInviteToken(db, organisationId, String(body.id ?? ""));
            if (!renewed) return res.status(404).json({ error: "This invite has ended" });
            const sent = await sendEvidenceEmail(renewed.invite.email, inviteEmail(renewed.invite, renewed.token));
            return res.json({ sent, ...(await catalog(db, organisationId)) });
        }
        if (body.action === "revoke") {
            if (!await revokeInvite(db, organisationId, String(body.id ?? ""))) return res.status(404).json({ error: "Invite not found" });
            return res.json(await catalog(db, organisationId));
        }
        return res.status(400).json({ error: "Unknown action" });
    } catch (err) {
        console.error("[evidence]", err.message);
        return res.status(500).json({ error: "Internal server error" });
    }
}
