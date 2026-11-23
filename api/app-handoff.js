import { getPool } from "./_db.js";
import { requireMember } from "./_member-auth.js";
import { bearerToken, createHandoff, ensureHandoffTable, redeemHandoff } from "./_app-handoff.js";

/**
 * POST /api/app-handoff — mobile app → web dashboard without a second sign-in
 * (see _app-handoff.js).
 *
 *   { action: "create", user }  (signed in: Authorization + Organisation)
 *       → { code, expiresIn }   called by the app before opening the web
 *   { action: "redeem", code }  (no sign-in — the code is the credential)
 *       → { token, email, organisationId, user }   called by /app-handoff
 */
export default async function handler(req, res) {
    res.setHeader("Cache-Control", "no-store");
    if (req.method !== "POST") {
        res.setHeader("Allow", "POST");
        return res.status(405).json({ error: "Method not allowed" });
    }

    const { action, code, user } = req.body || {};
    const db = getPool();
    try {
        await ensureHandoffTable(db);
        if (action === "create") {
            const member = await requireMember(req);
            if (member.error) return res.status(member.status).json({ error: member.error });
            const result = await createHandoff(db, { member, token: bearerToken(req.headers.authorization), user });
            return result.error ? res.status(result.status).json({ error: result.error }) : res.status(200).json(result);
        }
        if (action === "redeem") {
            const result = await redeemHandoff(db, code);
            return result.error ? res.status(result.status).json({ error: result.error }) : res.status(200).json(result);
        }
        return res.status(400).json({ error: "Unknown action" });
    } catch (err) {
        console.error("[app-handoff]", err.message);
        return res.status(500).json({ error: "Hand-over failed" });
    }
}
