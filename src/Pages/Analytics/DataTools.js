// Overview tools around the data: notes on the timeline (annotations) and
// the raw-data export. Backed by api/analytics-annotations.js and
// api/analytics-export.js.
const { useState, useEffect, useCallback } = React;
import { ScannerHost } from "../../API/host.js";
import { authHeaders } from "./_shared.js";
import { toCsv } from "../UserConsents/auditLogFormat.js";
import { t } from "../../i18n/index.js";

/** Geometry of the Overview hero charts (index.js) — the note markers line up with it. */
export const HERO_CHART = { W: 800, H: 182, PAD: { t: 14, r: 18, b: 34, l: 46 } };

const NOTE_MAX = 200;

export function useAnnotations(domain, from, to) {
    const [annotations, setAnnotations] = useState([]);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!domain || !from || !to) return undefined;
        let cancelled = false;
        const qs = new URLSearchParams({ domain, from, to });
        fetch(`${ScannerHost}/api/analytics-annotations?${qs}`, { headers: authHeaders() })
            .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
            .then((body) => { if (!cancelled) { setAnnotations(body.annotations || []); setError(null); } })
            .catch(() => { if (!cancelled) setError(t("Notes couldn't be loaded.")); });
        return () => { cancelled = true; };
    }, [domain, from, to]);

    const add = useCallback(async (day, text) => {
        const res = await fetch(`${ScannerHost}/api/analytics-annotations`, {
            method: "POST", headers: authHeaders(), body: JSON.stringify({ domain, day, text }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || t("The note couldn't be saved."));
        if (day >= from && day <= to) {
            setAnnotations((list) => [...list, body.annotation].sort((a, b) => a.day.localeCompare(b.day)));
        }
    }, [domain, from, to]);

    const remove = useCallback(async (id) => {
        const res = await fetch(`${ScannerHost}/api/analytics-annotations?id=${encodeURIComponent(id)}`, { method: "DELETE", headers: authHeaders() });
        if (!res.ok) throw new Error(t("The note couldn't be deleted."));
        setAnnotations((list) => list.filter((a) => a.id !== id));
    }, []);

    return { annotations, error, add, remove };
}

/** Horizontal position (percent of the chart width) of `day` on the hero chart, or null. */
export function notePosition(daily, day) {
    const n = daily?.length || 0;
    if (!n) return null;
    let i = daily.findIndex((d) => d.date === day);
    if (i < 0) {
        // Days without data aren't in `daily`: place on the next day that is.
        i = daily.findIndex((d) => d.date > day);
        if (i < 0) return null;
    }
    const { W, PAD } = HERO_CHART;
    const cW = W - PAD.l - PAD.r;
    const x = PAD.l + (n === 1 ? cW / 2 : (i / (n - 1)) * cW);
    return (x / W) * 100;
}

/** Markers under the hero chart plus the notes list and "Add note" form. */
export function AnnotationStrip({ daily, notes, defaultDay }) {
    const { annotations, error, add, remove } = notes;
    const [day, setDay] = useState(defaultDay);
    const [text, setText] = useState("");
    const [saving, setSaving] = useState(false);
    const [formError, setFormError] = useState(null);

    const submit = async (e) => {
        e.preventDefault();
        if (!text.trim()) return;
        setSaving(true);
        setFormError(null);
        try {
            await add(day, text.trim());
            setText("");
        } catch (err) {
            setFormError(err.message);
        } finally {
            setSaving(false);
        }
    };
    const del = (id) => remove(id).catch((err) => setFormError(err.message));

    return (
        <div className="sa-notes">
            <div className="sa-notes__track">
                {annotations.map((a) => {
                    const left = notePosition(daily, a.day);
                    return left == null ? null : (
                        <span key={a.id} className="sa-notes__pin" style={{ left: `${left}%` }}
                            title={`${a.day}: ${a.text}`} aria-label={`${a.day}: ${a.text}`} role="img" />
                    );
                })}
            </div>
            <details className="sa-notes__panel">
                <summary>{t("Notes ({count})", { count: annotations.length })}</summary>
                {error ? <p className="sa-notes__error">{error}</p> : null}
                {annotations.length ? (
                    <ul className="sa-notes__list">
                        {annotations.map((a) => (
                            <li key={a.id}>
                                <span className="sa-notes__day">{a.day}</span>
                                <span className="sa-notes__text">{a.text}</span>
                                {a.createdBy ? <span className="sa-notes__by">{a.createdBy}</span> : null}
                                <button type="button" className="sa-notes__delete" onClick={() => del(a.id)}
                                    aria-label={t("Delete note")}>×</button>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <p className="sa-notes__empty">{t("Mark what happened, e.g. a campaign start or a site relaunch, so a change in the chart has its reason next to it.")}</p>
                )}
                <form className="sa-notes__form" onSubmit={submit}>
                    <input type="date" value={day} onChange={(e) => setDay(e.target.value)} required aria-label={t("Date")} />
                    <input type="text" value={text} onChange={(e) => setText(e.target.value)} maxLength={NOTE_MAX}
                        placeholder={t("What happened?")} aria-label={t("Note")} required />
                    <button type="submit" className="sa-customize-btn" disabled={saving || !text.trim()}>
                        {saving ? t("Saving…") : t("Add note")}
                    </button>
                </form>
                {formError ? <p className="sa-notes__error">{formError}</p> : null}
            </details>
        </div>
    );
}

const EXPORT_MAX_ROWS = 500000;

function download(filename, text) {
    // BOM so Excel opens UTF-8 (å, ø, é…) correctly.
    const url = URL.createObjectURL(new Blob(["﻿", text], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** "Export CSV" in the Overview header: raw page views or events of the period. */
export function ExportMenu({ domain, from, to, excludeBots }) {
    const [status, setStatus] = useState(null); // null | { busy, rows } | { error } | { done, rows, capped }

    const run = async (dataset) => {
        setStatus({ busy: true, rows: 0 });
        try {
            const rows = [];
            let columns = [];
            let after = "";
            let capped = false;
            do {
                const qs = new URLSearchParams({ domain, from, to, dataset, after, excludeBots: excludeBots ? "1" : "0" });
                const res = await fetch(`${ScannerHost}/api/analytics-export?${qs}`, { headers: authHeaders() });
                const body = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error(body.error || t("The export failed."));
                columns = body.columns;
                rows.push(...body.rows);
                after = body.next || "";
                setStatus({ busy: true, rows: rows.length });
                if (rows.length >= EXPORT_MAX_ROWS) { capped = !!after; break; }
            } while (after);
            if (!rows.length) {
                setStatus({ error: t("No data in this period.") });
                return;
            }
            download(`${domain}-${dataset}-${from}-${to}.csv`, toCsv(rows.map((r) => Object.fromEntries(columns.map((c, i) => [c, r[i]])))));
            setStatus({ done: true, rows: rows.length, capped });
        } catch (err) {
            setStatus({ error: err.message || t("The export failed.") });
        }
    };

    const busy = status?.busy;
    return (
        <div className="sa-export">
            <details className="sa-export__menu">
                <summary className="sa-customize-btn" aria-disabled={busy || undefined}>
                    {busy ? t("Exporting… {count} rows", { count: status.rows.toLocaleString() }) : t("Export CSV")}
                </summary>
                <div className="sa-export__options" role="menu">
                    <button type="button" role="menuitem" disabled={busy} onClick={() => run("pageviews")}>{t("Page views")}</button>
                    <button type="button" role="menuitem" disabled={busy} onClick={() => run("events")}>{t("Events and conversions")}</button>
                    <p>{t("Raw rows for the selected period. Paths only (no query strings), no IP addresses or ad click IDs.")}</p>
                </div>
            </details>
            {status?.error ? <span className="sa-export__status sa-export__status--error" role="status">{status.error}</span> : null}
            {status?.done ? (
                <span className="sa-export__status" role="status">
                    {status.capped
                        ? t("Stopped at {count} rows — choose a shorter period for the rest.", { count: status.rows.toLocaleString() })
                        : t("{count} rows exported.", { count: status.rows.toLocaleString() })}
                </span>
            ) : null}
        </div>
    );
}
