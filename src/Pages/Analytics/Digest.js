/*
 * Channel Analytics Digest
 *
 * Portfolio-level view of highest-priority marketing channel suggestion
 * cards across all domains in this account.
 *
 * For each domain the CMP marketing attribution endpoint is fetched, rows
 * are mapped into a channel-level summary, and buildInvisibleTrafficSuggestions
 * runs exactly as it does on the per-domain Marketing Report page — same rules,
 * same thresholds. Suggestion IDs and snooze storage keys match the Marketing
 * Report so snoozing a card here also hides it there, and vice versa.
 */

const { useState, useEffect, useCallback, useMemo } = React;
const Link = window.ReactRouterDOM.Link;

import { buildInvisibleTrafficSuggestions } from "../Reports/MarketingReport/marketingSuggestions.js";
import { PrimaryHost } from "../../API/host.js";
import Authentication from "../../Authentication/Auth.js";
import StickyPageTitle from "../../Components/Header/Sticky/index.js";
import "./Analytics.css";

// ── CMP marketing attribution fetch ──────────────────────────────────────────

const MARKETING_URL = `${PrimaryHost}/analytics/gdpr/marketingAttribution`;

function extractRows(payload) {
    if (payload == null) return [];
    const root = payload.data != null ? payload.data : payload;
    if (Array.isArray(root)) return root;
    if (Array.isArray(root.rows)) return root.rows;
    if (Array.isArray(root.campaigns)) return root.campaigns;
    if (Array.isArray(root.items)) return root.items;
    if (Array.isArray(root.attribution)) return root.attribution;
    return [];
}

function safeNum(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
}

// Coarser channel grouping than the full Marketing Report — sufficient for
// Rule 1 (blind-spot channel) which reports the channel name in card text.
function deriveChannel(utmSource, utmMedium, referrer) {
    const s = (utmSource || "").toLowerCase().trim();
    const m = (utmMedium || "").toLowerCase().trim();
    const host = (referrer || "").toLowerCase().trim().replace(/^(https?:\/\/)?(www\.)?/, "");

    if (s === "(gclid)" || s === "(fbclid)") return "Paid";
    if (/cpc|ppc|paid|display|cpm/.test(m)) return "Paid";
    if (/facebook|instagram|meta|fb\b|ig\b/.test(s + " " + host) && /social|ads|cpc|ppc/.test(m))
        return "Paid Social";
    if (/facebook|instagram|meta/.test(s + " " + host)) return "Social";
    if (/linkedin|linkedin\.com/.test(s + " " + host)) return "LinkedIn";
    if (/twitter|x\.com|t\.co/.test(s + " " + host)) return "Social";
    if (m === "organic" || /google\.|bing\.|duckduckgo\.|yahoo\.|yandex\./.test(host))
        return "Organic";
    if (/google|adwords/.test(s) && /cpc|ppc|paid/.test(m)) return "Google Ads";
    if (host && host !== "—" && host !== "") return "Referral";
    return "Direct";
}

function mapDigestRow(r) {
    const utmSource = String(r.utm_source ?? r.utmSource ?? r.source ?? "—");
    const utmMedium = String(r.utm_medium ?? r.utmMedium ?? r.medium ?? "—");
    const referrer  = String(r.referrerHost ?? r.referrer_host ?? r.referrer ?? "");
    return {
        channel:       deriveChannel(utmSource, utmMedium, referrer),
        consents:      safeNum(r.consents ?? r.consent_count ?? r.count ?? 0),
        acceptAll:     safeNum(r.acceptAll ?? r.accept_all ?? 0),
        essentialOnly: safeNum(r.essentialOnly ?? r.essential_only ?? 0),
        granular:      safeNum(r.granular ?? r.granular_choices ?? r.granularChoices ?? 0),
    };
}

function buildChannelSummary(rows) {
    const map = new Map();
    for (const r of rows) {
        if (!map.has(r.channel)) {
            map.set(r.channel, { channel: r.channel, consents: 0, acceptAll: 0, essentialOnly: 0, granular: 0 });
        }
        const c = map.get(r.channel);
        c.consents      += r.consents;
        c.acceptAll     += r.acceptAll;
        c.essentialOnly += r.essentialOnly;
        c.granular      += r.granular;
    }
    return [...map.values()].sort((a, b) => b.consents - a.consents);
}

