import { Readable } from "stream";
import { getPool } from "./_db.js";
import { LOGO_DATA_URI } from "./_report-logo.js";
import {
    ensureEvidenceTables, inviteByToken, createLoginCode, redeemLoginCode, sessionValid, logAccess, listDocuments,
    getDocument, fileHeaders, maskEmail, typeLabel, SESSION_HOURS, LOGIN_MINUTES,
} from "./_evidence.js";
import { loginEmail, sendEvidenceEmail, ROOM_BASE } from "./_evidence-mail.js";

/**
 * The read-only evidence room for an invited control person, at /evidence-room/<invite token>.
 *
 *   GET  …/<token>               the catalog with a session, otherwise "email me a sign-in link"
 *   POST …/<token>               emails a one-time sign-in link to the invited address
 *   GET  …/<token>/login/<code>  a button, so mail scanners opening the link don't spend it
 *   POST …/<token>/login/<code>  spends the code, sets the session cookie
 *   GET  …/<token>/view/<id>     one document with its preview
 *   GET  …/<token>/file/<id>     the file itself (?download=1 to save it)
 *
 * Holding the room link isn't enough: the sign-in link only goes to the invited address.
 */
const COOKIE = "evidence_session";
const PAGE_POLICY = "default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:; frame-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const day = (value) => new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const size = (bytes) => (bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : bytes ? `${Math.max(1, Math.round(bytes / 1024))} KB` : "");
const MECHANISMS = { dpf: "EU–US Data Privacy Framework", sccs: "Standard contractual clauses", adequacy: "Adequacy decision", bcr: "Binding corporate rules", none: "None" };
const DPA_STATES = { unknown: "Unknown", requested: "Requested", signed: "Signed", not_required: "Not required" };

