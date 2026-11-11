import { emailLayout, emailEsc, emailP, emailFacts, INTASTELLAR_LOGO_ATTACHMENT } from "./_email-layout.js";
import { LOGIN_MINUTES } from "./_evidence.js";

export const ROOM_BASE = "https://www.intastellarconsents.com/evidence-room";
const SENDER = "privacy@intastellar.com";

const longDate = (value) => new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const companyOf = (invite) => invite.organisation_name || "An organisation";

/** To the control person when they're invited, or when a member sends the link again. */
export function inviteEmail(invite, token) {
    const company = companyOf(invite);
    const link = `${ROOM_BASE}/${token}`;
    return {
        subject: `${company} shared its compliance evidence with you`,
        html: emailLayout({
            heading: "You've been invited to review compliance evidence",
            body: emailP(`${emailEsc(company)} invited you to review its compliance documents, such as data processing agreements, in read-only form.`)
                + (invite.note ? emailP(`<em>“${emailEsc(invite.note)}”</em>`) : "")
                + emailFacts([["Invited by", emailEsc(invite.created_by || company)], ["Access until", emailEsc(longDate(invite.expires_at))]]),
            cta: { label: "Open the evidence room", href: link },
            note: `Each time you open it, we email a one-time sign-in link to this address. Every document you open is logged for ${emailEsc(company)}.<br><br><span style="font-size:13px;word-break:break-all">If the button doesn't work, copy this link:<br><a href="${emailEsc(link)}" style="color:#8a6a1f">${emailEsc(link)}</a></span>`,
        }),
        attachments: [INTASTELLAR_LOGO_ATTACHMENT],
    };
}

export function loginEmail(invite, token, code) {
    const link = `${ROOM_BASE}/${token}/login/${code}`;
    return {
        subject: `Your sign-in link for ${companyOf(invite)}'s evidence room`,
        html: emailLayout({
            heading: "Sign in to the evidence room",
            body: emailP(`Use this link to open ${emailEsc(companyOf(invite))}'s compliance evidence. It works once, for ${LOGIN_MINUTES} minutes.`),
            cta: { label: "Sign in", href: link },
            note: `If you didn't ask for this, ignore this email.<br><br><span style="font-size:13px;word-break:break-all"><a href="${emailEsc(link)}" style="color:#8a6a1f">${emailEsc(link)}</a></span>`,
        }),
        attachments: [INTASTELLAR_LOGO_ATTACHMENT],
    };
}

export async function sendEvidenceEmail(to, { subject, html, attachments }) {
    const key = process.env.RESEND_API_KEY;
    if (!key) return false;
    const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: SENDER, to: [to], subject, html, attachments }),
    });
    if (!response.ok) console.error("[evidence] email failed:", response.status, (await response.text().catch(() => "")).slice(0, 300));
    return response.ok;
}
