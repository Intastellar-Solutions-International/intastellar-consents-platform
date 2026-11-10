import API from "../../API/api";
import { Button, Card, ErrorState, FilterSelect, KpiTile } from "../../Components/ui";
import { fetchJsonWithTimeout } from "../../Functions/fetchWithTimeout.js";
import { formatDate, formatNumber, formatPercent } from "../../Functions/format.js";
import { SALES_FIGURES, figureChange, missingFigureReason, salesSheetHtml, sameFigures } from "../../Functions/platformStats.js";
import TrendLineChart from "../Analytics/TrendLineChart.js";

const { useState, useEffect } = React;

const REFRESH_TIMEOUT_MS = 70000;
const TREND_FIGURES = SALES_FIGURES.filter((f) => f.trend);

function openSalesSheet(figures, asOf) {
    const sheet = window.open("", "_blank");
    if (!sheet) return false;
    sheet.document.write(salesSheetHtml(figures, asOf));
    sheet.document.close();
    sheet.focus();
    sheet.print();
    return true;
}

function WebsiteToggle({ id, hidden, disabled, onChange }) {
    return (
        <label className="tw-inline-flex tw-items-center tw-gap-2 tw-text-xs tw-text-text-muted tw-cursor-pointer">
            <input type="checkbox" checked={!hidden.has(id)} disabled={disabled} onChange={(e) => onChange(id, e.target.checked)} />
            On website
        </label>
    );
}

/** One figure from the nightly snapshots. A day without a value is left out rather than drawn as zero. */
function TrendCard({ history }) {
    const [key, setKey] = useState(TREND_FIGURES[0].key);
    const figure = TREND_FIGURES.find((f) => f.key === key);
    const data = (history || []).filter((row) => row[key] != null).map((row) => ({ date: row.day, num: row[key] }));
    return (
        <Card
            title="Over time"
            actions={<FilterSelect label="Figure" value={key} options={TREND_FIGURES.map((f) => ({ value: f.key, label: f.label }))} onChange={setKey} />}
        >
            {data.length < 2
                ? <p className="tw-m-0 tw-text-sm tw-text-text-muted">The chart fills in as the nightly calculation runs. {formatNumber(data.length)} {data.length === 1 ? "day" : "days"} so far.</p>
                : <TrendLineChart data={data} title={figure.label} height={200} />}
        </Card>
    );
}

function TrackersCard({ figures, minSites, toggle }) {
    const trackers = figures?.top_trackers;
    return (
        <Card title="Most common trackers" description="Share of scanned websites that load each service" actions={toggle}>
            {trackers?.length ? (
                <ol className="tw-m-0 tw-p-0 tw-list-none tw-flex tw-flex-col tw-gap-3">
                    {trackers.map((t) => (
                        <li key={t.name} className="tw-grid tw-items-center tw-gap-3" style={{ gridTemplateColumns: "minmax(0, 10rem) 1fr 3rem" }}>
                            <span className="tw-text-sm tw-text-text-primary tw-truncate">{t.name}</span>
                            <div className="tw-h-2 tw-rounded-full tw-bg-white/10" aria-hidden="true">
                                <div className="tw-h-full tw-rounded-full tw-bg-data" style={{ width: `${t.pct}%` }} />
                            </div>
                            <span className="tw-text-sm tw-text-text-secondary tw-tabular-nums tw-text-right">{formatPercent(t.pct, 0)}</span>
                        </li>
                    ))}
                </ol>
            ) : (
                <p className="tw-m-0 tw-text-sm tw-text-text-muted">
                    {figures?.sites_scanned != null ? `${formatNumber(figures.sites_scanned)} of ${minSites} sites needed` : "Not available"}
                </p>
            )}
        </Card>
    );
}