async function fetchDomainCards(domain) {
    const today  = new Date().toISOString().slice(0, 10);
    const from30 = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const res = await fetch(MARKETING_URL, {
        method: "GET",
        headers: {
            Authorization:  Authentication.getToken(),
            Organisation:   String(Authentication.getOrganisation()),
            "Content-Type": "application/json",
            Domains:        domain,
            FromDate:       from30,
            ToDate:         today,
            CompareRange:   "",
            PreviousPeriod: "",
            PreviousPeriod2: "",
            "X-Compare-Start": "",
            "X-Compare-End":   "",
            "X-Compare-Range": "",
        },
    });
    if (!res.ok) return [];
    const json = await res.json();
    if (!json || json === "Err_Login_Expired") return [];

    const rows = extractRows(json).map(mapDigestRow);
    if (!rows.length) return [];

    const channelOverview    = buildChannelSummary(rows);
    const totalConsents      = rows.reduce((s, r) => s + r.consents,      0);
    const essentialOnlyTotal = rows.reduce((s, r) => s + r.essentialOnly, 0);
    const granularTotal      = rows.reduce((s, r) => s + r.granular,      0);
    const acceptAllTotal     = rows.reduce((s, r) => s + r.acceptAll,     0);
    const invisibleSharePct  = totalConsents > 0
        ? ((totalConsents - acceptAllTotal) / totalConsents) * 100
        : 0;

    return buildInvisibleTrafficSuggestions({
        selectedChannel:        null,
        invisibleSharePct,
        baselineInvisibleSharePct: null,
        compareEnabled:         false,
        channelOverview,
        totalConsents,
        essentialOnlyTotal,
        granularTotal,
    }).map(s => ({ ...s, domain }));
}

// ── Snooze (same keys as MarketingSuggestionsStrip per domain) ───────────────

const SNOOZE_PREFIX = "marketing-suggestions-snooze:";
const SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;

function safeDomainKey(domain) {
    return String(domain || "default").replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 80) || "default";
}

function isCardSnoozed(snoozeCache, domain, cardId) {
    const map = snoozeCache[domain];
    if (!map) return false;
    const exp = map[cardId];
    return typeof exp === "number" && exp > Date.now();
}

function loadSnoozeCache(domains) {
    const cache = {};
    for (const d of domains) {
        try {
            const raw = localStorage.getItem(SNOOZE_PREFIX + safeDomainKey(d));
            if (!raw) continue;
            const parsed = JSON.parse(raw);
            if (!parsed || typeof parsed !== "object") continue;
            const now = Date.now();
            const cleaned = {};
            Object.entries(parsed).forEach(([k, v]) => {
                if (typeof v === "number" && v > now) cleaned[k] = v;
            });
            cache[d] = cleaned;
        } catch { /* ignore */ }
    }
    return cache;
}

function saveSnooze(domain, cardId, snoozeCache, setSnoozeCache) {
    const key = SNOOZE_PREFIX + safeDomainKey(domain);
    setSnoozeCache(prev => {
        const domainMap = { ...(prev[domain] || {}), [cardId]: Date.now() + SNOOZE_MS };
        try {
            const now = Date.now();
            const cleaned = {};
            Object.entries(domainMap).forEach(([k, v]) => {
                if (typeof v === "number" && v > now) cleaned[k] = v;
            });
            localStorage.setItem(key, JSON.stringify(cleaned));
        } catch { /* quota */ }
        return { ...prev, [domain]: domainMap };
    });
}

// ── Card rendering ────────────────────────────────────────────────────────────

function formatEvidenceValue(value) {
    if (value == null) return "—";
    if (typeof value === "number") {
        return Number.isInteger(value)
            ? value.toLocaleString("de-DE")
            : value.toLocaleString("de-DE", { maximumFractionDigits: 2 });
    }
    return String(value);
}

function DigestCard({ card, snoozeCache, onSnooze }) {
    const snoozed = isCardSnoozed(snoozeCache, card.domain, card.id);
    if (snoozed) return null;

    return (
        <li className={`marketing-suggestions__card marketing-suggestions__card--${card.severity} sa-digest-card`}>
            <div className="marketing-suggestions__card-head">
                <span className={`marketing-suggestions__severity marketing-suggestions__severity--${card.severity}`}
                      aria-label={`${card.severity} priority`}>
                    {card.severity}
                </span>
                <h3 className="marketing-suggestions__card-title">{card.title}</h3>
            </div>
            <span className="sa-digest-card__domain">{card.domain}</span>
            <p className="marketing-suggestions__card-body">{card.body}</p>
            <div className="marketing-suggestions__card-actions">
                {card.action ? (
                    <a className="marketing-suggestions__cta" href={card.action.href}>
                        {card.action.label} →
                    </a>
                ) : null}
                <button
                    type="button"
                    className="marketing-suggestions__snooze"
                    onClick={() => onSnooze(card.domain, card.id)}
                    title="Hide for 7 days — reappears next week if the metric still warrants it."
                >
                    Snooze 7 d
                </button>
            </div>
            {card.evidence && Object.keys(card.evidence).length > 0 ? (
                <details className="marketing-suggestions__evidence">
                    <summary>Why this?</summary>
                    <ul>
                        {Object.entries(card.evidence).map(([k, v]) => (
                            <li key={k}><code>{k}</code>: {formatEvidenceValue(v)}</li>
                        ))}
                    </ul>
                </details>
            ) : null}
        </li>
    );
}

// ── Main page ─────────────────────────────────────────────────────────────────

const SEVERITY_RANK = { critical: 0, high: 1, medium: 2, low: 3 };

