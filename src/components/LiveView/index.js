import useFetch from "../../Functions/FetchHook";
import { lockBodyScroll, unlockBodyScroll } from "../../Functions/bodyScrollLock.js";
import API from "../../API/api";
import "../Charts/WorldMap/Style.css";
import "./Style.css";

const useState = window.React.useState;
const useEffect = window.React.useEffect;
const useMemo = window.React.useMemo;

function fmtDemoCount(n, demoMode) {
    if (n == null || !Number.isFinite(Number(n))) return "—";
    const v = Math.round(Number(n));
    if (!demoMode) return String(v);
    const s = String(v);
    return s.length > 3 ? `${s.slice(0, 2)}**` : s;
}

function parseConsentPayload(consent) {
    if (consent == null) return null;
    if (typeof consent === "string") {
        try {
            return JSON.parse(consent);
        } catch {
            return null;
        }
    }
    return consent;
}

/** Matches UserConsents / demo payloads: necessary, essential, etc. */
function isEssentialCategoryType(typeName) {
    const t = String(typeName ?? "").trim().toLowerCase();
    if (!t) return false;
    if (t.includes("non-essential") || t.includes("non essential")) return false;
    if (t === "necessary" || t === "essential") return true;
    if (/\b(necessary|essential|erforderlich|notwendig)\b/.test(t)) return true;
    if (t.includes("strictly") && t.includes("necessary")) return true;
    return false;
}

function isConsentItemAccepted(item) {
    const c = item?.checked;
    return c === true || c === "checked" || c === "1";
}

/**
 * One visit / consent event: accept all optional, essential-only (all optional off), or granular.
 */
function classifyVisitChoicePattern(data) {
    if (!Array.isArray(data) || data.length === 0) return null;
    const optional = data.filter((item) => !isEssentialCategoryType(item?.type));
    if (optional.length === 0) return "essentialOnly";
    const allOptionalAccepted = optional.every(isConsentItemAccepted);
    const allOptionalDeclined = optional.every((item) => !isConsentItemAccepted(item));
    if (allOptionalAccepted) return "acceptAll";
    if (allOptionalDeclined) return "essentialOnly";
    return "granular";
}

/** Aggregate cookie choices for one domain limited to visits from `countryKey`. */
function aggregateDomainConsentsForCountry(liveData, domain, countryKey) {
    const consents = liveData?.domains?.[domain]?.consent || [];
    const countries = liveData?.domains?.[domain]?.country || [];
    const byType = {};
    const visitBuckets = { acceptAll: 0, essentialOnly: 0, granular: 0 };
    let visitRows = 0;

    consents.forEach((raw, i) => {
        if (countries[i] !== countryKey) return;
        visitRows += 1;
        const data = parseConsentPayload(raw);
        if (!Array.isArray(data)) return;
        const pattern = classifyVisitChoicePattern(data);
        if (pattern) visitBuckets[pattern] += 1;
        data.forEach((item) => {
            const t = item?.type != null && String(item.type).trim() !== "" ? String(item.type) : "Other";
            if (!byType[t]) byType[t] = { accepted: 0, declined: 0 };
            const ok = isConsentItemAccepted(item);
            if (ok) byType[t].accepted += 1;
            else byType[t].declined += 1;
        });
    });

    let totalAccepted = 0;
    let totalDeclined = 0;
    Object.values(byType).forEach((row) => {
        totalAccepted += row.accepted;
        totalDeclined += row.declined;
    });
    const decisions = totalAccepted + totalDeclined;
    const acceptPct = decisions > 0 ? (totalAccepted / decisions) * 100 : null;

    const types = Object.keys(byType).sort((a, b) => {
        const ta = byType[a].accepted + byType[a].declined;
        const tb = byType[b].accepted + byType[b].declined;
        return tb - ta || a.localeCompare(b);
    });

    const visitsClassified =
        visitBuckets.acceptAll + visitBuckets.essentialOnly + visitBuckets.granular;

    return {
        byType,
        types,
        visitRows,
        visitBuckets,
        visitsClassified,
        totalAccepted,
        totalDeclined,
        decisions,
        acceptPct,
    };
}

