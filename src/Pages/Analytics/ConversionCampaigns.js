const { useState, useEffect, useMemo } = React;
import { ScannerHost } from "../../API/host.js";
import { authHeaders } from "./_shared.js";
import { IconMegaphone, IconChevronDown } from "./Icons.js";

const CURRENCY_SYMBOLS = { EUR: "€", USD: "$", GBP: "£", CHF: "CHF", DKK: "kr", SEK: "kr", NOK: "kr", PLN: "zł" };

function formatMoney(n, currency) {
    const symbol = CURRENCY_SYMBOLS[currency] || (currency ? currency + " " : "");
    return `${symbol} ${Number(n || 0).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const PLATFORM_LABEL = { meta_ads: "Meta", google_ads: "Google Ads", microsoft_ads: "Microsoft Ads" };

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

    if (!rows.length) {
        return (
            <div className="sa-panel sa-conv-campaigns">
                <h3 className="sa-panel__title"><IconMegaphone className="sa-icon" /> Campaigns</h3>
                <p className="sa-panel__sub">
                    No UTM-tagged conversions in this period. Tag campaign links with{" "}
                    <code>?utm_campaign=</code> to see them here.
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
                                        {r.campaign}
                                        {r.ad && (
                                            <span className="sa-panel__consent-note">
                                                {" "}· {PLATFORM_LABEL[r.ad.platform] || r.ad.platform}
                                                {r.ad.name && r.ad.name !== r.campaign ? ` "${r.ad.name}"` : ""}
                                            </span>
                                        )}
                                    </td>
                                    <td>{[r.source, r.medium].filter(Boolean).join(" / ") || "—"}</td>
                                    <td className="sa-table__num">{r.count.toLocaleString("de-DE")}</td>
                                    <td className="sa-table__num">
                                        {r.ad ? formatMoney(r.ad.spend, r.ad.currency) : "—"}
                                    </td>
                                    <td className="sa-table__num">
                                        {r.costPerConversion != null ? formatMoney(r.costPerConversion, r.ad.currency) : "—"}
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
                                                        <b>{ev.count.toLocaleString("de-DE")}</b>
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
