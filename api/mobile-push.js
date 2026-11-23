import { getPool } from "./_db.js";
import { requireMember } from "./_member-auth.js";
import { ensureMobilePushTable, listAlerts, registerDevice, unregisterDevice } from "./_mobile-push.js";

/**
 * /api/mobile-push — the mobile app's alerts (see _mobile-push.js).
 *
 *   GET                                         → { alerts }  recent alerts of the organisation
 *   POST { action: "register", token, platform, language }   opt this phone in
 *   POST { action: "unregister", token }                     opt it out
 *
 * Signed in: Authorization + Organisation (requireMember).
 */
export default async function handler(req, res) {
    res.setHeader("Cache-Control", "no-store");
    if (req.method !== "GET" && req.method !== "POST") {
        res.setHeader("Allow", "GET, POST");
        return res.status(405).json({ error: "Method not allowed" });
    }
    const member = await requireMember(req);
    if (member.error) return res.status(member.status).json({ error: member.error });

    const db = getPool();
    try {
        if (req.method === "GET") {
            return res.status(200).json({ alerts: await listAlerts(db, member.organisationId) });
        }
        await ensureMobilePushTable(db);
        const { action, token, platform, language } = req.body || {};
        const result = action === "register"
            ? await registerDevice(db, { member, token, platform, language })
            : action === "unregister"
                ? await unregisterDevice(db, { member, token })
                : { status: 400, error: "Unknown action" };
        return result.error ? res.status(result.status).json({ error: result.error }) : res.status(200).json(result);
    } catch (err) {
        console.error("[mobile-push]", err.message);
        return res.status(500).json({ error: "Request failed" });
    }
}
