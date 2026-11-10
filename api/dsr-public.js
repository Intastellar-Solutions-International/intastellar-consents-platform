import { createHash, randomBytes } from "crypto";
import { getPool } from "./_db.js";
import { LOGO_DATA_URI } from "./_report-logo.js";
import { FORM_LANGUAGES, formT, pickFormLanguage } from "./_dsr-public-i18n.js";
import { ensureDsrTables, createRequest, validateNewRequest, validatePublicSubmission, REQUEST_TYPES, PUBLIC_REGIONS } from "./_dsr.js";

/**
 * The public page where someone can send a data subject request. Reached at
 * /privacy-request/<form token>. Nothing reaches the organisation until the
 * person confirms their email from the link we send them, and the confirm
 * link needs a button press so mail scanners can't trigger it.
 */
const BASE = "https://www.intastellarconsents.com";
const CONFIRM_DAYS = 7;
const MAX_PER_IP_HOUR = 5;
const MAX_PER_FORM_DAY = 200;

export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const sha = (v) => createHash("sha256").update(v).digest("hex");

/** Always on white, because either logo may be dark-on-transparent. */
function brandBar(form) {
    const company = form?.logo_data ? `<img class="co" src="${esc(form.logo_data)}" alt="${esc(form.company_name)}">` : "";
    return `<div class="brand">${company}<img class="ics" src="${LOGO_DATA_URI}" alt="Intastellar Consents"></div>`;
}

function page(title, body, form, lang = "en") {
    return `<!doctype html><html lang="${esc(lang)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)}</title>
<style>
:root{color-scheme:light dark;--bg:#f5f5f4;--card:#fff;--text:#1c1c1c;--muted:#5f5f5f;--line:#d6d6d3;--accent:#8a6a1f;--on-accent:#fff}
@media (prefers-color-scheme:dark){:root{--bg:#222;--card:#333;--text:#f2f2f2;--muted:#b5b5b5;--line:#555;--accent:#c9a653;--on-accent:#1c1c1c}}
*{box-sizing:border-box}body{margin:0;padding:32px 16px;background:var(--bg);color:var(--text);font:16px/1.5 system-ui,sans-serif}
main{max-width:520px;margin:0 auto;padding:28px;background:var(--card);border:1px solid var(--line);border-radius:12px}
h1{margin:0 0 8px;font-size:24px;line-height:1.25}p{margin:0 0 16px;color:var(--muted)}label{display:block;margin:0 0 16px;font-size:14px;font-weight:600}
input,select,textarea{display:block;width:100%;margin-top:4px;padding:10px;background:transparent;color:inherit;border:1px solid var(--line);border-radius:8px;font:inherit;font-size:16px;font-weight:400}
select{appearance:none;-webkit-appearance:none;padding-right:36px;background:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' fill='none' stroke='%23888' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m1 1.5 5 5 5-5'/%3E%3C/svg%3E") no-repeat right 14px center}
select option{color:#1c1c1c}.opt{font-weight:400;color:var(--muted)}.hint{display:block;margin-top:4px;font-size:13px;font-weight:400;color:var(--muted)}
button{padding:12px 20px;background:var(--accent);color:var(--on-accent);border:0;border-radius:8px;font:inherit;font-weight:600;cursor:pointer}
.brand{display:flex;align-items:center;justify-content:space-between;gap:16px;margin:0 0 24px;padding:14px 16px;background:#fff;border-radius:8px}.brand img{display:block;height:32px;width:auto;max-width:47%;object-fit:contain}.brand .ics{margin-left:auto}
.top{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.lang{position:relative;flex-shrink:0;font-size:14px}.lang summary{display:flex;align-items:center;gap:6px;padding:6px 10px;border:1px solid var(--line);border-radius:8px;color:var(--muted);cursor:pointer;list-style:none}.lang summary::-webkit-details-marker{display:none}.lang ul{position:absolute;right:0;z-index:2;min-width:150px;margin:4px 0 0;padding:4px;list-style:none;background:var(--card);border:1px solid var(--line);border-radius:8px}.lang a{display:block;padding:6px 10px;border-radius:6px;color:inherit;text-decoration:none}.lang a:hover,.lang a:focus-visible{background:var(--line)}.lang a[aria-current]{font-weight:600}
.err{padding:10px 12px;border:1px solid #c44;border-radius:8px;color:inherit}.hp{position:absolute;left:-9999px}small{display:block;margin-top:20px;color:var(--muted)}
</style></head><body><main>${brandBar(form)}${body}</main></body></html>`;
}

