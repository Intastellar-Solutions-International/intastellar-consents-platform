import "./DeviceTypeInteractions.css";

const DEVICES = [
    {
        key: "mobile",
        label: "Mobile",
        color: "#d9738f",
        gradient: "linear-gradient(90deg, #c85a78, #e888a0)",
    },
    {
        key: "desktop",
        label: "Desktop",
        color: "#5ba8d9",
        gradient: "linear-gradient(90deg, #3d8ec4, #7ec0ea)",
    },
    {
        key: "tablet",
        label: "Tablet",
        color: "#c09f53",
        gradient: "linear-gradient(90deg, #a6853f, #d4b56a)",
    },
];

function pct(num) {
    const n = Number(num);
    return Number.isFinite(n) ? Math.max(0, n) : 0;
}

function normalizeShares(deviceType) {
    const m = pct(deviceType?.mobile);
    const d = pct(deviceType?.desktop);
    const t = pct(deviceType?.tablet);
    const sum = m + d + t;
    if (sum <= 0) {
        return { mobile: 0, desktop: 0, tablet: 0 };
    }
    return {
        mobile: (m / sum) * 100,
        desktop: (d / sum) * 100,
        tablet: (t / sum) * 100,
    };
}

function formatPeriod(fromDate, toDate) {
    if (!fromDate || !toDate) return null;
    try {
        if (fromDate === toDate) {
            return new Intl.DateTimeFormat("de-DE", { dateStyle: "medium" }).format(new Date(fromDate));
        }
        const a = new Date(fromDate);
        const b = new Date(toDate);
        return `${new Intl.DateTimeFormat("de-DE", { day: "numeric", month: "short" }).format(a)} – ${new Intl.DateTimeFormat("de-DE", { day: "numeric", month: "short", year: "numeric" }).format(b)}`;
    } catch {
        return null;
    }
}

function conicGradient(shares) {
    let a = 0;
    const parts = [];
    for (const def of DEVICES) {
        const p = shares[def.key] || 0;
        const next = a + (p / 100) * 360;
        if (p > 0) {
            parts.push(`${def.color} ${a}deg ${next}deg`);
        }
        a = next;
    }
    if (parts.length === 0) {
        return "rgba(255,255,255,0.08) 0 360deg";
    }
    return parts.join(", ");
}

function formatCount(n, demoMode) {
    if (demoMode && n != null && Number.isFinite(n)) {
        const s = String(Math.round(n));
        if (s.length > 3) return `${s.slice(0, 2)}**`;
        return s;
    }
    if (n == null || !Number.isFinite(n)) return "—";
    return Math.round(n).toLocaleString("de-DE");
}

function DeviceGlyph({ type }) {
    if (type === "mobile") {
        return (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
                <rect x="7" y="2" width="10" height="18" rx="2" />
                <line x1="12" y1="18" x2="12" y2="18.01" strokeLinecap="round" />
            </svg>
        );
    }
    if (type === "tablet") {
        return (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
                <rect x="4" y="3" width="16" height="18" rx="2" />
                <line x1="12" y1="17" x2="12" y2="17.01" strokeLinecap="round" />
            </svg>
        );
    }
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
            <rect x="2" y="4" width="20" height="14" rx="2" />
            <line x1="8" y1="21" x2="16" y2="21" strokeLinecap="round" />
            <line x1="12" y1="18" x2="12" y2="21" strokeLinecap="round" />
        </svg>
    );
}