function DomainConsentDrawer({ domain, country, liveData, demoMode, onClose }) {
    const summary = useMemo(
        () => aggregateDomainConsentsForCountry(liveData, domain, country),
        [liveData, domain, country]
    );

    useEffect(() => {
        const onKey = (e) => {
            if (e.key === "Escape") onClose();
        };
        window.addEventListener("keydown", onKey);
        lockBodyScroll();
        return () => {
            window.removeEventListener("keydown", onKey);
            unlockBodyScroll();
        };
    }, [onClose]);

    const totalInteractions = liveData?.count || 0;
    const domainCountryCount = (liveData?.domains?.[domain]?.country || []).filter((c) => c === country).length;
    const shareOfLive =
        totalInteractions > 0 && domainCountryCount > 0
            ? Math.min(100, (domainCountryCount / totalInteractions) * 100)
            : null;

    return (
        <>
            <div className="world-map-drawer-backdrop" onClick={onClose} aria-hidden />
            <aside
                className="world-map-drawer"
                role="dialog"
                aria-modal="true"
                aria-labelledby="live-view-domain-drawer-title"
            >
                <header className="world-map-drawer__header">
                    <div className="world-map-drawer__title-wrap">
                        <h2 id="live-view-domain-drawer-title" className="world-map-drawer__title">
                            {domain}
                        </h2>
                        <span className="world-map-drawer__iso">{country}</span>
                        <p className="live-view-drawer__subtitle">
                            Cookie choices from visitors in this country
                            {demoMode ? " (demo)" : ""}
                        </p>
                    </div>
                    <button
                        type="button"
                        className="world-map-drawer__close"
                        onClick={onClose}
                        aria-label="Close domain details"
                    >
                        ×
                    </button>
                </header>

                {shareOfLive != null ? (
                    <div className="world-map-drawer__share">
                        <span className="world-map-drawer__share-label">Share of live interactions (30 min)</span>
                        <div className="world-map-drawer__share-bar">
                            <div className="world-map-drawer__share-fill" style={{ width: `${shareOfLive}%` }} />
                        </div>
                        <span className="world-map-drawer__share-pct">{shareOfLive.toFixed(1)}%</span>
                    </div>
                ) : null}

                {summary.decisions === 0 ? (
                    <p className="world-map-drawer__empty">
                        No per-category consent breakdown for this domain and country in the current window.
                    </p>
                ) : (
                    <>
                        <div className="live-view-drawer__visit-patterns">
                            <span className="live-view-drawer__summary-label">Across visits</span>
                            {(() => {
                                const vb = summary.visitBuckets;
                                const vc = summary.visitsClassified;
                                const rows = [];
                                if (vb.acceptAll > 0) {
                                    rows.push(
                                        <div key="aa" className="live-view-drawer__visit-row">
                                            <div className="live-view-drawer__visit-row-main">
                                                <span className="live-view-drawer__visit-label live-view-drawer__visit-label--accept">
                                                    Accepted all
                                                </span>
                                            </div>
                                            <span className="live-view-drawer__visit-count">
                                                {fmtDemoCount(vb.acceptAll, demoMode)}{" "}
                                                {vb.acceptAll === 1 ? "visit" : "visits"}
                                            </span>
                                        </div>
                                    );
                                }
                                if (vb.essentialOnly > 0) {
                                    rows.push(
                                        <div key="eo" className="live-view-drawer__visit-row">
                                            <div className="live-view-drawer__visit-row-main">
                                                <span className="live-view-drawer__visit-label live-view-drawer__visit-label--essential">
                                                    Essential only
                                                </span>
                                                <span className="live-view-drawer__visit-meta">
                                                    Optional cookies declined
                                                </span>
                                            </div>
                                            <span className="live-view-drawer__visit-count">
                                                {fmtDemoCount(vb.essentialOnly, demoMode)}{" "}
                                                {vb.essentialOnly === 1 ? "visit" : "visits"}
                                            </span>
                                        </div>
                                    );
                                }
                                if (vb.granular > 0) {
                                    rows.push(
                                        <div key="gr" className="live-view-drawer__visit-row">
                                            <div className="live-view-drawer__visit-row-main">
                                                <span className="live-view-drawer__visit-label live-view-drawer__visit-label--granular">
                                                    Custom choices
                                                </span>
                                                <span className="live-view-drawer__visit-meta">
                                                    Mixed accept / decline per category
                                                </span>
                                            </div>
                                            <span className="live-view-drawer__visit-count">
                                                {fmtDemoCount(vb.granular, demoMode)}{" "}
                                                {vb.granular === 1 ? "visit" : "visits"}
                                            </span>
                                        </div>
                                    );
                                }
                                return rows;
                            })()}
                            {summary.visitsClassified > 0 ? (
                                <div className="live-view-drawer__visit-mix-bar" aria-hidden>
                                    {(() => {
                                        const vb = summary.visitBuckets;
                                        const vc = summary.visitsClassified;
                                        const w = (n) => (vc > 0 ? (n / vc) * 100 : 0);
                                        return (
                                            <>
                                                {vb.acceptAll > 0 ? (
                                                    <div
                                                        className="live-view-drawer__visit-mix-segment live-view-drawer__visit-mix-segment--accept"
                                                        style={{ width: `${w(vb.acceptAll)}%` }}
                                                    />
                                                ) : null}
                                                {vb.essentialOnly > 0 ? (
                                                    <div
                                                        className="live-view-drawer__visit-mix-segment live-view-drawer__visit-mix-segment--essential"
                                                        style={{ width: `${w(vb.essentialOnly)}%` }}
                                                    />
                                                ) : null}
                                                {vb.granular > 0 ? (
                                                    <div
                                                        className="live-view-drawer__visit-mix-segment live-view-drawer__visit-mix-segment--granular"
                                                        style={{ width: `${w(vb.granular)}%` }}
                                                    />
                                                ) : null}
                                            </>
                                        );
                                    })()}
                                </div>
                            ) : null}
                        </div>

                        <div className="live-view-drawer__granular-head">
                            <span className="live-view-drawer__summary-label">By category</span>
                            <p className="live-view-drawer__granular-sub">
                                Granular accept / decline counts per cookie type
                            </p>
                        </div>

                        <ul className="world-map-drawer__stats live-view-drawer__type-list">
                            {summary.types.map((typeName) => {
                                const row = summary.byType[typeName];
                                const n = row.accepted + row.declined;
                                const pctOk = n > 0 ? (row.accepted / n) * 100 : 0;
                                return (
                                    <li key={typeName} className="world-map-drawer__stat live-view-drawer__type-stat">
                                        <div className="world-map-drawer__stat-top">
                                            <span className="world-map-drawer__stat-label live-view-drawer__type-name">
                                                {typeName}
                                            </span>
                                            <span className="world-map-drawer__stat-value">
                                                {pctOk.toFixed(0)}% accepted
                                            </span>
                                        </div>
                                        <div className="live-view-drawer__mini-split" aria-hidden>
                                            <div
                                                className="live-view-drawer__mini-split-accept"
                                                style={{ width: `${pctOk}%` }}
                                            />
                                            <div
                                                className="live-view-drawer__mini-split-decline"
                                                style={{ width: `${100 - pctOk}%` }}
                                            />
                                        </div>
                                        <span className="world-map-drawer__stat-sub">
                                            {fmtDemoCount(row.accepted, demoMode)} accepted ·{" "}
                                            {fmtDemoCount(row.declined, demoMode)} declined
                                        </span>
                                    </li>
                                );
                            })}
                        </ul>
                    </>
                )}
            </aside>
        </>
    );
}

