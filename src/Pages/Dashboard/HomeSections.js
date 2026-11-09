import Card from "../../Components/ui/Card.js";
import Button from "../../Components/ui/Button.js";
import { Icon } from "../../Components/ui/icons.js";
import { SkeletonCard, SkeletonText } from "../../Components/ui/Skeleton.js";
import { KpiDelta } from "../../Components/ui/KpiTile.js";
import CountryDetailDrawer from "../../Components/Charts/WorldMap/CountryDetailDrawer.js";
import { countryCodes } from "../../Components/Charts/WorldMap/countryCodes.js";
import { normalizeShares } from "../../Components/Charts/DeviceTypeInteractions/index.js";
import { preConsentCookieStat } from "../../Functions/cookieStats.js";
import { formatNumber, formatPercent } from "../../Functions/format.js";
import { decisionSplit } from "../../Functions/consentTrend.js";
import API from "../../API/api";
import { fetchJsonWithTimeout } from "../../Functions/fetchWithTimeout.js";
import { reportsPath } from "../../Functions/domainPathSegments.js";
import { readCachedDomains, toUnicodeDomain } from "../../Functions/cachedDomains.js";

const { useState, useMemo, useEffect } = React;
const Link = window.ReactRouterDOM.Link;

const COUNTRIES_SHOWN = 8;

// Guard against backend calculation bugs that produce percentages outside
// the valid [0, 100] range (e.g. stale/mismatched denominators). Clamps
// the value and logs a warning so the issue is visible in the console.
function safePercent(v) {
    const n = Number(v);
    if (!isFinite(n)) return v;
    if (n < 0 || n > 100) {
        console.warn("[Intastellar] Acceptance rate out of bounds:", n, "— clamped to [0, 100]");
    }
    return Math.min(100, Math.max(0, Math.round(n * 10) / 10));
}

/** Total of the daily series against its aligned previous period, in percent. */
export function periodChangePercent(daily) {
    if (!Array.isArray(daily) || daily.length === 0) return null;
    let current = 0, previous = 0;
    for (const d of daily) {
        current += Number(d?.num) || 0;
        previous += Number(d?.previousPeriod?.num) || 0;
    }
    return previous > 0 ? Math.round(((current - previous) / previous) * 1000) / 10 : null;
}

const CHECK_STATUS = {
    ok: { icon: "check-circle", tone: "tw-text-success" },
    warning: { icon: "alert-triangle", tone: "tw-text-warning" },
    danger: { icon: "alert-octagon", tone: "tw-text-danger-text" },
    unknown: { icon: "info", tone: "tw-text-text-muted" },
};

/** The state of each compliance check, including the ones that are fine. */
export function ComplianceChecks({ checks }) {
    return (
        <ul className="home-checks tw-m-0 tw-p-0 tw-list-none">
            {checks.map((c) => {
                const s = CHECK_STATUS[c.status] || CHECK_STATUS.unknown;
                return (
                    <li key={c.label} className="tw-px-3 tw-py-2 tw-rounded-md tw-bg-bg-sunken tw-min-w-0">
                        <p className="tw-m-0 tw-text-xs tw-text-text-muted">{c.label}</p>
                        <p className={`tw-m-0 tw-flex tw-items-center tw-gap-1 tw-text-sm ${s.tone}`}>
                            <Icon name={s.icon} size={15} /><span className="tw-truncate">{c.text}</span>
                        </p>
                    </li>
                );
            })}
        </ul>
    );
}

/** Section title on the left, its headline figures on the right. */
export function PerformanceBand({ children }) {
    return (
        <section aria-labelledby="home-performance-title" className="home-performance">
            <div className="home-performance__intro">
                <h2 id="home-performance-title" className="tw-m-0 tw-text-2xl tw-font-normal tw-text-text-primary">Consent performance</h2>
                <p className="tw-m-0 tw-text-sm tw-text-text-secondary">How visitors answered your banner in the selected period.</p>
            </div>
            <div className="home-performance__stats">{children}</div>
        </section>
    );
}

const CATEGORIES = [
    { name: "Marketing", rate: "Marketing", key: "marketing" },
    { name: "Functional", rate: "Functional", key: "functional" },
    { name: "Analytics", rate: "Statics", key: "statics" },
];

