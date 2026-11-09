const DAY_MS = 86400000;

/** Open requests, how many fall due within 7 days, and how many are overdue. deadlineDays: days per regulation, 30 otherwise. */
export function dsrSummary(requests, deadlineDays = {}, now = Date.now()) {
    const open = requests.filter((r) => r.status !== "completed");
    let dueSoon = 0, overdue = 0;
    for (const r of open) {
        const deadline = new Date(r.submitted);
        deadline.setDate(deadline.getDate() + (deadlineDays[r.regulation] ?? 30));
        const left = deadline.getTime() - now;
        if (left < 0) overdue += 1;
        else if (left <= 7 * DAY_MS) dueSoon += 1;
    }
    return { open: open.length, dueSoon, overdue };
}