export default function DeviceTypeInteractions({ activeData, title, fromDate, toDate, demoMode }) {
    const deviceType = activeData?.device_type;
    const shares = normalizeShares(deviceType);
    const totalInteractions = Number(activeData?.Total);
    const hasTotal = Number.isFinite(totalInteractions) && totalInteractions > 0;
    const period = formatPeriod(fromDate, toDate);

    const rows = DEVICES.map((def) => ({
        ...def,
        share: shares[def.key] || 0,
        count: hasTotal ? (totalInteractions * (shares[def.key] || 0)) / 100 : null,
    }));

    const leading = rows.reduce((best, r) => (r.share > best.share ? r : best), rows[0]);
    const hasData = rows.some((r) => r.share > 0);

    if (!hasData) {
        return (
            <section className="device-interactions" aria-labelledby="device-interactions-title">
                <header className="device-interactions__header">
                    <h2 id="device-interactions-title" className="device-interactions__title">
                        {title || "Interactions by device"}
                    </h2>
                    {period ? <p className="device-interactions__subtitle">{period}</p> : null}
                </header>
                <p className="device-interactions__empty">No device breakdown available for this period.</p>
            </section>
        );
    }

    return (
        <section className="device-interactions" aria-labelledby="device-interactions-title">
            <header className="device-interactions__header">
                <h2 id="device-interactions-title" className="device-interactions__title">
                    {title || "Interactions by device"}
                </h2>
                {period ? <p className="device-interactions__subtitle">{period}</p> : null}
                {leading?.share > 0 ? (
                    <div className="device-interactions__lead">
                        <span>Most interactions:</span>
                        <strong>{leading.label}</strong>
                        <span>({leading.share.toFixed(1)}%)</span>
                    </div>
                ) : null}
            </header>

            <div className="device-interactions__body">
                <div className="device-interactions__donut-wrap">
                    <div
                        className="device-interactions__donut"
                        style={{ background: `conic-gradient(${conicGradient(shares)})` }}
                        role="img"
                        aria-label={`Device split: mobile ${shares.mobile.toFixed(1)}%, desktop ${shares.desktop.toFixed(1)}%, tablet ${shares.tablet.toFixed(1)}%`}
                    >
                        <div className="device-interactions__donut-hole">
                            <span className="device-interactions__donut-hole-label">Mix</span>
                            <span className="device-interactions__donut-hole-value">
                                {hasTotal
                                    ? formatCount(totalInteractions, demoMode)
                                    : `${rows.filter((r) => r.share > 0).length} types`}
                            </span>
                            <span className="device-interactions__donut-hole-sub">
                                {hasTotal ? "consent interactions" : "share of total"}
                            </span>
                        </div>
                    </div>
                    <ul className="device-interactions__legend">
                        {rows.map((r) => (
                            <li key={r.key} className="device-interactions__legend-item">
                                <span
                                    className="device-interactions__legend-swatch"
                                    style={{ backgroundColor: r.color }}
                                />
                                {r.label} · {r.share.toFixed(1)}%
                            </li>
                        ))}
                    </ul>
                </div>

                <div className="device-interactions__rows">
                    {rows.map((r) => (
                        <div key={r.key} className="device-interactions__row">
                            <div className="device-interactions__row-icon" style={{ color: r.color }}>
                                <DeviceGlyph type={r.key} />
                            </div>
                            <div className="device-interactions__row-main">
                                <div className="device-interactions__row-label">
                                    <span className="device-interactions__row-name">{r.label}</span>
                                    <span className="device-interactions__row-pct">{r.share.toFixed(1)}%</span>
                                </div>
                                <div className="device-interactions__row-bar">
                                    <div
                                        className="device-interactions__row-bar-fill"
                                        style={{
                                            width: `${Math.min(100, r.share)}%`,
                                            background: r.gradient,
                                        }}
                                    />
                                </div>
                            </div>
                            <div className="device-interactions__row-side">
                                <span className="device-interactions__row-count">
                                    {formatCount(r.count, demoMode)}
                                </span>
                                <span className="device-interactions__row-count-label">est. events</span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            <div className="device-interactions__stack">
                <p className="device-interactions__stack-label">Composition</p>
                <div className="device-interactions__stack-track" role="presentation">
                    {rows.map((r) =>
                        r.share > 0 ? (
                            <div
                                key={r.key}
                                className="device-interactions__stack-seg"
                                style={{
                                    width: `${r.share}%`,
                                    background: r.gradient,
                                }}
                                title={`${r.label}: ${r.share.toFixed(1)}%`}
                            />
                        ) : null
                    )}
                </div>
            </div>

            {!hasTotal ? (
                <p className="device-interactions__subtitle" style={{ marginTop: "14px", textAlign: "center" }}>
                    Percentages reflect the device mix. Enable total counts from your analytics payload to show
                    estimated events per device.
                </p>
            ) : null}
        </section>
    );
}