function getDomainList() {
    try {
        const raw = localStorage.getItem("domains");
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed.filter(d => d && typeof d === "string" && d !== "combined view");
    } catch { return []; }
}

export default function AnalyticsDigest() {
    document.title = "Channel Digest | Analytics";

    const [cards,       setCards]       = useState(null);  // null = not yet loaded
    const [loading,     setLoading]     = useState(false);
    const [loadedCount, setLoadedCount] = useState(0);
    const [domainCount, setDomainCount] = useState(0);
    const [snoozeCache, setSnoozeCache] = useState({});

    const load = useCallback(async () => {
        const domains = getDomainList();
        setDomainCount(domains.length);
        if (!domains.length) { setCards([]); return; }
        setLoading(true);
        setLoadedCount(0);
        setSnoozeCache(loadSnoozeCache(domains));

        // Fetch all domains in parallel (batched at 8 to avoid overwhelming the API)
        const BATCH = 8;
        const allCards = [];
        for (let i = 0; i < domains.length; i += BATCH) {
            const batch = domains.slice(i, i + BATCH);
            const results = await Promise.allSettled(batch.map(d => fetchDomainCards(d)));
            for (const r of results) {
                if (r.status === "fulfilled") allCards.push(...r.value);
            }
            setLoadedCount(prev => prev + batch.length);
        }

        allCards.sort((a, b) => {
            const ra = SEVERITY_RANK[a.severity] ?? 99;
            const rb = SEVERITY_RANK[b.severity] ?? 99;
            return ra !== rb ? ra - rb : a.id.localeCompare(b.id);
        });

        setCards(allCards);
        setLoading(false);
    }, []);

    useEffect(() => { load(); }, [load]);

    const handleSnooze = useCallback((domain, cardId) => {
        saveSnooze(domain, cardId, snoozeCache, setSnoozeCache);
    }, [snoozeCache]);

    // Visible cards after filtering snoozed
    const visibleCards = useMemo(() => {
        if (!cards) return [];
        return cards.filter(c => !isCardSnoozed(snoozeCache, c.domain, c.id));
    }, [cards, snoozeCache]);

    const isAllClear = !loading && cards !== null && visibleCards.length === 0;

    return (
        <div style={{ flex: "1", minWidth: 0 }}>
            <StickyPageTitle title="Channel Digest" />
            <div className="dashboard-content">
                <div className="sa-page">

                    <div className="sa-digest-meta">
                        {loading ? (
                            <span className="sa-digest-meta__info">
                                Checking {domainCount} domain{domainCount !== 1 ? "s" : ""}&hellip;
                                {loadedCount > 0 && ` (${loadedCount}/${domainCount} done)`}
                            </span>
                        ) : cards !== null ? (
                            <span className="sa-digest-meta__info">
                                {domainCount} domain{domainCount !== 1 ? "s" : ""} &middot; last 30 days
                            </span>
                        ) : null}
                        <button
                            type="button"
                            className="sa-digest-meta__refresh"
                            onClick={load}
                            disabled={loading}
                        >
                            {loading ? "Loading…" : "Refresh"}
                        </button>
                    </div>

                    {loading && cards === null && (
                        <div className="sa-skeleton-rows" style={{ marginTop: 16 }}>
                            {[1, 2, 3].map(i => (
                                <div key={i} className="sa-skeleton-row">
                                    <div className="sa-skeleton" style={{ width: "30%", height: 12 }} />
                                    <div className="sa-skeleton" style={{ flex: 1, height: 10 }} />
                                </div>
                            ))}
                        </div>
                    )}

                    {isAllClear && (
                        <div className="sa-notice" style={{ marginTop: 24 }}>
                            All clear — no channel alerts across {domainCount} domain{domainCount !== 1 ? "s" : ""}.
                            {" "}{cards && cards.length > 0 && visibleCards.length === 0
                                ? "All suggestions have been snoozed."
                                : ""}
                        </div>
                    )}

                    {!loading && !domainCount && (
                        <p className="sa-notice" style={{ marginTop: 24 }}>
                            No domains found. Add a domain in Settings to get started.
                        </p>
                    )}

                    {visibleCards.length > 0 && (
                        <section className="marketing-suggestions sa-digest-section" aria-labelledby="digest-heading">
                            <header className="marketing-suggestions__head">
                                <h2 id="digest-heading" className="marketing-suggestions__title">
                                    {visibleCards.length} alert{visibleCards.length !== 1 ? "s" : ""} across your portfolio
                                </h2>
                                <p className="marketing-suggestions__hint">
                                    Sorted by severity. Cards are shared with the per-domain Marketing Report — snoozing here hides the card there too.
                                </p>
                            </header>
                            <ul className="marketing-suggestions__list">
                                {visibleCards.map(card => (
                                    <DigestCard
                                        key={`${card.domain}:${card.id}`}
                                        card={card}
                                        snoozeCache={snoozeCache}
                                        onSnooze={handleSnooze}
                                    />
                                ))}
                            </ul>
                        </section>
                    )}

                </div>
            </div>
        </div>
    );
}
