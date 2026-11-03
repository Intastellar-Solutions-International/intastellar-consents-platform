const { useState, useEffect, useMemo } = React;
const Link = window.ReactRouterDOM.Link;
import { ScannerHost } from "../../API/host.js";
import { analyticsRecordingsPath } from "../../Functions/domainPathSegments.js";
import { lockBodyScroll, unlockBodyScroll } from "../../Functions/bodyScrollLock.js";
import { authHeaders, formatDuration, formatCurrency, timeAgo } from "./_shared.js";
import StatusBadge from "./components/StatusBadge.js";
import "./LiveVisitorDrawer.css";

/**
 * Live View → one active visitor in detail. Only opened for visitors with
 * full (statistics) consent — the endpoint (/api/analytics-live?session=)
 * refuses anyone else, see sessionDetail() in api/analytics-live.js.
 * Re-fetches whenever the page's live data refreshes (`refreshKey`), so an
 * open drawer follows the visitor as they browse.
 */
const LIVE_URL = `${ScannerHost}/api/analytics-live`;

let regionNames = null;
export function countryName(code) {
    if (!code) return null;
    try {
        regionNames = regionNames || new Intl.DisplayNames(["en"], { type: "region" });
        return regionNames.of(code) || code;
    } catch {
        return code;
    }
}

function useSessionDetail(siteKey, domain, sessionId, refreshKey) {
    const [state, setState] = useState({ loading: true, session: null, error: null });

    useEffect(() => {
        setState({ loading: true, session: null, error: null });
    }, [sessionId]);

    useEffect(() => {
        if (!sessionId) return;
        let ignore = false;
        const qs = new URLSearchParams(siteKey ? { site: siteKey } : { domain });
        qs.set("session", sessionId);
        fetch(`${LIVE_URL}?${qs}`, { headers: authHeaders() })
            .then(async (r) => {
                if (ignore) return;
                if (r.status === 404) {
                    setState({ loading: false, session: null, error: "This visitor's details aren't available — they may not have granted full consent, or their session has ended." });
                    return;
                }
                if (!r.ok) throw new Error(`HTTP ${r.status}`);
                const { session } = await r.json();
                if (!ignore) setState({ loading: false, session, error: null });
            })
            .catch((err) => {
                if (!ignore) setState((s) => ({ ...s, loading: false, error: s.session ? null : `Couldn't load visitor (${err.message}).` }));
            });
        return () => { ignore = true; };
    }, [siteKey, domain, sessionId, refreshKey]);

    return state;
}

function Fact({ label, value }) {
    if (value == null || value === "") return null;
    return (
        <div className="lv-fact">
            <dt>{label}</dt>
            <dd>{value}</dd>
        </div>
    );
}

function ConsentChip({ label, granted }) {
    return <StatusBadge status={granted ? "good" : "neutral"} label={`${label} ${granted ? "granted" : "declined"}`} icon={granted ? undefined : null} />;
}

