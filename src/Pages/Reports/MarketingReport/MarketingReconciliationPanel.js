const { useCallback, useEffect, useMemo, useState } = React;

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
}) {
    const inputsKeyValue = inputsKey(domainKey, scopeKey);
    const snapshotsKeyValue = snapshotsKey(domainKey);

    const [inputs, setInputs] = useState(() => ({ ...DEFAULT_INPUTS, byPlatform: {} }));
    const [snapshots, setSnapshots] = useState([]);
    const [loaded, setLoaded] = useState(false);
    const [snapshotsExpanded, setSnapshotsExpanded] = useState(false);
    const [savedFlash, setSavedFlash] = useState(false);

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
        setSnapshots(loadSnapshots(domainKey));
    }, [snapshotsKeyValue, domainKey]);

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

    const scopeSentence = scopeLabel
        ? scopeKey && scopeKey.startsWith("channel:")
            ? `this channel (${scopeLabel})`
            : scopeLabel
        : "this view";

    const windowHint =
        fromDate && toDate
            ? `Use the same date range as the header filter (${fromDate} → ${toDate}).`
            : "Use the same date range as the header filter.";

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
    ]);

    const handleDeleteSnapshot = useCallback((id) => {
        setSnapshots((prev) => prev.filter((s) => s.id !== id));
    }, []);

    const handleClearSnapshots = useCallback(() => {
        if (snapshots.length === 0) return;
        const ok = window.confirm(
            `Remove all ${snapshots.length} reconciliation snapshot${snapshots.length === 1 ? "" : "s"} for this property? This cannot be undone.`
        );
        if (ok) setSnapshots([]);
    }, [snapshots.length]);

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
        <section
            className="marketing-reconciliation"
            aria-labelledby="marketing-reconciliation-h"
        >
            <header className="marketing-reconciliation__header">
                <h2
                    id="marketing-reconciliation-h"
                    className="marketing-report-section__title"
                >
                    Reconcile with your ad platform
                </h2>
                <p className="marketing-report-section__hint">
                    Drop in the click / session count you see in your ad platform for the same window
                    and we'll line it up against the consents we logged — so you can tell at a glance
                    how much of your paid traffic will actually land in your analytics tools. Numbers
                    are remembered per platform on this device, and you can save a snapshot to keep a
                    history.
                </p>
            </header>

            <div className="marketing-reconciliation__inputs">
                <label className="marketing-reconciliation__field">
                    <span className="marketing-reconciliation__field-label">Platform</span>
                    <select
                        value={inputs.platform}
                        onChange={handlePlatformChange}
                        className="marketing-reconciliation__select"
                    >
                        {PLATFORMS.map((p) => (
                            <option key={p.id} value={p.id}>
                                {p.label}
                            </option>
                        ))}
                    </select>
                </label>

                <label className="marketing-reconciliation__field">
                    <span className="marketing-reconciliation__field-label">
                        {selectedPlatform.label} {selectedPlatform.metric} for this period
                    </span>
                    <input
                        type="number"
                        inputMode="numeric"
                        min="0"
                        step="1"
                        placeholder="e.g. 5000"
                        value={currentValues.adClicks}
                        onChange={updatePlatformValue("adClicks")}
                        className="marketing-reconciliation__input"
                        aria-label={`${selectedPlatform.label} ${selectedPlatform.metric}`}
                    />
                </label>

                <label className="marketing-reconciliation__field">
                    <span className="marketing-reconciliation__field-label">
                        Ad spend for this period (optional)
                    </span>
                    <div className="marketing-reconciliation__money">
                        <input
                            type="number"
                            inputMode="decimal"
                            min="0"
                            step="0.01"
                            placeholder="e.g. 2340"
                            value={currentValues.spend}
                            onChange={updatePlatformValue("spend")}
                            className="marketing-reconciliation__input marketing-reconciliation__input--money"
                            aria-label="Ad spend"
                        />
                        <select
                            value={inputs.currency}
                            onChange={handleCurrencyChange}
                            className="marketing-reconciliation__select marketing-reconciliation__select--currency"
                            aria-label="Currency"
                        >
                            {CURRENCIES.map((c) => (
                                <option key={c.id} value={c.id}>
                                    {c.id}
                                </option>
                            ))}
                        </select>
                    </div>
                </label>

                <div className="marketing-reconciliation__actions">
                    <button
                        type="button"
                        className="marketing-reconciliation__save"
                        onClick={handleSaveSnapshot}
                        disabled={!hasClicks}
                        title={
                            hasClicks
                                ? "Save the current reconciliation as a snapshot"
                                : `Enter ${selectedPlatform.metric} first`
                        }
                    >
                        {savedFlash ? "Saved ✓" : "Save snapshot"}
                    </button>
                    <button
                        type="button"
                        className="marketing-reconciliation__clear"
                        onClick={handleClear}
                    >
                        Clear inputs
                    </button>
                </div>
            </div>

            <p className="marketing-reconciliation__window-hint">{windowHint}</p>

            {filterActive ? (
                noMatchedRows ? (
                    <div
                        className="marketing-reconciliation__filter-note marketing-reconciliation__filter-note--empty"
                        role="status"
                    >
                        <p>
                            No traffic tagged as <strong>{selectedPlatform.label}</strong> in {scopeSentence}.
                            We match canonical <code>utm_source</code> values like{" "}
                            <code>{(PLATFORM_EXAMPLE_SOURCES[selectedPlatform.id] || []).join(", ") || "—"}</code>
                            . Either your campaigns aren't UTM-tagged with a recognised source, or the
                            traffic lives in a different channel — switch to{" "}
                            <strong>Other / custom</strong> to reconcile against the scope total
                            instead, or adjust your UTM tagging.
                        </p>
                    </div>
                ) : (
                    <div className="marketing-reconciliation__filter-note" role="status">
                        <p>
                            Filtered to <strong>{selectedPlatform.label}</strong> traffic:{" "}
                            <strong>{formatInt(numConsents)}</strong> of{" "}
                            <strong>{formatInt(scopeConsents)}</strong> scope consents
                            {coverageOfScopePct != null ? (
                                <>
                                    {" "}
                                    ({formatPct(coverageOfScopePct)} coverage)
                                </>
                            ) : null}
                            .
                            {platformStats.matchedSources.length > 0 ? (
                                <>
                                    {" "}
                                    Matched <code>utm_source</code>:{" "}
                                    <code>
                                        {platformStats.matchedSources.slice(0, 6).join(", ")}
                                        {platformStats.matchedSources.length > 6
                                            ? `, +${platformStats.matchedSources.length - 6} more`
                                            : ""}
                                    </code>
                                    .
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

            {hasClicks ? (
                <div className="marketing-reconciliation__results">
                    <ResultCard
                        tone="neutral"
                        title="Banner reach"
                        headline={`${formatInt(numConsents)} consent events`}
                        detail={`From ${scopeSentence}, that's ${formatPct(
                            bannerReachPct
                        )} of your ${formatInt(clicksNum)} reported ${selectedPlatform.metric}.`}
                        subDetail={
                            bannerOverage > 0
                                ? `We logged ${formatInt(
                                      bannerOverage
                                  )} more consents than you reported ${selectedPlatform.metric} — likely multi-session visitors, remarketing, or pre-consented returns.`
                                : null
                        }
                    />
                    <ResultCard
                        tone="good"
                        title="Will reach your analytics"
                        headline={`${formatInt(numVisible)} consents`}
                        detail={
                            visibilityOfConsentsPct != null && visibleSharePct != null
                                ? `${formatPct(
                                      visibilityOfConsentsPct
                                  )} of consents, ${formatShareOfReportedPct(
                                      visibleSharePct
                                  )} of your ${selectedPlatform.metric}. These will appear in GA4 / Ads Manager / Meta pixel.`
                                : null
                        }
                    />
                    <ResultCard
                        tone="warn"
                        title="Invisible gap"
                        headline={`${formatInt(numInvisible)} visits`}
                        detail={
                            invisibleSharePct == null
                                ? null
                                : numConsents > clicksNum
                                  ? `${formatInt(
                                        numInvisible
                                    )} of your ${formatInt(
                                        numConsents
                                    )} attributed consents won't reach ${selectedPlatform.label}. We saw more consent traffic than the ${clicksNum.toLocaleString("de-DE")} ${selectedPlatform.metric} you reported, so the gap can't be expressed as a clean share of ${selectedPlatform.metric}.`
                                  : `${formatPct(
                                        invisibleSharePct
                                    )} of your ${selectedPlatform.metric} will be missing from ${selectedPlatform.label}'s conversion tracking.`
                        }
                    />
                    {hasSpend ? (
                        <ResultCard
                            tone="neutral"
                            title="Cost per visible consent"
                            headline={
                                costPerVisible != null
                                    ? formatMoney(costPerVisible, inputs.currency)
                                    : "—"
                            }
                            detail={
                                costPerVisible != null
                                    ? `${formatMoney(
                                          spendNum,
                                          inputs.currency
                                      )} ÷ ${formatInt(
                                          numVisible
                                      )} analytics-visible consents.`
                                    : "Need at least one visible consent to compute."
                            }
                            subDetail={
                                visibilityCostMultiplier != null
                                    ? `Your reported cost per ${selectedPlatform.metric}: ${formatMoney(
                                          costPerClick,
                                          inputs.currency
                                      )}. Visibility gap multiplies your effective cost by ${visibilityCostMultiplier.toLocaleString(
                                          "de-DE",
                                          { maximumFractionDigits: 2 }
                                      )}×.`
                                    : null
                            }
                        />
                    ) : null}
                </div>
            ) : (
                <div className="marketing-reconciliation__empty">
                    <p>
                        Enter your {selectedPlatform.metric} count from{" "}
                        <strong>{selectedPlatform.label}</strong> above to see the reconciliation.
                        Use the same date range as the header filter so the numbers line up.
                    </p>
                </div>
            )}

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