const GLOBE = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/></svg>`;

/** Plain links, because this page runs no JavaScript. */
function languageMenu(form, lang) {
    const current = FORM_LANGUAGES.find((l) => l.id === lang);
    const items = FORM_LANGUAGES.map((l) => `<li><a href="/privacy-request/${esc(form.token)}?lang=${l.id}" hreflang="${l.id}" lang="${l.id}"${l.id === lang ? ' aria-current="true"' : ""}>${esc(l.name)}</a></li>`).join("");
    return `<details class="lang"><summary aria-label="${esc(formT(lang, "language"))}: ${esc(current.name)}">${GLOBE}${esc(current.name)}</summary><ul>${items}</ul></details>`;
}

export function formPage(form, error = "", values = {}, lang = "en") {
    const t = (key, vars) => esc(formT(lang, key, vars));
    const option = (id, label, current) => `<option value="${esc(id)}"${id === current ? " selected" : ""}>${label}</option>`;
    const optional = `<span class="opt">${t("optional")}</span>`;
    const company = form.company_name;
    return page(`${formT(lang, "title")}: ${company}`, `<div class="top"><h1>${t("title")}</h1>${languageMenu(form, lang)}</div>
<p>${t("intro", { company })}</p>
${error ? `<p class="err" role="alert">${esc(error)}</p>` : ""}
<form method="post" action="/privacy-request/${esc(form.token)}">
<input type="hidden" name="lang" value="${esc(lang)}">
<label>${t("email")}<input type="email" name="email" required maxlength="255" autocomplete="email" placeholder="name@example.com" value="${esc(values.email)}"></label>
<label>${t("name")} ${optional}<input name="name" maxlength="255" autocomplete="name" value="${esc(values.name)}"></label>
<label>${t("type_q")}<select name="type">${REQUEST_TYPES.map((r) => option(r.id, t(`type_${r.id}`), values.type)).join("")}</select></label>
<label>${t("region_q")}<select name="region">${PUBLIC_REGIONS.map((r) => option(r.id, t(`region_${r.id}`), values.region)).join("")}</select><span class="hint">${t("region_hint")}</span></label>
<label>${t("message_q")} ${optional}<textarea name="message" rows="4" maxlength="4000">${esc(values.message)}</textarea></label>
<label class="hp" aria-hidden="true">Website<input name="website" tabindex="-1" autocomplete="off"></label>
<input type="hidden" name="started" value="${Date.now()}">
<button type="submit">${t("send")}</button>
</form>
<small>${t("footer")}</small>`, form, lang);
}

/** A page with just a heading and a sentence; `name` picks the wording. */
function notice(name, lang, form, vars) {
    const title = formT(lang, `${name}_title`, vars);
    return page(title, `<h1>${esc(title)}</h1><p>${esc(formT(lang, `${name}_text`, vars))}</p>`, form, lang);
}

async function sendEmail(to, subject, html) {
    const key = process.env.RESEND_API_KEY;
    if (!key) return false;
    const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: process.env.RESEND_FROM || "alerts@intastellarconsents.com", to: [to], subject, html }),
    });
    if (!response.ok) console.error("[dsr-public] email failed:", response.status);
    return response.ok;
}

function send(res, status, html) {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; img-src data:; form-action 'self'; base-uri 'none'");
    res.setHeader("X-Content-Type-Options", "nosniff");
    return res.status(status).send(html);
}

async function loadForm(db, token) {
    const { rows } = await db.query(`SELECT * FROM dsr_public_forms WHERE token = $1 AND enabled = TRUE`, [String(token).slice(0, 64)]);
    return rows[0] || null;
}

async function submit(req, res, db, form, lang) {
    const body = req.body || {};
    const values = validatePublicSubmission(body, form);
    if (values.spam) return send(res, 200, notice("check", lang, form));
    if (values.error) return send(res, 400, formPage(form, formT(lang, values.error), body, lang));

    const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
    const ipHash = sha(`${ip}|${process.env.CRON_SECRET || ""}`);
    const { rows: [{ by_ip, by_form }] } = await db.query(
        `SELECT COUNT(*) FILTER (WHERE ip_hash = $1 AND created_at > NOW() - INTERVAL '1 hour')::int AS by_ip,
                COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '1 day')::int AS by_form
           FROM dsr_public_submissions WHERE form_token = $2`,
        [ipHash, form.token]
    );
    if (by_ip >= MAX_PER_IP_HOUR || by_form >= MAX_PER_FORM_DAY) return send(res, 429, notice("busy", lang, form));

    const code = randomBytes(24).toString("base64url");
    await db.query(
        `INSERT INTO dsr_public_submissions (token_hash, form_token, payload, ip_hash, expires_at) VALUES ($1, $2, $3::jsonb, $4, NOW() + INTERVAL '${CONFIRM_DAYS} days')`,
        [sha(code), form.token, JSON.stringify({ ...values, lang }), ipHash]
    );
    const link = `${BASE}/privacy-request/confirm/${code}?lang=${lang}`;
    const company = form.company_name;
    const sent = await sendEmail(values.requester_email, formT(lang, "mail_subject", { company }),
        `<p>${esc(formT(lang, "mail_intro", { company }))}</p><p><a href="${link}">${esc(formT(lang, "mail_button"))}</a></p><p>${esc(formT(lang, "mail_ignore"))}</p>`);
    if (!sent) {
        await db.query(`DELETE FROM dsr_public_submissions WHERE token_hash = $1`, [sha(code)]);
        return send(res, 503, formPage(form, formT(lang, "error_send"), body, lang));
    }
    return send(res, 200, notice("check", lang, form));
}

function confirmPage(code, lang) {
    const title = formT(lang, "confirm_title");
    return page(title, `<h1>${esc(title)}</h1><p>${esc(formT(lang, "confirm_text"))}</p><form method="post" action="/privacy-request/confirm/${esc(code)}?lang=${lang}"><button type="submit">${esc(formT(lang, "confirm_button"))}</button></form>`, null, lang);
}

async function confirm(res, db, code, lang) {
    // Deleting first makes the link single-use, even if pressed twice.
    const { rows } = await db.query(
        `DELETE FROM dsr_public_submissions WHERE token_hash = $1 AND expires_at > NOW() RETURNING form_token, payload, created_at`,
        [sha(String(code))]
    );
    if (!rows[0]) return send(res, 410, notice("gone", lang));
    const form = await loadForm(db, rows[0].form_token);
    if (!form) return send(res, 410, notice("closed", lang));
    const received = new Date(rows[0].created_at).toISOString().slice(0, 10);
    const values = validateNewRequest({ ...rows[0].payload, received_at: received, domain: form.domain });
    if (values.error) return send(res, 400, notice("wrong", lang, form));
    await createRequest(db, form.organisation_id, "Public request form", { ...values, source: "public_form" });
    if (form.notify_email) await sendEmail(form.notify_email, "New data subject request", `<p>A new data subject request was confirmed for ${esc(form.company_name)}. Open the DSR portal to handle it.</p>`).catch(() => {});
    return send(res, 200, notice("received", lang, form, { company: form.company_name }));
}

export default async function handler(req, res) {
    if (req.method !== "GET" && req.method !== "POST") {
        res.setHeader("Allow", "GET, POST");
        return res.status(405).end();
    }
    const lang = pickFormLanguage(req.query.lang || req.body?.lang, req.headers["accept-language"]);
    try {
        const db = getPool();
        await ensureDsrTables(db);
        if (req.query.confirm) return req.method === "POST" ? await confirm(res, db, req.query.confirm, lang) : send(res, 200, confirmPage(req.query.confirm, lang));
        const form = req.query.token ? await loadForm(db, req.query.token) : null;
        if (!form) return send(res, 404, notice("missing", lang));
        return req.method === "POST" ? await submit(req, res, db, form, lang) : send(res, 200, formPage(form, "", {}, lang));
    } catch (err) {
        console.error("[dsr-public]", err.message);
        return send(res, 500, notice("wrong", lang));
    }
}
