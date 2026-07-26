const { useCallback, useEffect, useMemo, useState } = React;
import { ScannerHost } from "../../../API/host";

/*
 * MarketingReconciliationPanel
 *
 * The reconciliation-first view of the marketing dashboard: a marketer
 * pastes in the click / session count they see in their ad platform (or
 * in GA4) for this window and we compute, live:
 *
 *   1. Banner reach — how many of those clicks actually reached the banner.
 *   2. Analytics visibility — how many of the resulting consents will
 *      appear in GA4 / Ads Manager / Meta pixel (accept-all only).
 *   3. Invisible gap — clicks that won't surface in their analytics at all.
 *   4. (Optional) Cost per analytics-visible consent, if they also enter
 *      ad spend for the same period.
 *
 * Inputs are remembered *per platform*, so flipping between Google Ads
 * and Meta restores each platform's last-entered numbers — marketers
 * usually reconcile the same campaign window against multiple platforms.
 *
 * Snapshots: the "Save snapshot" button captures the current state plus
 * the derived reconciliation numbers and the data window. Snapshots
 * persist per domain (across scopes, so a single CSV gives the marketer
 * one timeline of their reconciliation history) and can be exported as
 * a CSV to drop into a board deck.
 */

const PLATFORMS = [
    { id: "google_ads", label: "Google Ads", metric: "clicks" },
    { id: "meta_ads", label: "Meta (Facebook / Instagram) Ads", metric: "link clicks" },
    { id: "ga4", label: "Google Analytics 4", metric: "sessions" },
    { id: "linkedin_ads", label: "LinkedIn Ads", metric: "clicks" },
    { id: "microsoft_ads", label: "Microsoft Ads", metric: "clicks" },
    { id: "tiktok_ads", label: "TikTok Ads", metric: "clicks" },
    { id: "pinterest_ads", label: "Pinterest Ads", metric: "clicks" },
    { id: "twitter_ads", label: "X (Twitter) Ads", metric: "clicks" },
    { id: "other", label: "Other / custom", metric: "clicks or sessions" },
];

const CURRENCIES = [
    { id: "EUR", symbol: "€" },
    { id: "USD", symbol: "$" },
    { id: "GBP", symbol: "£" },
    { id: "CHF", symbol: "CHF" },
    { id: "DKK", symbol: "kr" },
    { id: "SEK", symbol: "kr" },
    { id: "NOK", symbol: "kr" },
    { id: "PLN", symbol: "zł" },
];

const PLATFORM_BY_ID = PLATFORMS.reduce((acc, p) => {
    acc[p.id] = p;
    return acc;
}, {});

const PLATFORM_COLORS = {
    google_ads:    "#4285f4",
    meta_ads:      "#1877f2",
    linkedin_ads:  "#0a66c2",
    microsoft_ads: "#00a4ef",
    tiktok_ads:    "#ee1d52",
    pinterest_ads: "#e60023",
    twitter_ads:   "#1da1f2",
    ga4:           "#e37400",
    other:         "#888888",
};

/*
 * Run the same utm_source filter used by platformStats, but for an
 * arbitrary platformId rather than the currently-selected one.
 * Used by the comparison table to show all platforms side-by-side.
 */
function computeStatsForPlatform(platformId, scopeRows, fallbackConsents, fallbackVisible, fallbackInvisible) {
    const pattern = platformPattern(platformId);
    if (!pattern) {
        return { consents: fallbackConsents, visible: fallbackVisible, invisible: fallbackInvisible };
    }
    const rowsArr = Array.isArray(scopeRows) ? scopeRows : [];
    let consents = 0, visible = 0;
    for (const r of rowsArr) {
        if (!rowMatchesPlatform(r, pattern)) continue;
        consents += Number(r.consents) || 0;
        visible  += Number(r.acceptAll) || 0;
    }
    return { consents, visible, invisible: Math.max(0, consents - visible) };
}

/*
 * Per-platform utm_source matchers.
 *
 * A scope (channel or overview) usually contains traffic from several
 * ad platforms — we can't reconcile Microsoft clicks against "all paid
 * search consents" because that pool also contains Google and Baidu.
 * Each platform gets a regex that matches the canonicalised utm_source
 * (lowercased, punctuation-stripped); rows whose source matches are
 * treated as belonging to that platform.
 *
 * `null` means "no source filter" — applied to GA4 (which is analytics
 * downstream of every ad source) and "Other / custom" (user opt-out of
 * filtering, useful for bespoke UTM schemes the matcher doesn't know).
 *
 * The matchers err on the generous side (e.g. "fb*" → Meta) because
 * false negatives are the worse UX: a marketer seeing "0 matched" is
 * confusing, while a false positive gets caught when they review the
 * "matched sources" list we render under the inputs.
 */
const PLATFORM_SOURCE_PATTERNS = {
    google_ads: /^(?:google|adwords|gads)/,
    meta_ads: /^(?:facebook|meta|instagram|fb|ig)/,
    microsoft_ads: /^(?:bing|microsoft|msads|msn)/,
    linkedin_ads: /^(?:linkedin|liads)/,
    tiktok_ads: /^(?:tiktok|ttads)/,
    pinterest_ads: /^pinterest/,
    twitter_ads: /^(?:twitter|twtr|xads|x$)/,
    ga4: null,
    other: null,
};

function canonUtmSource(s) {
    return String(s || "")
        .toLowerCase()
        .replace(/[\s_\-.]+/g, "");
}

function platformPattern(platformId) {
    if (!Object.prototype.hasOwnProperty.call(PLATFORM_SOURCE_PATTERNS, platformId)) {
        return null;
    }
    return PLATFORM_SOURCE_PATTERNS[platformId];
}

function rowMatchesPlatform(row, pattern) {
    if (!pattern) return true;
    const raw = row && row.utmSource ? row.utmSource : "";
    if (!raw || raw === "—") return false;
    const canon = canonUtmSource(raw);
    if (!canon) return false;
    return pattern.test(canon);
}

/*
 * Describe what a platform's pattern accepts in marketer-friendly terms.
 * We surface this under the inputs when a filter is active so the user
 * can self-diagnose "why didn't my utm_source tag count?"
 */
const PLATFORM_EXAMPLE_SOURCES = {
    google_ads: ["google", "googleads", "adwords", "gads"],
    meta_ads: ["facebook", "fb", "meta", "instagram", "ig"],
    microsoft_ads: ["bing", "microsoft", "msads", "msn"],
    linkedin_ads: ["linkedin", "liads"],
    tiktok_ads: ["tiktok", "ttads"],
    pinterest_ads: ["pinterest"],
    twitter_ads: ["twitter", "twtr", "xads", "x"],
    ga4: [],
    other: [],
};

function platformOrFallback(id) {
    return PLATFORM_BY_ID[id] || PLATFORMS[0];
}

function currencyOrFallback(id) {
    return CURRENCIES.find((c) => c.id === id) || CURRENCIES[0];
}

const DEFAULT_INPUTS = {
    platform: "google_ads",
    currency: "EUR",
    /*
     * `byPlatform[platformId] = { adClicks: string, spend: string }`
     * Strings (not numbers) so empty fields don't render as "0".
     */
    byPlatform: {},
};

function blankPlatformValues() {
    return { adClicks: "", spend: "" };
}

function formatInt(n) {
    const x = Number(n);
    if (!Number.isFinite(x)) return "—";
    return Math.round(x).toLocaleString("de-DE");
}

function formatPct(n, maxFraction = 1) {
    const x = Number(n);
    if (!Number.isFinite(x)) return "—";
    return `${x.toLocaleString("de-DE", { maximumFractionDigits: maxFraction })}%`;
}

/*
 * Display helper for "X as a share of reported clicks" percentages.
 *
 * When consents exceed reported clicks (multi-session visits,
 * pre-consented returns, UTM-tagged URLs shared beyond the ad, or a
 * cross-platform attribution overlap), the derived share can exceed
 * 100% and reads like broken math. We clamp the label to "100%+" so
 * the UI stays honest — the raw numbers remain visible next to it and
 * the row gets an "over-count" badge, so the user can see why.
 */
function formatShareOfReportedPct(n, maxFraction = 1) {
    const x = Number(n);
    if (!Number.isFinite(x)) return "—";
    if (x > 100) return "100%+";
    return `${x.toLocaleString("de-DE", { maximumFractionDigits: maxFraction })}%`;
}

function formatMoney(n, currency) {
    const x = Number(n);
    if (!Number.isFinite(x)) return "—";
    const cur = currencyOrFallback(currency);
    return `${cur.symbol} ${x.toLocaleString("de-DE", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    })}`;
}

function formatTimestamp(iso) {
    if (!iso) return "—";
    try {
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) return iso;
        return d.toLocaleString("de-DE", {
            year: "numeric",
            month: "short",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
        });
    } catch {
        return iso;
    }
}

