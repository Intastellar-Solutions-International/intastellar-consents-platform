/**
 * GET /api/billing-subscription
 *
 * The organisation's current plan, read by the platform's paywall and tier
 * gating (src/Functions/tier.js).
 *   Headers: Authorization, Organisation
 *   200 { subscription: "none" | "personal" | "starter" | "growth" | "agency-pro",
 *         status, current_period_end, cancel_at_period_end, portal_url }
 */

import { getPool } from "./_db.js";
import { setCors, requestOrganisation, organisationSubscription } from "./_stripe.js";

export default async function handler(req, res) {
    setCors(req, res, "GET");
    if (req.method === "OPTIONS") return res.status(204).end();
    if (req.method !== "GET") {
        res.setHeader("Allow", "GET, OPTIONS");
        return res.status(405).json({ error: "Method not allowed" });
    }
    res.setHeader("Cache-Control", "no-store");

    const auth = requestOrganisation(req);
    if (auth.error === 401) return res.status(401).json({ error: "Unauthorized" });
    if (auth.error) return res.status(400).json({ error: "Missing Organisation header" });

    try {
        return res.status(200).json(await organisationSubscription(getPool(), auth.organisationId));
    } catch (err) {
        console.error("[billing-subscription]", err.message);
        return res.status(500).json({ error: "Internal server error" });
    }
}
