const { useState, useEffect, useCallback, useRef } = React;
import { ScannerHost } from "../../API/host.js";
import StickyPageTitle from "../../Components/Header/Sticky/index.js";
import { authHeaders, useAnalyticsPageChrome, toIsoDate } from "./_shared.js";
import "./Analytics.css";

const ATTRIBUTION_URL = `${ScannerHost}/api/analytics-attribution`;
const PUSH_URL        = `${ScannerHost}/api/ad-conversion-push`;
const AD_RESOLVE_URL  = `${ScannerHost}/api/ad-id-resolve`;

// Shared cache across renders — avoids re-fetching the same ID on date-range changes
const _resolveCache = new Map();

function isNumericId(val) {
    return val && /^\d{5,}$/.test(String(val).trim());
}

function inferPlatform(ev) {
    if (ev.gclid)   return "google_ads";
    if (ev.fbclid)  return "meta_ads";
    if (ev.msclkid) return "microsoft_ads";
    return null;
}

const PLATFORM_LABELS = {
    google_ads:    "Google Ads",
    meta_ads:      "Meta Ads",
    microsoft_ads: "Microsoft Ads",
};

const PLATFORM_COLORS = {
    google_ads:    "rgba(66,133,244,0.85)",
    meta_ads:      "rgba(24,119,242,0.6)",
    microsoft_ads: "rgba(0,164,240,0.75)",
};

function StatusBadge({ status }) {
    const colors = {
        pending: "rgba(192,159,83,0.15)",
        sent:    "rgba(74,222,128,0.15)",
        failed:  "rgba(239,68,68,0.15)",
    };
    const texts = {
        pending: "rgba(192,159,83,1)",
        sent:    "rgba(74,222,128,1)",
        failed:  "rgba(239,68,68,1)",
    };
    return (
        <span style={{
            padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600,
            background: colors[status] || "rgba(100,100,100,0.15)",
            color:      texts[status]  || "rgba(180,180,180,1)",
            whiteSpace: "nowrap",
        }}>
            {status}
        </span>
    );
}

function PlatformChip({ platform }) {
    return (
        <span style={{
            padding: "2px 7px", borderRadius: 4, fontSize: 11, fontWeight: 600,
            background: (PLATFORM_COLORS[platform] || "rgba(130,130,130,0.2)").replace("0.85", "0.15").replace("0.6", "0.12").replace("0.75", "0.12"),
            color: PLATFORM_COLORS[platform] || "rgba(180,180,180,1)",
            whiteSpace: "nowrap",
        }}>
            {PLATFORM_LABELS[platform] || platform}
        </span>
    );
}