function generateId() {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return crypto.randomUUID();
    }
    return `snap-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function readStored(key) {
    try {
        const raw = window.localStorage.getItem(key);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object") return null;
        return parsed;
    } catch {
        return null;
    }
}

function writeStored(key, value) {
    try {
        window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
        /* private-mode / quota / SSR — silently skip */
    }
}

function safeKeyPart(value, fallback) {
    return String(value || fallback).slice(0, 120);
}

function inputsKey(domainKey, scopeKey) {
    return `marketing-reconciliation-inputs:${safeKeyPart(domainKey, "default")}:${safeKeyPart(scopeKey, "overview")}`;
}

function snapshotsKey(domainKey) {
    return `marketing-reconciliation-snapshots:${safeKeyPart(domainKey, "default")}`;
}

function legacyKey(domainKey, scopeKey) {
    return `marketing-reconciliation:${safeKeyPart(domainKey, "default")}:${safeKeyPart(scopeKey, "overview")}`;
}

/*
 * Read inputs for the (domain × scope) and migrate from the previous
 * storage shape on the way out. The old shape was a flat
 * { platform, adClicks, spend, currency }; the new shape keeps the
 * adClicks/spend buckets per-platform so the user can flip between
 * Google Ads and Meta without losing each set of numbers.
 */
function loadInputs(domainKey, scopeKey) {
    const next = readStored(inputsKey(domainKey, scopeKey));
    if (next && next.byPlatform && typeof next.byPlatform === "object") {
        return {
            ...DEFAULT_INPUTS,
            ...next,
            byPlatform: { ...next.byPlatform },
        };
    }

    /*
     * Migrate legacy single-platform record. We assign the legacy
     * numbers to whichever platform was selected at the time, so the
     * marketer's previously-entered values aren't lost on first load.
     */
    const legacy = readStored(legacyKey(domainKey, scopeKey));
    if (legacy && typeof legacy === "object") {
        const platform = legacy.platform || DEFAULT_INPUTS.platform;
        const migrated = {
            platform,
            currency: legacy.currency || DEFAULT_INPUTS.currency,
            byPlatform: {
                [platform]: {
                    adClicks: String(legacy.adClicks ?? ""),
                    spend: String(legacy.spend ?? ""),
                },
            },
        };
        writeStored(inputsKey(domainKey, scopeKey), migrated);
        try {
            window.localStorage.removeItem(legacyKey(domainKey, scopeKey));
        } catch {
            /* ignore */
        }
        return migrated;
    }

    return { ...DEFAULT_INPUTS, byPlatform: {} };
}

function loadSnapshots(domainKey) {
    const stored = readStored(snapshotsKey(domainKey));
    if (Array.isArray(stored)) return stored;
    return [];
}

function escapeCsv(value) {
    const s = value === null || value === undefined ? "" : String(value);
    if (s === "") return "";
    if (s.includes(",") || s.includes("\"") || s.includes("\n") || s.includes("\r")) {
        return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
}

function snapshotsToCsv(snapshots) {
    const header = [
        "saved_at",
        "scope",
        "platform",
        "platform_metric",
        "reported_count",
        "consents",
        "visible_consents",
        "invisible_consents",
        "banner_reach_pct",
        "visible_share_of_reported_pct",
        "invisible_share_of_reported_pct",
        "visible_share_of_consents_pct",
        "spend",
        "currency",
        "cost_per_visible",
        "source_filter_active",
        "matched_utm_sources",
        "scope_consents",
        "coverage_of_scope_pct",
        "from_date",
        "to_date",
    ];
    const lines = [header.map(escapeCsv).join(",")];
    for (const s of snapshots) {
        lines.push(
            [
                s.savedAt,
                s.scopeLabel,
                s.platformLabel,
                s.metric,
                s.adClicks,
                s.consents,
                s.visibleConsents,
                s.invisibleConsents,
                s.bannerReachPct,
                s.visibleSharePct,
                s.invisibleSharePct,
                s.visibilityOfConsentsPct,
                s.spend,
                s.currency,
                s.costPerVisible,
                s.sourceFilterActive ? "yes" : "no",
                s.matchedSources || "",
                s.scopeConsents ?? "",
                s.coverageOfScopePct ?? "",
                s.fromDate,
                s.toDate,
            ]
                .map(escapeCsv)
                .join(",")
        );
    }
    return lines.join("\n");
}

function downloadCsv(filename, csvText) {
    try {
        const blob = new Blob(["\uFEFF", csvText], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    } catch {
        /* swallow — download is best-effort */
    }
}

function ResultCard({ tone = "neutral", title, headline, detail, subDetail }) {
    return (
        <div
            className={[
                "marketing-reconciliation__result",
                `marketing-reconciliation__result--${tone}`,
            ].join(" ")}
        >
            <h4 className="marketing-reconciliation__result-title">{title}</h4>
            <p className="marketing-reconciliation__result-headline">{headline}</p>
            {detail ? <p className="marketing-reconciliation__result-detail">{detail}</p> : null}
            {subDetail ? (
                <p className="marketing-reconciliation__result-sub">{subDetail}</p>
            ) : null}
        </div>
    );
}

/* ─── Trend chart ───────────────────────────────────────────────────────── */

function TrendChart({ snapshots }) {
    const lines = useMemo(() => {
        const byPlatform = {};
        for (const s of snapshots) {
            if (s.visibilityOfConsentsPct === "" || s.visibilityOfConsentsPct == null) continue;
            const pid = s.platform;
            if (!byPlatform[pid]) byPlatform[pid] = [];
            byPlatform[pid].push({
                date:  new Date(s.savedAt).getTime(),
                pct:   Number(s.visibilityOfConsentsPct),
                scope: s.scopeLabel || "",
            });
        }
        return Object.entries(byPlatform)
            .map(([pid, pts]) => ({
                pid,
                label: (PLATFORM_BY_ID[pid] || {}).label || pid,
                color: PLATFORM_COLORS[pid] || "#888",
                pts:   pts.sort((a, b) => a.date - b.date),
            }))
            .filter(l => l.pts.length >= 1);
    }, [snapshots]);

    if (lines.length === 0) return null;

    const W = 600, H = 180;
    const PAD = { top: 16, right: 16, bottom: 36, left: 44 };
    const plotW = W - PAD.left - PAD.right;
    const plotH = H - PAD.top  - PAD.bottom;

    const allDates  = lines.flatMap(l => l.pts.map(p => p.date));
    const minDate   = Math.min(...allDates);
    const maxDate   = Math.max(...allDates);
    const dateRange = maxDate - minDate || 1;

    const toX = d   => PAD.left + ((d - minDate) / dateRange) * plotW;
    const toY = pct => PAD.top  + plotH - (Math.min(100, Math.max(0, pct)) / 100) * plotH;

    const yTicks = [0, 25, 50, 75, 100];
    const uniqueDates = [...new Set(allDates)].sort((a, b) => a - b);
    const xTicks = uniqueDates.length > 7
        ? uniqueDates.filter((_, i) => i % Math.ceil(uniqueDates.length / 6) === 0)
        : uniqueDates;

    function fmtDate(ts) {
        return new Date(ts).toLocaleDateString("de-DE", { month: "short", day: "numeric" });
    }

    return (
        <div className="marketing-reconciliation__trend">
            <h3 className="marketing-reconciliation__section-title">Visibility trend</h3>
            <p className="marketing-reconciliation__section-hint">
                Analytics-visible consents as a share of all consents recorded, over time.
                Save snapshots regularly to grow this chart.
            </p>
            <div className="marketing-reconciliation__trend-legend">
                {lines.map(l => (
                    <span key={l.pid} className="marketing-reconciliation__trend-legend-item">
                        <span className="marketing-reconciliation__trend-legend-dot"
                            style={{ background: l.color }} />
                        {l.label}
                    </span>
                ))}
            </div>
            <svg viewBox={`0 0 ${W} ${H}`} className="marketing-reconciliation__trend-svg"
                role="img" aria-label="Visibility % over time">
                {yTicks.map(pct => (
                    <g key={pct}>
                        <line x1={PAD.left} y1={toY(pct)} x2={W - PAD.right} y2={toY(pct)}
                            stroke="rgba(255,255,255,0.07)" strokeWidth="1" />
                        <text x={PAD.left - 6} y={toY(pct) + 4} textAnchor="end"
                            fontSize="10" fill="rgba(200,200,210,0.5)">{pct}%</text>
                    </g>
                ))}
                {xTicks.map(ts => (
                    <text key={ts} x={toX(ts)} y={H - PAD.bottom + 14} textAnchor="middle"
                        fontSize="10" fill="rgba(200,200,210,0.5)">{fmtDate(ts)}</text>
                ))}
                {lines.map(l => (
                    <g key={l.pid}>
                        {l.pts.length >= 2 && (
                            <polyline
                                points={l.pts.map(p => `${toX(p.date)},${toY(p.pct)}`).join(" ")}
                                fill="none" stroke={l.color} strokeWidth="2"
                                strokeLinejoin="round" opacity="0.85"
                            />
                        )}
                        {l.pts.map((p, i) => (
                            <circle key={i} cx={toX(p.date)} cy={toY(p.pct)} r="4"
                                fill={l.color} stroke="rgba(0,0,0,0.5)" strokeWidth="1.5">
                                <title>{l.label} · {fmtDate(p.date)}: {formatPct(p.pct)}{p.scope ? ` (${p.scope})` : ""}</title>
                            </circle>
                        ))}
                    </g>
                ))}
            </svg>
        </div>
    );
}

/* ─── Platform comparison table ─────────────────────────────────────────── */

function ComparisonTable({ rows, currency }) {
    if (rows.length < 2) return null;
    const hasSpend = rows.some(r => r.spend > 0);
    return (
        <div className="marketing-reconciliation__comparison">
            <h3 className="marketing-reconciliation__section-title">Platform comparison</h3>
            <p className="marketing-reconciliation__section-hint">
                Every platform where you've entered data, reconciled against this scope's consent data side-by-side.
            </p>
            <div className="marketing-reconciliation__comparison-wrap">
                <table className="marketing-reconciliation__comparison-table">
                    <thead>
                        <tr>
                            <th scope="col">Platform</th>
                            <th scope="col" className="num">Reported</th>
                            <th scope="col" className="num">Consents</th>
                            <th scope="col" className="num">Visible</th>
                            <th scope="col" className="num">Gap</th>
                            <th scope="col" className="num">Visibility</th>
                            {hasSpend ? <th scope="col" className="num">Cost / visible</th> : null}
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map(r => {
                            const visibilityClass =
                                r.visibilityPct != null && r.visibilityPct >= 70
                                    ? "marketing-reconciliation__comparison-good"
                                    : r.visibilityPct != null && r.visibilityPct < 50
                                      ? "marketing-reconciliation__comparison-warn"
                                      : "";
                            return (
                                <tr key={r.platform.id}>
                                    <td>
                                        <span className="marketing-reconciliation__comparison-dot"
                                            style={{ background: PLATFORM_COLORS[r.platform.id] || "#888" }} />
                                        {r.platform.label}
                                    </td>
                                    <td className="num">{formatInt(r.clicks)}</td>
                                    <td className="num">{formatInt(r.consents)}</td>
                                    <td className="num">
                                        {formatInt(r.visible)}
                                        {r.visibleSharePct != null ? (
                                            <span className="marketing-reconciliation__snapshots-sub">
                                                {" "}({formatShareOfReportedPct(r.visibleSharePct)})
                                            </span>
                                        ) : null}
                                    </td>
                                    <td className="num">
                                        {formatInt(r.invisible)}
                                        {r.invisibleSharePct != null ? (
                                            <span className="marketing-reconciliation__snapshots-sub">
                                                {" "}({formatShareOfReportedPct(r.invisibleSharePct)})
                                            </span>
                                        ) : null}
                                    </td>
                                    <td className={`num ${visibilityClass}`}>
                                        {r.visibilityPct != null ? formatPct(r.visibilityPct) : "—"}
                                    </td>
                                    {hasSpend ? (
                                        <td className="num">
                                            {r.costPerVisible != null
                                                ? formatMoney(r.costPerVisible, currency)
                                                : "—"}
                                        </td>
                                    ) : null}
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

/* ─── Visibility improvement projection ─────────────────────────────────── */

function ProjectionTable({ numConsents, numVisible, spend, currency }) {
    if (!spend || spend <= 0 || numConsents <= 0 || numVisible <= 0) return null;
    const currentPct = (numVisible / numConsents) * 100;
    const targets    = [60, 75, 90, 100].filter(t => t > currentPct + 2);
    if (!targets.length) return null;

    const currentCost = spend / numVisible;

    return (
        <div className="marketing-reconciliation__projection">
            <h3 className="marketing-reconciliation__section-title">What improved visibility would cost</h3>
            <p className="marketing-reconciliation__section-hint">
                If more visitors consented, your effective cost per analytics-visible consent would fall.
                Assumes the same spend and same total consent volume; only the visibility rate changes.
            </p>
            <table className="marketing-reconciliation__projection-table">
                <thead>
                    <tr>
                        <th scope="col">Visibility rate</th>
                        <th scope="col" className="num">Visible consents</th>
                        <th scope="col" className="num">Cost per visible</th>
                        <th scope="col" className="num">vs. today</th>
                    </tr>
                </thead>
                <tbody>
                    <tr className="marketing-reconciliation__projection-row--current">
                        <td>Today ({formatPct(currentPct)})</td>
                        <td className="num">{formatInt(numVisible)}</td>
                        <td className="num">{formatMoney(currentCost, currency)}</td>
                        <td className="num">—</td>
                    </tr>
                    {targets.map(targetPct => {
                        const projVisible = Math.round((targetPct / 100) * numConsents);
                        const projCost    = spend / Math.max(1, projVisible);
                        const saving      = ((currentCost - projCost) / currentCost) * 100;
                        return (
                            <tr key={targetPct}>
                                <td>{targetPct}%</td>
                                <td className="num">{formatInt(projVisible)}</td>
                                <td className="num">{formatMoney(projCost, currency)}</td>
                                <td className="num marketing-reconciliation__comparison-good">
                                    −{formatPct(saving, 0)}
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}

/* ─── DB row → snapshot shape ────────────────────────────────────────────── */

function dbRowToSnapshot(row) {
    return {
        id: row.id,
        savedAt: row.saved_at,
        scopeLabel: row.scope_label,
        scopeKey: row.scope_key,
        platform: row.platform,
        platformLabel: row.platform_label,
        metric: row.metric,
        adClicks: row.ad_clicks,
        spend: row.spend ?? "",
        currency: row.currency ?? "",
        costPerVisible: row.cost_per_visible ?? "",
        consents: row.consents,
        visibleConsents: row.visible_consents,
        invisibleConsents: row.invisible_consents,
        bannerReachPct: row.banner_reach_pct ?? "",
        visibleSharePct: row.visible_share_pct ?? "",
        invisibleSharePct: row.invisible_share_pct ?? "",
        visibilityOfConsentsPct: row.visibility_of_consents_pct ?? "",
        sourceFilterActive: row.source_filter_active ?? false,
        sourcePattern: row.source_pattern ?? "",
        matchedSources: row.matched_sources ?? "",
        scopeConsents: row.scope_consents ?? "",
        coverageOfScopePct: row.coverage_of_scope_pct ?? "",
        fromDate: row.from_date ?? "",
        toDate: row.to_date ?? "",
    };
}

/* ─── FunnelFlow ─────────────────────────────────────────────────────────── */

function FunnelFlow({ clicks, consents, visible, invisible, platform, visibleSharePct, bannerReachPct, invisibleSharePct, hasClicks }) {
    if (!hasClicks) return null;
    const bannerPct = bannerReachPct != null ? `${formatPct(bannerReachPct)} reach` : null;
    const visPct    = visibleSharePct  != null ? `${formatPct(visibleSharePct)} of ${platform.metric}` : null;
    const gapPct    = invisibleSharePct != null ? `${formatPct(invisibleSharePct)} gap` : null;

    return (
        <div className="recon-funnel">
            <div className="recon-funnel__step recon-funnel__step--reported">
                <div className="recon-funnel__num">{formatInt(clicks)}</div>
                <div className="recon-funnel__label">Reported {platform.metric}</div>
            </div>
            <div className="recon-funnel__arrow">
                <div className="recon-funnel__arrow-pct">{bannerPct}</div>
                <div className="recon-funnel__arrow-line">↓</div>
            </div>
            <div className="recon-funnel__step recon-funnel__step--consents">
                <div className="recon-funnel__num">{formatInt(consents)}</div>
                <div className="recon-funnel__label">Banner consents</div>
            </div>
            <div className="recon-funnel__arrow">
                <div className="recon-funnel__arrow-pct">{visPct}</div>
                <div className="recon-funnel__arrow-line">↓</div>
            </div>
            <div className="recon-funnel__step recon-funnel__step--visible">
                <div className="recon-funnel__num">{formatInt(visible)}</div>
                <div className="recon-funnel__label">Visible in analytics</div>
            </div>
            {invisible > 0 && (
                <div className="recon-funnel__gap">
                    <span className="recon-funnel__gap-num">{formatInt(invisible)}</span>
                    <span className="recon-funnel__gap-label"> invisible{gapPct ? ` · ${gapPct}` : ""}</span>
                </div>
            )}
        </div>
    );
}

/* ─── VisibilityGauge ────────────────────────────────────────────────────── */

function VisibilityGauge({ pct, costPerVisible, costPerClick, currency }) {
    if (pct == null) return null;

    const R = 70, CX = 90, CY = 90, SW = 14;
    const startAngle = Math.PI * 0.75;
    const endAngle   = Math.PI * 2.25;
    const arcAngle   = startAngle + ((Math.min(100, Math.max(0, pct)) / 100)) * (endAngle - startAngle);

    function polarToXY(angle, r) {
        return { x: CX + r * Math.cos(angle), y: CY + r * Math.sin(angle) };
    }
    function arc(a1, a2, r) {
        const s = polarToXY(a1, r), e = polarToXY(a2, r);
        const large = (a2 - a1) > Math.PI ? 1 : 0;
        return `M ${s.x} ${s.y} A ${r} ${r} 0 ${large} 1 ${e.x} ${e.y}`;
    }

    const gaugeColor = pct >= 70 ? "#4cde8c" : pct >= 50 ? "#f5a623" : "#e05050";
    const W = 180, H = 160;

    return (
        <div className="recon-gauge">
            <svg viewBox={`0 0 ${W} ${H}`} className="recon-gauge__svg" role="img"
                 aria-label={`Visibility: ${formatPct(pct)}`}>
                {/* Background track */}
                <path d={arc(startAngle, endAngle, R)} fill="none"
                    stroke="rgba(255,255,255,0.08)" strokeWidth={SW} strokeLinecap="round" />
                {/* Filled arc */}
                {pct > 0 && (
                    <path d={arc(startAngle, arcAngle, R)} fill="none"
                        stroke={gaugeColor} strokeWidth={SW} strokeLinecap="round" opacity="0.88" />
                )}
                {/* Center text */}
                <text x={CX} y={CY - 8} textAnchor="middle" fontSize="28" fontWeight="700"
                    fill={gaugeColor}>{Math.round(pct)}%</text>
                <text x={CX} y={CY + 14} textAnchor="middle" fontSize="11" fill="rgba(200,200,210,0.7)">
                    visibility
                </text>
                {/* Scale labels */}
                <text x={polarToXY(startAngle, R + 18).x} y={polarToXY(startAngle, R + 18).y + 4}
                    textAnchor="middle" fontSize="9" fill="rgba(180,180,190,0.5)">0%</text>
                <text x={polarToXY(endAngle, R + 18).x} y={polarToXY(endAngle, R + 18).y + 4}
                    textAnchor="middle" fontSize="9" fill="rgba(180,180,190,0.5)">100%</text>
            </svg>
            {costPerVisible != null && (
                <div className="recon-gauge__cost">
                    <span className="recon-gauge__cost-label">Cost / visible consent</span>
                    <span className="recon-gauge__cost-val">{formatMoney(costPerVisible, currency)}</span>
                    {costPerClick != null && (
                        <span className="recon-gauge__cost-sub">
                            vs {formatMoney(costPerClick, currency)} /{" "}click
                        </span>
                    )}
                </div>
            )}
        </div>
    );
}

/* ─── UtmSourcesChart ────────────────────────────────────────────────────── */

function UtmSourcesChart({ scopeRows }) {
    const data = useMemo(() => {
        if (!Array.isArray(scopeRows) || scopeRows.length === 0) return [];
        const map = {};
        for (const r of scopeRows) {
            const key = (String(r.utmSource || "").trim()) || "(untagged)";
            if (!map[key]) map[key] = { source: key, consents: 0, visible: 0 };
            map[key].consents += Number(r.consents) || 0;
            map[key].visible  += Number(r.acceptAll) || 0;
        }
        return Object.values(map)
            .filter(d => d.consents > 0)
            .sort((a, b) => b.consents - a.consents)
            .slice(0, 10)
            .map(d => ({
                ...d,
                invisible:     Math.max(0, d.consents - d.visible),
                visibilityPct: d.consents > 0 ? (d.visible / d.consents) * 100 : 0,
            }));
    }, [scopeRows]);

    if (data.length < 2) return null;

    const maxVal   = Math.max(...data.map(d => d.consents), 1);
    const ROW_H    = 30;
    const LABEL_W  = 148;
    const BAR_AREA = 340;
    const PCT_W    = 52;
    const PAD_X    = 12;
    const H_HEAD   = 22;
    const W        = LABEL_W + PAD_X + BAR_AREA + PAD_X + PCT_W;
    const H        = H_HEAD + data.length * ROW_H + 8;

    return (
        <div className="recon-chart-section">
            <h3 className="marketing-reconciliation__section-title">Traffic sources</h3>
            <p className="marketing-reconciliation__section-hint">
                Consent volume by utm_source — green = analytics-visible, amber = consented but not measurable.
            </p>
            <div className="recon-chart-scroll">
                <svg viewBox={`0 0 ${W} ${H}`} className="recon-bar-chart"
                     role="img" aria-label="Consent breakdown by UTM source">
                    {/* Column headers */}
                    <text x={LABEL_W + PAD_X} y={14} fontSize="9" fontWeight="600"
                          fill="rgba(150,165,190,0.6)">CONSENTS</text>
                    <text x={LABEL_W + PAD_X + BAR_AREA + PAD_X} y={14} fontSize="9" fontWeight="600"
                          fill="rgba(150,165,190,0.6)">VIS.</text>

                    {data.map((d, i) => {
                        const y    = H_HEAD + i * ROW_H + 2;
                        const barH = ROW_H - 8;
                        const x0   = LABEL_W + PAD_X;
                        const visW = (d.visible  / maxVal) * BAR_AREA;
                        const invW = (d.invisible / maxVal) * BAR_AREA;
                        const pctColor = d.visibilityPct >= 65 ? "#86efac" : d.visibilityPct >= 40 ? "#fcd34d" : "#fca5a5";
                        const srcLabel = d.source.length > 20 ? d.source.slice(0, 19) + "…" : d.source;
                        return (
                            <g key={d.source}>
                                <text x={LABEL_W - 6} y={y + barH / 2 + 1} textAnchor="end"
                                      fontSize="11" fill="rgba(185,195,215,0.88)" dominantBaseline="middle">
                                    {srcLabel}
                                </text>
                                {/* Track */}
                                <rect x={x0} y={y} width={BAR_AREA} height={barH}
                                      rx="3" fill="rgba(255,255,255,0.04)" />
                                {/* Visible segment */}
                                {visW > 0 && (
                                    <rect x={x0} y={y} width={visW} height={barH} rx="3" fill="rgba(74,222,128,0.72)">
                                        <title>{d.source}: {formatInt(d.visible)} visible consents</title>
                                    </rect>
                                )}
                                {/* Invisible segment */}
                                {invW > 0 && (
                                    <rect x={x0 + visW} y={y} width={invW} height={barH} rx="3" fill="rgba(245,158,11,0.52)">
                                        <title>{d.source}: {formatInt(d.invisible)} not measurable</title>
                                    </rect>
                                )}
                                {/* Visibility % */}
                                <text x={x0 + BAR_AREA + PAD_X} y={y + barH / 2 + 1}
                                      fontSize="11" fontWeight="700" fill={pctColor} dominantBaseline="middle">
                                    {formatPct(d.visibilityPct, 0)}
                                </text>
                            </g>
                        );
                    })}
                </svg>
                <div className="recon-chart-legend">
                    <span><span className="recon-legend-dot" style={{ background: "rgba(74,222,128,0.72)" }} />Visible in analytics</span>
                    <span><span className="recon-legend-dot" style={{ background: "rgba(245,158,11,0.52)" }} />Consented, not measurable</span>
                </div>
            </div>
        </div>
    );
}

/* ─── PlatformBarsChart ──────────────────────────────────────────────────── */

function PlatformBarsChart({ rows, currency }) {
    if (!rows || rows.length < 2) return null;

    const maxConsents = Math.max(...rows.map(r => r.consents), 1);
    const ROW_H   = 56;
    const LABEL_W = 130;
    const BAR_AREA = 330;
    const PCT_W   = 54;
    const PAD_X   = 12;
    const H_HEAD  = 22;
    const W       = LABEL_W + PAD_X + BAR_AREA + PAD_X + PCT_W;
    const H       = H_HEAD + rows.length * ROW_H + 8;

    return (
        <div className="recon-chart-section">
            <h3 className="marketing-reconciliation__section-title">Platform comparison</h3>
            <p className="marketing-reconciliation__section-hint">
                Visible vs. not-measurable consents per platform — bar width = consent volume.
            </p>
            <div className="recon-chart-scroll">
                <svg viewBox={`0 0 ${W} ${H}`} className="recon-bar-chart"
                     role="img" aria-label="Platform consent comparison">
                    <text x={LABEL_W + PAD_X} y={14} fontSize="9" fontWeight="600"
                          fill="rgba(150,165,190,0.6)">CONSENTS</text>
                    <text x={LABEL_W + PAD_X + BAR_AREA + PAD_X} y={14} fontSize="9" fontWeight="600"
                          fill="rgba(150,165,190,0.6)">VIS.</text>

                    {rows.map((r, i) => {
                        const y      = H_HEAD + i * ROW_H + 2;
                        const barH   = 22;
                        const x0     = LABEL_W + PAD_X;
                        const visW   = r.consents > 0 ? (r.visible  / maxConsents) * BAR_AREA : 0;
                        const invW   = r.consents > 0 ? (r.invisible / maxConsents) * BAR_AREA : 0;
                        const dotColor  = PLATFORM_COLORS[r.platform.id] || "#888";
                        const pctColor  = r.visibilityPct >= 65 ? "#86efac" : r.visibilityPct >= 40 ? "#fcd34d" : "#fca5a5";
                        const shortName = r.platform.label.replace(" (Facebook / Instagram)", "").replace(" Ads", "");
                        return (
                            <g key={r.platform.id}>
                                {/* Dot + label */}
                                <circle cx={8} cy={y + barH / 2} r="5" fill={dotColor} />
                                <text x={20} y={y + barH / 2 + 1} fontSize="11" fontWeight="600"
                                      fill="rgba(190,200,220,0.9)" dominantBaseline="middle">
                                    {shortName}
                                </text>
                                {/* Track */}
                                <rect x={x0} y={y} width={BAR_AREA} height={barH}
                                      rx="4" fill="rgba(255,255,255,0.04)" />
                                {visW > 0 && (
                                    <rect x={x0} y={y} width={visW} height={barH} rx="4" fill="rgba(74,222,128,0.72)">
                                        <title>{r.platform.label}: {formatInt(r.visible)} visible</title>
                                    </rect>
                                )}
                                {invW > 0 && (
                                    <rect x={x0 + visW} y={y} width={invW} height={barH} rx="4" fill="rgba(245,158,11,0.52)">
                                        <title>{r.platform.label}: {formatInt(r.invisible)} not measurable</title>
                                    </rect>
                                )}
                                {/* Visibility % */}
                                <text x={x0 + BAR_AREA + PAD_X} y={y + barH / 2 + 1}
                                      fontSize="12" fontWeight="700" fill={pctColor} dominantBaseline="middle">
                                    {r.visibilityPct != null ? formatPct(r.visibilityPct, 0) : "—"}
                                </text>
                                {/* Sub-line: reported + cost */}
                                <text x={x0} y={y + barH + 13} fontSize="9" fill="rgba(130,145,170,0.65)">
                                    {formatInt(r.clicks)} reported · {formatInt(r.visible)} visible
                                    {r.costPerVisible != null ? ` · ${formatMoney(r.costPerVisible, currency)} / visible` : ""}
                                </text>
                            </g>
                        );
                    })}
                </svg>
                <div className="recon-chart-legend">
                    <span><span className="recon-legend-dot" style={{ background: "rgba(74,222,128,0.72)" }} />Visible in analytics</span>
                    <span><span className="recon-legend-dot" style={{ background: "rgba(245,158,11,0.52)" }} />Consented, not measurable</span>
                </div>
            </div>
        </div>
    );
}

/* ─── SnapshotComboChart ─────────────────────────────────────────────────── */

function SnapshotComboChart({ snapshots }) {
    const data = useMemo(() => {
        return snapshots
            .filter(s => Number(s.adClicks) > 0 && s.visibilityOfConsentsPct !== "" && s.visibilityOfConsentsPct != null)
            .slice(0, 24)
            .sort((a, b) => new Date(a.savedAt) - new Date(b.savedAt))
            .map(s => ({
                date:          new Date(s.savedAt).getTime(),
                clicks:        Number(s.adClicks) || 0,
                consents:      Number(s.consents)  || 0,
                visible:       Number(s.visibleConsents) || 0,
                visPct:        Number(s.visibilityOfConsentsPct),
                platform:      s.platform,
                platformLabel: s.platformLabel || s.platform,
                color:         PLATFORM_COLORS[s.platform] || "#888",
            }));
    }, [snapshots]);

    if (data.length < 2) return null;

    const W   = 620, H = 230;
    const PAD = { top: 20, right: 56, bottom: 46, left: 56 };
    const plotW = W - PAD.left - PAD.right;
    const plotH = H - PAD.top  - PAD.bottom;

    const maxClicks  = Math.max(...data.map(d => d.clicks), 1);
    const barW       = Math.max(6, Math.min(36, (plotW / data.length) * 0.65));
    const toX        = i   => PAD.left + ((i + 0.5) / data.length) * plotW;
    const toYClicks  = v   => PAD.top  + plotH - (v / maxClicks) * plotH;
    const toYPct     = pct => PAD.top  + plotH - (Math.min(100, Math.max(0, pct)) / 100) * plotH;

    const linePoints = data.map((d, i) => `${toX(i)},${toYPct(d.visPct)}`).join(" ");

    function fmtDate(ts) {
        return new Date(ts).toLocaleDateString("de-DE", { month: "short", day: "numeric" });
    }

    // Show every Nth x-label to avoid clutter
    const xStep = Math.ceil(data.length / 7);

    return (
        <div className="marketing-reconciliation__trend">
            <h3 className="marketing-reconciliation__section-title">Performance over time</h3>
            <p className="marketing-reconciliation__section-hint">
                Reported clicks per snapshot (bars) and analytics visibility % (line). Save snapshots regularly to extend this chart.
            </p>
            <svg viewBox={`0 0 ${W} ${H}`} className="marketing-reconciliation__trend-svg"
                 role="img" aria-label="Snapshot performance over time">

                {/* Grid + right-axis % labels */}
                {[0, 25, 50, 75, 100].map(pct => (
                    <g key={pct}>
                        <line x1={PAD.left} y1={toYPct(pct)} x2={W - PAD.right} y2={toYPct(pct)}
                              stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
                        <text x={W - PAD.right + 5} y={toYPct(pct) + 4}
                              fontSize="9" fill="rgba(160,175,200,0.5)">{pct}%</text>
                    </g>
                ))}

                {/* Left-axis clicks labels */}
                {[0, 0.5, 1].map((f, i) => (
                    <text key={i} x={PAD.left - 6} y={PAD.top + plotH - f * plotH + 4}
                          textAnchor="end" fontSize="9" fill="rgba(160,175,200,0.5)">
                        {formatInt(maxClicks * f)}
                    </text>
                ))}

                {/* Click bars (colored by platform) */}
                {data.map((d, i) => {
                    const x   = toX(i) - barW / 2;
                    const top = toYClicks(d.clicks);
                    const ht  = PAD.top + plotH - top;
                    return (
                        <rect key={i} x={x} y={top} width={barW} height={ht}
                              rx="2" fill={d.color} opacity="0.35">
                            <title>{d.platformLabel} · {fmtDate(d.date)}: {formatInt(d.clicks)} {PLATFORM_BY_ID[d.platform]?.metric || "clicks"}, {formatPct(d.visPct)} visibility</title>
                        </rect>
                    );
                })}

                {/* Visibility % line */}
                <polyline points={linePoints} fill="none"
                          stroke="rgba(240,245,255,0.85)" strokeWidth="2" strokeLinejoin="round" />

                {/* Data-point dots, colored by threshold */}
                {data.map((d, i) => {
                    const dotColor = d.visPct >= 65 ? "#4ade80" : d.visPct >= 40 ? "#f59e0b" : "#f87171";
                    return (
                        <circle key={i} cx={toX(i)} cy={toYPct(d.visPct)} r="4.5"
                                fill={dotColor} stroke="rgba(0,0,0,0.55)" strokeWidth="1.5">
                            <title>{d.platformLabel} · {fmtDate(d.date)}: {formatPct(d.visPct)} visibility</title>
                        </circle>
                    );
                })}

                {/* X axis date labels */}
                {data.filter((_, i) => i % xStep === 0).map(d => (
                    <text key={d.date} x={toX(data.indexOf(d))} y={H - PAD.bottom + 14}
                          textAnchor="middle" fontSize="9" fill="rgba(160,175,200,0.55)">
                        {fmtDate(d.date)}
                    </text>
                ))}

                {/* Axis labels */}
                <text x={PAD.left - 38} y={PAD.top + plotH / 2} textAnchor="middle"
                      fontSize="9" fill="rgba(150,165,190,0.5)"
                      transform={`rotate(-90,${PAD.left - 38},${PAD.top + plotH / 2})`}>
                    Clicks
                </text>
                <text x={W - PAD.right + 40} y={PAD.top + plotH / 2} textAnchor="middle"
                      fontSize="9" fill="rgba(150,165,190,0.5)"
                      transform={`rotate(90,${W - PAD.right + 40},${PAD.top + plotH / 2})`}>
                    Visibility %
                </text>
            </svg>

            {/* Legend */}
            <div className="recon-chart-legend">
                {[...new Set(data.map(d => d.platform))].map(pid => (
                    <span key={pid}>
                        <span className="recon-legend-dot" style={{ background: PLATFORM_COLORS[pid] || "#888", opacity: 0.7 }} />
                        {(PLATFORM_BY_ID[pid] || {}).label || pid}
                    </span>
                ))}
                <span style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                    <span style={{ display: "inline-block", width: "18px", height: "2px", background: "rgba(240,245,255,0.85)", verticalAlign: "middle" }} />
                    Visibility %
                </span>
                <span><span className="recon-legend-dot" style={{ background: "#4ade80" }} />≥65%</span>
                <span><span className="recon-legend-dot" style={{ background: "#f59e0b" }} />40–65%</span>
                <span><span className="recon-legend-dot" style={{ background: "#f87171" }} />&lt;40%</span>
            </div>
        </div>
    );
}

/* ─── computeInsights ────────────────────────────────────────────────────── */

function computeInsights({
    hasClicks, hasSpend,
    visibilityOfConsentsPct, bannerReachPct, coverageOfScopePct,
    costPerVisible, numConsents, numVisible, spendNum, currency,
    darkTrafficPct, darkConsents, darkTrafficTotal,
    selectedPlatform, filterActive,
}) {
    const ins = [];

    // 1. UTM dark traffic (scope-level, always shown when significant)
    if (darkTrafficPct != null && darkTrafficTotal >= 20) {
        if (darkTrafficPct > 50) {
            ins.push({
                type: "critical",
                title: `${formatPct(darkTrafficPct, 0)} of traffic is untagged`,
                body: `${formatInt(darkConsents)} of ${formatInt(darkTrafficTotal)} consents have no utm_source and can't be attributed to any platform or campaign. This level of dark traffic means your ROAS figures are based on a fraction of actual conversions. Review UTM tagging across all channels — especially brand, direct, and email campaigns.`,
            });
        } else if (darkTrafficPct > 25) {
            ins.push({
                type: "warning",
                title: `${formatPct(darkTrafficPct, 0)} untagged traffic`,
                body: `${formatInt(darkConsents)} consents have no utm_source. Some dark traffic is expected (direct, bookmarks) but above 25% usually signals incomplete UTM tagging on campaigns or landing pages. Use a UTM builder and audit your campaign links.`,
            });
        }
    }

    // 2. Analytics visibility vs 65% benchmark
    if (hasClicks && visibilityOfConsentsPct != null) {
        if (visibilityOfConsentsPct < 40) {
            ins.push({
                type: "critical",
                title: `Only ${formatPct(visibilityOfConsentsPct, 0)} analytics visibility`,
                body: `Fewer than 4 in 10 consents from this campaign appear in your analytics tools — well below the typical 65–75% range. At this level your reported ROAS is likely 2–3× overstated. Check banner placement on ad landing pages, review your consent category setup, and consider A/B testing the banner UX.`,
            });
        } else if (visibilityOfConsentsPct < 65) {
            ins.push({
                type: "warning",
                title: `Below-benchmark visibility (${formatPct(visibilityOfConsentsPct, 0)})`,
                body: `Typical analytics visibility sits at 65–75%. Closing the gap increases measurable reach without extra spend. The projection table below shows the exact cost reduction you'd see at each target visibility rate.`,
            });
        } else if (visibilityOfConsentsPct >= 80) {
            ins.push({
                type: "good",
                title: `Strong visibility (${formatPct(visibilityOfConsentsPct, 0)})`,
                body: `Well above the 65% benchmark — the large majority of campaign traffic is measurable. Your analytics data is a reliable reflection of actual performance.`,
            });
        } else {
            ins.push({
                type: "good",
                title: `Good visibility (${formatPct(visibilityOfConsentsPct, 0)})`,
                body: `Above the 65% industry benchmark. Aim for 75–80% to further reduce cost per measurable event.`,
            });
        }
    }

    // 3. Cost saving opportunity (only when visibility has headroom)
    if (hasSpend && visibilityOfConsentsPct != null && visibilityOfConsentsPct < 80
        && numConsents > 0 && costPerVisible != null && spendNum > 0) {
        const targetPct = 75;
        const projVisible = Math.round((targetPct / 100) * numConsents);
        const projCost = spendNum / Math.max(1, projVisible);
        const saving = ((costPerVisible - projCost) / costPerVisible) * 100;
        if (saving > 8) {
            ins.push({
                type: "opportunity",
                title: `${formatPct(saving, 0)} cost saving at 75% visibility`,
                body: `Your current cost per analytics-visible consent is ${formatMoney(costPerVisible, currency)}. At 75% visibility with the same spend it falls to ${formatMoney(projCost, currency)} — a ${formatPct(saving, 0)} reduction. Improving banner opt-in rates is often the highest-leverage action available without increasing budget.`,
            });
        }
    }

    // 4. Low banner reach
    if (hasClicks && bannerReachPct != null && bannerReachPct < 50) {
        ins.push({
            type: "warning",
            title: `Low banner reach (${formatPct(bannerReachPct, 0)})`,
            body: `Fewer than half of reported ${selectedPlatform.metric} triggered a consent banner interaction. Verify that your banner script loads correctly on all ad landing pages, isn't blocked by ad-blockers or page caching, and that cross-domain clicks aren't dropping the consent session.`,
        });
    }

    // 5. Low platform UTM match
    if (filterActive && coverageOfScopePct != null && coverageOfScopePct < 15 && hasClicks) {
        ins.push({
            type: "warning",
            title: `Low UTM match for ${selectedPlatform.label}`,
            body: `Only ${formatPct(coverageOfScopePct, 0)} of scope consents match ${selectedPlatform.label}'s utm_source pattern. Either this platform drives very little traffic in this channel, or campaign URLs are missing the correct utm_source tag (expected: ${(PLATFORM_EXAMPLE_SOURCES[selectedPlatform.id] || []).slice(0, 3).join(", ")}).`,
        });
    }

    // Return up to 4 insights, sorted critical → warning → opportunity → good
    const ORDER = { critical: 0, warning: 1, opportunity: 2, good: 3 };
    return ins.sort((a, b) => (ORDER[a.type] ?? 4) - (ORDER[b.type] ?? 4)).slice(0, 4);
}

