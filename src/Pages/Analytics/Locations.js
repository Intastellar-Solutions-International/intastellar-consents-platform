// Where visitors and sales come from: countries → regions → cities, with
// page views, sessions, conversions, revenue and products sold per place.
// LocationsPanel sits on Audience; any view of it can be pinned to the
// Overview, where PinnedReports re-runs it for the period selected there.
// Backed by api/analytics-locations.js and api/analytics-pins.js.
const { useState, useEffect, useMemo, useCallback } = React;
const Link = window.ReactRouterDOM.Link;
import { ScannerHost } from "../../API/host.js";
import { authHeaders, formatCurrency, MiniBar } from "./_shared.js";
import { IconGlobe } from "./Icons.js";
import LocationMap from "./LocationMap.js";
import { analyticsAudiencePath } from "../../Functions/domainPathSegments.js";
import { appLocale } from "../../Functions/format.js";
import { t } from "../../i18n/index.js";

const LOCATIONS_URL = `${ScannerHost}/api/analytics-locations`;
const PINS_URL = `${ScannerHost}/api/analytics-pins`;
const OTHER_KEY = "__other";
// Table rows per page; the map always shows every place.
const PAGE_SIZE = 10;
const BASIC_METRICS = ["sessions", "pageviews", "conversions"];
const PLACE_METRICS = [...BASIC_METRICS, "revenue"];
const PRODUCT_METRICS = ["revenue", "units"];

const fmt = (n) => Math.round(n || 0).toLocaleString(appLocale());

function metricLabel(m) {
    return m === "sessions" ? t("Sessions")
        : m === "pageviews" ? t("Page views")
        : m === "conversions" ? t("Conversions")
        : m === "revenue" ? t("Revenue")
        : t("Units sold");
}

let displayNames = null;
function countryName(code) {
    if (!code) return null;
    try {
        displayNames = displayNames || new Intl.DisplayNames([appLocale()], { type: "region" });
        return displayNames.of(code) || code;
    } catch {
        return code;
    }
}

function placeLabel(row, level, minCitySessions) {
    if (row.key === OTHER_KEY) return t("Other cities (fewer than {count} sessions each)", { count: minCitySessions });
    if (!row.key) return level === "city" ? t("Unknown city") : level === "region" ? t("Unknown region") : t("Unknown country");
    return level === "country" ? countryName(row.key) : row.label;
}

/** View state ↔ URL (?locLevel=&locCountry=…) so "Open report" lands on the same view. */
export function locationViewFromSearch(search) {
    const p = new URLSearchParams(search || "");
    const level = ["country", "region", "city"].includes(p.get("locLevel")) ? p.get("locLevel") : "country";
    const country = p.get("locCountry") || null;
    return {
        level: level !== "country" && !country ? "country" : level,
        country: level === "country" ? null : country,
        region: level === "city" ? p.get("locRegion") || null : null,
        metric: p.get("locMetric") || "sessions",
        product: p.get("locProduct") || null,
    };
}

function locationSearch(view) {
    const p = new URLSearchParams();
    p.set("locLevel", view.level);
    if (view.country) p.set("locCountry", view.country);
    if (view.region) p.set("locRegion", view.region);
    p.set("locMetric", view.metric);
    if (view.product) p.set("locProduct", view.product);
    return `?${p}`;
}

function useLocations(domain, from, to, view) {
    const [state, setState] = useState({ loading: true, data: null, error: null });
    const { level, country, region } = view;
    useEffect(() => {
        if (!domain || !from || !to) return undefined;
        let cancelled = false;
        setState((s) => ({ ...s, loading: true, error: null }));
        const qs = new URLSearchParams({ domain, from, to, level });
        if (country) qs.set("country", country);
        if (region) qs.set("region", region);
        fetch(`${LOCATIONS_URL}?${qs}`, { headers: authHeaders() })
            .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
            .then((data) => { if (!cancelled) setState({ loading: false, data, error: null }); })
            .catch(() => { if (!cancelled) setState({ loading: false, data: null, error: t("Locations could not be loaded.") }); });
        return () => { cancelled = true; };
    }, [domain, from, to, level, country, region]);
    return state;
}

/**
 * Revenue, products and purchases only show on dashboards where sales carry
 * a value (showsRevenue() in _shared.js: e-commerce and the booking modes).
 * `revenueMode` is null while the site settings load — the view is left
 * alone until it's known to be false.
 */
