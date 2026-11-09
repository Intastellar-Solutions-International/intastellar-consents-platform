import useFetch from "../../Functions/FetchHook";
import { lockBodyScroll, unlockBodyScroll } from "../../Functions/bodyScrollLock.js";
import API from "../../API/api";
import "../Charts/WorldMap/Style.css";
import "./Style.css";
import Card from "../ui/Card.js";
import Button from "../ui/Button.js";
import { SkeletonText } from "../ui/Skeleton.js";
import { liveMinuteBuckets } from "./liveInteractionTimestamp.js";

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
    const COUNTRY_PAGE_SIZE = 5;
    const DOMAIN_SHOW_LIMIT = 4;
    const [countryPage, setCountryPage] = useState(0);
    const [expandedCountries, setExpandedCountries] = useState(new Set());
    useEffect(() => {
        setCountryPage(0);
        setExpandedCountries(new Set());
    }, [liveData]);

    useEffect(() => {
        if (typeof props.onLiveDataChange === "function") {
            props.onLiveDataChange(liveData);
        }
    }, [liveData]);

    const closeDomainDrawer = () =>
        setDomainLiveView({ domain: "", country: "", open: false });

    const failed = Boolean(error) || (!loading && (liveData == null || typeof liveData !== "object"));
    const total = Number(liveData?.count) || 0;
    const minutes = liveMinuteBuckets(liveData?.visitsOverTime);
    const peak = Math.max(1, ...minutes);
    const countryKeys = Object.keys(liveData?.country || {});
    const totalPages = Math.ceil(countryKeys.length / COUNTRY_PAGE_SIZE);
    const visibleCountries = countryKeys.slice(countryPage * COUNTRY_PAGE_SIZE, (countryPage + 1) * COUNTRY_PAGE_SIZE);
    const domainsIn = (country) => Object.keys(liveData?.domains || {}).filter((d) => {
        const list = liveData.domains[d]?.country;
        return Array.isArray(list) && list.includes(country);
    });

    return (
        <>
            <Card
                title="Live view"
                description={demoMode ? "Demo mode is on" : undefined}
                className="tw-h-full"
                actions={(
                    <span className="tw-flex tw-items-center tw-gap-1 tw-text-xs tw-text-success">
                        <span className="tw-w-2 tw-h-2 tw-rounded-full tw-bg-success" aria-hidden="true" />Live
                    </span>
                )}
            >
                {loading && !liveData ? <SkeletonText lines={5} label="Loading live view…" /> : failed ? (
                    <p className="tw-m-0 tw-text-sm tw-text-text-muted">Live data couldn't be loaded. It will retry automatically.</p>
                ) : (
                    <div className="tw-flex tw-flex-col tw-gap-4">
                        <div>
                            <p className="tw-m-0 tw-text-4xl tw-text-text-primary tw-tabular-nums tw-leading-none">{fmtDemoCount(total, demoMode)}</p>
                            <p className="tw-m-0 tw-mt-1 tw-text-xs tw-text-text-muted">Interactions in the last 30 minutes</p>
                        </div>
                        {total === 0 ? (
                            <p className="tw-m-0 tw-text-sm tw-text-text-muted">No interactions right now. New decisions appear here automatically.</p>
                        ) : (
                            <>
                                <div>
                                    <div className="tw-flex tw-items-end tw-gap-px" style={{ height: 56 }} role="img" aria-label={`${total} interactions in the last 30 minutes`}>
                                        {minutes.map((count, index) => (
                                            <div
                                                key={index}
                                                title={`${29 - index === 0 ? "This minute" : `${29 - index} min ago`}: ${count}`}
                                                className={`tw-flex-1 tw-rounded-t-xs ${count > 0 ? "tw-bg-data" : "tw-bg-white/10"}`}
                                                style={{ height: count > 0 ? `${Math.max(8, (count / peak) * 100)}%` : 2, transition: "height 0.5s ease-in-out" }}
                                            />
                                        ))}
                                    </div>
                                    <div className="tw-flex tw-justify-between tw-mt-1 tw-text-xs tw-text-text-muted"><span>30 min ago</span><span>Now</span></div>
                                </div>
                                <ul className="tw-m-0 tw-p-0 tw-list-none tw-flex tw-flex-col tw-gap-3">
                                    {visibleCountries.map((key) => {
                                        const countryCount = liveData.country[key]?.count ?? 0;
                                        const allDomains = domainsIn(key);
                                        const expanded = expandedCountries.has(key);
                                        const shownDomains = expanded ? allDomains : allDomains.slice(0, DOMAIN_SHOW_LIMIT);
                                        const hiddenCount = allDomains.length - DOMAIN_SHOW_LIMIT;
                                        return (
                                            <li key={key}>
                                                <div className="tw-flex tw-justify-between tw-gap-3 tw-text-sm tw-text-text-primary">
                                                    <span className="tw-truncate">{key}</span>
                                                    <span className="tw-tabular-nums">{fmtDemoCount(countryCount, demoMode)}</span>
                                                </div>
                                                <div className="tw-h-1 tw-mt-1 tw-bg-white/10 tw-rounded-full" aria-hidden="true">
                                                    <div className="tw-h-full tw-bg-data tw-rounded-full" style={{ width: `${Math.min(100, (countryCount / Math.max(1, total)) * 100)}%` }} />
                                                </div>
                                                {!demoMode && shownDomains.map((domain) => (
                                                    <button
                                                        key={domain}
                                                        type="button"
                                                        onClick={() => setDomainLiveView({ domain, country: key, open: true })}
                                                        className="tw-flex tw-w-full tw-justify-between tw-gap-3 tw-h-8 tw-items-center tw-px-1 tw-border-0 tw-bg-transparent tw-rounded-sm tw-font-sans tw-text-sm tw-text-text-secondary tw-cursor-pointer hover:tw-bg-white/5 hover:tw-text-text-primary focus-visible:tw-outline-none focus-visible:tw-shadow-focus"
                                                    >
                                                        <span className="tw-truncate">{domain}</span>
                                                        <span className="tw-tabular-nums">{(liveData.domains[domain].country || []).filter((c) => c === key).length}</span>
                                                    </button>
                                                ))}
                                                {!demoMode && hiddenCount > 0 && (
                                                    <Button size="sm" variant="ghost" onClick={() => setExpandedCountries((prev) => {
                                                        const next = new Set(prev);
                                                        if (next.has(key)) next.delete(key); else next.add(key);
                                                        return next;
                                                    })}>
                                                        {expanded ? "Show less" : `+${hiddenCount} more domain${hiddenCount !== 1 ? "s" : ""}`}
                                                    </Button>
                                                )}
                                            </li>
                                        );
                                    })}
                                </ul>
                                {totalPages > 1 && (
                                    <div className="tw-flex tw-items-center tw-justify-between tw-gap-2 tw-text-xs tw-text-text-muted">
                                        <Button size="sm" variant="ghost" iconOnly icon="chevron-left" aria-label="Previous countries" disabled={countryPage === 0} onClick={() => setCountryPage((p) => p - 1)} />
                                        <span className="tw-tabular-nums">{countryPage + 1} / {totalPages}</span>
                                        <Button size="sm" variant="ghost" iconOnly icon="chevron-right" aria-label="Next countries" disabled={countryPage >= totalPages - 1} onClick={() => setCountryPage((p) => p + 1)} />
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                )}
            </Card>

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
