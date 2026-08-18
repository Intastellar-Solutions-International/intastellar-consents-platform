const { useState, useEffect, useMemo } = React;
import { ScannerHost } from "../../API/host.js";
import { authHeaders } from "./_shared.js";
import { IconFunnel } from "./Icons.js";

const KIND_LABEL = {
    view_basket: "Viewed basket", begin_checkout: "Began checkout",
    checkout: "Checkout", purchase: "Purchase",
};

// Fixed e-commerce funnel order — matches ALLOWED_KINDS in api/analytics-events.js.
// The funnel only renders once 2+ of these steps are registered; a single
// funnel-kind event (e.g. just "purchase") isn't a funnel on its own.
const FUNNEL_ORDER = ["view_basket", "begin_checkout", "checkout", "purchase"];

export default function ConversionFunnel({ domain, funnel, totalConversions, linkedConversions }) {
    const [defs, setDefs] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!domain) { setDefs([]); setLoading(false); return; }
        setLoading(true);
        fetch(`${ScannerHost}/api/analytics-events?domain=${encodeURIComponent(domain)}`, {
            headers: authHeaders(),
        })
            .then(r => r.ok ? r.json() : { events: [] })
            .then(d => setDefs(d.events || []))
            .catch(() => setDefs([]))
            .finally(() => setLoading(false));
    }, [domain]);

    const funnelByKind = useMemo(() => new Map((funnel || []).map(f => [f.kind, f])), [funnel]);

    const funnelSteps = useMemo(() => {
        const defByKind = new Map(defs.map(d => [d.kind, d]));
        const stepKinds = FUNNEL_ORDER.filter(k => defByKind.has(k));
        if (stepKinds.length < 2) return [];
        return stepKinds.map(kind => {
            const def = defByKind.get(kind);
            const sessions = funnelByKind.get(kind)?.sessions || 0;
            return { kind, label: def.label || KIND_LABEL[kind], sessions };
        });
    }, [defs, funnelByKind]);

    const firstStepSessions = funnelSteps[0]?.sessions || 0;
    const unlinked = Math.max(0, (totalConversions || 0) - (linkedConversions || 0));

    return (
        <div className="sa-panel sa-conv-funnel-panel">
            <h3 className="sa-panel__title"><IconFunnel className="sa-icon" /> Checkout funnel</h3>

            {!loading && funnelSteps.length === 0 && (
                <p className="sa-panel__sub">
                    Register at least two checkout-funnel events (view_basket, begin_checkout, checkout,
                    purchase) under Events &amp; Tracking to see a funnel here.
                </p>
            )}

            {funnelSteps.map((step, i) => {
                const pct = firstStepSessions > 0
                    ? Math.round((step.sessions / firstStepSessions) * 100)
                    : 0;
                const prev = funnelSteps[i - 1];
                const dropOffPct = prev && prev.sessions > 0
                    ? Math.round((1 - step.sessions / prev.sessions) * 1000) / 10
                    : null;
                return (
                    <div key={step.kind} className="sa-funnel-step">
                        {i > 0 && dropOffPct != null && (
                            <div className="sa-funnel-step__dropoff">
                                &darr; {dropOffPct}% drop-off
                            </div>
                        )}
                        <div className="sa-funnel-step__row">
                            <span className="sa-funnel-step__label">{step.label}</span>
                            <div className="sa-funnel-step__track">
                                <div className="sa-funnel-step__fill" style={{ width: pct + "%" }} />
                            </div>
                            <span className="sa-funnel-step__value">
                                {step.sessions.toLocaleString("de-DE")}
                                <span className="sa-funnel-step__pct">({pct}%)</span>
                            </span>
                        </div>
                    </div>
                );
            })}

            {funnelSteps.length > 0 && unlinked > 0 && (
                <p className="sa-panel__consent-note sa-funnel-note">
                    Session-linked conversions only — {unlinked.toLocaleString("de-DE")} of{" "}
                    {(totalConversions || 0).toLocaleString("de-DE")} conversions couldn't be tied to a
                    session (no analytics consent) and aren't reflected in this funnel.
                </p>
            )}
        </div>
    );
}
