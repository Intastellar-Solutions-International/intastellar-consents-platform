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

    const numConsents = Math.max(0, Number(consents) || 0);
    const numVisible = Math.max(0, Number(visibleConsents) || 0);
    const numInvisible = Math.max(0, Number(invisibleConsents) || 0);

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
                                  )} of consents, ${formatPct(
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
                            invisibleSharePct != null
                                ? `${formatPct(
                                      invisibleSharePct
                                  )} of your ${selectedPlatform.metric} will be missing from ${selectedPlatform.label}'s conversion tracking.`
                                : null
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
                                    {snapshots.map((s) => (
                                        <tr key={s.id}>
                                            <td>{formatTimestamp(s.savedAt)}</td>
                                            <td>{s.scopeLabel}</td>
                                            <td>
                                                {s.platformLabel}
                                                <span className="marketing-reconciliation__snapshots-metric">
                                                    {" "}
                                                    · {s.metric}
                                                </span>
                                            </td>
                                            <td className="num">{formatInt(s.adClicks)}</td>
                                            <td className="num">{formatInt(s.consents)}</td>
                                            <td className="num">
                                                {formatInt(s.visibleConsents)}
                                                {s.visibleSharePct !== "" &&
                                                s.visibleSharePct != null ? (
                                                    <span className="marketing-reconciliation__snapshots-sub">
                                                        {" "}
                                                        ({formatPct(s.visibleSharePct)})
                                                    </span>
                                                ) : null}
                                            </td>
                                            <td className="num">
                                                {formatInt(s.invisibleConsents)}
                                                {s.invisibleSharePct !== "" &&
                                                s.invisibleSharePct != null ? (
                                                    <span className="marketing-reconciliation__snapshots-sub">
                                                        {" "}
                                                        ({formatPct(s.invisibleSharePct)})
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
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )
                ) : null}
            </div>
        </section>
    );
}
