import { getPool } from "./_db.js";
/**
 * GET /api/analytics-site-config?site=<siteKey>
 *
 * Public, unauthenticated — the site key is already embeddable/public (same
 * trust model as GET /api/a). Read by the embed script at runtime to decide
 * whether to bootstrap session recording for this visit. Kept separate from
 * the cached, byte-identical GET /api/a response so per-site config can change
 * without needing to bust that response's CDN cache.
 */
export default async function handler(req, res) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") return res.status(204).end();
    if (req.method !== "GET") return res.status(405).end();

    const siteId = String(req.query.site || "").slice(0, 32);
    if (!siteId) return res.status(400).end();

    res.setHeader("Cache-Control", "public, max-age=120, stale-while-revalidate=600");

    const db = getPool();

    const { rows } = await db.query(
        `SELECT heatmaps_enabled, recording_enabled, recording_sample_rate,
                recording_block_selectors, recording_mask_selectors, datalayer_enabled
         FROM analytics_sites WHERE id = $1 AND active = true LIMIT 1`,
        [siteId]
    ).catch(() => ({ rows: [] }));

    if (!rows.length) {
        return res.status(200).json({
            heatmapsEnabled: false, recordingEnabled: false,
            sampleRate: 0, blockSelectors: [], maskSelectors: [],
            datalayerEnabled: false, datalayerRules: [],
        });
    }

    const site = rows[0];

    const [datalayerRuleRows, approvedDomainRows] = await Promise.all([
        site.datalayer_enabled === true
            ? db.query(
                `SELECT datalayer_event, maps_to_name, kind, value_path, currency_path, transaction_id_path
                 FROM analytics_datalayer_rules WHERE site_id = $1 AND enabled = true`,
                [siteId]
              ).catch(() => ({ rows: [] }))
            : Promise.resolve({ rows: [] }),

        db.query(
            `SELECT domain FROM analytics_foreign_domains WHERE site_id = $1 AND approved = true`,
            [siteId]
        ).catch(() => ({ rows: [] })),
    ]);

    const datalayerRules = datalayerRuleRows.rows.map(r => ({
        datalayerEvent:    r.datalayer_event,
        mapsToName:        r.maps_to_name,
        kind:              r.kind,
        valuePath:         r.value_path,
        currencyPath:      r.currency_path,
        transactionIdPath: r.transaction_id_path,
    }));

    return res.status(200).json({
        heatmapsEnabled:  site.heatmaps_enabled !== false,
        recordingEnabled: site.recording_enabled === true,
        sampleRate:       Number(site.recording_sample_rate ?? 20),
        blockSelectors:   Array.isArray(site.recording_block_selectors) ? site.recording_block_selectors : [],
        maskSelectors:    Array.isArray(site.recording_mask_selectors)  ? site.recording_mask_selectors  : [],
        datalayerEnabled: site.datalayer_enabled === true,
        datalayerRules,
        approvedDomains:  approvedDomainRows.rows.map(r => r.domain),
    });
}
