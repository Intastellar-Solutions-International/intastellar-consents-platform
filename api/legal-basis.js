import { getPool } from "./_db.js";
import { requireMember } from "./_member-auth.js";
import { bannerLegalBasis, ensureLegalBasisTables, readLegalBasis, saveLegalBasis, validateMatrix, validateServices } from "./_legal-basis.js";

/**
 * /api/legal-basis — the organisation's Legal Basis Tracking settings.
 *
 * GET                    → { matrix, services, banner, updated_at, updated_by }
 * POST { matrix, services } → the same, after saving
 * GET ?organisation=ID (no login) → { legalBasis } — the block for that organisation's config.js.
 *   It's public anyway once it's in config.js, and holds no customer data.
 *
 * Headers: Authorization (Bearer), Organisation, X-User-Email
 */
const ALLOWED_ORIGINS = [
    "https://www.intastellarconsents.com",
    "https://www.consentsmanagement.com",
    "https://consentsplatform.com",
    "http://localhost:8080",
    "http://localhost:3000",
];

const SYNC_URL = "https://apis.intastellarsolutions.com/analytics/settings/legal-basis-sync";

const view = (stored) => ({ ...stored, banner: bannerLegalBasis(stored.services) });

/** Has the PHP server rewrite the legal basis block in the organisation's config.js files, as the signed-in user. */
async function syncBannerConfigs(req, member) {
    try {
        const response = await fetch(SYNC_URL, {
            method: "POST",
            headers: { Authorization: req.headers.authorization, "X-User-Email": member.email, "Content-Type": "application/json" },
            body: JSON.stringify({ organisationId: member.organisationId }),
            signal: AbortSignal.timeout(20000),
        });
        const body = await response.json().catch(() => ({}));
        return response.ok ? { ok: true, updated: body.updated || [], skipped: body.skipped || [] } : { ok: false, error: body.error || `responded ${response.status}` };
    } catch (err) {
        console.error("[legal-basis] sync", err.message);
        return { ok: false, error: "The banner files could not be updated" };
    }
}

export default async function handler(req, res) {
    const origin = req.headers.origin || "";
    if (ALLOWED_ORIGINS.includes(origin)) res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Authorization, Organisation, Content-Type, X-User-Email");
    if (req.method === "OPTIONS") return res.status(204).end();
    if (req.method !== "GET" && req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

    const db = getPool();
    try {
        await ensureLegalBasisTables(db);

        if (req.method === "GET" && req.query.organisation) {
            const organisationId = parseInt(req.query.organisation, 10);
            if (!organisationId) return res.status(400).json({ error: "Invalid organisation" });
            const { services } = await readLegalBasis(db, organisationId);
            // Read by legal-basis-sync.php right after a save, so a cached copy would write the old services.
            res.setHeader("Cache-Control", "no-store");
            return res.json({ legalBasis: bannerLegalBasis(services) });
        }

        const member = await requireMember(req);
        if (member.error) return res.status(member.status).json({ error: member.error });
        res.setHeader("Cache-Control", "private, no-store");

        if (req.method === "POST") {
            const matrix = validateMatrix(req.body?.matrix);
            if (matrix.error) return res.status(400).json({ error: matrix.error });
            const services = validateServices(req.body?.services);
            if (services.error) return res.status(400).json({ error: services.error });
            await saveLegalBasis(db, member.organisationId, { matrix: matrix.matrix, services: services.services }, member.email);
            return res.json({ ...view(await readLegalBasis(db, member.organisationId)), sync: await syncBannerConfigs(req, member) });
        }
        return res.json(view(await readLegalBasis(db, member.organisationId)));
    } catch (err) {
        console.error("[legal-basis]", err.message);
        return res.status(500).json({ error: "Could not load the legal basis settings" });
    }
}