export function forDashboard(view, revenueMode) {
    if (revenueMode !== false) return view;
    if (!view.product && BASIC_METRICS.includes(view.metric)) return view;
    return { ...view, product: null, metric: BASIC_METRICS.includes(view.metric) ? view.metric : "sessions" };
}

/** Rows for the table/card: one per place, valued by the chosen metric. */
export function locationRows(data, view) {
    if (!data) return [];
    if (view.product) {
        const product = data.products.find((p) => p.id === view.product);
        const byKey = new Map((product?.places || []).map((p) => [p.key, p]));
        return data.rows
            .filter((r) => byKey.has(r.key))
            .map((r) => ({ ...r, units: byKey.get(r.key).units, revenue: byKey.get(r.key).revenue, value: byKey.get(r.key)[view.metric === "units" ? "units" : "revenue"] }))
            .sort((a, b) => b.value - a.value);
    }
    const metric = PLACE_METRICS.includes(view.metric) ? view.metric : "sessions";
    return data.rows
        .map((r) => ({ ...r, value: r[metric] || 0 }))
        .sort((a, b) => {
            const rank = (x) => (x.key === OTHER_KEY ? 2 : x.key === "" ? 1 : 0);
            return rank(a) - rank(b) || b.value - a.value;
        });
}

function formatValue(value, metric, currency) {
    return metric === "revenue" ? formatCurrency(value, currency) : fmt(value);
}

function defaultTitle(view, data) {
    const what = view.product ? (data?.products.find((p) => p.id === view.product)?.name || view.product) : metricLabel(view.metric);
    const title = view.level === "country" ? t("{what} by country", { what })
        : view.level === "region" ? t("{what} by region", { what })
        : t("{what} by city", { what });
    const where = view.region ? `${data?.regionName || view.region}, ${countryName(view.country)}`
        : view.country ? countryName(view.country) : null;
    return where ? `${title} · ${where}` : title;
}

function PinForm({ domain, view, data, onDone }) {
    const [title, setTitle] = useState(() => defaultTitle(view, data));
    const [state, setState] = useState({ saving: false, error: null });
    const save = (e) => {
        e.preventDefault();
        setState({ saving: true, error: null });
        fetch(`${PINS_URL}?${new URLSearchParams({ domain })}`, {
            method: "POST",
            headers: authHeaders(),
            body: JSON.stringify({ kind: "locations", title, config: view }),
        })
            .then(async (r) => {
                if (r.ok) return onDone(true);
                const body = await r.json().catch(() => ({}));
                setState({ saving: false, error: body.error || t("The report could not be pinned.") });
            })
            .catch(() => setState({ saving: false, error: t("The report could not be pinned.") }));
    };
    return (
        <form className="sa-loc__pin-form" onSubmit={save}>
            <label className="sa-loc__field">
                <span>{t("Name on the Overview")}</span>
                <input className="sa-loc__input" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} autoFocus />
            </label>
            <button type="submit" className="sa-btn sa-btn--sm sa-btn--primary" disabled={state.saving || !title.trim()}>{t("Pin")}</button>
            <button type="button" className="sa-btn sa-btn--sm sa-btn--ghost" onClick={() => onDone(false)}>{t("Cancel")}</button>
            {state.error && <p className="sa-notice sa-notice--error sa-loc__pin-error">{state.error}</p>}
        </form>
    );
}

