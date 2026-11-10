import API from "../../API/api.js";
import { Badge } from "../../Components/ui";
import { REQUEST_TYPES } from "../../Functions/dsr.js";

const DAY_MS = 86400000;
export const FIELD = "tw-h-10 tw-w-full tw-box-border tw-px-2 tw-bg-bg-sunken tw-text-text-primary tw-border tw-border-solid tw-border-border-strong tw-rounded-md tw-font-sans tw-text-sm focus-visible:tw-outline-none focus-visible:tw-shadow-focus";
export const AREA = `${FIELD} tw-h-auto tw-py-2`;
export const LABEL = "tw-flex tw-flex-col tw-gap-1 tw-text-xs tw-text-text-muted tw-min-w-0";

export const typeLabel = (id) => REQUEST_TYPES.find((t) => t.id === id)?.label || id;
export const requesterName = (r) => r.requester_name || r.requester_email || r.consent_id || "Anonymised";
export const isClosed = (r) => r.status === "completed" || r.status === "rejected";

const STATUS = {
    pending: { tone: "warning", icon: "clock", label: "Pending" },
    in_progress: { tone: "info", icon: "clock", label: "In progress" },
    completed: { tone: "success", icon: "check-circle", label: "Completed" },
    rejected: { tone: "neutral", icon: "minus-circle", label: "Rejected" },
    overdue: { tone: "danger", icon: "alert-octagon", label: "Overdue" },
};

export function DsrStatusBadge({ request }) {
    const s = STATUS[request.overdue ? "overdue" : request.status] || STATUS.pending;
    return <Badge tone={s.tone} icon={s.icon}>{s.label}</Badge>;
}

/** "12 days left", "Due today" or "3 days overdue". */
export function daysLeftLabel(request, now = Date.now()) {
    const remaining = (new Date(request.effective_due_at).getTime() - now) / DAY_MS;
    if (request.overdue) { const late = Math.max(1, Math.ceil(-remaining)); return `${late} day${late === 1 ? "" : "s"} overdue`; }
    const days = Math.ceil(remaining);
    if (days <= 1) return "Due today";
    return `${days} days left`;
}

async function readJson(response) {
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "That didn't work. Please try again.");
    return data;
}

export const fetchDsr = (query = "") => fetch(`${API.dsr.url}${query}`, { headers: API.dsr.headers }).then(readJson);
export const postDsr = (body) => fetch(API.dsr.url, { method: "POST", headers: API.dsr.headers, body: JSON.stringify(body) }).then(readJson);