/* ─── UtmHealthBar ────────────────────────────────────────────────────────── */

function UtmHealthBar({ darkTrafficPct, darkConsents, darkTrafficTotal }) {
    if (darkTrafficPct == null || darkTrafficTotal < 20) return null;
    const taggedPct = 100 - darkTrafficPct;
    const tone = taggedPct >= 80 ? "good" : taggedPct >= 55 ? "warn" : "bad";
    return (
        <div className={`utm-health utm-health--${tone}`} title={`${formatInt(darkConsents)} of ${formatInt(darkTrafficTotal)} consents have no utm_source`}>
            <span className="utm-health__label">UTM attribution</span>
            <div className="utm-health__track">
                <div className="utm-health__fill" style={{ width: `${Math.max(2, taggedPct)}%` }} />
            </div>
            <span className="utm-health__stats">
                <strong>{formatPct(taggedPct, 0)}</strong> attributed
                <span className="utm-health__dark"> · {formatPct(darkTrafficPct, 0)} untagged ({formatInt(darkConsents)})</span>
            </span>
        </div>
    );
}

/* ─── InsightsPanel ───────────────────────────────────────────────────────── */

const INSIGHT_ICONS = { critical: "⚠", warning: "◉", opportunity: "↗", good: "✓" };

function InsightsPanel({ insights }) {
    if (!insights || insights.length === 0) return null;
    return (
        <div className="recon-insights">
            <h3 className="recon-insights__heading">Insights</h3>
            <div className="recon-insights__list">
                {insights.map((ins, i) => (
                    <div key={i} className={`recon-insight recon-insight--${ins.type}`}>
                        <span className="recon-insight__icon" aria-hidden="true">
                            {INSIGHT_ICONS[ins.type] || "●"}
                        </span>
                        <div className="recon-insight__content">
                            <p className="recon-insight__title">{ins.title}</p>
                            <p className="recon-insight__body">{ins.body}</p>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

const SYNC_SHORT_LABEL = {
    google_ads: "Google Ads", meta_ads: "Meta", linkedin_ads: "LinkedIn",
    microsoft_ads: "Microsoft Ads", tiktok_ads: "TikTok", pinterest_ads: "Pinterest",
    twitter_ads: "X / Twitter", ga4: "GA4",
};

/* ─── NotificationBell ───────────────────────────────────────────────────── */

function NotificationBell({ domainKey, orgId, authToken }) {
    const [open, setOpen] = useState(false);
    const [notifications, setNotifications] = useState([]);
    const [unread, setUnread] = useState(0);
    const [loading, setLoading] = useState(false);
    const bellRef = React.useRef(null);

    const fetchNotifications = useCallback(async () => {
        if (!authToken || !orgId || !domainKey || domainKey === "combined view") return;
        setLoading(true);
        try {
            const resp = await fetch(
                `${ScannerHost}/api/ad-alerts?domain=${encodeURIComponent(domainKey)}&resource=notifications&limit=20`,
                { headers: { Authorization: authToken, Organisation: String(orgId) } }
            );
            if (resp.ok) {
                const data = await resp.json();
                setNotifications(data.notifications || []);
                setUnread(data.unread || 0);
            }
        } finally {
            setLoading(false);
        }
    }, [domainKey, orgId, authToken]);

    useEffect(() => { fetchNotifications(); }, [fetchNotifications]);

    // Close on outside click
    useEffect(() => {
        if (!open) return;
        function handler(e) {
            if (bellRef.current && !bellRef.current.contains(e.target)) setOpen(false);
        }
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, [open]);

    async function markAllRead() {
        await fetch(`${ScannerHost}/api/ad-alerts`, {
            method: "POST",
            headers: { Authorization: authToken, Organisation: String(orgId), "Content-Type": "application/json" },
            body: JSON.stringify({ domain: domainKey, action: "mark-read", id: "all" }),
        }).catch(() => {});
        setNotifications(prev => prev.map(n => ({ ...n, read_at: n.read_at || new Date().toISOString() })));
        setUnread(0);
    }

    async function markRead(id) {
        await fetch(`${ScannerHost}/api/ad-alerts`, {
            method: "POST",
            headers: { Authorization: authToken, Organisation: String(orgId), "Content-Type": "application/json" },
            body: JSON.stringify({ domain: domainKey, action: "mark-read", id }),
        }).catch(() => {});
        setNotifications(prev => prev.map(n => n.id === id ? { ...n, read_at: new Date().toISOString() } : n));
        setUnread(prev => Math.max(0, prev - 1));
    }

    const toggleOpen = () => {
        if (!open) fetchNotifications();
        setOpen(v => !v);
    };

    const severityColors = { critical: "#ef4444", warning: "#f59e0b", info: "#3b82f6" };
    const ruleLabels = {
        visibility_low: "Low visibility",
        dark_traffic_high: "Dark traffic",
        banner_reach_low: "Banner reach",
        cost_high: "High cost",
    };

    return (
        <div className="notif-bell" ref={bellRef}>
            <button
                className={`notif-bell__btn${unread > 0 ? " notif-bell__btn--active" : ""}`}
                onClick={toggleOpen}
                aria-label={`Alerts${unread > 0 ? ` — ${unread} unread` : ""}`}
                title="Analytics blind-spot alerts"
            >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                    <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
                </svg>
                {unread > 0 && <span className="notif-bell__badge">{unread > 9 ? "9+" : unread}</span>}
            </button>

            {open && (
                <div className="notif-dropdown">
                    <div className="notif-dropdown__header">
                        <span className="notif-dropdown__title">Alerts</span>
                        {unread > 0 && (
                            <button className="notif-dropdown__mark-all" onClick={markAllRead}>
                                Mark all read
                            </button>
                        )}
                    </div>

                    <div className="notif-dropdown__list">
                        {loading && notifications.length === 0 && (
                            <p className="notif-dropdown__empty">Loading…</p>
                        )}
                        {!loading && notifications.length === 0 && (
                            <p className="notif-dropdown__empty">
                                No alerts yet. Configure alert rules to get notified when analytics visibility drops.
                            </p>
                        )}
                        {notifications.map(n => (
                            <div
                                key={n.id}
                                className={`notif-item${!n.read_at ? " notif-item--unread" : ""}`}
                                style={{ borderLeftColor: severityColors[n.severity] || "#6366f1" }}
                                onClick={() => !n.read_at && markRead(n.id)}
                            >
                                <div className="notif-item__meta">
                                    <span className="notif-item__type" style={{ color: severityColors[n.severity] }}>
                                        {ruleLabels[n.rule_type] || n.rule_type}
                                    </span>
                                    <span className="notif-item__time">
                                        {new Date(n.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                                    </span>
                                </div>
                                <p className="notif-item__title">{n.title}</p>
                                {!n.read_at && <span className="notif-item__dot" aria-label="unread" />}
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

/* ─── AlertSettingsModal ─────────────────────────────────────────────────── */

const RULE_DEFS = [
    { type: "visibility_low",    label: "Visibility below",      unit: "percent",         defaultThreshold: 65, hint: "Alert when analytics-visible consent % drops below this value." },
    { type: "dark_traffic_high", label: "Untagged traffic above", unit: "percent",         defaultThreshold: 40, hint: "Alert when utm_source is missing for more than this % of consents." },
    { type: "banner_reach_low",  label: "Banner reach below",    unit: "percent",         defaultThreshold: 40, hint: "Alert when fewer than this % of ad clicks trigger a banner interaction." },
    { type: "cost_high",         label: "Cost per visible above", unit: "currency_amount", defaultThreshold: null, hint: "Alert when cost per analytics-visible consent exceeds this amount." },
];

function AlertSettingsModal({ domainKey, orgId, authToken, currency, onClose }) {
    const [rules, setRules] = useState([]);
    const [vapidKey, setVapidKey] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState({});
    const [pushSubscription, setPushSubscription] = useState(null);
    const [pushStatus, setPushStatus] = useState("idle"); // idle | subscribing | subscribed | unsupported
    const [email, setEmail] = useState("");

    useEffect(() => {
        if (!authToken || !orgId || !domainKey) return;
        fetch(`${ScannerHost}/api/ad-alerts?domain=${encodeURIComponent(domainKey)}&resource=rules`, {
            headers: { Authorization: authToken, Organisation: String(orgId) },
        })
            .then(r => r.ok ? r.json() : null)
            .then(data => {
                if (!data) return;
                setRules(data.rules || []);
                setVapidKey(data.vapidPublicKey || null);
                const emailRule = (data.rules || []).find(r => r.email_address);
                if (emailRule) setEmail(emailRule.email_address || "");
            })
            .finally(() => setLoading(false));

        // Check existing push subscription
        if ("serviceWorker" in navigator && "PushManager" in window) {
            navigator.serviceWorker.ready.then(reg => reg.pushManager.getSubscription())
                .then(sub => { if (sub) { setPushSubscription(sub); setPushStatus("subscribed"); } })
                .catch(() => {});
        } else {
            setPushStatus("unsupported");
        }
    }, [domainKey, orgId, authToken]);

    async function saveRule(ruleType, updates) {
        setSaving(p => ({ ...p, [ruleType]: true }));
        try {
            const rule = rules.find(r => r.rule_type === ruleType) || {};
            const def  = RULE_DEFS.find(d => d.type === ruleType);
            const payload = {
                domain: domainKey,
                action: "save-rule",
                rule_type: ruleType,
                threshold: updates.threshold ?? rule.threshold ?? def?.defaultThreshold,
                threshold_unit: def?.unit || "percent",
                currency: ruleType === "cost_high" ? (updates.currency || rule.currency || currency) : null,
                enabled: updates.enabled ?? rule.enabled ?? false,
                notify_email: updates.notify_email ?? rule.notify_email ?? false,
                notify_push: updates.notify_push ?? rule.notify_push ?? false,
                email_address: (updates.email_address ?? rule.email_address ?? email) || null,
            };
            const resp = await fetch(`${ScannerHost}/api/ad-alerts`, {
                method: "POST",
                headers: { Authorization: authToken, Organisation: String(orgId), "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            if (resp.ok) {
                const data = await resp.json();
                setRules(prev => {
                    const idx = prev.findIndex(r => r.rule_type === ruleType);
                    const next = [...prev];
                    if (idx >= 0) next[idx] = data.rule;
                    else next.push(data.rule);
                    return next;
                });
            }
        } finally {
            setSaving(p => ({ ...p, [ruleType]: false }));
        }
    }

    async function togglePush() {
        if (!vapidKey) return;
        if (pushStatus === "subscribed" && pushSubscription) {
            setPushStatus("idle");
            await pushSubscription.unsubscribe().catch(() => {});
            await fetch(`${ScannerHost}/api/ad-alerts`, {
                method: "POST",
                headers: { Authorization: authToken, Organisation: String(orgId), "Content-Type": "application/json" },
                body: JSON.stringify({ domain: domainKey, action: "unsubscribe-push", subscription: { endpoint: pushSubscription.endpoint } }),
            }).catch(() => {});
            setPushSubscription(null);
            return;
        }
        setPushStatus("subscribing");
        try {
            const perm = await Notification.requestPermission();
            if (perm !== "granted") { setPushStatus("idle"); return; }
            const reg = await navigator.serviceWorker.ready;
            const sub = await reg.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: vapidKey,
            });
            setPushSubscription(sub);
            await fetch(`${ScannerHost}/api/ad-alerts`, {
                method: "POST",
                headers: { Authorization: authToken, Organisation: String(orgId), "Content-Type": "application/json" },
                body: JSON.stringify({ domain: domainKey, action: "subscribe-push", subscription: sub.toJSON() }),
            });
            setPushStatus("subscribed");
        } catch (err) {
            console.error("[push]", err);
            setPushStatus("idle");
        }
    }

    const ruleMap = Object.fromEntries(rules.map(r => [r.rule_type, r]));

    return (
        <div className="alert-settings-backdrop" onClick={onClose}>
            <div className="alert-settings-modal" onClick={e => e.stopPropagation()}>
                <div className="alert-settings-modal__header">
                    <div>
                        <h2 className="alert-settings-modal__title">Analytics blind-spot alerts</h2>
                        <p className="alert-settings-modal__sub">
                            Get notified when visibility, dark traffic, banner reach, or cost metrics cross your thresholds.
                        </p>
                    </div>
                    <button className="alert-settings-modal__close" onClick={onClose} aria-label="Close">×</button>
                </div>

                {loading ? (
                    <p style={{ color: "rgba(160,170,195,0.7)", padding: "24px 0" }}>Loading…</p>
                ) : (
                    <>
                        {/* Notification channels */}
                        <div className="alert-settings-channels">
                            <h3 className="alert-settings-channels__title">Notification channels</h3>
                            <div className="alert-settings-channels__row">
                                <div className="alert-settings-channels__item">
                                    <div className="alert-settings-channels__icon">✉</div>
                                    <div className="alert-settings-channels__info">
                                        <span className="alert-settings-channels__name">Email</span>
                                        <input
                                            type="email"
                                            className="alert-settings-email-input"
                                            placeholder="your@email.com"
                                            value={email}
                                            onChange={e => setEmail(e.target.value)}
                                        />
                                    </div>
                                </div>
                                <div className="alert-settings-channels__item">
                                    <div className="alert-settings-channels__icon">🔔</div>
                                    <div className="alert-settings-channels__info">
                                        <span className="alert-settings-channels__name">Push notifications</span>
                                        {pushStatus === "unsupported" ? (
                                            <span className="alert-settings-channels__status">Not supported in this browser</span>
                                        ) : !vapidKey ? (
                                            <span className="alert-settings-channels__status">Requires VAPID keys (set in Vercel env)</span>
                                        ) : (
                                            <button
                                                className={`alert-settings-push-btn${pushStatus === "subscribed" ? " alert-settings-push-btn--active" : ""}`}
                                                onClick={togglePush}
                                                disabled={pushStatus === "subscribing"}
                                            >
                                                {pushStatus === "subscribing" ? "Enabling…"
                                                    : pushStatus === "subscribed" ? "✓ Enabled — click to disable"
                                                    : "Enable push notifications"}
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Alert rules */}
                        <h3 className="alert-settings-rules__title">Alert rules</h3>
                        <div className="alert-settings-rules">
                            {RULE_DEFS.map(def => {
                                const rule = ruleMap[def.type] || {};
                                const enabled = rule.enabled ?? false;
                                const threshold = rule.threshold ?? def.defaultThreshold ?? "";
                                const isCost = def.unit === "currency_amount";
                                const isSaving = saving[def.type];

                                return (
                                    <div key={def.type} className={`alert-rule${enabled ? " alert-rule--enabled" : ""}`}>
                                        <div className="alert-rule__top">
                                            <label className="alert-rule__toggle">
                                                <input
                                                    type="checkbox"
                                                    checked={enabled}
                                                    onChange={e => saveRule(def.type, { enabled: e.target.checked, email_address: email || null })}
                                                    disabled={isSaving}
                                                />
                                                <span className="alert-rule__toggle-label">{def.label}</span>
                                            </label>
                                            <div className="alert-rule__threshold">
                                                <input
                                                    type="number"
                                                    className="alert-rule__threshold-input"
                                                    value={threshold}
                                                    min="0"
                                                    step={isCost ? "0.01" : "1"}
                                                    placeholder={isCost ? "e.g. 5.00" : "e.g. 65"}
                                                    onChange={e => saveRule(def.type, { threshold: e.target.value, email_address: email || null })}
                                                    disabled={!enabled || isSaving}
                                                />
                                                <span className="alert-rule__unit">
                                                    {isCost ? (currency || "EUR") : "%"}
                                                </span>
                                            </div>
                                        </div>
                                        <p className="alert-rule__hint">{def.hint}</p>
                                        {enabled && (
                                            <div className="alert-rule__channels">
                                                <label className="alert-rule__channel-toggle">
                                                    <input
                                                        type="checkbox"
                                                        checked={rule.notify_email ?? false}
                                                        onChange={e => saveRule(def.type, { notify_email: e.target.checked, email_address: email || null })}
                                                        disabled={isSaving || !email}
                                                    />
                                                    Email{!email && <span className="alert-rule__channel-note"> (enter email above)</span>}
                                                </label>
                                                <label className="alert-rule__channel-toggle">
                                                    <input
                                                        type="checkbox"
                                                        checked={rule.notify_push ?? false}
                                                        onChange={e => saveRule(def.type, { notify_push: e.target.checked, email_address: email || null })}
                                                        disabled={isSaving || pushStatus !== "subscribed"}
                                                    />
                                                    Push{pushStatus !== "subscribed" && <span className="alert-rule__channel-note"> (subscribe above)</span>}
                                                </label>
                                                <span className="alert-rule__channel-note">In-app always on</span>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

/* ─── CostByChannelTable ─────────────────────────────────────────────────── */

function CostByChannelTable({ rows, currency }) {
    if (!rows || rows.length === 0) return null;
    const hasSpend = rows.some(r => r.spend > 0 && r.costPerVisible != null);
    if (!hasSpend) return null;

    const sym = currency === "USD" ? "$" : currency === "GBP" ? "£" : currency === "CHF" ? "CHF " : "€";
    const avgCost = (() => {
        const totalSpend   = rows.reduce((s, r) => s + (r.spend || 0), 0);
        const totalVisible = rows.reduce((s, r) => s + (r.costPerVisible != null ? r.visible : 0), 0);
        return totalVisible > 0 ? totalSpend / totalVisible : null;
    })();

    return (
        <div className="cost-by-channel">
            <h3 className="recon-card__title" style={{ marginBottom: "14px" }}>Cost per visible consent — by platform</h3>
            <div className="cost-by-channel__table-wrap">
                <table className="cost-by-channel__table">
                    <thead>
                        <tr>
                            <th>Platform</th>
                            <th className="num">Spend</th>
                            <th className="num">Visible</th>
                            <th className="num">Invisible gap</th>
                            <th className="num">Visibility</th>
                            <th className="num cost-col">Cost / visible</th>
                            <th className="num">vs avg</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map(r => {
                            const cost = r.costPerVisible;
                            const visPct = r.visibilityPct;
                            const vsAvg = cost != null && avgCost != null ? ((cost - avgCost) / avgCost) * 100 : null;
                            const costColor = cost == null ? "" : cost < (avgCost || Infinity) ? "rgba(74,222,128,0.9)" : cost > (avgCost || 0) * 1.2 ? "rgba(248,113,113,0.9)" : "rgba(252,211,77,0.9)";
                            const shortName = r.platform.label.replace(" (Facebook / Instagram)", "").replace(" Ads", "");
                            return (
                                <tr key={r.platform.id}>
                                    <td>
                                        <span className="cost-by-channel__dot" style={{ background: PLATFORM_COLORS[r.platform.id] || "#888" }} />
                                        {shortName}
                                    </td>
                                    <td className="num">{r.spend > 0 ? `${sym}${r.spend.toLocaleString("de-DE", { minimumFractionDigits: 2 })}` : "—"}</td>
                                    <td className="num">{formatInt(r.visible)}</td>
                                    <td className="num">{formatInt(r.invisible)}</td>
                                    <td className={`num${visPct != null ? visPct >= 65 ? " cost-by-channel__good" : visPct < 40 ? " cost-by-channel__bad" : " cost-by-channel__warn" : ""}`}>
                                        {visPct != null ? formatPct(visPct) : "—"}
                                    </td>
                                    <td className="num cost-col" style={{ color: costColor, fontWeight: 700, fontSize: "1.05rem" }}>
                                        {cost != null ? `${sym}${cost.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"}
                                    </td>
                                    <td className={`num${vsAvg != null ? vsAvg < 0 ? " cost-by-channel__good" : vsAvg > 20 ? " cost-by-channel__bad" : "" : ""}`}>
                                        {vsAvg != null ? `${vsAvg > 0 ? "+" : ""}${vsAvg.toFixed(0)}%` : "—"}
                                    </td>
                                </tr>
                            );
                        })}
                        {rows.length > 1 && avgCost != null && (
                            <tr className="cost-by-channel__avg-row">
                                <td><em>Average</em></td>
                                <td className="num">—</td>
                                <td className="num">—</td>
                                <td className="num">—</td>
                                <td className="num">—</td>
                                <td className="num cost-col" style={{ fontWeight: 700 }}>{`${sym}${avgCost.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}</td>
                                <td className="num">baseline</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

export default function MarketingReconciliationPanel({
    scopeLabel,
    scopeKey,
    domainKey,
    consents,
    visibleConsents,
    invisibleConsents,
    scopeRows,
    fromDate,
    toDate,
    orgId,
    authToken,
}) {
    const inputsKeyValue = inputsKey(domainKey, scopeKey);
    const snapshotsKeyValue = snapshotsKey(domainKey);

    const [inputs, setInputs] = useState(() => ({ ...DEFAULT_INPUTS, byPlatform: {} }));
    const [snapshots, setSnapshots] = useState([]);
    const [loaded, setLoaded] = useState(false);
    const [snapshotsExpanded, setSnapshotsExpanded] = useState(false);
    const [savedFlash, setSavedFlash] = useState(false);
    const [connections, setConnections] = useState([]);
    const [syncing, setSyncing] = useState(false);
    const [syncMsg, setSyncMsg] = useState(null);
    const [alertSettingsOpen, setAlertSettingsOpen] = useState(false);
    const [connectingPlatform, setConnectingPlatform] = useState(false);

    /*
     * Load inputs whenever scope changes; load snapshots whenever
     * domain changes. Snapshots are intentionally domain-scoped (not
     * scope-scoped) so the CSV is one continuous reconciliation history
     * for the property, not a fragmented per-channel pile.
     */
    useEffect(() => {
        setLoaded(false);
        setInputs(loadInputs(domainKey, scopeKey));
        setLoaded(true);
    }, [inputsKeyValue, domainKey, scopeKey]);

    useEffect(() => {
        // Load from localStorage immediately for instant render
        const local = loadSnapshots(domainKey);
        setSnapshots(local);
        // Then fetch from DB and merge (DB wins for anything it has)
        if (authToken && orgId && domainKey && domainKey !== "combined view") {
            fetch(`${ScannerHost}/api/ad-snapshots?domain=${encodeURIComponent(domainKey)}`, {
                headers: { Authorization: authToken, Organisation: String(orgId) }
            }).then(r => r.ok ? r.json() : null)
              .then(data => {
                  if (!data?.snapshots?.length) return;
                  const dbIds = new Set(data.snapshots.map(s => s.id));
                  const localOnly = local.filter(s => !dbIds.has(s.id));
                  const merged = [...data.snapshots.map(dbRowToSnapshot), ...localOnly]
                      .sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt));
                  setSnapshots(merged);
              })
              .catch(() => {/* keep local */});
        }
    }, [snapshotsKeyValue, domainKey, authToken, orgId]);

    useEffect(() => {
        if (!loaded) return;
        writeStored(inputsKeyValue, inputs);
    }, [inputsKeyValue, inputs, loaded]);

    useEffect(() => {
        writeStored(snapshotsKeyValue, snapshots);
    }, [snapshotsKeyValue, snapshots]);

    /*
     * Auto-clear the "Saved" pill after a couple of seconds so it
     * reads as a transient confirmation, not a sticky badge.
     */
    useEffect(() => {
        if (!savedFlash) return;
        const t = window.setTimeout(() => setSavedFlash(false), 2200);
        return () => window.clearTimeout(t);
    }, [savedFlash]);

    // Register service worker for push notifications
    useEffect(() => {
        if ("serviceWorker" in navigator) {
            navigator.serviceWorker.register("/sw.js").catch(() => {});
        }
    }, []);

    // Keep an up-to-date list of which platforms have active connections for this domain
    useEffect(() => {
        if (!authToken || !orgId || !domainKey || domainKey === "combined view") return;
        fetch(`${ScannerHost}/api/ad-connections?domain=${encodeURIComponent(domainKey)}`, {
            headers: { Authorization: authToken, Organisation: String(orgId) },
        })
            .then(r => r.ok ? r.json() : null)
            .then(data => { if (data?.connections) setConnections(data.connections); })
            .catch(() => {});
    }, [authToken, orgId, domainKey]);

    const handleSync = useCallback(async () => {
        if (!fromDate || !toDate || !authToken || !orgId || !domainKey) return;
        setSyncing(true);
        setSyncMsg(null);
        try {
            const resp = await fetch(
                `${ScannerHost}/api/ad-data-fetch?platform=${inputs.platform}&domain=${encodeURIComponent(domainKey)}&fromDate=${fromDate}&toDate=${toDate}`,
                { headers: { Authorization: authToken, Organisation: String(orgId) } }
            );
            const data = await resp.json();
            if (!resp.ok) {
                setSyncMsg({ text: data.error || "Sync failed.", error: true });
                return;
            }
            const clicks = data.clicks != null ? String(Math.round(data.clicks)) : "";
            const spend  = data.spend  != null ? String(Number(data.spend).toFixed(2)) : "";
            setInputs(prev => ({
                ...prev,
                ...(data.currency ? { currency: data.currency } : {}),
                byPlatform: {
                    ...prev.byPlatform,
                    [prev.platform]: { adClicks: clicks, spend },
                },
            }));
            const shortLabel = SYNC_SHORT_LABEL[inputs.platform] || inputs.platform;
            const platformMetric = PLATFORMS.find(p => p.id === inputs.platform)?.metric || "clicks";
            setSyncMsg({ text: `Synced from ${shortLabel}: ${clicks} ${platformMetric}${spend ? `, ${data.currency || ""} ${spend} spend` : ""}.`, error: false });
            setTimeout(() => setSyncMsg(null), 8000);
        } catch (err) {
            setSyncMsg({ text: err.message, error: true });
        } finally {
            setSyncing(false);
        }
    }, [inputs.platform, fromDate, toDate, authToken, orgId, domainKey]);

    const handleConnectPlatform = useCallback((platform) => {
        if (!orgId || !domainKey || domainKey === "combined view") return;
        setConnectingPlatform(true);
        const returnPath = window.location.pathname + window.location.search;
        const url = [
            `${ScannerHost}/api/ad-oauth-start`,
            `?platform=${encodeURIComponent(platform)}`,
            `&domain=${encodeURIComponent(domainKey)}`,
            `&returnPath=${encodeURIComponent(returnPath)}`,
            `&org=${encodeURIComponent(orgId)}`,
        ].join("");
        window.location.href = url;
    }, [authToken, orgId, domainKey]);

    const selectedPlatform = useMemo(
        () => platformOrFallback(inputs.platform),
        [inputs.platform]
    );
    const selectedCurrency = useMemo(
        () => currencyOrFallback(inputs.currency),
        [inputs.currency]
    );

    const currentValues = useMemo(() => {
        const slot = inputs.byPlatform && inputs.byPlatform[inputs.platform];
        return slot ? { ...blankPlatformValues(), ...slot } : blankPlatformValues();
    }, [inputs.byPlatform, inputs.platform]);

    const handlePlatformChange = useCallback((e) => {
        const next = e.target.value;
        setInputs((prev) => ({ ...prev, platform: next }));
    }, []);

    const handleCurrencyChange = useCallback((e) => {
        const next = e.target.value;
        setInputs((prev) => ({ ...prev, currency: next }));
    }, []);

    const updatePlatformValue = useCallback((field) => {
        return (e) => {
            const v = e && e.target ? e.target.value : "";
            setInputs((prev) => {
                const current =
                    (prev.byPlatform && prev.byPlatform[prev.platform]) || blankPlatformValues();
                return {
                    ...prev,
                    byPlatform: {
                        ...prev.byPlatform,
                        [prev.platform]: { ...current, [field]: v },
                    },
                };
            });
        };
    }, []);

    const handleClear = useCallback(() => {
        setInputs((prev) => ({
            ...prev,
            byPlatform: {
                ...prev.byPlatform,
                [prev.platform]: blankPlatformValues(),
            },
        }));
    }, []);

    /*
     * Scope-wide totals come from the parent (single source of truth
     * for "how much traffic this channel saw"). We keep them around
     * because the platform-filtered numbers below are a strict subset
     * and we want to show coverage ("X of Y scope consents matched").
     */
    const scopeConsents = Math.max(0, Number(consents) || 0);
    const scopeVisible = Math.max(0, Number(visibleConsents) || 0);
    const scopeInvisible = Math.max(0, Number(invisibleConsents) || 0);

    /*
     * Platform-filtered slice. When the selected platform has a
     * utm_source pattern (every platform except GA4 and Other), we
     * aggregate only the scope rows whose source matches, so each
     * platform snapshot reconciles against its own traffic — not the
     * whole pool, which would make Microsoft and Google look identical.
     */
    const pattern = platformPattern(inputs.platform);
    const filterActive = pattern != null;

    const platformStats = useMemo(() => {
        const rowsArr = Array.isArray(scopeRows) ? scopeRows : [];
        if (!filterActive) {
            return {
                consents: scopeConsents,
                visible: scopeVisible,
                invisible: scopeInvisible,
                matchedSources: [],
                rowsMatched: rowsArr.length,
                scopeRowCount: rowsArr.length,
            };
        }
        let totalConsents = 0;
        let totalVisible = 0;
        let rowsMatched = 0;
        const matchedSourcesSet = new Set();
        for (const r of rowsArr) {
            if (!rowMatchesPlatform(r, pattern)) continue;
            rowsMatched += 1;
            totalConsents += Number(r.consents) || 0;
            totalVisible += Number(r.acceptAll) || 0;
            if (r.utmSource && r.utmSource !== "—") {
                matchedSourcesSet.add(String(r.utmSource));
            }
        }
        const invisible = Math.max(0, totalConsents - totalVisible);
        return {
            consents: totalConsents,
            visible: totalVisible,
            invisible,
            matchedSources: [...matchedSourcesSet].sort((a, b) => a.localeCompare(b)),
            rowsMatched,
            scopeRowCount: rowsArr.length,
        };
    }, [scopeRows, pattern, filterActive, scopeConsents, scopeVisible, scopeInvisible]);

    const numConsents = platformStats.consents;
    const numVisible = platformStats.visible;
    const numInvisible = platformStats.invisible;

    /*
     * "Coverage" = what share of the scope's consents was attributable
     * to this platform's utm_source. A low coverage hints at either
     * missing UTM tags on the campaign or a scope where this platform
     * was a minor contributor.
     */
    const coverageOfScopePct =
        filterActive && scopeConsents > 0
            ? Math.round((numConsents / scopeConsents) * 1000) / 10
            : null;
    const hasScopeRows = Array.isArray(scopeRows) && scopeRows.length > 0;
    const noMatchedRows = filterActive && hasScopeRows && numConsents === 0;

    // All platforms with entered data, each with their own filtered consent stats.
    // Powers the side-by-side comparison table.
    const comparisonRows = useMemo(() => {
        const byPlatform = inputs.byPlatform || {};
        return PLATFORMS
            .map(p => {
                const vals   = byPlatform[p.id];
                const clicks = Number(vals?.adClicks) || 0;
                if (!clicks) return null;
                const spend  = Number(vals?.spend) || 0;
                const stats  = computeStatsForPlatform(p.id, scopeRows, scopeConsents, scopeVisible, scopeInvisible);
                const visibleSharePct   = (stats.visible   / clicks) * 100;
                const invisibleSharePct = (stats.invisible / clicks) * 100;
                const visibilityPct     = stats.consents > 0 ? (stats.visible / stats.consents) * 100 : null;
                const costPerVisible    = spend > 0 && stats.visible > 0 ? spend / stats.visible : null;
                return {
                    platform: p,
                    clicks,
                    spend,
                    consents:        stats.consents,
                    visible:         stats.visible,
                    invisible:       stats.invisible,
                    visibleSharePct,
                    invisibleSharePct,
                    visibilityPct,
                    costPerVisible,
                };
            })
            .filter(Boolean);
    }, [inputs.byPlatform, scopeRows, scopeConsents, scopeVisible, scopeInvisible]);

    // All utm_source values actually present in scope — surfaced when no platform match is found
    const actualScopeSources = useMemo(() => {
        if (!noMatchedRows || !Array.isArray(scopeRows)) return [];
        const seen = new Set();
        for (const r of scopeRows) {
            const s = r && r.utmSource;
            if (s && s !== "—" && s !== "(none)" && s !== "(not set)") seen.add(String(s));
        }
        return [...seen].sort((a, b) => a.localeCompare(b));
    }, [noMatchedRows, scopeRows]);

    // UTM dark traffic — consents with no attributable utm_source
    const darkTrafficStats = useMemo(() => {
        const rows = Array.isArray(scopeRows) ? scopeRows : [];
        if (rows.length === 0) return null;
        const DARK_VALUES = new Set(["", "—", "(none)", "(not set)", "undefined", "null"]);
        let total = 0, dark = 0;
        for (const r of rows) {
            const c = Number(r.consents) || 0;
            total += c;
            const src = canonUtmSource(r.utmSource || "");
            if (!src || DARK_VALUES.has(r.utmSource?.toLowerCase?.() || "")) dark += c;
        }
        if (total === 0) return null;
        return { darkTrafficPct: (dark / total) * 100, darkConsents: dark, darkTrafficTotal: total };
    }, [scopeRows]);

    // Connected platform IDs for this domain
    const connectedPlatforms = useMemo(
        () => new Set(connections.map(c => c.platform)),
        [connections]
    );
    const isConnected = connectedPlatforms.has(inputs.platform);

    const clicksNum = Math.max(0, Number(currentValues.adClicks) || 0);
    const spendNum = Math.max(0, Number(currentValues.spend) || 0);
    const hasClicks = clicksNum > 0;
    const hasSpend = spendNum > 0;

    /*
     * Reconciliation math. We cap "banner reach" at 100% for the
     * headline percentage (more consents than reported clicks happens
     * with multi-session visitors / remarketing / pre-consented
     * returners — surfaced as an honest sub-note rather than a
     * misleading ">100%").
     */
    const bannerReachRaw = hasClicks ? (numConsents / clicksNum) * 100 : null;
    const bannerReachPct = bannerReachRaw == null ? null : Math.min(100, bannerReachRaw);
    const bannerOverage = hasClicks ? Math.max(0, numConsents - clicksNum) : 0;

    const visibleSharePct = hasClicks ? (numVisible / clicksNum) * 100 : null;
    const invisibleSharePct = hasClicks ? (numInvisible / clicksNum) * 100 : null;
    const visibilityOfConsentsPct = numConsents > 0 ? (numVisible / numConsents) * 100 : null;

    const costPerVisible = hasSpend && numVisible > 0 ? spendNum / numVisible : null;
    const costPerClick = hasSpend && hasClicks ? spendNum / clicksNum : null;
    const visibilityCostMultiplier =
        costPerVisible != null && costPerClick != null && costPerClick > 0
            ? costPerVisible / costPerClick
            : null;

    const insights = useMemo(() => computeInsights({
        hasClicks, hasSpend,
        visibilityOfConsentsPct, bannerReachPct, coverageOfScopePct,
        costPerVisible, numConsents, numVisible, spendNum,
        currency: inputs.currency,
        ...(darkTrafficStats || {}),
        selectedPlatform, filterActive,
    }), [
        hasClicks, hasSpend, visibilityOfConsentsPct, bannerReachPct, coverageOfScopePct,
        costPerVisible, numConsents, numVisible, spendNum, inputs.currency,
        darkTrafficStats, selectedPlatform, filterActive,
    ]);

    const scopeSentence = scopeLabel
        ? scopeKey && scopeKey.startsWith("channel:")
            ? `this channel (${scopeLabel})`
            : scopeLabel
        : "this view";

    const handleSaveSnapshot = useCallback(() => {
        if (!hasClicks) return;
        const snapshot = {
            id: generateId(),
            savedAt: new Date().toISOString(),
            scopeLabel: scopeLabel || "all channels",
            scopeKey: scopeKey || "overview",
            platform: selectedPlatform.id,
            platformLabel: selectedPlatform.label,
            metric: selectedPlatform.metric,
            adClicks: clicksNum,
            spend: hasSpend ? spendNum : "",
            currency: hasSpend ? selectedCurrency.id : "",
            costPerVisible:
                costPerVisible != null
                    ? Math.round(costPerVisible * 100) / 100
                    : "",
            consents: numConsents,
            visibleConsents: numVisible,
            invisibleConsents: numInvisible,
            bannerReachPct: bannerReachRaw != null ? Math.round(bannerReachRaw * 10) / 10 : "",
            visibleSharePct: visibleSharePct != null ? Math.round(visibleSharePct * 10) / 10 : "",
            invisibleSharePct:
                invisibleSharePct != null ? Math.round(invisibleSharePct * 10) / 10 : "",
            visibilityOfConsentsPct:
                visibilityOfConsentsPct != null
                    ? Math.round(visibilityOfConsentsPct * 10) / 10
                    : "",
            /*
             * Audit trail for the platform filter. Without this the
             * snapshot CSV can't tell a stakeholder why a channel's
             * total consents differ between rows — the `matchedSources`
             * list is the ground truth for that.
             */
            sourceFilterActive: filterActive,
            sourcePattern: pattern ? pattern.source : "",
            matchedSources: platformStats.matchedSources.join("|"),
            scopeConsents,
            coverageOfScopePct: coverageOfScopePct != null ? coverageOfScopePct : "",
            fromDate: fromDate || "",
            toDate: toDate || "",
        };
        setSnapshots((prev) => [snapshot, ...prev]);
        setSnapshotsExpanded(true);
        setSavedFlash(true);
        // Also persist to DB
        if (authToken && orgId && domainKey && domainKey !== "combined view") {
            fetch(`${ScannerHost}/api/ad-snapshots`, {
                method: 'POST',
                headers: {
                    Authorization: authToken,
                    Organisation: String(orgId),
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ domain: domainKey, snapshot }),
            }).catch(() => {/* localStorage fallback already done */});
        }
    }, [
        hasClicks,
        hasSpend,
        scopeLabel,
        scopeKey,
        selectedPlatform,
        selectedCurrency,
        clicksNum,
        spendNum,
        costPerVisible,
        numConsents,
        numVisible,
        numInvisible,
        bannerReachRaw,
        visibleSharePct,
        invisibleSharePct,
        visibilityOfConsentsPct,
        filterActive,
        pattern,
        platformStats.matchedSources,
        scopeConsents,
        coverageOfScopePct,
        fromDate,
        toDate,
        authToken,
        orgId,
        domainKey,
    ]);

    const handleDeleteSnapshot = useCallback((id) => {
        setSnapshots((prev) => prev.filter((s) => s.id !== id));
        if (authToken && orgId) {
            fetch(`${ScannerHost}/api/ad-snapshots?id=${encodeURIComponent(id)}`, {
                method: 'DELETE',
                headers: { Authorization: authToken, Organisation: String(orgId) }
            }).catch(() => {});
        }
    }, [authToken, orgId]);

    const handleClearSnapshots = useCallback(() => {
        if (snapshots.length === 0) return;
        const ok = window.confirm(
            `Remove all ${snapshots.length} reconciliation snapshot${snapshots.length === 1 ? "" : "s"} for this property? This cannot be undone.`
        );
        if (ok) {
            setSnapshots([]);
            if (authToken && orgId && domainKey) {
                fetch(`${ScannerHost}/api/ad-snapshots?domain=${encodeURIComponent(domainKey)}&all=1`, {
                    method: 'DELETE',
                    headers: { Authorization: authToken, Organisation: String(orgId) }
                }).catch(() => {});
            }
        }
    }, [snapshots.length, authToken, orgId, domainKey]);

    const handleExportSnapshots = useCallback(() => {
        if (snapshots.length === 0) return;
        const safeDomain = String(domainKey || "report")
            .replace(/[^\w\-]+/g, "_")
            .slice(0, 60);
        const today = new Date().toISOString().slice(0, 10);
        downloadCsv(
            `marketing_reconciliation_snapshots_${safeDomain}_${today}.csv`,
            snapshotsToCsv(snapshots)
        );
    }, [snapshots, domainKey]);

    return (
        <section className="marketing-reconciliation" aria-labelledby="marketing-reconciliation-h">

            {/* ── Controls card ─────────────────────────────────────────── */}
            <div className="recon-card recon-controls-card">
                <div className="recon-inputs-bar">
                    <label className="recon-inputs-bar__field">
                        <span className="recon-inputs-bar__label">Platform</span>
                        <select value={inputs.platform} onChange={handlePlatformChange}
                            className="marketing-reconciliation__select">
                            {PLATFORMS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                        </select>
                    </label>

                    <label className="recon-inputs-bar__field recon-inputs-bar__field--wide">
                        <span className="recon-inputs-bar__label">{selectedPlatform.metric}</span>
                        <input type="number" inputMode="numeric" min="0" step="1" placeholder="e.g. 5 000"
                            value={currentValues.adClicks} onChange={updatePlatformValue("adClicks")}
                            className="marketing-reconciliation__input" />
                    </label>
                    <label className="recon-inputs-bar__field recon-inputs-bar__field--wide">
                        <span className="recon-inputs-bar__label">Spend (optional)</span>
                        <div className="marketing-reconciliation__money">
                            <input type="number" inputMode="decimal" min="0" step="0.01" placeholder="e.g. 2 400"
                                value={currentValues.spend} onChange={updatePlatformValue("spend")}
                                className="marketing-reconciliation__input marketing-reconciliation__input--money" />
                            <select value={inputs.currency} onChange={handleCurrencyChange}
                                className="marketing-reconciliation__select marketing-reconciliation__select--currency">
                                {CURRENCIES.map(c => <option key={c.id} value={c.id}>{c.id}</option>)}
                            </select>
                        </div>
                    </label>
                    <div className="recon-inputs-bar__actions">
                        {isConnected && fromDate && toDate && (
                            <button
                                type="button"
                                className="recon-sync-btn"
                                onClick={handleSync}
                                disabled={syncing}
                                title={`Auto-import ${fromDate} → ${toDate} from ${SYNC_SHORT_LABEL[inputs.platform] || inputs.platform}`}
                            >
                                {syncing ? "Syncing…" : `↓ Sync ${SYNC_SHORT_LABEL[inputs.platform] || "platform"}`}
                            </button>
                        )}
                        <button type="button" className="marketing-reconciliation__save"
                            onClick={handleSaveSnapshot} disabled={!hasClicks}
                            title={hasClicks ? "Save snapshot" : `Enter ${selectedPlatform.metric} first`}>
                            {savedFlash ? "Saved ✓" : "Save snapshot"}
                        </button>
                        <button type="button" className="marketing-reconciliation__clear" onClick={handleClear}>
                            Clear
                        </button>
                        <button
                            type="button"
                            className="recon-alerts-settings-btn"
                            onClick={() => setAlertSettingsOpen(true)}
                            title="Configure analytics blind-spot alerts"
                            aria-label="Alert settings"
                        >
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <circle cx="12" cy="12" r="3"/>
                                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                            </svg>
                            Alerts
                        </button>
                        <NotificationBell domainKey={domainKey} orgId={orgId} authToken={authToken} />
                    </div>
                </div>
                {syncMsg && (
                    <p className={`recon-sync-msg${syncMsg.error ? " recon-sync-msg--error" : ""}`} role="status">
                        {syncMsg.text}
                        {!isConnected && !syncMsg.error && (
                            <> · <a href="/settings/ad-connections" className="recon-sync-msg__link">Manage connections</a></>
                        )}
                    </p>
                )}
                {!isConnected && fromDate && toDate && orgId && !["ga4", "other"].includes(inputs.platform) && (
                    <div className="recon-connect-prompt">
                        <button
                            type="button"
                            className="recon-connect-btn"
                            onClick={() => handleConnectPlatform(inputs.platform)}
                            disabled={connectingPlatform}
                        >
                            {connectingPlatform ? "Opening…" : `Connect ${SYNC_SHORT_LABEL[inputs.platform] || "platform"} to enable auto-import`}
                        </button>
                        <span className="recon-connect-prompt__hint">
                            Automatically pull {selectedPlatform.metric} and spend for {fromDate} → {toDate}
                        </span>
                    </div>
                )}
                {fromDate && toDate && (
                    <p className="marketing-reconciliation__window-hint">
                        Use the same date range as the header filter ({fromDate} → {toDate}).
                    </p>
                )}
            </div>

            {/* ── KPI row ─────────────────────────────────────────────────── */}
            <div className="recon-kpi-row">
                <div className="recon-stat-card">
                    <span className="recon-stat-card__label">Consents in scope</span>
                    <span className="recon-stat-card__value">{formatInt(scopeConsents)}</span>
                    {fromDate && toDate && (
                        <span className="recon-stat-card__sub">{fromDate} → {toDate}</span>
                    )}
                </div>
                <div className="recon-stat-card recon-stat-card--good">
                    <span className="recon-stat-card__label">Visible in analytics</span>
                    <span className="recon-stat-card__value">{formatInt(scopeVisible)}</span>
                    <span className="recon-stat-card__sub">accept-all consents</span>
                </div>
                <div className={`recon-stat-card${scopeInvisible > 0 ? " recon-stat-card--warn" : ""}`}>
                    <span className="recon-stat-card__label">Invisible gap</span>
                    <span className="recon-stat-card__value">{formatInt(scopeInvisible)}</span>
                    <span className="recon-stat-card__sub">not measurable</span>
                </div>
                {(() => {
                    const visPct = scopeConsents > 0 ? (scopeVisible / scopeConsents) * 100 : null;
                    const tone = visPct == null ? "" : visPct >= 65 ? " recon-stat-card--good" : visPct >= 40 ? " recon-stat-card--warn" : " recon-stat-card--bad";
                    return (
                        <div className={`recon-stat-card${tone}`}>
                            <span className="recon-stat-card__label">Visibility</span>
                            <span className="recon-stat-card__value">{visPct != null ? formatPct(visPct) : "—"}</span>
                            <span className="recon-stat-card__sub">benchmark 65%</span>
                        </div>
                    );
                })()}
            </div>

            {/* ── Platform filter strip ───────────────────────────────────── */}
            {filterActive ? (
                noMatchedRows ? (
                    <div
                        className="marketing-reconciliation__filter-note marketing-reconciliation__filter-note--empty"
                        role="status"
                    >
                        <p>
                            No traffic tagged as <strong>{selectedPlatform.label}</strong> in {scopeSentence}.
                            We match <code>utm_source</code> values like{" "}
                            <code>{(PLATFORM_EXAMPLE_SOURCES[selectedPlatform.id] || []).join(", ") || "—"}</code>.
                        </p>
                        {actualScopeSources.length > 0 ? (
                            <p>
                                Sources we <em>do</em> see in this scope:{" "}
                                <code>
                                    {actualScopeSources.slice(0, 10).join(", ")}
                                    {actualScopeSources.length > 10
                                        ? ` +${actualScopeSources.length - 10} more`
                                        : ""}
                                </code>
                                . If your campaign uses one of these, switch to{" "}
                                <strong>Other / custom</strong> to reconcile against the full scope,
                                or update your UTM tags to a recognised source name.
                            </p>
                        ) : (
                            <p>
                                No <code>utm_source</code> values found in this scope at all —
                                either the traffic isn't UTM-tagged, or it lives in a different
                                channel. Switch to <strong>Other / custom</strong> to reconcile
                                against the scope total instead.
                            </p>
                        )}
                    </div>
                ) : (
                    <div className="marketing-reconciliation__filter-note" role="status">
                        <p>
                            Filtered to <strong>{selectedPlatform.label}</strong> traffic:{" "}
                            <strong>{formatInt(numConsents)}</strong> of{" "}
                            <strong>{formatInt(scopeConsents)}</strong> scope consents
                            {coverageOfScopePct != null ? (
                                <> ({formatPct(coverageOfScopePct)} coverage)</>
                            ) : null}.
                            {platformStats.matchedSources.length > 0 ? (
                                <>
                                    {" "}Matched <code>utm_source</code>:{" "}
                                    <code>
                                        {platformStats.matchedSources.slice(0, 6).join(", ")}
                                        {platformStats.matchedSources.length > 6
                                            ? `, +${platformStats.matchedSources.length - 6} more`
                                            : ""}
                                    </code>.
                                </>
                            ) : null}
                        </p>
                    </div>
                )
            ) : (
                <div className="marketing-reconciliation__filter-note" role="status">
                    <p>
                        {selectedPlatform.id === "ga4"
                            ? "GA4 sits downstream of every ad source, so we don't filter by utm_source — the consent totals below are the whole scope."
                            : "Reconciling against the full scope. Pick a specific ad platform above to narrow consents to that platform's utm_source."}{" "}
                        Scope total: <strong>{formatInt(scopeConsents)}</strong> consents.
                    </p>
                </div>
            )}

            {/* ── Dashboard grid: Funnel card + Insights card ─────────────── */}
            <div className="recon-dashboard-grid">
                <div className="recon-card">
                    <h3 className="recon-card__title">Conversion funnel</h3>
                    <div className="recon-main">
                        <FunnelFlow
                            clicks={clicksNum} consents={numConsents}
                            visible={numVisible} invisible={numInvisible}
                            platform={selectedPlatform}
                            bannerReachPct={bannerReachPct}
                            visibleSharePct={visibleSharePct}
                            invisibleSharePct={invisibleSharePct}
                            hasClicks={hasClicks}
                        />
                        <VisibilityGauge
                            pct={visibilityOfConsentsPct}
                            costPerVisible={costPerVisible}
                            costPerClick={costPerClick}
                            currency={inputs.currency}
                        />
                    </div>
                    {!hasClicks && (
                        <div className="marketing-reconciliation__empty">
                            <p>Enter your {selectedPlatform.metric} count from <strong>{selectedPlatform.label}</strong> above to see the reconciliation.</p>
                            <p>Use the same date range as the header filter so the numbers line up.</p>
                        </div>
                    )}
                </div>

                <div className="recon-card recon-card--insights">
                    {darkTrafficStats && (
                        <UtmHealthBar
                            darkTrafficPct={darkTrafficStats.darkTrafficPct}
                            darkConsents={darkTrafficStats.darkConsents}
                            darkTrafficTotal={darkTrafficStats.darkTrafficTotal}
                        />
                    )}
                    <InsightsPanel insights={insights} />
                    {insights.length === 0 && (!darkTrafficStats || darkTrafficStats.darkTrafficTotal < 20) && (
                        <p className="recon-card__empty-hint">
                            Insights appear once you enter {selectedPlatform.metric} data in the controls above.
                        </p>
                    )}
                </div>
            </div>

            {/* ── Charts grid ─────────────────────────────────────────────── */}
            <div className="recon-charts-grid">
                <UtmSourcesChart scopeRows={scopeRows} />
                {comparisonRows.length >= 2 ? <PlatformBarsChart rows={comparisonRows} currency={inputs.currency} /> : null}
            </div>

            {/* ── Cost per visible by channel ──────────────────────────────── */}
            {comparisonRows.length >= 1 && (
                <div className="recon-card">
                    <CostByChannelTable rows={comparisonRows} currency={inputs.currency} />
                </div>
            )}

            {/* ── Cost projection ──────────────────────────────────────────── */}
            {hasSpend && hasClicks && numVisible > 0 ? (
                <ProjectionTable numConsents={numConsents} numVisible={numVisible} spend={spendNum} currency={inputs.currency} />
            ) : null}

            {/* ── Performance timeline ─────────────────────────────────────── */}
            {snapshots.length >= 2 ? <SnapshotComboChart snapshots={snapshots} /> : null}

            {/* ── Alert settings modal ─────────────────────────────────────── */}
            {alertSettingsOpen && (
                <AlertSettingsModal
                    domainKey={domainKey}
                    orgId={orgId}
                    authToken={authToken}
                    currency={inputs.currency}
                    onClose={() => setAlertSettingsOpen(false)}
                />
            )}

            {/* ── Snapshots accordion ──────────────────────────────────────── */}
            <div className="marketing-reconciliation__snapshots">
                <div className="marketing-reconciliation__snapshots-bar">
                    <button
                        type="button"
                        className="marketing-reconciliation__snapshots-toggle"
                        onClick={() => setSnapshotsExpanded((v) => !v)}
                        aria-expanded={snapshotsExpanded}
                        aria-controls="marketing-reconciliation-snapshots-list"
                    >
                        <span aria-hidden="true">{snapshotsExpanded ? "▾" : "▸"}</span>{" "}
                        Saved snapshots
                        <span className="marketing-reconciliation__snapshots-count">
                            {snapshots.length}
                        </span>
                    </button>
                    {snapshots.length > 0 ? (
                        <div className="marketing-reconciliation__snapshots-actions">
                            <button
                                type="button"
                                className="marketing-reconciliation__snapshots-export"
                                onClick={handleExportSnapshots}
                            >
                                Export CSV
                            </button>
                            <button
                                type="button"
                                className="marketing-reconciliation__snapshots-clear"
                                onClick={handleClearSnapshots}
                            >
                                Clear all
                            </button>
                        </div>
                    ) : null}
                </div>

                {snapshotsExpanded ? (
                    snapshots.length === 0 ? (
                        <p
                            id="marketing-reconciliation-snapshots-list"
                            className="marketing-reconciliation__snapshots-empty"
                        >
                            No snapshots yet. Enter the numbers from your ad platform and click
                            <strong> Save snapshot</strong> to start a reconciliation history for
                            this property — it'll be available across every channel and exportable
                            to CSV.
                        </p>
                    ) : (
                        <div
                            id="marketing-reconciliation-snapshots-list"
                            className="marketing-reconciliation__snapshots-table-wrap"
                        >
                            <p className="marketing-reconciliation__snapshots-caption">
                                Consents / visible / gap are the slice of scope traffic tagged with
                                the platform's <code>utm_source</code> — so the same scope will show
                                different numbers per platform. GA4 and "Other / custom" don't
                                filter by source and reconcile against the whole scope. Rows flagged
                                <span className="marketing-reconciliation__over-count-badge marketing-reconciliation__over-count-badge--inline">
                                    over-count
                                </span>
                                had more attributed consents than reported clicks (multi-session
                                visits, pre-consented returns, or UTM overlap), so the share label
                                is capped at 100%+.
                            </p>
                            <table className="marketing-reconciliation__snapshots-table">
                                <thead>
                                    <tr>
                                        <th scope="col">Saved</th>
                                        <th scope="col">Scope</th>
                                        <th scope="col">Platform</th>
                                        <th scope="col" className="num">Reported</th>
                                        <th scope="col" className="num">Consents</th>
                                        <th scope="col" className="num">Visible</th>
                                        <th scope="col" className="num">Gap</th>
                                        <th scope="col" className="num">Cost / visible</th>
                                        <th scope="col">Window</th>
                                        <th scope="col" aria-label="Actions" />
                                    </tr>
                                </thead>
                                <tbody>
                                    {snapshots.map((s) => {
                                        const reported = Number(s.adClicks) || 0;
                                        const consentsN = Number(s.consents) || 0;
                                        const overCount = reported > 0 && consentsN > reported;
                                        return (
                                            <tr
                                                key={s.id}
                                                className={
                                                    overCount
                                                        ? "marketing-reconciliation__snapshots-row--overcount"
                                                        : undefined
                                                }
                                            >
                                                <td>{formatTimestamp(s.savedAt)}</td>
                                                <td>{s.scopeLabel}</td>
                                                <td>
                                                    {s.platformLabel}
                                                    <span className="marketing-reconciliation__snapshots-metric">
                                                        {" "}
                                                        · {s.metric}
                                                    </span>
                                                </td>
                                                <td className="num">
                                                    {formatInt(s.adClicks)}
                                                    {overCount ? (
                                                        <span
                                                            className="marketing-reconciliation__over-count-badge"
                                                            title={`Attributed consents (${formatInt(
                                                                consentsN
                                                            )}) exceed reported ${s.metric} (${formatInt(
                                                                reported
                                                            )}).`}
                                                        >
                                                            over-count
                                                        </span>
                                                    ) : null}
                                                </td>
                                                <td className="num">{formatInt(s.consents)}</td>
                                                <td className="num">
                                                    {formatInt(s.visibleConsents)}
                                                    {s.visibleSharePct !== "" &&
                                                    s.visibleSharePct != null ? (
                                                        <span className="marketing-reconciliation__snapshots-sub">
                                                            {" "}
                                                            ({formatShareOfReportedPct(
                                                                s.visibleSharePct
                                                            )})
                                                        </span>
                                                    ) : null}
                                                </td>
                                                <td className="num">
                                                    {formatInt(s.invisibleConsents)}
                                                    {s.invisibleSharePct !== "" &&
                                                    s.invisibleSharePct != null ? (
                                                        <span className="marketing-reconciliation__snapshots-sub">
                                                            {" "}
                                                            ({formatShareOfReportedPct(
                                                                s.invisibleSharePct
                                                            )})
                                                        </span>
                                                    ) : null}
                                                </td>
                                                <td className="num">
                                                    {s.costPerVisible !== "" &&
                                                    s.costPerVisible != null
                                                        ? formatMoney(s.costPerVisible, s.currency)
                                                        : "—"}
                                                </td>
                                                <td>
                                                    {s.fromDate && s.toDate
                                                        ? `${s.fromDate} → ${s.toDate}`
                                                        : "—"}
                                                </td>
                                                <td>
                                                    <button
                                                        type="button"
                                                        className="marketing-reconciliation__snapshots-delete"
                                                        onClick={() => handleDeleteSnapshot(s.id)}
                                                        aria-label={`Delete snapshot from ${formatTimestamp(s.savedAt)}`}
                                                        title="Delete snapshot"
                                                    >
                                                        ×
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )
                ) : null}
            </div>
        </section>
    );
}