export function CategoryOptIn({ activeData, compareOn, footer }) {
    if (activeData == null) return <SkeletonCard height={320} label="Loading category opt-in…" />;
    return (
        <Card title="Opt-in by category">
            <div className="tw-flex tw-flex-col tw-gap-4">
                <div className="tw-flex tw-gap-3 tw-text-xs tw-text-text-secondary">
                    <span className="tw-flex tw-items-center tw-gap-1"><span className="tw-w-3 tw-h-3 tw-rounded-xs tw-bg-data" />Opted in</span>
                    <span className="tw-flex tw-items-center tw-gap-1"><span className="tw-w-3 tw-h-3 tw-rounded-xs tw-bg-white/10" />Opted out</span>
                </div>
                {CATEGORIES.map((c) => {
                    const rate = activeData[c.rate];
                    const change = activeData.changeRate?.[c.key];
                    return (
                        <div key={c.key}>
                            <div className="tw-flex tw-items-end tw-justify-between tw-gap-3">
                                <div className="tw-min-w-0">
                                    <h3 className="tw-m-0 tw-text-base tw-font-normal tw-text-text-primary">{c.name}</h3>
                                    {compareOn && <KpiDelta delta={{ value: change, formatted: formatPercent(change), goodWhen: "up" }} />}
                                </div>
                                <div className="tw-flex tw-gap-4 tw-text-right">
                                    <div>
                                        <p className="tw-m-0 tw-text-xs tw-text-text-muted">Accepted</p>
                                        <p className="tw-m-0 tw-text-base tw-text-text-primary tw-tabular-nums">{formatNumber(activeData.interactions_number?.[c.key])}</p>
                                    </div>
                                    <div>
                                        <p className="tw-m-0 tw-text-xs tw-text-text-muted">Opt-in rate</p>
                                        <p className="tw-m-0 tw-text-base tw-text-text-primary tw-tabular-nums">{formatPercent(rate)}</p>
                                    </div>
                                </div>
                            </div>
                            <div className="tw-flex tw-gap-0.5 tw-h-5 tw-mt-2" aria-hidden="true">
                                <div className="tw-bg-data tw-rounded-l-sm" style={{ width: `${Math.min(100, Math.max(0, Number(rate) || 0))}%` }} />
                                <div className="tw-flex-1 tw-bg-white/10 tw-rounded-r-sm" />
                            </div>
                        </div>
                    );
                })}
                <p className="tw-m-0 tw-text-xs tw-text-text-muted">Categories are calculated independently and may overlap.</p>
                {footer}
            </div>
        </Card>
    );
}

const SPLIT_COLORS = { accepted: "rgb(var(--c-data))", custom: "rgb(var(--c-data-2))", denied: "rgb(var(--c-data-3))" };
const SPLIT_GAP = 0.8;
const SPLIT_MIN_ARC = 0.6; // keeps a very small share visible