/** Figures for promoting the platform. Nothing reaches the website until it is published here. */
export default function SalesFigures() {
    const [view, setView] = useState(null);
    const [error, setError] = useState(null);
    const [busy, setBusy] = useState(null);
    const [attempt, setAttempt] = useState(0);

    useEffect(() => {
        const ac = new AbortController();
        setError(null);
        fetchJsonWithTimeout(API.platformStats.url, { headers: API.platformStats.headers }, { signal: ac.signal })
            .then(setView)
            .catch((err) => { if (err.kind !== "aborted") setError(err.message); });
        return () => ac.abort();
    }, [attempt]);

    async function act(action, extra = {}) {
        setBusy(action);
        setError(null);
        try {
            setView(await fetchJsonWithTimeout(API.platformStats.url, { method: "POST", headers: API.platformStats.headers, body: JSON.stringify({ action, ...extra }) }, { timeoutMs: REFRESH_TIMEOUT_MS }));
        } catch (err) {
            setError(err.message);
        } finally {
            setBusy(null);
        }
    }

    function printSheet() {
        if (!openSalesSheet(view.publishable, view.latest.day)) setError("Your browser blocked the sales sheet. Allow pop-ups for this page and try again.");
    }

    const latest = view?.latest;
    const figures = latest?.figures;
    const hidden = new Set(view?.hidden || []);
    const canPublish = Boolean(view?.publishable && Object.keys(view.publishable).length);
    const outdated = Boolean(view?.published && view.publishable && !sameFigures(view.published.figures, view.publishable));
    const toggle = (id) => <WebsiteToggle id={id} hidden={hidden} disabled={Boolean(busy)} onChange={(key, visible) => act("visibility", { key, visible })} />;
    const display = (f) => (f.unit === "percent" ? formatPercent(figures[f.key], 0) : formatNumber(figures[f.key]));
    const delta = (f) => {
        const value = f.trend ? figureChange(figures[f.key], view.previous?.figures?.[f.key]) : null;
        return value == null ? undefined : { value, goodWhen: "up", label: "vs 30 days earlier" };
    };

    const actions = view && (
        <>
            <Button size="sm" icon="refresh" loading={busy === "refresh"} disabled={Boolean(busy)} onClick={() => act("refresh")}>Calculate now</Button>
            <Button size="sm" disabled={!canPublish || Boolean(busy)} onClick={printSheet}>Sales sheet</Button>
            {view.published && <Button size="sm" variant="danger" loading={busy === "unpublish"} disabled={Boolean(busy)} onClick={() => act("unpublish")}>Remove from website</Button>}
            <Button size="sm" variant="primary" loading={busy === "publish"} disabled={!canPublish || Boolean(busy)} onClick={() => act("publish")}>{view.published ? "Update website" : "Publish to website"}</Button>
        </>
    );

    let status = "Not published. The website shows nothing until you publish.";
    if (view?.published) {
        status = `Live on the website since ${formatDate(view.published.published_at)}, using figures from ${formatDate(view.published.as_of)}.`;
        if (outdated) status += " Newer figures or website settings aren't live yet. Choose Update website.";
    }

    return (
        <div className="tw-flex tw-flex-col tw-gap-5">
            <Card title="Current figures" description={view ? status : undefined} actions={actions}>
                {error && <div className="tw-mb-4"><ErrorState compact title="Sales figures" message={error} onRetry={view ? undefined : () => setAttempt((n) => n + 1)} /></div>}
                {!view && !error && <p className="tw-m-0 tw-text-sm tw-text-text-muted">Loading…</p>}
                {view && !latest && <p className="tw-m-0 tw-text-sm tw-text-text-muted">No figures yet. They are calculated every night, or choose Calculate now.</p>}
                {figures && (
                    <>
                        <div className="tw-grid tw-gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))" }}>
                            {SALES_FIGURES.map((f) => (
                                <div key={f.key} className="tw-flex tw-flex-col tw-gap-2">
                                    {figures[f.key] == null
                                        ? <KpiTile label={f.label} value={missingFigureReason(f, figures, view.min_sites, view.min_records)} noData="Not shown on the website until this is available" />
                                        : <KpiTile label={f.label} value={display(f)} delta={delta(f)} />}
                                    {toggle(f.key)}
                                </div>
                            ))}
                        </div>
                        {figures.source_errors?.length > 0 && <p className="tw-m-0 tw-mt-4 tw-text-sm tw-text-warning">Some figures couldn't be updated, so their last known values are shown: {figures.source_errors.join("; ")}</p>}
                        <p className="tw-m-0 tw-mt-4 tw-text-xs tw-text-text-muted">Calculated {formatDate(latest.computed_at)}. Counts exclude your own and test sites, and only aggregates are stored. Switching a figure off takes it off the website at the next update.</p>
                    </>
                )}
            </Card>
            {view && (
                <div className="tw-grid tw-gap-5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))" }}>
                    <TrendCard history={view.history} />
                    <TrackersCard figures={figures} minSites={view.min_sites} toggle={toggle("top_trackers")} />
                </div>
            )}
        </div>
    );
}
