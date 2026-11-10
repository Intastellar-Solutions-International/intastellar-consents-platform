const DAY_MS = 86400000;
const CLOSED = new Set(["completed", "rejected"]);

/** Open requests, how many fall due within 7 days, and how many are overdue. */
export function dsrSummary(requests, now = Date.now()) {
    const open = requests.filter((r) => !CLOSED.has(r.status) && !r.is_test);
    let dueSoon = 0, overdue = 0;
    for (const r of open) {
        if (r.paused) continue;
        const left = new Date(r.effective_due_at).getTime() - now;
        if (left < 0) overdue += 1;
        else if (left <= 7 * DAY_MS) dueSoon += 1;
    }
    return { open: open.length, dueSoon, overdue };
}
