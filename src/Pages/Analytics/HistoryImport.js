// Google Analytics 4 history: the import panel (Google Analytics page) and
// the tables that show imported numbers for periods before Intastellar's own
// tracking began (Overview, Acquisition). Backed by api/ga4-import.js and the
// report's `history` (api/_ga4-import.js → importedHistory).
const { useState, useEffect, useRef } = React;
import { ScannerHost } from "../../API/host.js";
import { authHeaders, MiniBar } from "./_shared.js";
import { appLocale, formatDate } from "../../Functions/format.js";
import { t } from "../../i18n/index.js";

const fmt = (n) => Number(n || 0).toLocaleString(appLocale());
const day = (d) => (d ? formatDate(d) : "—");

async function call(method, domain, body) {
    const url = method === "GET" || method === "DELETE"
        ? `${ScannerHost}/api/ga4-import?domain=${encodeURIComponent(domain)}`
        : `${ScannerHost}/api/ga4-import`;
    const res = await fetch(url, { method, headers: authHeaders(), body: body ? JSON.stringify({ domain, ...body }) : undefined });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || t("The request failed."));
    return json;
}

/** Share of the property's span already imported (walking back from the newest day). */
export function importProgress(state) {
    if (!state?.firstDay || !state?.newest || !state?.cursor) return state?.status === "done" ? 1 : 0;
    const span = Date.parse(state.newest) - Date.parse(state.firstDay);
    if (span <= 0) return 1;
    return Math.min(1, Math.max(0, (Date.parse(state.newest) - Date.parse(state.cursor)) / span));
}

export function Ga4ImportPanel({ domain }) {
    const [state, setState] = useState(null);   // import state from the server
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const stopped = useRef(false);

    useEffect(() => {
        stopped.current = false;
        call("GET", domain).then((r) => setState(r.import)).catch(() => {});
        return () => { stopped.current = true; };
    }, [domain]);

    const run = async (action) => {
        setBusy(true);
        setError(null);
        try {
            let { import: s } = await call("POST", domain, { action });
            setState(s);
            // One chunk (3 months) per request; keep going while this page is open.
            while (s?.status === "running" && !stopped.current) {
                if (s.busy) await new Promise((r) => setTimeout(r, 3000));
                ({ import: s } = await call("POST", domain, { action: "continue" }));
                setState(s);
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setBusy(false);
        }
    };

    const remove = async () => {
        setBusy(true);
        try { await call("DELETE", domain); setState(null); } catch (err) { setError(err.message); } finally { setBusy(false); }
    };

    const running = state?.status === "running";
    const pct = Math.round(importProgress(state) * 100);
    return (
        <div className="sa-panel sa-history-import">
            <h3 className="sa-panel__title">{t("Import your Google Analytics history")}</h3>
            <p className="sa-panel__sub">
                {t("Copies daily totals, channels, devices and countries, and the top pages per month, so your charts go back further than your Intastellar tracking. Only aggregated numbers are imported, no data about individual visitors.")}
            </p>
            {state?.status === "done" || (state?.oldest && !running) ? (
                <p>{t("Imported: {from} – {to} ({count} rows).", { from: day(state.oldest), to: day(state.newest), count: fmt(state.rows) })}</p>
            ) : null}
            {state?.status === "empty" ? <p>{t("This Google Analytics property has no data to import.")}</p> : null}
            {running ? (
                <div className="sa-history-import__progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                    <MiniBar value={pct} max={100} />
                    <span>{t("Importing… {percent} % (back to {date})", { percent: pct, date: day(state.cursor) })}</span>
                </div>
            ) : null}
            {state?.status === "error" || error ? (
                <p className="sa-history-import__error">{t("The import stopped: {reason}", { reason: error || state.error })}</p>
            ) : null}
            <div className="sa-history-import__actions">
                {running ? (
                    <button type="button" className="sa-customize-btn" disabled={busy} onClick={() => run("continue")}>{t("Continue import")}</button>
                ) : (
                    <button type="button" className="sa-customize-btn" disabled={busy} onClick={() => run("start")}>
                        {state?.oldest ? t("Import again") : t("Import history")}
                    </button>
                )}
                {state?.oldest && !busy ? (
                    <button type="button" className="sa-customize-btn" onClick={remove}>{t("Delete imported data")}</button>
                ) : null}
            </div>
            {running && !busy ? <p className="sa-history-import__hint">{t("The import runs while this page is open. Continue where it stopped any time.")}</p> : null}
        </div>
    );
}

function HistoryTable({ title, rows, label, valueKey, valueLabel }) {
    if (!rows?.length) return null;
    const max = Math.max(...rows.map((r) => r[valueKey] || 0), 1);
    return (
        <div className="sa-panel">
            <h3 className="sa-panel__title">{title}</h3>
            <table className="sa-table">
                <thead>
                    <tr><th>{label}</th><th className="sa-table__num">{valueLabel}</th><th className="sa-table__bar" /></tr>
                </thead>
                <tbody>
                    {rows.slice(0, 10).map((r) => (
                        <tr key={r.dim}>
                            <td className="sa-table__path" title={r.dim}>{r.dim || t("(not set)")}</td>
                            <td className="sa-table__num">{fmt(r[valueKey])}</td>
                            <td className="sa-table__bar"><MiniBar value={r[valueKey]} max={max} color="var(--color-data)" /></td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

/** Channels / pages / countries from the import — only when the whole period predates tracking. */
export function HistoryTables({ history, only }) {
    if (!history?.wholePeriod) return null;
    const show = (k) => !only || only.includes(k);
    return (
        <div className="ga4-two-col">
            {show("channels") ? <HistoryTable title={t("Channels")} rows={history.channels} label={t("Channel")} valueKey="sessions" valueLabel={t("Sessions")} /> : null}
            {show("pages") ? <HistoryTable title={t("Top pages")} rows={history.pages} label={t("Page")} valueKey="pageviews" valueLabel={t("Page views")} /> : null}
            {show("countries") ? <HistoryTable title={t("Top countries")} rows={history.countries} label={t("Country")} valueKey="sessions" valueLabel={t("Sessions")} /> : null}
            {show("devices") ? <HistoryTable title={t("Devices")} rows={history.devices} label={t("Device")} valueKey="sessions" valueLabel={t("Sessions")} /> : null}
        </div>
    );
}

/** The line every imported number carries, so it's never mistaken for Intastellar's own. */
export function HistoryNote({ history }) {
    if (!history) return null;
    return (
        <p className="sa-history-note">
            {history.trackingStart
                ? t("Imported from Google Analytics 4 for {from} – {to}, before Intastellar Analytics tracking began on {start}. GA4 counts sessions its own way, so compare trends rather than exact numbers.", { from: day(history.from), to: day(history.to), start: day(history.trackingStart) })
                : t("Imported from Google Analytics 4 for {from} – {to}. GA4 counts sessions its own way, so compare trends rather than exact numbers.", { from: day(history.from), to: day(history.to) })}
        </p>
    );
}
