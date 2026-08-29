import { getPool } from "./_db.js";
/**
 * GET /api/jurisdiction-config-public?org=123
 *
 * Public, no-auth endpoint for the consent banner script.
 * Returns the jurisdiction mode and per-framework settings for an organisation.
 *
 * Response shape:
 *   {
 *     mode: "auto" | "managed",
 *     frameworks: {
 *       GDPR:  { enabled: true,  bannerType: "opt-in" },
 *       LGPD:  { enabled: true,  bannerType: "auto"   },
 *       CCPA:  { enabled: false, bannerType: "auto"   },
 *       PDPA:  { enabled: true,  bannerType: "auto"   },
 *       POPIA: { enabled: false, bannerType: "auto"   },
 *     }
 *   }
 *
 * mode = "auto":
 *   No saved config for this org, or managed mode is off.
 *   The banner should auto-detect the visitor's country and apply all
 *   matching regulations. This is the default for sites without a CMP account.
 *
 * mode = "managed":
 *   The org has explicitly configured which regulations apply.
 *   The banner should only show for enabled frameworks and use the
 *   specified bannerType per framework.
 *
 * Response is cached for 5 minutes (CDN-friendly).
 */
const FRAMEWORK_IDS = ["GDPR", "LGPD", "CCPA", "PDPA", "POPIA"];

const AUTO_RESPONSE = {
    mode: "auto",
    frameworks: Object.fromEntries(
        FRAMEWORK_IDS.map((fw) => [fw, { enabled: true, bannerType: "auto" }])
    ),
};

const ALLOWED_ORIGINS = ["*"]; // public endpoint — allow all origins

function setCors(res) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=60");
}

export default async function handler(req, res) {
    setCors(res);
    if (req.method === "OPTIONS") return res.status(204).end();

    if (req.method !== "GET") {
        res.setHeader("Allow", "GET, OPTIONS");
        return res.status(405).json({ error: "Method not allowed" });
    }

    const orgId = parseInt(req.query.org || "0", 10);

    // No org provided — small site without a CMP account, use auto mode
    if (!orgId) return res.json(AUTO_RESPONSE);

    try {
        const { rows } = await getPool().query(
            `SELECT managed, config FROM jurisdiction_config WHERE organisation_id = $1`,
            [orgId]
        );

        // No saved config, or managed mode explicitly off — auto mode
        if (!rows.length || !rows[0].managed) {
            return res.json(AUTO_RESPONSE);
        }

        const saved = rows[0].config || {};

        // Build framework map: merge saved config with auto defaults for any missing framework
        const frameworks = Object.fromEntries(
            FRAMEWORK_IDS.map((fw) => [
                fw,
                {
                    enabled:    saved[fw]?.enabled    ?? false,
                    bannerType: saved[fw]?.bannerType ?? "auto",
                },
            ])
        );

        return res.json({ mode: "managed", frameworks });
    } catch (err) {
        console.error("[jurisdiction-config-public] Error:", err.message);
        // Fail open — return auto mode so the banner still works if DB is down
        return res.json(AUTO_RESPONSE);
    }
}
