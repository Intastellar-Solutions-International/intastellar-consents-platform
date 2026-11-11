import API from "../API/api.js";

/**
 * Talks to /api/evidence. Every write returns the whole catalog
 * ({ documents, invites, log, types }), so callers just replace their state.
 */
export const EVIDENCE_ACCEPT = ".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg";
export const EVIDENCE_MAX_BYTES = 3 * 1024 * 1024;

async function request(body) {
    const response = await fetch(API.evidence.url, body
        ? { method: "POST", headers: API.evidence.headers, body: JSON.stringify(body) }
        : { headers: API.evidence.headers });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "That didn't work. Please try again.");
    return data;
}

const readBase64 = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = () => reject(new Error("That file couldn't be read."));
    reader.readAsDataURL(file);
});

export const loadEvidence = () => request();

export async function uploadEvidence({ vendor = null, docType, title = "", file }) {
    return request({ action: "upload", vendor, doc_type: docType, title, filename: file.name, content_type: file.type, data: await readBase64(file) });
}

export const deleteEvidence = (id) => request({ action: "delete", id });
export const inviteControlPerson = (invite) => request({ action: "invite", ...invite });
export const resendInvite = (id) => request({ action: "resend", id });
export const revokeInvite = (id) => request({ action: "revoke", id });

/** The file as an object URL for the preview; the caller revokes it. The API needs headers, so a plain src can't be used. */
export async function evidenceObjectUrl(id) {
    const response = await fetch(`${API.evidence.url}?file=${encodeURIComponent(id)}`, { headers: API.evidence.headers });
    if (!response.ok) throw new Error("That file couldn't be opened.");
    return URL.createObjectURL(await response.blob());
}

export async function downloadEvidence(doc) {
    const url = await evidenceObjectUrl(doc.id);
    const a = document.createElement("a");
    a.href = url;
    a.download = doc.filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Current documents of one vendor: { dpa, history, other }. */
export function vendorDocuments(documents, vendor) {
    const own = (documents || []).filter((d) => d.vendor === vendor);
    return {
        dpa: own.find((d) => d.doc_type === "dpa" && !d.superseded_at) || null,
        history: own.filter((d) => d.doc_type === "dpa" && d.superseded_at),
        other: own.filter((d) => d.doc_type !== "dpa"),
    };
}

export const formatBytes = (bytes) => (bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : bytes ? `${Math.max(1, Math.round(bytes / 1024))} KB` : "");
export const formatDay = (value) => (value ? new Date(value).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "—");
