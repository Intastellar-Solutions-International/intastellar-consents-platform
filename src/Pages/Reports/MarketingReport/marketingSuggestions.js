/*
 * --- Invisible-traffic suggestions registry ----------------------------
 *
 * Pure rules engine. Given the current Marketing Report data, returns a
 * ranked list of concrete actions the user can take to shrink their
 * analytics-invisible traffic share. The output feeds the
 * MarketingSuggestionsStrip component below the KPI grid.
 *
 * Design constraints
 *  - No network. Every input is already in the render path of the
 *    Marketing Report, so the rules can run on every refresh.
 *  - Independent rules. Each block decides on its own whether to fire and
 *    pushes at most one suggestion. A new rule should only need to be
 *    appended; nothing else changes.
 *  - Stable IDs. Each suggestion carries an id that survives data refreshes
 *    so the React strip can persist per-suggestion snoozes in localStorage.
 *  - Channel-scoped suggestions only fire on the overview view. When the
 *    user is already drilled into one channel, rules that recommend
 *    drilling further would just re-state context.
 */

const SUGGESTION_THRESHOLDS = {
    /** Don't surface a channel-level suggestion if the channel is too small to be worth the user's attention. */
    minChannelConsentsForBlindSpot: 50,
    /** Same threshold the dashboard already uses for the "analytics blind spot" badge. */
    blindSpotInvisiblePct: 50,
    /** Δ in percentage points between current and baseline invisible share. */
    trendSpikePts: 5,
    /** Site-wide essential-only share that flags the banner copy as the lever. */
    essentialOnlyShareWarn: 25,
};

const SEVERITY_RANK = { critical: 0, high: 1, medium: 2, low: 3 };

function safeNumber(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
}

/**
 * Build the ranked suggestion list. Always returns an array (possibly
 * empty); never throws, so the component can render unconditionally.
 */
export function buildInvisibleTrafficSuggestions(input) {
    const {
        selectedChannel,
        invisibleSharePct,
        baselineInvisibleSharePct,
        compareEnabled,
        channelOverview,
        totalConsents,
        essentialOnlyTotal,
        granularTotal,
    } = input || {};

    const out = [];

    // --- Rule 1: most expensive blind-spot channel by lost-consent volume ---
    //
    // Ranks by *count* of invisible consents, not rate. A channel with 8,000
    // consents at 51% invisible loses more measurable visits than a channel
    // with 200 consents at 90%. Marketers think in volume; the rate then
    // reinforces it inside the body copy.
    if (!selectedChannel && Array.isArray(channelOverview) && channelOverview.length) {
        const ranked = channelOverview
            .map((row) => {
                const consents = safeNumber(row.consents);
                const visible = safeNumber(row.acceptAll);
                const invisible = Math.max(0, consents - visible);
                const invisiblePct = consents > 0 ? (invisible / consents) * 100 : 0;
                return { row, consents, invisible, invisiblePct };
            })
            .filter(
                ({ consents, invisiblePct }) =>
                    consents >= SUGGESTION_THRESHOLDS.minChannelConsentsForBlindSpot &&
                    invisiblePct >= SUGGESTION_THRESHOLDS.blindSpotInvisiblePct
            )
            .sort((a, b) => b.invisible - a.invisible);
        const top = ranked[0];
        if (top) {
            out.push({
                id: `blind-spot-channel:${top.row.channel}`,
                severity: "high",
                title: `${top.row.channel} is your biggest analytics blind spot`,
                body: `${top.invisible.toLocaleString("de-DE")} of ${top.consents.toLocaleString("de-DE")} ${top.row.channel} consents (${top.invisiblePct.toFixed(0)}%) never reach analytics. A banner variant scoped to ${top.row.channel} visitors usually recovers 10–25 percentage points.`,
                action: {
                    label: `Test a banner for ${top.row.channel} visitors`,
                    href: `/experiments?new=1&scope=${encodeURIComponent(`channel:${top.row.channel}`)}`,
                },
                evidence: {
                    channel: top.row.channel,
                    invisibleConsents: top.invisible,
                    invisibleSharePct: Number(top.invisiblePct.toFixed(1)),
                    consentsInChannel: top.consents,
                },
            });
        }
    }

    // --- Rule 2: invisible-traffic share rose vs baseline ---
    //
    // Pure trend rule. Doesn't try to attribute the cause (banner change vs
    // traffic mix); the body copy lists both possibilities so the user knows
    // where to look. CTA scrolls to the reconciliation panel so they can
    // capture a snapshot before the recovery work begins.
    if (
        compareEnabled &&
        invisibleSharePct != null &&
        baselineInvisibleSharePct != null
    ) {
        const current = safeNumber(invisibleSharePct);
        const baseline = safeNumber(baselineInvisibleSharePct);
        const delta = current - baseline;
        if (delta >= SUGGESTION_THRESHOLDS.trendSpikePts) {
            out.push({
                id: "invisible-trend-spike",
                severity: "high",
                title: `Invisible traffic rose ${delta.toFixed(1)} pts vs prior period`,
                body: `Currently ${current.toFixed(1)}% — last window was ${baseline.toFixed(1)}%. Snapshot now to track recovery, then check whether a recent banner change or a new low-consent campaign caused the jump.`,
                action: {
                    label: "Snapshot now to track recovery",
                    href: "#marketing-reconciliation-panel",
                },
                evidence: {
                    deltaPts: Number(delta.toFixed(1)),
                    currentPct: Number(current.toFixed(1)),
                    baselinePct: Number(baseline.toFixed(1)),
                },
            });
        }
    }

    // --- Rule 3: essential-only share is dominating declines ---
    //
    // Site-wide signal: when a quarter or more of visitors actively pick
    // essential-only, the banner copy itself is the lever. We avoid this
    // rule when the user is drilled into one channel, since the channel-
    // scoped recommendation in Rule 1 is more actionable.
    if (
        !selectedChannel &&
        safeNumber(totalConsents) > 0 &&
        essentialOnlyTotal != null
    ) {
        const total = safeNumber(totalConsents);
        const eo = safeNumber(essentialOnlyTotal);
        const essentialOnlyPct = (eo / total) * 100;
        if (essentialOnlyPct >= SUGGESTION_THRESHOLDS.essentialOnlyShareWarn) {
            out.push({
                id: "essential-only-dominant",
                severity: "medium",
                title: `${essentialOnlyPct.toFixed(0)}% of visitors pick essential-only`,
                body: `That share is high. Banners that lead with risk language ("we may track you") tend to push users here; banners that explain what gets accepted in plain words tend to recover acceptance. Worth an A/B on the first sentence.`,
                action: {
                    label: "Test a clearer copy variant",
                    href: "/experiments?new=1&hypothesis=essential-only-copy",
                },
                evidence: {
                    essentialOnlyConsents: eo,
                    essentialOnlySharePct: Number(essentialOnlyPct.toFixed(1)),
                    granularConsents: granularTotal != null ? safeNumber(granularTotal) : null,
                    totalConsents: total,
                },
            });
        }
    }

    out.sort((a, b) => {
        const sa = SEVERITY_RANK[a.severity] ?? 99;
        const sb = SEVERITY_RANK[b.severity] ?? 99;
        if (sa !== sb) return sa - sb;
        return a.id.localeCompare(b.id);
    });

    return out;
}

export const __TEST__ = { SUGGESTION_THRESHOLDS, SEVERITY_RANK };
