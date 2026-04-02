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

    const pct = (v) => (v != null && v !== "" && !Number.isNaN(Number(v)) ? `${Number(v)}%` : "—");

    const stats = [
        { label: "Total interactions", value: fmt(num.total, demoMode), sub: null },
        { label: "Accepted", value: pct(country.accepted), sub: fmt(num.accepted, demoMode) },
        { label: "Functional", value: pct(country.functional), sub: fmt(num.functional, demoMode) },
        { label: "Statistics", value: pct(country.statics), sub: fmt(num.statics, demoMode) },
        { label: "Marketing", value: pct(country.marketing), sub: fmt(num.marketing, demoMode) },
        { label: "Rejected", value: pct(country.declined), sub: fmt(num.rejected, demoMode) },
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
