const { useEffect } = React;
import { lockBodyScroll, unlockBodyScroll } from "../../../Functions/bodyScrollLock.js";

function fmt(n, demoMode) {
    if (n == null || (typeof n === "number" && !Number.isFinite(n))) return "—";
    if (demoMode && typeof n === "number") {
        const s = String(Math.round(n));
        if (s.length > 3) return `${s.slice(0, 2)}**`;
        return s;
    }
    if (typeof n === "number") return n.toLocaleString("de-DE");
    return String(n);
}

function consentCountFromNum(num) {
    if (!num || typeof num !== "object") return null;
    const v = num.accept ?? num.accepted;
    return v != null && Number.isFinite(Number(v)) ? Number(v) : null;
}

function formatCountDelta(current, previous) {
    const c = Number(current);
    const p = Number(previous);
    if (!Number.isFinite(c) || !Number.isFinite(p)) return null;
    const d = Math.round(c - p);
    if (d === 0) return "↔ 0";
    const arrow = d > 0 ? "↑" : "↓";
    return `${arrow} ${d > 0 ? "+" : ""}${Math.abs(d).toLocaleString("de-DE")}`;
}

function formatPctDeltaPp(currentPct, prevPct) {
    const c = Number(currentPct);
    const p = Number(prevPct);
    if (!Number.isFinite(c) || !Number.isFinite(p)) return null;
    const d = Math.round((c - p) * 10) / 10;
    const arrow = d > 0 ? "↑" : d < 0 ? "↓" : "↔";
    const sign = d > 0 ? "+" : "";
    return `${arrow} ${sign}${d.toLocaleString("de-DE", { maximumFractionDigits: 1 })} pp`;
}

export default function CountryDetailDrawer({ country, total, demoMode, onClose, renderCountryPanelExtras }) {
    const extrasNode =
        country &&
        country.__empty !== true &&
        typeof renderCountryPanelExtras === "function"
            ? renderCountryPanelExtras(country)
            : null;

    useEffect(() => {
        if (!country) return undefined;

        const onKey = (e) => {
            if (e.key === "Escape") onClose();
        };
        window.addEventListener("keydown", onKey);
        lockBodyScroll();
        return () => {
            window.removeEventListener("keydown", onKey);
            unlockBodyScroll();
        };
    }, [country, onClose]);

    if (!country) return null;

    const empty = country.__empty === true;
    const num = country.num || {};
    const name = country.country || "—";
    const pp = !empty && country.previousPeriod && typeof country.previousPeriod === "object" ? country.previousPeriod : null;
    const pnum = pp?.num || {};

    const pct = (v) => (v != null && v !== "" && !Number.isNaN(Number(v)) ? `${Number(v)}%` : "—");

    const accCount = consentCountFromNum(num);
    const rejCount = num.decline ?? num.rejected;

    const stats = [
        {
            label: "Total interactions",
            value: fmt(num.total, demoMode),
            sub: null,
            cmpLine: pp ? `Baseline: ${fmt(pnum.total, demoMode)} · ${formatCountDelta(Number(num.total), Number(pnum.total)) || "—"}` : null,
        },
        {
            label: "Accepted",
            value: pct(country.accepted),
            sub: fmt(accCount, demoMode),
            cmpLine: pp
                ? `Baseline: ${pct(pp.accepted)} (${fmt(consentCountFromNum(pnum), demoMode)}) · ${formatPctDeltaPp(country.accepted, pp.accepted) || "—"}`
                : null,
        },
        {
            label: "Functional",
            value: pct(country.functional),
            sub: fmt(num.functional, demoMode),
            cmpLine: pp
                ? `Baseline: ${pct(pp.functional)} (${fmt(pnum.functional, demoMode)}) · ${formatPctDeltaPp(country.functional, pp.functional) || "—"}`
                : null,
        },
        {
            label: "Statistics",
            value: pct(country.statics),
            sub: fmt(num.statics, demoMode),
            cmpLine: pp
                ? `Baseline: ${pct(pp.statics)} (${fmt(pnum.statics, demoMode)}) · ${formatPctDeltaPp(country.statics, pp.statics) || "—"}`
                : null,
        },
        {
            label: "Marketing",
            value: pct(country.marketing),
            sub: fmt(num.marketing, demoMode),
            cmpLine: pp
                ? `Baseline: ${pct(pp.marketing)} (${fmt(pnum.marketing, demoMode)}) · ${formatPctDeltaPp(country.marketing, pp.marketing) || "—"}`
                : null,
        },
        {
            label: "Rejected",
            value: pct(country.declined),
            sub: fmt(rejCount, demoMode),
            cmpLine: pp
                ? `Baseline: ${pct(pp.declined)} (${fmt(pnum.decline ?? pnum.rejected, demoMode)}) · ${formatPctDeltaPp(country.declined, pp.declined) || "—"}`
                : null,
        },
    ];

    const shareOfGlobal =
        !empty && total > 0 && num.total != null
            ? Math.min(100, Math.max(0, (Number(num.total) / total) * 100))
            : null;

    return (
        <>
            <div
                className="world-map-drawer-backdrop"
                onClick={onClose}
                aria-hidden
            />
            <aside
                className="world-map-drawer"
                role="dialog"
                aria-modal="true"
                aria-labelledby="world-map-drawer-title"
            >
                <header className="world-map-drawer__header">
                    <div className="world-map-drawer__title-wrap">
                        <h2 id="world-map-drawer-title" className="world-map-drawer__title">
                            {name}
                        </h2>
                        {country.__iso ? (
                            <span className="world-map-drawer__iso">{country.__iso}</span>
                        ) : null}
                    </div>
                    <button
                        type="button"
                        className="world-map-drawer__close"
                        onClick={onClose}
                        aria-label="Close country details"
                    >
                        ×
                    </button>
                </header>

                {shareOfGlobal != null ? (
                    <div className="world-map-drawer__share">
                        <span className="world-map-drawer__share-label">Share of global volume</span>
                        <div className="world-map-drawer__share-bar">
                            <div
                                className="world-map-drawer__share-fill"
                                style={{ width: `${shareOfGlobal}%` }}
                            />
                        </div>
                        <span className="world-map-drawer__share-pct">{shareOfGlobal.toFixed(1)}%</span>
                    </div>
                ) : null}

                {empty ? (
                    <p className="world-map-drawer__empty">
                        No consent interactions in this country for the selected period.
                    </p>
                ) : (
                    <ul className="world-map-drawer__stats">
                        {stats.map((s) => (
                            <li key={s.label} className="world-map-drawer__stat">
                                <div className="world-map-drawer__stat-top">
                                    <span className="world-map-drawer__stat-label">{s.label}</span>
                                    <span className="world-map-drawer__stat-value">{s.value}</span>
                                </div>
                                {s.sub != null && String(s.sub) !== "" ? (
                                    <span className="world-map-drawer__stat-sub">Count: {s.sub}</span>
                                ) : null}
                                {s.cmpLine ? <span className="world-map-drawer__stat-cmp">{s.cmpLine}</span> : null}
                            </li>
                        ))}
                    </ul>
                )}

                {extrasNode ? (
                    <div className="world-map-drawer__extras">
                        <h3 className="world-map-drawer__extras-title">More detail</h3>
                        <div className="world-map-drawer__embed">{extrasNode}</div>
                    </div>
                ) : null}
            </aside>
        </>
    );
}