function fmtDate(iso) {
    if (!iso) return "—";
    return new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function fmtValue(cents, currency) {
    if (!cents) return "—";
    return new Intl.NumberFormat("en-GB", {
        style: "currency", currency: currency || "EUR", minimumFractionDigits: 0,
    }).format(cents / 100);
}

function KpiStrip({ summary }) {
    const kpis = [
        { label: "Attributed conversions", value: summary.totalAttributed ?? 0 },
        {
            label: "Attributed value",
            value: summary.totalAttributedValueCents
                ? fmtValue(summary.totalAttributedValueCents, "EUR")
                : "—",
        },
        { label: "Google Ads click IDs",   value: summary.platformCounts?.google_ads    ?? 0 },
        { label: "Meta Ads click IDs",     value: summary.platformCounts?.meta_ads      ?? 0 },
        { label: "Microsoft Ads click IDs",value: summary.platformCounts?.microsoft_ads ?? 0 },
        { label: "Pushes sent",     value: summary.pushStats?.sent    ?? 0, accent: "rgba(74,222,128,0.85)"  },
        { label: "Pushes pending",  value: summary.pushStats?.pending ?? 0, accent: "rgba(192,159,83,0.85)"  },
        { label: "Pushes failed",   value: summary.pushStats?.failed  ?? 0, accent: "rgba(239,68,68,0.85)"   },
    ];
    return (
        <div className="sa-rv-kpi-strip" style={{ flexWrap: "wrap", gap: 8 }}>
            {kpis.map(k => (
                <div key={k.label} className="sa-rv-kpi" style={{ minWidth: 120 }}>
                    <div className="sa-rv-kpi__label">{k.label}</div>
                    <div className="sa-rv-kpi__value" style={k.accent ? { color: k.accent } : {}}>
                        {k.value}
                    </div>
                </div>
            ))}
        </div>
    );
}

function ConversionRow({ ev, onPush, resolvedIds }) {
    const pushStatus = ev.pushes.length
        ? (ev.pushes.every(p => p.status === "sent")   ? "sent"
         : ev.pushes.some( p => p.status === "failed") ? "failed"
         : "pending")
        : "no_push";

    const platform = inferPlatform(ev);
    const campaignResolved = platform && ev.utm_campaign && isNumericId(ev.utm_campaign)
        ? resolvedIds[`${platform}:${ev.utm_campaign}`] : null;
    const adResolved = platform && ev.utm_content && isNumericId(ev.utm_content)
        ? resolvedIds[`${platform}:${ev.utm_content}`] : null;

    let campaignCell = null;
    if (campaignResolved || adResolved) {
        campaignCell = (
            <div style={{ fontSize: 12, lineHeight: 1.4 }}>
                {campaignResolved && (
                    <div style={{ color: "rgba(220,220,220,0.9)" }} title={`Campaign ID: ${ev.utm_campaign}`}>
                        {campaignResolved.name}
                    </div>
                )}
                {adResolved && (
                    <div style={{ color: "rgba(160,160,160,0.8)", fontSize: 11 }} title={`Ad ID: ${ev.utm_content}`}>
                        {adResolved.name}
                    </div>
                )}
            </div>
        );
    } else if (ev.utm_campaign || ev.utm_content) {
        campaignCell = (
            <span style={{ color: "rgba(130,130,130,0.5)", fontSize: 11 }}>
                {ev.utm_campaign || ev.utm_content}
            </span>
        );
    }

    return (
        <tr className="sa-attr-row">
            <td className="sa-attr-td">{fmtDate(ev.received_at)}</td>
            <td className="sa-attr-td">
                <span style={{ fontWeight: 600 }}>{ev.event_name}</span>
            </td>
            <td className="sa-attr-td">{fmtValue(ev.value_cents, ev.currency)}</td>
            <td className="sa-attr-td">
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                    {ev.platforms.map(p => <PlatformChip key={p} platform={p} />)}
                </div>
            </td>
            <td className="sa-attr-td">
                {campaignCell || <span style={{ color: "rgba(130,130,130,0.35)", fontSize: 11 }}>—</span>}
            </td>
            <td className="sa-attr-td">
                {ev.pushes.length === 0 ? (
                    <span style={{ color: "rgba(130,130,130,0.5)", fontSize: 12 }}>not queued</span>
                ) : (
                    <div style={{ display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap" }}>
                        {ev.pushes.map(p => (
                            <span key={p.platform} style={{ display: "flex", gap: 4, alignItems: "center" }}>
                                <PlatformChip platform={p.platform} />
                                <StatusBadge status={p.status} />
                                {p.error_message && (
                                    <span title={p.error_message} style={{ fontSize: 11, color: "rgba(239,68,68,0.8)", cursor: "help" }}>⚠</span>
                                )}
                            </span>
                        ))}
                    </div>
                )}
            </td>
            <td className="sa-attr-td" style={{ textAlign: "right" }}>
                {ev.pushes.some(p => p.status === "pending" || p.status === "failed") && (
                    <button className="sa-btn sa-btn--sm"
                        onClick={() => onPush(ev.pushes.filter(p => p.status !== "sent").map(p => p.id))}>
                        Retry
                    </button>
                )}
            </td>
        </tr>
    );
}

export default function ConversionAttribution() {
    document.title = "Conversion Attribution | Site Analytics";

    const { domain, getLastDays, setLastDays, fromDate, setFromDate, toDate, setToDate }
        = useAnalyticsPageChrome();

    const [data,        setData]        = useState(null);
    const [loading,     setLoading]     = useState(false);
    const [error,       setError]       = useState(null);
    const [pushing,     setPushing]     = useState(false);
    const [pushResult,  setPushResult]  = useState(null);
    const [resolvedIds, setResolvedIds] = useState({});
    const resolvingRef = useRef(new Set());

    const fromIso = fromDate ? toIsoDate(fromDate) : toIsoDate(new Date(Date.now() - 30 * 86400_000));
    const toIso   = toDate   ? toIsoDate(toDate)   : toIsoDate(new Date());

    const load = useCallback(() => {
        if (!domain) { setData(null); return; }
        setLoading(true); setError(null);
        const qs = new URLSearchParams({ domain, from: fromIso, to: toIso }).toString();
        fetch(`${ATTRIBUTION_URL}?${qs}`, { headers: authHeaders() })
            .then(async r => {
                if (!r.ok) throw new Error(r.status);
                setData(await r.json());
            })
            .catch(() => setError("Could not load attribution data."))
            .finally(() => setLoading(false));
    }, [domain, fromIso, toIso]);

    useEffect(() => { load(); }, [load]);

    useEffect(() => {
        if (!data?.attributed?.length || !domain) return;
        const toFetch = [];
        for (const ev of data.attributed) {
            const platform = inferPlatform(ev);
            if (!platform) continue;
            for (const id of [ev.utm_campaign, ev.utm_content]) {
                if (!isNumericId(id)) continue;
                const key = `${platform}:${id}`;
                if (!_resolveCache.has(key) && !resolvingRef.current.has(key)) toFetch.push({ key, platform, id });
            }
        }
        const unique = [...new Map(toFetch.map(x => [x.key, x])).values()];
        if (!unique.length) {
            const hit = {};
            for (const ev of data.attributed) {
                const p = inferPlatform(ev);
                if (!p) continue;
                for (const id of [ev.utm_campaign, ev.utm_content]) {
                    const key = `${p}:${id}`;
                    if (_resolveCache.has(key)) hit[key] = _resolveCache.get(key);
                }
            }
            if (Object.keys(hit).length) setResolvedIds(prev => ({ ...prev, ...hit }));
            return;
        }
        for (const { key } of unique) resolvingRef.current.add(key);
        Promise.all(unique.map(async ({ key, platform, id }) => {
            try {
                const r = await fetch(
                    `${AD_RESOLVE_URL}?platform=${platform}&id=${encodeURIComponent(id)}&domain=${encodeURIComponent(domain)}`,
                    { headers: authHeaders() }
                );
                if (r.ok) {
                    const json = await r.json();
                    _resolveCache.set(key, json);
                    return [key, json];
                }
            } catch { /* ignore */ }
            return null;
        })).then(results => {
            const updates = {};
            for (const r of results) if (r) updates[r[0]] = r[1];
            if (Object.keys(updates).length) setResolvedIds(prev => ({ ...prev, ...updates }));
            for (const { key } of unique) resolvingRef.current.delete(key);
        });
    }, [data, domain]);

    async function pushPending(ids) {
        setPushing(true); setPushResult(null);
        try {
            const body = ids?.length ? { domain, ids } : { domain };
            const r = await fetch(PUSH_URL, {
                method: "POST",
                headers: authHeaders(),
                body: JSON.stringify(body),
            });
            const json = await r.json();
            setPushResult(json);
            load();
        } catch {
            setPushResult({ error: "Push request failed." });
        } finally {
            setPushing(false);
        }
    }

    const pendingCount = data?.summary?.pushStats?.pending ?? 0;
    const failedCount  = data?.summary?.pushStats?.failed  ?? 0;

    return (
        <div style={{ flex: "1", minWidth: 0 }}>
            <StickyPageTitle
                title="Conversion Attribution"
                numberofDays={setLastDays}
                getLastDays={getLastDays}
                fromDate={fromDate}
                toDate={toDate}
                setFromDate={setFromDate}
                setToDate={setToDate}
            />
            <div className="dashboard-content">
                <div className="sa-page">

                    {/* ── Header actions ────────────────────────── */}
                    {domain && (
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                            <p style={{ margin: 0, color: "rgba(180,180,180,0.7)", fontSize: 13 }}>
                                Conversions matched to ad click IDs (gclid / fbclid / msclkid).
                                Pending records are sent to the respective ad platform to improve campaign optimisation.
                            </p>
                            <div style={{ display: "flex", gap: 8 }}>
                                {(pendingCount > 0 || failedCount > 0) && (
                                    <button className="sa-btn sa-btn--primary" onClick={() => pushPending()} disabled={pushing}>
                                        {pushing ? "Pushing…" : `Push ${pendingCount + failedCount} pending`}
                                    </button>
                                )}
                            </div>
                        </div>
                    )}

                    {pushResult && (
                        <div style={{
                            padding: "10px 14px", borderRadius: 6, marginBottom: 16,
                            background: pushResult.error ? "rgba(239,68,68,0.1)" : "rgba(74,222,128,0.1)",
                            border: `1px solid ${pushResult.error ? "rgba(239,68,68,0.25)" : "rgba(74,222,128,0.25)"}`,
                            fontSize: 13,
                        }}>
                            {pushResult.error
                                ? pushResult.error
                                : `Processed ${pushResult.processed} records — ${pushResult.sent} sent, ${pushResult.failed} failed.`
                            }
                        </div>
                    )}

                    {!domain && (
                        <p className="sa-notice">Select a domain in the header to view attribution data.</p>
                    )}
                    {domain && loading && <p className="sa-notice">Loading…</p>}
                    {domain && error   && <p className="sa-notice sa-notice--error">{error}</p>}

                    {domain && !loading && data && (
                        <>
                            {/* ── KPI summary ──────────────────────── */}
                            <div className="sa-panel" style={{ marginBottom: 16 }}>
                                <h3 className="sa-panel__title">Attribution Summary</h3>
                                <KpiStrip summary={data.summary} />
                            </div>

                            {/* ── How it works ─────────────────────── */}
                            {data.attributed.length === 0 && (
                                <div className="sa-panel">
                                    <h3 className="sa-panel__title">No attributed conversions found</h3>
                                    <p style={{ color: "rgba(180,180,180,0.65)", fontSize: 13, marginTop: 8 }}>
                                        Attribution works automatically when a visitor arrives via an ad click
                                        (with a <code>gclid</code>, <code>fbclid</code>, or <code>msclkid</code> in the URL)
                                        and then fires a conversion event via <code>window.intaAnalytics.track()</code> during the same session.
                                    </p>
                                    <p style={{ color: "rgba(180,180,180,0.65)", fontSize: 13, margin: "8px 0 0" }}>
                                        Click IDs are persisted in a 90-day cookie (<code>_ia_cid</code>) so conversions
                                        that happen on later sessions are still attributed to the original ad click.
                                    </p>
                                </div>
                            )}

                            {/* ── Conversion table ─────────────────── */}
                            {data.attributed.length > 0 && (
                                <div className="sa-panel">
                                    <h3 className="sa-panel__title">
                                        Attributed Conversions
                                        <span style={{ fontSize: 11, fontWeight: 400, color: "rgba(130,130,130,0.6)", marginLeft: 8 }}>
                                            {data.attributed.length} events
                                        </span>
                                    </h3>
                                    <div style={{ overflowX: "auto" }}>
                                        <table className="sa-attr-table">
                                            <thead>
                                                <tr>
                                                    <th className="sa-attr-th">Time</th>
                                                    <th className="sa-attr-th">Event</th>
                                                    <th className="sa-attr-th">Value</th>
                                                    <th className="sa-attr-th">Platform</th>
                                                    <th className="sa-attr-th">Campaign / Ad</th>
                                                    <th className="sa-attr-th">Push status</th>
                                                    <th className="sa-attr-th"></th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {data.attributed.map(ev => (
                                                    <ConversionRow
                                                        key={ev.id}
                                                        ev={ev}
                                                        onPush={ids => pushPending(ids)}
                                                        resolvedIds={resolvedIds}
                                                    />
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}

                            {/* ── Setup guide ──────────────────────── */}
                            <div className="sa-panel" style={{ marginTop: 16 }}>
                                <h3 className="sa-panel__title">Setup Guide</h3>
                                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12, marginTop: 12 }}>
                                    {[
                                        {
                                            title: "1. Connect ad platforms",
                                            desc: "Go to Settings → Ad Connections to connect Google Ads, Meta, or Microsoft Ads via OAuth.",
                                        },
                                        {
                                            title: "2. Set conversion action",
                                            desc: "Go to Settings → Analytics Settings → Conversion actions. For Google Ads, choose from the dropdown. For Microsoft Ads, enter your conversion goal name.",
                                        },
                                        {
                                            title: "3. Fire conversion events",
                                            desc: "Call window.intaAnalytics.track('purchase', { value: 49.99, currency: 'EUR' }) on your thank-you or confirmation page.",
                                        },
                                        {
                                            title: "4. Push to platforms",
                                            desc: "Click 'Push pending' above to send queued conversions, or automate via a cron call to POST /api/ad-conversion-push.",
                                        },
                                    ].map(s => (
                                        <div key={s.title} style={{
                                            padding: "12px 14px", borderRadius: 6,
                                            background: "rgba(255,255,255,0.03)",
                                            border: "1px solid rgba(255,255,255,0.06)",
                                        }}>
                                            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>{s.title}</div>
                                            <div style={{ fontSize: 12, color: "rgba(180,180,180,0.65)", lineHeight: 1.5 }}>{s.desc}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