export default function LiveVisitorDrawer({ siteKey, domain, sessionId, refreshKey, onClose }) {
    const { loading, session, error } = useSessionDetail(siteKey, domain, sessionId, refreshKey);

    useEffect(() => {
        const onKey = (e) => { if (e.key === "Escape") onClose(); };
        window.addEventListener("keydown", onKey);
        lockBodyScroll();
        return () => { window.removeEventListener("keydown", onKey); unlockBodyScroll(); };
    }, [onClose]);

    // Pageviews and events interleaved into one timeline, newest first.
    const journey = useMemo(() => {
        if (!session) return [];
        return [
            ...session.pageviews.map((p) => ({ kind: "page", ...p })),
            ...session.events.map((e) => ({ kind: "event", ...e })),
        ].sort((a, b) => new Date(b.at) - new Date(a.at));
    }, [session]);

    const stats = useMemo(() => {
        if (!session) return null;
        // Conversion events only — a value on e.g. add_to_cart is the cart's
        // worth, not revenue, and summing it with the purchase double-counts.
        const valueByCurrency = {};
        for (const e of session.events) {
            if (e.isConversion && e.valueCents != null) {
                const cur = e.currency || "EUR";
                valueByCurrency[cur] = (valueByCurrency[cur] || 0) + e.valueCents;
            }
        }
        return {
            durationSec: (new Date(session.lastSeenAt) - new Date(session.startedAt)) / 1000,
            pages: session.pageviews.length,
            conversions: session.events.filter((e) => e.isConversion).length,
            value: Object.entries(valueByCurrency).map(([cur, cents]) => formatCurrency(cents, cur, { cents: true })).join(" + "),
        };
    }, [session]);

    const v = session?.visitor;
    const src = session?.source;
    const title = !v ? "Visitor"
        : `${v.isNew === false ? "Returning visitor" : v.isNew ? "New visitor" : "Visitor"} from ${countryName(v.country) || "an unknown location"}`;
    const currentPage = journey.findIndex((j) => j.kind === "page");

    return (
        <>
            <div className="lv-backdrop" onClick={onClose} aria-hidden="true" />
            <aside className="lv-drawer" role="dialog" aria-modal="true" aria-labelledby="lv-drawer-title">
                <header className="lv-drawer__head">
                    <div>
                        <h2 id="lv-drawer-title" className="lv-drawer__title">{title}</h2>
                        {session && (
                            <p className="lv-drawer__sub">
                                <span className="sa-live__dot" /> Last active {timeAgo(session.lastSeenAt)} · session started {timeAgo(session.startedAt)}
                            </p>
                        )}
                    </div>
                    <button type="button" className="lv-drawer__close" onClick={onClose} aria-label="Close visitor details">×</button>
                </header>

                <div className="lv-drawer__body">
                    {loading && !session && <p className="sa-notice">Loading visitor&hellip;</p>}
                    {error && <p className="sa-notice">{error}</p>}

                    {session && (
                        <>
                            <div className="lv-stats">
                                <div className="lv-stat"><span className="lv-stat__value">{formatDuration(stats.durationSec)}</span><span className="lv-stat__label">Session length</span></div>
                                <div className="lv-stat"><span className="lv-stat__value">{stats.pages}</span><span className="lv-stat__label">Pages viewed</span></div>
                                <div className="lv-stat"><span className="lv-stat__value">{stats.conversions}</span><span className="lv-stat__label">Conversions</span></div>
                                <div className="lv-stat"><span className="lv-stat__value">{stats.value || "—"}</span><span className="lv-stat__label">Conversion value</span></div>
                            </div>

                            {session.recording && (
                                <Link className="lv-recording" to={`${analyticsRecordingsPath(domain)}/${session.recording.id}`}>
                                    ▶ Watch session recording
                                    {session.recording.status === "active" ? " (still recording)" : session.recording.durationSec ? ` · ${formatDuration(session.recording.durationSec)}` : ""}
                                </Link>
                            )}

                            <div className="lv-sections">
                                <section className="lv-section">
                                    <h3 className="lv-section__title">Visitor</h3>
                                    <dl className="lv-facts">
                                        <Fact label="Country" value={countryName(v.country)} />
                                        <Fact label="Language" value={v.language} />
                                        <Fact label="Time zone" value={v.timezone} />
                                        <Fact label="Device" value={v.device && v.device[0].toUpperCase() + v.device.slice(1)} />
                                        <Fact label="Browser" value={[v.browser, v.os].filter(Boolean).join(" on ")} />
                                        <Fact label="Screen" value={v.screen && `${v.screen}${v.viewport ? ` (window ${v.viewport})` : ""}`} />
                                    </dl>
                                </section>

                                <section className="lv-section">
                                    <h3 className="lv-section__title">Source</h3>
                                    <dl className="lv-facts">
                                        <Fact label="Channel" value={src?.channel} />
                                        <Fact label="Referrer" value={src?.referrer} />
                                        <Fact label="Ad click" value={src?.clickIds?.join(", ")} />
                                        <Fact label="UTM source" value={src?.utmSource} />
                                        <Fact label="UTM medium" value={src?.utmMedium} />
                                        <Fact label="Campaign" value={src?.utmCampaign} />
                                        <Fact label="Landing page" value={session.pageviews[0]?.path} />
                                    </dl>
                                </section>
                            </div>

                            <section className="lv-section">
                                <h3 className="lv-section__title">
                                    Consent
                                    {session.consent.granular != null && (
                                        <span className="lv-section__hint">{session.consent.granular ? "chose categories individually" : "accepted all"}</span>
                                    )}
                                </h3>
                                <div className="lv-consent">
                                    <ConsentChip label="Statistics" granted={session.consent.statistics} />
                                    <ConsentChip label="Functional" granted={session.consent.functional} />
                                    <ConsentChip label="Marketing" granted={session.consent.marketing} />
                                </div>
                            </section>

                            <section className="lv-section">
                                <h3 className="lv-section__title">Journey <span className="lv-section__hint">newest first</span></h3>
                                <ol className="lv-journey">
                                    {journey.map((j, i) => j.kind === "page" ? (
                                        <li key={i} className={"lv-step" + (i === currentPage ? " lv-step--current" : "")}>
                                            <span className="lv-step__time">{new Date(j.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                                            <div className="lv-step__body">
                                                <span className="lv-step__path" title={j.host ? `${j.host}${j.path}` : j.path}>
                                                    {j.host && j.host.replace(/^www\./, "") !== String(domain).replace(/^www\./, "") ? j.host : ""}{j.path}
                                                    {i === currentPage && <span className="lv-step__now">current</span>}
                                                </span>
                                                {j.title && <span className="lv-step__title">{j.title}</span>}
                                                {(j.durationSec > 0 || j.scrollDepth != null) && (
                                                    <span className="lv-step__meta">
                                                        {j.durationSec > 0 && `${formatDuration(j.durationSec)} on page`}
                                                        {j.durationSec > 0 && j.scrollDepth != null && " · "}
                                                        {j.scrollDepth != null && `scrolled ${j.scrollDepth}%`}
                                                    </span>
                                                )}
                                            </div>
                                        </li>
                                    ) : (
                                        <li key={i} className={"lv-step lv-step--event" + (j.isConversion ? " lv-step--conversion" : "")}>
                                            <span className="lv-step__time">{new Date(j.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                                            <div className="lv-step__body">
                                                <span className="lv-step__event">
                                                    {j.label.replace(/_/g, " ")}
                                                    {j.valueCents != null && <span className="lv-step__value">{formatCurrency(j.valueCents, j.currency || "EUR", { cents: true })}</span>}
                                                    {j.isConversion && <span className="lv-step__now">conversion</span>}
                                                </span>
                                                {j.path && <span className="lv-step__meta">on {j.path}</span>}
                                            </div>
                                        </li>
                                    ))}
                                </ol>
                            </section>
                        </>
                    )}
                </div>
            </aside>
        </>
    );
}