/** Donut of how visitors decided. The legend carries the exact figures. */
export function DecisionSplit({ activeData, demoMode }) {
    const [hovered, setHovered] = useState(null);
    if (activeData == null) return <SkeletonCard height={320} label="Loading decision split…" />;
    const { total, segments } = decisionSplit(activeData);
    const present = segments.filter((s) => s.count > 0);
    const center = segments.find((s) => s.key === hovered) || segments[0];
    let offset = 0;
    return (
        <Card title="How visitors decided">
            {total === 0 ? <p className="tw-m-0 tw-text-sm tw-text-text-muted">No decisions recorded in this period.</p> : (
                <div className="tw-flex tw-flex-col tw-items-center tw-gap-4">
                    <div className="tw-relative" style={{ width: 200, height: 200 }}>
                        <svg viewBox="0 0 42 42" role="img" aria-label={segments.map((s) => `${s.label} ${formatPercent(s.percent)}`).join(", ")} style={{ width: "100%", height: "100%", transform: "rotate(-90deg)" }}>
                            {present.map((s) => {
                                const gap = present.length > 1 ? SPLIT_GAP : 0;
                                const arc = Math.max(s.percent - gap, SPLIT_MIN_ARC);
                                const dashOffset = -offset;
                                offset += s.percent;
                                return (
                                    <circle key={s.key} cx="21" cy="21" r="15.915" fill="none" stroke={SPLIT_COLORS[s.key]} strokeWidth={hovered === s.key ? 6.5 : 5}
                                        strokeDasharray={`${arc} ${100 - arc}`} strokeDashoffset={dashOffset} style={{ cursor: "default" }}
                                        onMouseEnter={() => setHovered(s.key)} onMouseLeave={() => setHovered(null)} />
                                );
                            })}
                        </svg>
                        <div className="tw-absolute tw-inset-0 tw-flex tw-flex-col tw-items-center tw-justify-center tw-pointer-events-none">
                            <span className="tw-text-3xl tw-text-text-primary tw-tabular-nums">{formatPercent(center.percent)}</span>
                            <span className="tw-text-xs tw-text-text-muted">{center.label}</span>
                        </div>
                    </div>
                    <ul className="tw-m-0 tw-p-0 tw-list-none tw-w-full tw-flex tw-flex-col tw-gap-2">
                        {segments.map((s) => (
                            <li key={s.key} className="tw-flex tw-items-center tw-gap-2 tw-text-sm tw-text-text-secondary">
                                <span className="tw-w-3 tw-h-3 tw-rounded-xs" style={{ background: SPLIT_COLORS[s.key] }} aria-hidden="true" />
                                <span className="tw-flex-1">{s.label}</span>
                                <span className="tw-tabular-nums tw-text-text-muted">{demoCount(s.count, demoMode)}</span>
                                <span className="tw-tabular-nums tw-text-text-primary" style={{ minWidth: 56, textAlign: "right" }}>{formatPercent(s.percent)}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </Card>
    );
}

function demoCount(n, demoMode) {
    if (!demoMode || !Number.isFinite(n)) return formatNumber(n);
    const s = String(Math.round(n));
    return s.length > 3 ? `${s.slice(0, 2)}**` : s;
}

/** Countries ranked by decisions. A row opens the same detail drawer the map did. */
export function CountryRanking({ countries, activeData, demoMode }) {
    const [selected, setSelected] = useState(null);
    const [showAll, setShowAll] = useState(false);

    const ranked = useMemo(() => (countries || [])
        .filter((c) => c.country !== "Unknown" && Number(c.num?.total) > 0)
        .sort((a, b) => b.num.total - a.num.total), [countries]);
    const shown = showAll ? ranked : ranked.slice(0, COUNTRIES_SHOWN);
    const regions = [
        { label: "EU visitors", count: activeData?.euUsers, rate: activeData?.euAcceptedRate },
        { label: "Non-EU visitors", count: activeData?.noneEUUsers, rate: activeData?.noneEUAcceptedRate },
    ];

    return (
        <Card title="Where decisions come from">
            <div className="tw-flex tw-flex-wrap tw-gap-8">
                {regions.map((r) => (
                    <div key={r.label}>
                        <p className="tw-m-0 tw-text-xs tw-text-text-muted">{r.label}</p>
                        <p className="tw-m-0 tw-text-lg tw-text-text-primary tw-tabular-nums">
                            {formatNumber(r.count)}
                            {r.rate != null && <span className="tw-ml-1 tw-text-xs tw-text-text-secondary">{formatPercent(safePercent(r.rate))} accepted</span>}
                        </p>
                    </div>
                ))}
            </div>
            {shown.length === 0 ? (
                <p className="tw-m-0 tw-mt-4 tw-text-sm tw-text-text-muted">No country data for this period.</p>
            ) : (
                <>
                    <div className="home-country-row tw-mt-4 tw-text-xs tw-text-text-muted" aria-hidden="true">
                        <span /><span /><span className="tw-text-right">Decisions</span><span className="tw-text-right">Accepted</span>
                    </div>
                    <ul className="tw-m-0 tw-p-0 tw-list-none">
                        {shown.map((c) => (
                            <li key={c.country}>
                                <button
                                    type="button"
                                    onClick={() => setSelected({ ...c, __iso: countryCodes[c.country] })}
                                    className="home-country-row tw-w-full tw-h-10 tw-px-0 tw-border-0 tw-bg-transparent tw-rounded-sm tw-font-sans tw-text-sm tw-text-text-secondary tw-text-left tw-cursor-pointer hover:tw-bg-white/5 focus-visible:tw-outline-none focus-visible:tw-shadow-focus"
                                >
                                    <span className="tw-truncate">{c.country}</span>
                                    <span className="tw-block tw-h-3 tw-bg-data tw-rounded-r-sm" style={{ width: `${(c.num.total / ranked[0].num.total) * 100}%` }} aria-hidden="true" />
                                    <span className="tw-text-right tw-tabular-nums">{demoCount(c.num.total, demoMode)}</span>
                                    <span className="tw-text-right tw-tabular-nums">{formatPercent(c.accepted)}</span>
                                </button>
                            </li>
                        ))}
                    </ul>
                    {ranked.length > COUNTRIES_SHOWN && (
                        <Button size="sm" variant="ghost" className="tw-mt-2" onClick={() => setShowAll((v) => !v)}>
                            {showAll ? "Show fewer" : `Show all ${ranked.length} countries`}
                        </Button>
                    )}
                </>
            )}
            <CountryDetailDrawer country={selected} total={activeData?.Total} demoMode={demoMode} onClose={() => setSelected(null)} />
        </Card>
    );
}

const DEVICES = [
    { key: "mobile", label: "Mobile" },
    { key: "desktop", label: "Desktop" },
    { key: "tablet", label: "Tablet" },
];

export function DeviceShare({ activeData }) {
    if (activeData == null) return <SkeletonCard height={200} label="Loading device type…" />;
    const shares = normalizeShares(activeData.device_type);
    return (
        <Card title="Device type">
            <ul className="tw-m-0 tw-p-0 tw-list-none tw-flex tw-flex-col tw-gap-3">
                {DEVICES.map((d) => (
                    <li key={d.key}>
                        <div className="tw-flex tw-justify-between tw-text-sm tw-text-text-secondary">
                            <span>{d.label}</span><span className="tw-tabular-nums">{formatPercent(shares[d.key])}</span>
                        </div>
                        <div className="tw-h-3 tw-mt-1 tw-bg-white/10 tw-rounded-sm" aria-hidden="true">
                            <div className="tw-h-full tw-bg-data tw-rounded-sm" style={{ width: `${shares[d.key]}%` }} />
                        </div>
                    </li>
                ))}
            </ul>
        </Card>
    );
}

export function DecisionTime({ timeToDecision, onOpen }) {
    return (
        <Card title="Median decision time">
            <div className="tw-flex tw-flex-col tw-items-start tw-gap-1">
                <p className="tw-m-0 tw-text-5xl tw-text-text-primary tw-tabular-nums">
                    {timeToDecision?.median > 0 ? `${formatNumber(timeToDecision.median)} s` : "—"}
                </p>
                {timeToDecision?.count > 0 && <p className="tw-m-0 tw-text-sm tw-text-text-muted">{formatNumber(timeToDecision.count)} interactions · global</p>}
                <Button size="md" className="tw-mt-3" onClick={onOpen}>See breakdown</Button>
            </div>
        </Card>
    );
}

const RECENT_SCANS = 3;

/** The newest scans across all domains. Hides itself if there is nothing to show. */
function RecentScans({ platformId, workspace }) {
    const [scans, setScans] = useState(null);
    useEffect(() => {
        const api = API[platformId]?.listPreConsentScans;
        const domains = workspace?.domains?.length ? workspace.domains.map((d) => d.domain) : readCachedDomains();
        if (!api || !domains.length) { setScans([]); return undefined; }
        const ac = new AbortController();
        setScans(null);
        fetchJsonWithTimeout(api.url, { method: api.method, headers: api.headers, body: JSON.stringify({ domains, pageSize: RECENT_SCANS }) }, { signal: ac.signal })
            .then((data) => { if (!ac.signal.aborted) setScans(Array.isArray(data?.scans) ? data.scans : []); })
            .catch((err) => { if (err.kind !== "aborted" && !ac.signal.aborted) setScans([]); });
        return () => ac.abort();
    }, [platformId, workspace]);

    if (scans && scans.length === 0) return null;
    return (
        <div className="tw-w-full tw-pt-3 tw-border-0 tw-border-t tw-border-solid tw-border-border-subtle">
            <p className="tw-m-0 tw-text-xs tw-text-text-muted">Recent scans</p>
            {scans == null ? <SkeletonText lines={RECENT_SCANS} label="Loading recent scans…" /> : (
                <ul className="tw-m-0 tw-p-0 tw-list-none">
                    {scans.map((s) => (
                        <li key={s.id}>
                            <Link
                                to={`${reportsPath(platformId, toUnicodeDomain(s.domain), "/compliance")}?scan=${encodeURIComponent(s.id)}`}
                                className="tw-flex tw-items-center tw-justify-between tw-gap-3 tw-h-10 tw-text-sm tw-no-underline tw-text-text-secondary hover:tw-text-text-primary focus-visible:tw-outline-none focus-visible:tw-shadow-focus tw-rounded-sm"
                            >
                                <span className="tw-truncate">{toUnicodeDomain(s.domain)}</span>
                                <span className="tw-shrink-0 tw-tabular-nums">{formatNumber(s.cookies_found)} cookie{s.cookies_found === 1 ? "" : "s"}</span>
                            </Link>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

export function LatestScan({ domain, scanSummary, scanResult, compliancePath, allScansPath, scanLoading, onScan, platformId, workspace }) {
    const recent = <RecentScans platformId={platformId} workspace={workspace} />;
    const LINK = "tw-text-sm tw-font-semibold tw-text-accent-strong focus-visible:tw-outline-none focus-visible:tw-shadow-focus tw-rounded-sm";
    if (!domain) {
        return (
            <Card title="Latest cookie scan">
                <div className="tw-flex tw-flex-col tw-items-start tw-gap-3">
                    <p className="tw-m-0 tw-text-sm tw-text-text-secondary">Scans run per domain. Choose a domain to see its pre-consent transfers and cookies, or browse every scan.</p>
                    <Link to={allScansPath} className={LINK}>View all scans</Link>
                    {recent}
                </div>
            </Card>
        );
    }
    const transfers = scanSummary?.pre_consent_transfers || [];
    const cookies = scanSummary?.pre_consent_cookies || [];
    const nonEU = transfers.filter((t) => t.dataRegion !== "eu").length;
    const bareDomain = domain.replace(/^www\./, "");
    const preStat = preConsentCookieStat(scanResult);
    // The party split sits under the pre-consent number, so it has to add up to it.
    const preCookies = preStat.afterConsent != null ? cookies.filter((c) => c.consentPhase === "pre") : cookies;
    const thirdParty = preCookies.filter((c) => !c.domain?.replace(/^\./, "").endsWith(bareDomain)).length;
    const ageDays = scanSummary?.scanned_at ? Math.floor((Date.now() - new Date(scanSummary.scanned_at).getTime()) / 86400000) : null;
    const stale = ageDays != null && ageDays >= 14;
    const age = ageDays == null ? "No scan yet" : ageDays === 0 ? "Scanned today" : `Scanned ${ageDays} day${ageDays !== 1 ? "s" : ""} ago`;

    return (
        <Card title="Latest cookie scan" description={<span className={stale ? "tw-text-warning" : undefined}>{age}</span>}>
            <div className="tw-flex tw-flex-col tw-gap-3">
                <div className="tw-grid tw-grid-cols-2 tw-gap-3">
                    <div>
                        <p className="tw-m-0 tw-text-3xl tw-text-text-primary tw-tabular-nums">{scanSummary ? transfers.length : "—"}</p>
                        <p className="tw-m-0 tw-text-sm tw-text-text-secondary">Pre-consent transfers</p>
                        <p className="tw-m-0 tw-text-xs tw-text-text-muted">
                            {scanSummary ? (nonEU > 0 ? `${nonEU} non-EU · ${transfers.length - nonEU} EU` : "All within EU") : "No scan yet"}
                        </p>
                    </div>
                    <div>
                        <p className="tw-m-0 tw-text-3xl tw-text-text-primary tw-tabular-nums">{preStat.count != null ? preStat.count : preStat.label}</p>
                        <p className="tw-m-0 tw-text-sm tw-text-text-secondary">Pre-consent cookies</p>
                        <p className="tw-m-0 tw-text-xs tw-text-text-muted">
                            {preStat.count != null
                                ? (thirdParty > 0 ? `${thirdParty} third-party · ${preCookies.length - thirdParty} first-party` : "All first-party")
                                : preStat.reason}
                        </p>
                        {preStat.afterConsent != null && <p className="tw-m-0 tw-text-xs tw-text-text-muted">of {preStat.total} found · {preStat.afterConsent} set after accepting</p>}
                    </div>
                </div>
                <div className="tw-flex tw-flex-wrap tw-items-center tw-gap-3">
                    <Button size="md" loading={scanLoading} onClick={onScan}>{scanLoading ? "Scanning…" : "Scan now"}</Button>
                    <Link to={compliancePath} className={LINK}>Review in Compliance</Link>
                    <Link to={allScansPath} className={LINK}>View all scans</Link>
                </div>
                {recent}
            </div>
        </Card>
    );
}