export function LiveView(props) {
    API.liveData.headers.Domains = props.currentDomain;
    const demoMode = props.demoMode;

    const [loading, liveData, error, updated] = useFetch(
        0.25,
        API.liveData.url,
        API.liveData.method,
        API.liveData.headers
    );
    const [domainLiveView, setDomainLiveView] = useState({
        domain: "",
        country: "",
        open: false,
    });
    const [barRenderKey, setBarRenderKey] = useState(0);
    useEffect(() => {
        setBarRenderKey((prev) => prev + 1);
    }, [liveData]);

    const closeDomainDrawer = () =>
        setDomainLiveView({ domain: "", country: "", open: false });

    return (
        <>
            {!loading ? (
                <div className="liveView">
                    <div className="liveView-content">
                        <p className="liveView-content-title">
                            INTERACTIONS IN LAST 30 MINUTES {demoMode ? "(DEMO MODE IS ON)" : ""}
                        </p>
                        <div className="liveView-content-data">
                            <div className="liveView-content-data-1">
                                <p className="liveView-content-data-1-number">{liveData?.count}</p>
                            </div>
                            <div
                                className="liveView-container"
                                key={barRenderKey}
                                style={{
                                    gap: "1px",
                                    display: "flex",
                                    alignItems: "flex-end",
                                    width: "100%",
                                    borderBottom: "1px solid rgb(192, 159, 83)",
                                    marginBottom: "10px",
                                }}
                            >
                                {(() => {
                                    const counts = Array(30).fill(0);
                                    if (liveData?.visitsOverTime && Array.isArray(liveData.visitsOverTime)) {
                                        liveData.visitsOverTime.forEach((event) => {
                                            const idx = Math.round(event.minutes) - 1;
                                            if (idx >= 0 && idx < 30) counts[idx]++;
                                        });
                                    }
                                    const maxCount = Math.max(1, ...counts);
                                    return counts.map((count, index) => {
                                        const barHeight =
                                            count > 0 ? Math.round((count / maxCount) * 60) : 2;
                                        return (
                                            <div
                                                key={index}
                                                className="liveView-container-bar"
                                                style={{
                                                    width: "calc(100% / 30)",
                                                    height: `${barHeight}px`,
                                                    backgroundColor: "rgb(192, 159, 83)",
                                                    transition: "height 0.5s ease-in-out",
                                                    opacity: count > 0 ? "1" : "0.3",
                                                }}
                                                title={count > 0 ? `${count} interactions` : "0 interactions"}
                                            />
                                        );
                                    });
                                })()}
                            </div>
                            <div className="liveView-content-data-2">
                                {Object.keys(liveData?.country || {}).map((key, countryIndex) => {
                                    const countryCount = liveData?.country[key]?.count ?? 0;
                                    const totalCount = liveData?.count || 1;
                                    const countryKeys = Object.keys(liveData?.country || {});
                                    const isLastCountry = countryIndex === countryKeys.length - 1;

                                    return (
                                        <div
                                            key={key}
                                            className="liveView-content-country"
                                            style={{ marginBottom: isLastCountry ? "0" : "40px" }}
                                        >
                                            <div className="liveView-content-flex">
                                                <p className="liveView-content-data-1-text">{key}</p>
                                                <p className="liveView-content-data-1-text">{countryCount}</p>
                                            </div>
                                            <div
                                                style={{
                                                    width: "100%",
                                                    height: "2px",
                                                    backgroundColor: "#c4c4c4",
                                                    marginBottom: "10px",
                                                }}
                                            >
                                                <div
                                                    style={{
                                                        width: `${(countryCount / totalCount) * 100}%`,
                                                        height: "2px",
                                                        backgroundColor: "rgb(222, 189, 113)",
                                                        marginBottom: "10px",
                                                    }}
                                                />
                                            </div>
                                            {!demoMode &&
                                                Object.keys(liveData?.domains || {})
                                                    .filter((domain) => {
                                                        const domainCountries = liveData?.domains[domain]?.country;
                                                        return Array.isArray(domainCountries) && domainCountries.includes(key);
                                                    })
                                                    .map((domain) => {
                                                        const domainCountryCount = (
                                                            liveData?.domains[domain]?.country || []
                                                        ).filter((c) => c === key).length;
                                                        const barWidthPercent =
                                                            totalCount > 0
                                                                ? (domainCountryCount / totalCount) * 100
                                                                : 0;

                                                        return (
                                                            <div key={`${key}-${domain}`} className="liveView-domain-block">
                                                                <button
                                                                    type="button"
                                                                    className="liveView-domain-row"
                                                                    onClick={() =>
                                                                        setDomainLiveView({
                                                                            domain,
                                                                            country: key,
                                                                            open: true,
                                                                        })
                                                                    }
                                                                >
                                                                    <span className="liveView-content-data-1-text liveView-domain-row__name">
                                                                        {domain}
                                                                    </span>
                                                                    <span className="liveView-content-data-1-text liveView-domain-row__count">
                                                                        {domainCountryCount}
                                                                    </span>
                                                                </button>
                                                                <div
                                                                    className="liveView-domain-bar-track"
                                                                    aria-hidden
                                                                >
                                                                    <div
                                                                        className="liveView-domain-bar-fill"
                                                                        style={{ width: `${barWidthPercent}%` }}
                                                                    />
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </div>
            ) : null}

            {domainLiveView.open && liveData ? (
                <DomainConsentDrawer
                    domain={domainLiveView.domain}
                    country={domainLiveView.country}
                    liveData={liveData}
                    demoMode={demoMode}
                    onClose={closeDomainDrawer}
                />
            ) : null}
        </>
    );
}
