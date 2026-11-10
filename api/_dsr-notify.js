/**
 * Bell notification for a request that arrived through the public form.
 * Written straight to the table rather than through _scan-notifications.js,
 * which would pull the whole scanner into the public form's function.
 */
const TYPE = "dsr_new_request";
const DAY_FORMAT = { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" };

/** No personal details: the bell is seen by everyone in the organisation. */
export function newRequestNotification(form, request, typeLabel) {
    const due = new Date(request.due_at).toLocaleDateString("en-GB", DAY_FORMAT);
    return { title: "New data subject request", body: `${typeLabel} request for ${form.company_name}. Response due ${due}.` };
}

/** Never throws: a bell that fails must not cost the person their confirmed request. */
export async function notifyNewRequest(db, form, request, typeLabel) {
    try {
        const { rows } = await db.query(`SELECT enabled FROM notification_preferences WHERE organisation_id = $1 AND type = $2`, [form.organisation_id, TYPE]).catch(() => ({ rows: [] }));
        if (rows[0]?.enabled === false) return false;
        const { title, body } = newRequestNotification(form, request, typeLabel);
        await db.query(
            `INSERT INTO ad_notifications (organisation_id, domain, rule_type, severity, title, body, dedupe_key, scan_id)
             VALUES ($1, $2, $3, 'warning', $4, $5, $6, $7)
             ON CONFLICT (organisation_id, dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING`,
            [form.organisation_id, form.domain || form.company_name, TYPE, title, body, `dsr:${request.id}`, String(request.id)]
        );
        return true;
    } catch (err) {
        console.error("[dsr-notify]", err.message);
        return false;
    }
}
