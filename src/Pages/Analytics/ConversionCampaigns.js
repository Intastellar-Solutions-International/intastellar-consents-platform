const { useState, useEffect, useMemo } = React;
import { ScannerHost } from "../../API/host.js";
import { authHeaders, formatCurrency } from "./_shared.js";
import { IconMegaphone, IconChevronDown } from "./Icons.js";
import { appLocale } from "../../Functions/format.js";

const PLATFORM_LABEL = { meta_ads: "Meta", google_ads: "Google Ads", microsoft_ads: "Microsoft Ads" };

// Same source pattern analytics-report-detail.js uses to classify 'paid_social'
// vs 'paid' traffic — used here only as a fallback label for campaigns that
// didn't match a connected ad account's spend data, so they still roll up
// under a named platform instead of disappearing into "Other."
function inferPlatformFromSource(source) {
    const s = (source || "").trim().toLowerCase();
    if (!s) return null;
    if (/^(fb|facebook|ig|instagram|msg|messenger|an)$/.test(s)) return "meta_ads";
    if (/google/.test(s)) return "google_ads";
    if (/(bing|microsoft)/.test(s)) return "microsoft_ads";
    return null;
}

function useAdCampaignReport(domain, fromIso, toIso) {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!domain) { setData(null); return; }
        let ignore = false;
        setLoading(true);
        const qs = new URLSearchParams({ domain, fromDate: fromIso, toDate: toIso }).toString();
        fetch(`${ScannerHost}/api/ad-campaign-report?${qs}`, { headers: authHeaders() })
            .then(async r => {
                if (!r.ok) throw new Error(r.status);
                if (!ignore) setData(await r.json());
            })
            .catch(() => { if (!ignore) setData(null); })
            .finally(() => { if (!ignore) setLoading(false); });
        return () => { ignore = true; };
    }, [domain, fromIso, toIso]);

    return { data, loading };
}

/**
 * Joins first-party conversion volume (grouped by utm_campaign) against
 * real ad-platform campaign data. Meta's campaign insights put the raw
 * numeric campaign id straight into utm_campaign when links are tagged
 * with it, so id is tried first; a human-named campaign only matches by
 * name. Campaigns that match neither still show — just without spend.
 */