export function LocationsPanel({ domain, from, to, revenueMode }) {
    const [view, setView] = useState(() => locationViewFromSearch(window.location.search));
    useEffect(() => { setView((v) => forDashboard(v, revenueMode)); }, [revenueMode]);
    const [pinning, setPinning] = useState(false);
    const [pinned, setPinned] = useState(false);
    const { loading, data, error } = useLocations(domain, from, to, view);

    // A product can disappear when the place or period changes.
    useEffect(() => {
        if (data && view.product && !data.products.some((p) => p.id === view.product)) {
            setView((v) => ({ ...v, product: null, metric: "revenue" }));
        }
    }, [data, view.product]);

    const update = useCallback((patch) => { setPinned(false); setPinning(false); setView((v) => ({ ...v, ...patch })); }, []);
    const rows = useMemo(() => locationRows(data, view), [data, view]);
    // Back to the first page whenever the list itself changes (drill, metric, period)
    const [page, setPage] = useState(0);
    useEffect(() => { setPage(0); }, [rows]);
    const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
    const pageRows = rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
    const max = Math.max(...rows.filter((r) => r.key !== OTHER_KEY).map((r) => r.value), 1);
    const metrics = !revenueMode ? BASIC_METRICS : view.product ? PRODUCT_METRICS : PLACE_METRICS;
    const hasProducts = !!revenueMode && !!data?.products?.length;
    const currency = data?.currency;
    const minCity = data?.minCitySessions || 5;

    const drill = (row) => {
        if (!row.key || row.key === OTHER_KEY) return;
        if (view.level === "country") update({ level: "region", country: row.key, region: null });
        else if (view.level === "region") update({ level: "city", region: row.key });
    };
    const canDrill = view.level !== "city";
    // Map clicks: a country → its regions; a region → its cities; in the
    // city view, another region → that region's cities.
    const drillTo = useCallback((code) => {
        if (view.level === "country") update({ level: "region", country: code, region: null });
        else update({ level: "city", region: code });
    }, [view.level, update]);
    const mapMetric = view.product ? (view.metric === "units" ? "units" : "revenue") : view.metric;
    const formatMapValue = useCallback((v) => formatValue(v, mapMetric, currency), [mapMetric, currency]);

    return (
        <div className="sa-panel sa-loc">
            <div className="sa-loc__head">
                <h3 className="sa-panel__title"><IconGlobe className="sa-icon" /> {t("Locations")}</h3>
                <div className="sa-loc__actions">
                    {pinned
                        ? <span className="sa-loc__pinned">{t("Pinned to the Overview")}</span>
                        : !pinning && <button type="button" className="sa-btn sa-btn--sm" onClick={() => setPinning(true)} disabled={!data}>{t("Pin to Overview")}</button>}
                </div>
            </div>
            <p className="sa-panel__sub">{t("Where visitors and sales come from. Click a country to see its regions, and a region to see its cities.")}</p>

            {pinning && data && <PinForm domain={domain} view={view} data={data} onDone={(ok) => { setPinning(false); setPinned(ok); }} />}

            <div className="sa-loc__toolbar">
                <nav className="sa-loc__crumbs" aria-label={t("Location")}>
                    <button type="button" className="sa-loc__crumb" disabled={view.level === "country"} onClick={() => update({ level: "country", country: null, region: null })}>
                        {t("All countries")}
                    </button>
                    {view.country && (
                        <>
                            <span aria-hidden="true">›</span>
                            <button type="button" className="sa-loc__crumb" disabled={view.level === "region"} onClick={() => update({ level: "region", region: null })}>
                                {countryName(view.country)}
                            </button>
                        </>
                    )}
                    {view.region && (
                        <>
                            <span aria-hidden="true">›</span>
                            <span className="sa-loc__crumb sa-loc__crumb--current">{data?.regionName || view.region}</span>
                        </>
                    )}
                </nav>
                {view.country && !view.region && (
                    <div className="sa-loc__switch" role="group" aria-label={t("Level")}>
                        <button type="button" aria-pressed={view.level === "region"} onClick={() => update({ level: "region" })}>{t("Regions")}</button>
                        <button type="button" aria-pressed={view.level === "city"} onClick={() => update({ level: "city" })}>{t("Cities")}</button>
                    </div>
                )}
                <label className="sa-loc__field">
                    <span>{t("Show")}</span>
                    <select className="sa-select sa-loc__select" value={view.metric} onChange={(e) => update({ metric: e.target.value })}>
                        {metrics.map((m) => <option key={m} value={m}>{metricLabel(m)}</option>)}
                    </select>
                </label>
                {hasProducts && (
                    <label className="sa-loc__field">
                        <span>{t("Product")}</span>
                        <select
                            className="sa-select sa-loc__select"
                            value={view.product || ""}
                            onChange={(e) => update(e.target.value
                                ? { product: e.target.value, metric: PRODUCT_METRICS.includes(view.metric) ? view.metric : "revenue" }
                                : { product: null })}
                        >
                            <option value="">{t("All products")}</option>
                            {data.products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                    </label>
                )}
            </div>

            {view.level === "city" && (
                <p className="sa-history-note">
                    {t("Cities are only recorded for visitors who accepted statistics cookies, and only since city tracking started. Cities with fewer than {count} sessions are grouped together so no single visitor can be picked out.", { count: minCity })}
                </p>
            )}

            {error ? <p className="sa-notice sa-notice--error">{error}</p>
                : loading && !data ? <p className="sa-notice">{t("Loading…")}</p>
                : rows.length === 0 ? <p className="sa-notice">{t("No visits from here in this period.")}</p>
                : (
                    <div className="sa-loc__body">
                    <LocationMap
                        view={view}
                        rows={rows}
                        metricLabel={metricLabel(mapMetric)}
                        formatValue={formatMapValue}
                        onDrill={drillTo}
                        onRegion={drillTo}
                    />
                    <div className="sa-loc__table-wrap" aria-busy={loading}>
                        <table className="sa-table sa-loc__table">
                            <thead>
                                <tr>
                                    <th>{view.level === "country" ? t("Country") : view.level === "region" ? t("Region") : t("City")}</th>
                                    {view.product ? (
                                        <>
                                            <th className="sa-table__num">{t("Units sold")}</th>
                                            <th className="sa-table__num">{t("Revenue")}</th>
                                        </>
                                    ) : (
                                        <>
                                            <th className="sa-table__num">{t("Sessions")}</th>
                                            <th className="sa-table__num">{t("Page views")}</th>
                                            <th className="sa-table__num">{t("Conversions")}</th>
                                            {revenueMode && <th className="sa-table__num">{t("Revenue")}</th>}
                                            {hasProducts && <th>{t("Best seller")}</th>}
                                        </>
                                    )}
                                    <th className="sa-table__bar" aria-label={metricLabel(view.metric)} />
                                </tr>
                            </thead>
                            <tbody>
                                {pageRows.map((r) => {
                                    const label = placeLabel(r, view.level, minCity);
                                    const drillable = canDrill && r.key && r.key !== OTHER_KEY;
                                    return (
                                        <tr
                                            key={r.key || "unknown"}
                                            className={r.key === OTHER_KEY || !r.key ? "sa-loc__row--muted" : drillable ? "sa-loc__row--drill" : undefined}
                                            // The whole row drills down; the name stays a button for keyboard users.
                                            onClick={drillable ? () => drill(r) : undefined}
                                        >
                                            <td className="sa-table__path">
                                                {drillable
                                                    ? <button type="button" className="sa-loc__place" onClick={(e) => { e.stopPropagation(); drill(r); }} title={view.level === "country" ? t("Show regions") : t("Show cities")}>{label}</button>
                                                    : label}
                                            </td>
                                            {view.product ? (
                                                <>
                                                    <td className="sa-table__num">{fmt(r.units)}</td>
                                                    <td className="sa-table__num">{formatCurrency(r.revenue, currency)}</td>
                                                </>
                                            ) : (
                                                <>
                                                    <td className="sa-table__num">{fmt(r.sessions)}</td>
                                                    <td className="sa-table__num">{fmt(r.pageviews)}</td>
                                                    <td className="sa-table__num">{fmt(r.conversions)}</td>
                                                    {revenueMode && <td className="sa-table__num">{r.revenue ? formatCurrency(r.revenue, currency) : "—"}</td>}
                                                    {hasProducts && <td className="sa-loc__best">{r.topProduct ? r.topProduct.name : "—"}</td>}
                                                </>
                                            )}
                                            <td className="sa-table__bar">{r.key !== OTHER_KEY && <MiniBar value={r.value} max={max} />}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                        {pageCount > 1 && (
                            <nav className="sa-pager" aria-label={t("Pages")}>
                                <button type="button" className="sa-btn sa-btn--sm sa-btn--ghost" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0} aria-label={t("Previous page")}>
                                    {t("Previous")}
                                </button>
                                <span className="sa-pager__label">
                                    {t("Showing {first}–{last} of {total}", { first: page * PAGE_SIZE + 1, last: Math.min(rows.length, (page + 1) * PAGE_SIZE), total: rows.length })}
                                </span>
                                <button type="button" className="sa-btn sa-btn--sm sa-btn--ghost" onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))} disabled={page >= pageCount - 1} aria-label={t("Next page")}>
                                    {t("Next")}
                                </button>
                            </nav>
                        )}
                    </div>
                    </div>
                )}

            {revenueMode && data && !hasProducts && (
                <div className="sa-loc__setup">
                    <p className="sa-loc__setup-title">{t("See which products sell best where")}</p>
                    <p className="sa-history-note">{t("No purchases with products in this period. Send the products with your purchase event and this report adds units sold, revenue and the best seller for every country, region and city:")}</p>
                    <pre className="sa-loc__code"><code>{"window.intaAnalytics.track('purchase', {\n  value: 59.98, currency: 'EUR', transactionId: 'ORDER-1001',\n  products: [{ id: 'SKU-1', name: 'Blue T-Shirt', price: 29.99, quantity: 2 }]\n});"}</code></pre>
                </div>
            )}
        </div>
    );
}

// ── Overview: pinned reports ─────────────────────────────────────────────────

function PinnedLocationCard({ pin, domain, from, to, onUnpin, revenueMode }) {
    const view = useMemo(() => forDashboard(pin.config, revenueMode), [pin.config, revenueMode]);
    const { loading, data, error } = useLocations(domain, from, to, view);
    const rows = useMemo(() => locationRows(data, view).filter((r) => r.key && r.key !== OTHER_KEY).slice(0, 5), [data, view]);
    const max = Math.max(...rows.map((r) => r.value), 1);
    const metric = view.product ? (view.metric === "units" ? "units" : "revenue") : view.metric;
    return (
        <div className="sa-panel sa-pinned">
            <div className="sa-pinned__head">
                <h3 className="sa-panel__title" title={pin.title}>{pin.title}</h3>
                <button type="button" className="sa-pinned__unpin" onClick={() => onUnpin(pin)} aria-label={t("Unpin {name}", { name: pin.title })} title={t("Unpin")}>✕</button>
            </div>
            {error ? <p className="sa-notice sa-notice--error">{error}</p>
                : loading && !data ? <p className="sa-notice">{t("Loading…")}</p>
                : rows.length === 0 ? <p className="sa-insights__empty">{t("No data for this period.")}</p>
                : (
                    <table className="sa-table">
                        <thead>
                            <tr>
                                <th>{view.level === "country" ? t("Country") : view.level === "region" ? t("Region") : t("City")}</th>
                                <th className="sa-table__num">{metricLabel(metric)}</th>
                                <th className="sa-table__bar" />
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((r) => (
                                <tr key={r.key}>
                                    <td className="sa-table__path">{placeLabel(r, view.level, data.minCitySessions)}</td>
                                    <td className="sa-table__num">{formatValue(r.value, metric, data.currency)}</td>
                                    <td className="sa-table__bar"><MiniBar value={r.value} max={max} /></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            <Link className="sa-panel__footer-link" to={analyticsAudiencePath(domain) + locationSearch(view)}>{t("Open report")} →</Link>
        </div>
    );
}

export function PinnedReports({ domain, from, to, revenueMode }) {
    const [pins, setPins] = useState([]);
    useEffect(() => {
        if (!domain) return undefined;
        let cancelled = false;
        fetch(`${PINS_URL}?${new URLSearchParams({ domain })}`, { headers: authHeaders() })
            .then((r) => (r.ok ? r.json() : { pins: [] }))
            .then((body) => { if (!cancelled) setPins(body.pins || []); })
            .catch(() => { if (!cancelled) setPins([]); });
        return () => { cancelled = true; };
    }, [domain]);

    const unpin = (pin) => {
        setPins((list) => list.filter((p) => p.id !== pin.id));
        fetch(`${PINS_URL}?${new URLSearchParams({ domain, id: String(pin.id) })}`, { method: "DELETE", headers: authHeaders() })
            .then((r) => { if (!r.ok && r.status !== 404) throw new Error(); })
            .catch(() => setPins((list) => [...list, pin].sort((a, b) => a.id - b.id)));
    };

    if (!pins.length) return null;
    return (
        <section className="sa-pinned-row" aria-labelledby="sa-pinned-title">
            <div className="sa-section-hd">
                <h3 id="sa-pinned-title" className="sa-section-hd__title">{t("Pinned reports")}</h3>
            </div>
            <div className="sa-pinned-grid">
                {pins.filter((p) => p.kind === "locations").map((p) => (
                    <PinnedLocationCard key={p.id} pin={p} domain={domain} from={from} to={to} onUnpin={unpin} revenueMode={revenueMode} />
                ))}
            </div>
        </section>
    );
}
