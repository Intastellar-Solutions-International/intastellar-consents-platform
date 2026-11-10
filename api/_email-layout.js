import { EMAIL_LOGO_PNG_BASE64 } from "./_email-logo.js";

/**
 * The look of every email we send. Tables and inline styles, because that is
 * what mail clients render. Logos travel as inline attachments; clients drop
 * SVG and data: images.
 */
export const emailEsc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const LOGO_CID = "intastellar-logo";
export const INTASTELLAR_LOGO_ATTACHMENT = { filename: "intastellar-consents.png", content: EMAIL_LOGO_PNG_BASE64, content_id: LOGO_CID };
const INTASTELLAR_BRAND = `<img src="cid:${LOGO_CID}" alt="Intastellar Consents" height="26" style="display:block;height:26px;width:auto;max-width:220px;border:0">`;

export const EMAIL_FONT = "font-family:Arial,Helvetica,sans-serif;";
const TONES = { critical: ["#b42318", "#fef3f2"], warning: ["#b54708", "#fffaeb"], info: ["#175cd3", "#eff8ff"], brand: ["#7a5c17", "#faf5e8"] };

/** A paragraph in the body style. `html` must already be escaped. */
export const emailP = (html, extra = "") => `<p style="margin:0 0 12px;${EMAIL_FONT}font-size:16px;line-height:24px;color:#4a4a4a;${extra}">${html}</p>`;

/** Label and value rows. Both must already be escaped. */
export function emailFacts(rows) {
    const body = rows.map(([label, value]) => `<tr><td style="padding:8px 12px 8px 0;${EMAIL_FONT}font-size:14px;color:#5f5f5f;border-top:1px solid #e5e5e2">${label}</td><td style="padding:8px 0;${EMAIL_FONT}font-size:14px;font-weight:700;color:#1c1c1c;text-align:right;border-top:1px solid #e5e5e2">${value}</td></tr>`).join("");
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:4px 0 0">${body}</table>`;
}

/**
 * heading is plain text; body, note and footer are already-escaped HTML.
 * brand replaces the Intastellar logo; badge is { text, tone }; cta is { label, href }.
 */
export function emailLayout({ lang = "en", brand = INTASTELLAR_BRAND, badge, heading, body, cta, note, footer, width = 520 }) {
    const [color, tint] = TONES[badge?.tone] || TONES.brand;
    return `<!doctype html><html lang="${emailEsc(lang)}"><head><meta charset="utf-8"></head><body style="margin:0;padding:0;background:#f5f5f4">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f4"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:${width}px;background:#ffffff;border:1px solid #d6d6d3;border-radius:12px">
<tr><td style="padding:28px 28px 0">${brand}</td></tr>
${badge ? `<tr><td style="padding:20px 28px 0"><span style="display:inline-block;padding:4px 10px;background:${tint};border-radius:999px;${EMAIL_FONT}font-size:13px;font-weight:700;color:${color}">${badge.text}</span></td></tr>` : ""}
<tr><td style="padding:${badge ? 12 : 24}px 28px 0;${EMAIL_FONT}font-size:24px;line-height:30px;font-weight:700;color:#1c1c1c">${emailEsc(heading)}</td></tr>
<tr><td style="padding:10px 28px 0">${body}</td></tr>
${cta ? `<tr><td style="padding:16px 28px 0"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td bgcolor="#8a6a1f" style="border-radius:8px"><a href="${emailEsc(cta.href)}" style="display:inline-block;padding:13px 22px;${EMAIL_FONT}font-size:16px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:8px">${emailEsc(cta.label)}</a></td></tr></table></td></tr>` : ""}
<tr><td style="padding:20px 28px 28px;${EMAIL_FONT}font-size:14px;line-height:21px;color:#5f5f5f">${note || ""}</td></tr>
</table>
${footer ? `<p style="max-width:${width}px;margin:16px auto 0;${EMAIL_FONT}font-size:13px;line-height:19px;color:#5f5f5f">${footer}</p>` : ""}
</td></tr></table></body></html>`;
}