export default function ConversionCampaigns({ domain, fromIso, toIso, byCampaign }) {
    const { data: adData, loading: adLoading } = useAdCampaignReport(domain, fromIso, toIso);
    const [expanded, setExpanded] = useState(null);

    const adLookup = useMemo(() => {
        const byId = new Map();
        const byName = new Map();
        (adData?.platforms || []).forEach(p => {
            (p.campaigns || []).forEach(c => {
                const row = { name: c.name, spend: c.spend, currency: c.currency, platform: p.platform };
                if (c.id != null) byId.set(String(c.id), row);
                if (c.name) byName.set(String(c.name).trim().toLowerCase(), row);
            });
        });
        return { byId, byName };
    }, [adData]);

    const rows = useMemo(() => {
        return (byCampaign || []).map(r => {
            const ad = adLookup.byId.get(r.campaign) || adLookup.byName.get(r.campaign.trim().toLowerCase()) || null;
            const costPerConversion = ad && ad.spend > 0 && r.count > 0 ? ad.spend / r.count : null;
            return { ...r, ad, costPerConversion };
        });
    }, [byCampaign, adLookup]);

    // Platform-level rollup — "which ad channel actually produced bookings/
    // purchases" is a decision made at the Google Ads vs Meta vs Microsoft
    // Ads level, not by reading individual campaign rows one at a time.
    // Campaigns without a matched connected-account spend row still count
    // toward their inferred platform's conversions (just not its spend), so
    // a disconnected/unmatched account doesn't silently vanish from the
    // comparison.
    const platformRows = useMemo(() => {
        const byPlatform = new Map();
        rows.forEach(r => {
            const platform = r.ad?.platform || inferPlatformFromSource(r.source) || "other";
            let entry = byPlatform.get(platform);
            if (!entry) {
                entry = { platform, conversions: 0, spend: 0, currency: null, hasSpend: false };
                byPlatform.set(platform, entry);
            }
            entry.conversions += r.count;
            if (r.ad && r.ad.spend > 0) {
                entry.spend += r.ad.spend;
                entry.hasSpend = true;
                entry.currency = r.ad.currency || entry.currency;
            }
        });
        return Array.from(byPlatform.values())
            .map(e => ({ ...e, costPerConversion: e.hasSpend && e.conversions > 0 ? e.spend / e.conversions : null }))
            .sort((a, b) => b.conversions - a.conversions);
    }, [rows]);

    const platformInsight = useMemo(() => {
        const withSpend = platformRows.filter(p => p.costPerConversion != null);
        if (withSpend.length < 2) return null;
        const cheapest = withSpend.reduce((a, b) => (a.costPerConversion <= b.costPerConversion ? a : b));
        const priciest = withSpend.reduce((a, b) => (a.costPerConversion >= b.costPerConversion ? a : b));
        if (cheapest.platform === priciest.platform) return null;
        return { cheapest, priciest };
    }, [platformRows]);

    if (!rows.length) {
        return (
            <div className="sa-panel sa-conv-campaigns">
                <h3 className="sa-panel__title"><IconMegaphone className="sa-icon" /> Campaigns</h3>
                <p className="sa-panel__sub">
                    No campaign-linked conversions in this period. Tag campaign links with{" "}
                    <code>?utm_campaign=</code>, or connect a Google Ads account so visits with a{" "}
                    <code>gclid</code> resolve automatically, to see them here.
                </p>
            </div>
        );
    }

    return (
        <div className="sa-panel sa-conv-campaigns">
            <h3 className="sa-panel__title">
                <IconMegaphone className="sa-icon" /> Campaigns
                <span className="sa-panel__consent-note">
                    session-linked conversions only{adLoading ? " · loading ad spend…" : ""}
                </span>
            </h3>

            {platformRows.length > 0 && (
                <>
                    <h4 className="sa-panel__sub-title">By ad platform</h4>
                    <table className="sa-table sa-conv-campaigns__platform-table">
                        <thead>
                            <tr>
                                <th>Platform</th>
                                <th className="sa-table__num">Conversions</th>
                                <th className="sa-table__num">Ad spend</th>
                                <th className="sa-table__num">Cost / conversion</th>
                            </tr>
                        </thead>
                        <tbody>
                            {platformRows.map(p => (
                                <tr key={p.platform}>
                                    <td>{PLATFORM_LABEL[p.platform] || "Other paid source"}</td>
                                    <td className="sa-table__num">{p.conversions.toLocaleString(appLocale())}</td>
                                    <td className="sa-table__num">{p.hasSpend ? formatCurrency(p.spend, p.currency) : "—"}</td>
                                    <td className="sa-table__num">
                                        {p.costPerConversion != null ? formatCurrency(p.costPerConversion, p.currency) : "—"}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {platformInsight && (
                        <p className="sa-panel__sub">
                            {PLATFORM_LABEL[platformInsight.cheapest.platform] || "That platform"} converts cheapest at{" "}
                            {formatCurrency(platformInsight.cheapest.costPerConversion, platformInsight.cheapest.currency)} per
                            conversion. {PLATFORM_LABEL[platformInsight.priciest.platform] || "The other platform"} costs{" "}
                            {formatCurrency(platformInsight.priciest.costPerConversion, platformInsight.priciest.currency)} per
                            conversion — the most expensive of the channels with spend data connected.
                        </p>
                    )}
                    <div className="sa-panel__divider" />
                </>
            )}

            <h4 className="sa-panel__sub-title">By campaign</h4>
            <table className="sa-table">
                <thead>
                    <tr>
                        <th />
                        <th>Campaign</th>
                        <th>Source / medium</th>
                        <th className="sa-table__num">Conversions</th>
                        <th className="sa-table__num">Ad spend</th>
                        <th className="sa-table__num">Cost / conversion</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map((r, i) => {
                        const hasEvents = (r.events || []).length > 0;
                        const isOpen = hasEvents && expanded === r.campaign;
                        return (
                            <React.Fragment key={r.campaign}>
                                <tr
                                    className={"sa-campaign-row" + (hasEvents ? "" : " sa-campaign-row--flat")}
                                    onClick={hasEvents ? () => setExpanded(isOpen ? null : r.campaign) : undefined}
                                >
                                    <td className="sa-campaign-row__toggle">
                                        {hasEvents && (
                                            <IconChevronDown className={"sa-icon" + (isOpen ? " sa-campaign-row__chevron--open" : "")} />
                                        )}
                                    </td>
                                    <td className="sa-table__path" title={r.campaign}>
                                        {r.displayName || r.campaign}
                                        {r.resolvedViaClickId && (
                                            <span className="sa-panel__consent-note" title="Resolved from the visitor's gclid via Google Ads' click_view API — more reliable than the utm_campaign tag">
                                                {" "}· via click ID
                                            </span>
                                        )}
                                        {r.ad && (
                                            <span className="sa-panel__consent-note">
                                                {" "}· {PLATFORM_LABEL[r.ad.platform] || r.ad.platform}
                                                {r.ad.name && r.ad.name !== r.displayName ? ` "${r.ad.name}"` : ""}
                                            </span>
                                        )}
                                    </td>
                                    <td>{[r.source, r.medium].filter(Boolean).join(" / ") || "—"}</td>
                                    <td className="sa-table__num">{r.count.toLocaleString(appLocale())}</td>
                                    <td className="sa-table__num">
                                        {r.ad ? formatCurrency(r.ad.spend, r.ad.currency) : "—"}
                                    </td>
                                    <td className="sa-table__num">
                                        {r.costPerConversion != null ? formatCurrency(r.costPerConversion, r.ad.currency) : "—"}
                                    </td>
                                </tr>
                                {isOpen && (
                                    <tr className="sa-campaign-row__detail">
                                        <td />
                                        <td colSpan={5}>
                                            <div className="sa-campaign-events">
                                                {(r.events || []).map(ev => (
                                                    <span key={ev.name} className="sa-campaign-event-chip">
                                                        {ev.label}
                                                        <b>{ev.count.toLocaleString(appLocale())}</b>
                                                    </span>
                                                ))}
                                            </div>
                                        </td>
                                    </tr>
                                )}
                            </React.Fragment>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}
