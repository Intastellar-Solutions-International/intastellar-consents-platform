/*
 * --- MarketingSuggestionsStrip ----------------------------------------
 *
 * Renders a compact, ranked list of "next moves" beneath the KPI grid.
 * Suggestions come from the buildInvisibleTrafficSuggestions registry
 * (see ./marketingSuggestions.js). The strip itself owns:
 *
 *  - Per-domain snooze persistence in localStorage (7 days, configurable
 *    per call). Snoozes are silently dropped when expired so the queue
 *    self-heals — the user can't accidentally bury a critical fix forever.
 *  - A maxVisible cap (default 3) to avoid recommendation spam.
 *  - A collapsible "Why this?" disclosure showing the evidence object that
 *    triggered the rule. Useful for trust ("how do you know?") and for
 *    debugging when the data shape evolves.
 *
 * The component intentionally has no opinions about suggestion authoring —
 * adding a rule means appending to the registry, not editing this file.
 */

const { useState, useEffect, useCallback } = React;

const SNOOZE_DAYS = 7;
const SNOOZE_MS = SNOOZE_DAYS * 24 * 60 * 60 * 1000;
const STORAGE_PREFIX = "marketing-suggestions-snooze:";

function safeKeyPart(value, fallback) {
    const s = value == null ? "" : String(value).trim();
    if (!s) return fallback;
    return s.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 80) || fallback;
}

function loadSnoozeMap(domainKey) {
    if (typeof window === "undefined" || !window.localStorage) return {};
    try {
        const raw = window.localStorage.getItem(STORAGE_PREFIX + safeKeyPart(domainKey, "default"));
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object") return {};
        // Drop expired entries on load so the in-memory map stays tidy.
        const now = Date.now();
        const cleaned = {};
        Object.entries(parsed).forEach(([k, v]) => {
            if (typeof v === "number" && v > now) cleaned[k] = v;
        });
        return cleaned;
    } catch (e) {
        return {};
    }
}

function saveSnoozeMap(domainKey, map) {
    if (typeof window === "undefined" || !window.localStorage) return;
    try {
        const cleaned = {};
        const now = Date.now();
        Object.entries(map).forEach(([k, v]) => {
            if (typeof v === "number" && v > now) cleaned[k] = v;
        });
        window.localStorage.setItem(
            STORAGE_PREFIX + safeKeyPart(domainKey, "default"),
            JSON.stringify(cleaned)
        );
    } catch (e) {
        /* quota or disabled storage — no-op */
    }
}

function formatEvidenceValue(value) {
    if (value == null) return "—";
    if (typeof value === "number") {
        return Number.isInteger(value)
            ? value.toLocaleString("de-DE")
            : value.toLocaleString("de-DE", { maximumFractionDigits: 2 });
    }
    return String(value);
}

export default function MarketingSuggestionsStrip({
    suggestions,
    domainKey,
    maxVisible = 3,
}) {
    const [snoozeMap, setSnoozeMap] = useState(() => loadSnoozeMap(domainKey));

    // Reload the snooze map whenever the active domain changes — different
    // customer / property / scope means a different localStorage bucket.
    useEffect(() => {
        setSnoozeMap(loadSnoozeMap(domainKey));
    }, [domainKey]);

    const snooze = useCallback(
        (id) => {
            setSnoozeMap((prev) => {
                const next = { ...prev, [id]: Date.now() + SNOOZE_MS };
                saveSnoozeMap(domainKey, next);
                return next;
            });
        },
        [domainKey]
    );

    const now = Date.now();
    const visible = (suggestions || [])
        .filter((s) => !(snoozeMap[s.id] && snoozeMap[s.id] > now))
        .slice(0, maxVisible);

    if (visible.length === 0) return null;

    return (
        <section
            className="marketing-suggestions"
            aria-labelledby="marketing-suggestions-heading"
        >
            <header className="marketing-suggestions__head">
                <h2
                    id="marketing-suggestions-heading"
                    className="marketing-suggestions__title"
                >
                    Suggestions for the gap
                </h2>
                <p className="marketing-suggestions__hint">
                    Concrete moves to shrink your analytics-invisible traffic. Snooze a card if you've already actioned it — it'll come back if the metric stays bad.
                </p>
            </header>
            <ul className="marketing-suggestions__list">
                {visible.map((s) => (
                    <li
                        key={s.id}
                        className={[
                            "marketing-suggestions__card",
                            `marketing-suggestions__card--${s.severity}`,
                        ].join(" ")}
                    >
                        <div className="marketing-suggestions__card-head">
                            <span
                                className={`marketing-suggestions__severity marketing-suggestions__severity--${s.severity}`}
                                aria-label={`${s.severity} priority`}
                            >
                                {s.severity}
                            </span>
                            <h3 className="marketing-suggestions__card-title">{s.title}</h3>
                        </div>
                        <p className="marketing-suggestions__card-body">{s.body}</p>
                        <div className="marketing-suggestions__card-actions">
                            {s.action ? (
                                <a
                                    className="marketing-suggestions__cta"
                                    href={s.action.href}
                                >
                                    {s.action.label} →
                                </a>
                            ) : null}
                            <button
                                type="button"
                                className="marketing-suggestions__snooze"
                                onClick={() => snooze(s.id)}
                                aria-label={`Snooze "${s.title}" for ${SNOOZE_DAYS} days`}
                                title={`Hide for ${SNOOZE_DAYS} days. The next data refresh after that will surface it again if the metric still warrants it.`}
                            >
                                Snooze {SNOOZE_DAYS} d
                            </button>
                        </div>
                        {s.evidence && Object.keys(s.evidence).length > 0 ? (
                            <details className="marketing-suggestions__evidence">
                                <summary>Why this?</summary>
                                <ul>
                                    {Object.entries(s.evidence).map(([k, v]) => (
                                        <li key={k}>
                                            <code>{k}</code>: {formatEvidenceValue(v)}
                                        </li>
                                    ))}
                                </ul>
                            </details>
                        ) : null}
                    </li>
                ))}
            </ul>
        </section>
    );
}