function page(title, body, wide = false) {
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)}</title>
<style>
:root{color-scheme:light dark;--bg:#f5f5f4;--card:#fff;--text:#1c1c1c;--muted:#5f5f5f;--line:#d6d6d3;--accent:#8a6a1f;--on-accent:#fff;--chip:#f0ebe0}
@media (prefers-color-scheme:dark){:root{--bg:#222;--card:#333;--text:#f2f2f2;--muted:#b5b5b5;--line:#555;--accent:#c9a653;--on-accent:#1c1c1c;--chip:#46402f}}
*{box-sizing:border-box}body{margin:0;padding:32px 16px;background:var(--bg);color:var(--text);font:16px/1.5 system-ui,sans-serif}
main{max-width:${wide ? 1000 : 520}px;margin:0 auto;padding:28px;background:var(--card);border:1px solid var(--line);border-radius:12px}
h1{margin:0 0 8px;font-size:24px;line-height:1.25}h2{margin:32px 0 12px;font-size:18px}p{margin:0 0 16px;color:var(--muted)}
button,.btn{display:inline-block;padding:10px 18px;background:var(--accent);color:var(--on-accent);border:0;border-radius:8px;font:inherit;font-weight:600;text-decoration:none;cursor:pointer}
.btn.secondary{background:transparent;color:var(--text);border:1px solid var(--line)}
.brand{margin:0 0 24px;padding:14px 16px;background:#fff;border-radius:8px}.brand img{display:block;height:28px;width:auto}
.wrap{overflow-x:auto}table{width:100%;border-collapse:collapse;font-size:14px}th,td{padding:10px 8px;text-align:left;border-bottom:1px solid var(--line);vertical-align:top}th{font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted)}
td a{color:var(--accent);font-weight:600}.chip{display:inline-block;padding:2px 8px;border-radius:99px;background:var(--chip);font-size:12px;font-weight:600}.old{color:var(--muted)}
.meta{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin:0 0 20px;font-size:14px}.meta div{padding:10px 12px;border:1px solid var(--line);border-radius:8px}.meta span{display:block;color:var(--muted);font-size:12px}
.preview{width:100%;height:75vh;border:1px solid var(--line);border-radius:8px;background:#fff}.preview-img{max-width:100%;border:1px solid var(--line);border-radius:8px}
.actions{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 16px}small{display:block;margin-top:24px;color:var(--muted)}
</style></head><body><main><div class="brand"><img src="${LOGO_DATA_URI}" alt="Intastellar Consents"></div>${body}</main></body></html>`;
}

function send(res, status, html) {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Security-Policy", PAGE_POLICY);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    return res.status(status).send(html);
}

const ended = (res) => send(res, 410, page("Access ended", `<h1>This invitation has ended</h1><p>Access to these documents was withdrawn or has expired. Ask the organisation that invited you for a new invitation.</p>`));
const notFound = (res) => send(res, 404, page("Not found", `<h1>Link not found</h1><p>Check that you copied the whole link from the invitation email.</p>`));

function readCookie(req) {
    const match = new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`).exec(req.headers.cookie || "");
    return match ? match[1] : null;
}

function signInPage(invite, token, notice = "") {
    return page("Evidence room", `<h1>${esc(invite.organisation_name || "Compliance")} evidence room</h1>
<p>You were invited to review compliance documents in read-only form. To open them, we'll email a one-time sign-in link to <strong>${esc(maskEmail(invite.email))}</strong>.</p>
${notice ? `<p role="status"><strong>${esc(notice)}</strong></p>` : ""}
<form method="post" action="${ROOM_BASE}/${esc(token)}"><button type="submit">Email me a sign-in link</button></form>
<small>Access until ${esc(day(invite.expires_at))}. Every document you open is logged.</small>`);
}

function catalogPage(invite, token, documents, records) {
    const base = `${ROOM_BASE}/${esc(token)}`;
    const row = (d) => `<tr${d.superseded_at ? ' class="old"' : ""}><td><a href="${base}/view/${d.id}">${esc(d.title)}</a><br><span class="old">${esc(d.filename)} ${esc(size(d.size_bytes))}</span></td>
<td><span class="chip">${esc(typeLabel(d.vendor, d.doc_type))}</span>${d.superseded_at ? `<br><span class="old">Replaced ${esc(day(d.superseded_at))}</span>` : ""}</td><td>${esc(day(d.uploaded_at))}</td></tr>`;
    const table = (rows, first) => `<div class="wrap"><table><thead><tr><th>${first}</th><th>Type</th><th>Uploaded</th></tr></thead><tbody>${rows}</tbody></table></div>`;

    const organisationDocs = documents.filter((d) => !d.vendor);
    const vendors = [...new Set([...documents.filter((d) => d.vendor).map((d) => d.vendor), ...records.map((r) => r.vendor)])].sort((a, b) => a.localeCompare(b));
    const vendorSections = vendors.map((vendor) => {
        const record = records.find((r) => r.vendor === vendor) || {};
        const docs = documents.filter((d) => d.vendor === vendor);
        return `<h2>${esc(vendor)}</h2><div class="meta">
<div><span>DPA status</span>${esc(DPA_STATES[record.dpa_status] || "Not recorded")}</div>
<div><span>Transfer mechanism</span>${esc(MECHANISMS[record.mechanism] || "Not recorded")}</div>
<div><span>Mechanism confirmed</span>${esc(record.mechanism_confirmed_at ? day(record.mechanism_confirmed_at) : "—")}</div>
<div><span>Owner</span>${esc(record.owner || "—")}</div></div>
${docs.length ? table(docs.map(row).join(""), "Document") : "<p>No documents uploaded for this vendor.</p>"}`;
    }).join("");

    return page("Evidence room", `<h1>${esc(invite.organisation_name || "Compliance")} evidence room</h1>
<p>Read-only access for ${esc(invite.name || invite.email)}, until ${esc(day(invite.expires_at))}. Open a document to preview or download it.</p>
<h2>Organisation documents</h2>${organisationDocs.length ? table(organisationDocs.map(row).join(""), "Document") : "<p>None uploaded.</p>"}
${vendorSections || "<h2>Vendors</h2><p>No vendor documents yet.</p>"}
<small>Every document you open is logged for the organisation that invited you.</small>`, true);
}

function documentPage(token, doc) {
    const base = `${ROOM_BASE}/${esc(token)}`;
    const file = `${base}/file/${doc.id}`;
    const preview = doc.content_type === "application/pdf"
        ? `<iframe class="preview" src="${file}" title="${esc(doc.title)}"></iframe>`
        : `<img class="preview-img" src="${file}" alt="${esc(doc.title)}">`;
    return page(doc.title, `<p><a href="${base}">← All documents</a></p><h1>${esc(doc.title)}</h1>
<p>${esc(doc.vendor ? `${doc.vendor} · ` : "")}${esc(typeLabel(doc.vendor, doc.doc_type))} · uploaded ${esc(day(doc.uploaded_at))}${doc.superseded_at ? ` · replaced ${esc(day(doc.superseded_at))}` : ""}</p>
<div class="actions"><a class="btn" href="${file}?download=1">Download</a></div>${preview}`, true);
}

export default async function handler(req, res) {
    if (req.method !== "GET" && req.method !== "POST") return res.status(405).end();
    const token = String(req.query.token || "");
    try {
        const db = getPool();
        await ensureEvidenceTables(db);
        const found = await inviteByToken(db, token);
        if (!found) return notFound(res);
        if (!found.usable) return ended(res);
        const { invite } = found;

        if (req.query.login) {
            if (req.method === "GET") {
                return send(res, 200, page("Sign in", `<h1>Sign in to the evidence room</h1><p>Press the button to open ${esc(invite.organisation_name || "the")} compliance documents.</p>
<form method="post"><button type="submit">Sign in</button></form>`));
            }
            const session = await redeemLoginCode(db, invite, req.query.login);
            if (!session) return send(res, 410, signInPage(invite, token, "That sign-in link was already used or has expired. Request a new one."));
            await logAccess(db, invite, "sign_in");
            res.setHeader("Set-Cookie", `${COOKIE}=${session}; Path=/evidence-room; Max-Age=${SESSION_HOURS * 3600}; HttpOnly; Secure; SameSite=Lax`);
            res.setHeader("Location", `${ROOM_BASE}/${token}`);
            return res.status(303).end();
        }

        const signedIn = await sessionValid(db, invite, readCookie(req));
        if (!signedIn) {
            if (req.method === "POST") {
                const code = await createLoginCode(db, invite);
                if (!code) return send(res, 429, signInPage(invite, token, "Too many sign-in links were requested. Try again in an hour."));
                const sent = await sendEvidenceEmail(invite.email, loginEmail(invite, token, code));
                return send(res, 200, signInPage(invite, token, sent
                    ? `We sent a sign-in link to ${maskEmail(invite.email)}. It works once, for ${LOGIN_MINUTES} minutes.`
                    : "The email couldn't be sent. Try again in a moment."));
            }
            if (req.query.file || req.query.view) return send(res, 401, signInPage(invite, token, "Sign in to open this document."));
            return send(res, 200, signInPage(invite, token));
        }

        if (req.query.file || req.query.view) {
            const doc = await getDocument(db, invite.organisation_id, String(req.query.file || req.query.view));
            if (!doc) return notFound(res);
            if (req.query.view) {
                await logAccess(db, invite, "view", doc.id);
                return send(res, 200, documentPage(token, doc));
            }
            const download = req.query.download === "1";
            if (download) await logAccess(db, invite, "download", doc.id);
            const { getPrivate } = await import("./_blob-stores.js");
            const result = await getPrivate(doc.blob_path);
            if (!result?.stream) return notFound(res);
            for (const [name, value] of Object.entries(fileHeaders(doc, download))) res.setHeader(name, value);
            res.setHeader("Content-Security-Policy", "frame-ancestors 'self'");
            return Readable.fromWeb(result.stream).pipe(res);
        }

        const [documents, records] = await Promise.all([
            listDocuments(db, invite.organisation_id),
            db.query(
                `SELECT vendor, mechanism, to_char(mechanism_confirmed_at, 'YYYY-MM-DD') AS mechanism_confirmed_at, dpa_status, owner
                   FROM vendor_compliance WHERE organisation_id = $1`,
                [invite.organisation_id]
            ).then((r) => r.rows).catch(() => []),
        ]);
        return send(res, 200, catalogPage(invite, token, documents, records));
    } catch (err) {
        console.error("[evidence-room]", err.message);
        return send(res, 500, page("Something went wrong", "<h1>Something went wrong</h1><p>Try again in a moment.</p>"));
    }
}
