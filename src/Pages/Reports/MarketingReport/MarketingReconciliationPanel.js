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
 * This is *not* an attribution engine. We don't try to join data — we
 * just surface the reconciliation math a marketer would otherwise do on
 * a napkin. The inputs persist to localStorage per (domain × scope) so
 * revisiting a channel doesn't make the user re-enter last week's number.
 *
 * Scope semantics:
 *   - `scopeKey` = "channel:<name>" when a channel is open, "overview"
 *     otherwise. Used both for the storage key and as a display hint
 *     ("this channel" vs "across all channels").
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

const DEFAULT_STATE = {
    platform: "google_ads",
    adClicks: "",
    spend: "",
    currency: "EUR",
};

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
    const cur = CURRENCIES.find((c) => c.id === currency) || CURRENCIES[0];
    return `${cur.symbol} ${x.toLocaleString("de-DE", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    })}`;
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

function storageKeyFor(domainKey, scopeKey) {
    const safeDomain = String(domainKey || "default").slice(0, 120);
    const safeScope = String(scopeKey || "overview").slice(0, 120);
    return `marketing-reconciliation:${safeDomain}:${safeScope}`;
}

/*
 * Small result card that reads as a sentence: a headline number on top,
 * a one-line plain-English explanation below. The three cards stack
 * horizontally on wide screens, collapsing to a single column on phone.
 */
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
    const key = storageKeyFor(domainKey, scopeKey);

    const [state, setState] = useState(() => ({ ...DEFAULT_STATE }));
    const [loaded, setLoaded] = useState(false);

    /*
     * Load persisted values whenever the scope or domain changes.
     * We intentionally blow away any in-flight edits on scope switch —
     * the new scope's saved values are the authoritative source. The
     * `loaded` flag prevents the save-effect from writing the default
     * state back over the freshly-loaded values on first render.
     */
    useEffect(() => {
        setLoaded(false);
        const stored = readStored(key);
        if (stored && typeof stored === "object") {
            setState({ ...DEFAULT_STATE, ...stored });
        } else {
            setState({ ...DEFAULT_STATE });
        }
        setLoaded(true);
    }, [key]);

    useEffect(() => {
        if (!loaded) return;
        writeStored(key, state);
    }, [key, state, loaded]);

    const update = useCallback((field) => {
        return (e) => {
            const v = e && e.target ? e.target.value : "";
            setState((prev) => ({ ...prev, [field]: v }));
        };
    }, []);

    const handleClear = useCallback(() => {
        setState({ ...DEFAULT_STATE });
    }, []);

    const selectedPlatform = useMemo(
        () => PLATFORMS.find((p) => p.id === state.platform) || PLATFORMS[0],
        [state.platform]
    );
    const selectedCurrency = useMemo(
        () => CURRENCIES.find((c) => c.id === state.currency) || CURRENCIES[0],
        [state.currency]
    );

    const numConsents = Math.max(0, Number(consents) || 0);
    const numVisible = Math.max(0, Number(visibleConsents) || 0);
    const numInvisible = Math.max(0, Number(invisibleConsents) || 0);

    const clicksNum = Math.max(0, Number(state.adClicks) || 0);
    const spendNum = Math.max(0, Number(state.spend) || 0);
    const hasClicks = clicksNum > 0;
    const hasSpend = spendNum > 0;

    /*
     * Reconciliation math.
     *
     * We cap the "banner reach" share at 100% for display (more consents
     * than reported clicks is not impossible — referral loops, multiple
     * visits per user, remarketing, pre-consented sessions — but framing
     * it as ">100% reach" would be confusing. We show an honest
     * "over-counted: X consents" note in that case instead).
     */
    const bannerReachPct = hasClicks ? Math.min(100, (numConsents / clicksNum) * 100) : null;
    const bannerOverage = hasClicks ? Math.max(0, numConsents - clicksNum) : 0;

    const visibilityOfClicksPct = hasClicks ? (numVisible / clicksNum) * 100 : null;
    const invisibleOfClicksPct = hasClicks ? (numInvisible / clicksNum) * 100 : null;
    const visibilityOfConsentsPct = numConsents > 0 ? (numVisible / numConsents) * 100 : null;

    const costPerVisible = hasSpend && numVisible > 0 ? spendNum / numVisible : null;
    const costPerClick = hasSpend && hasClicks ? spendNum / clicksNum : null;

    const scopeSentence = scopeLabel
        ? scopeKey && scopeKey.startsWith("channel:")
            ? `this channel (${scopeLabel})`
            : scopeLabel
        : "this view";

    const windowHint =
        fromDate && toDate
            ? `Use the same date range as the header filter (${fromDate} → ${toDate}).`
            : "Use the same date range as the header filter.";

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
                    are saved locally on this device for each scope.
                </p>
            </header>

            <div className="marketing-reconciliation__inputs">
                <label className="marketing-reconciliation__field">
                    <span className="marketing-reconciliation__field-label">Platform</span>
                    <select
                        value={state.platform}
                        onChange={update("platform")}
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
                        value={state.adClicks}
                        onChange={update("adClicks")}
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
                            value={state.spend}
                            onChange={update("spend")}
                            className="marketing-reconciliation__input marketing-reconciliation__input--money"
                            aria-label="Ad spend"
                        />
                        <select
                            value={state.currency}
                            onChange={update("currency")}
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
                        className="marketing-reconciliation__clear"
                        onClick={handleClear}
                    >
                        Clear
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
                            visibilityOfConsentsPct != null && visibilityOfClicksPct != null
                                ? `${formatPct(
                                      visibilityOfConsentsPct
                                  )} of consents, ${formatPct(
                                      visibilityOfClicksPct
                                  )} of your ${selectedPlatform.metric}. These will appear in GA4 / Ads Manager / Meta pixel.`
                                : null
                        }
                    />
                    <ResultCard
                        tone="warn"
                        title="Invisible gap"
                        headline={`${formatInt(numInvisible)} visits`}
                        detail={
                            invisibleOfClicksPct != null
                                ? `${formatPct(
                                      invisibleOfClicksPct
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
                                    ? formatMoney(costPerVisible, state.currency)
                                    : "—"
                            }
                            detail={
                                costPerVisible != null
                                    ? `${formatMoney(
                                          spendNum,
                                          state.currency
                                      )} ÷ ${formatInt(
                                          numVisible
                                      )} analytics-visible consents.`
                                    : "Need at least one visible consent to compute."
                            }
                            subDetail={
                                costPerClick != null
                                    ? `Your reported cost per ${selectedPlatform.metric}: ${formatMoney(
                                          costPerClick,
                                          state.currency
                                      )}. Visibility gap multiplies your effective cost by ${(
                                          costPerVisible && costPerClick
                                              ? costPerVisible / costPerClick
                                              : 0
                                      ).toLocaleString("de-DE", {
                                          maximumFractionDigits: 2,
                                      })}×.`
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
        </section>
    );
}
