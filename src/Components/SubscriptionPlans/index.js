import Authentication from "../../Authentication/Auth";
import CheckoutForm from "./CheckoutForm";
import "./Style/Plans.css";
import API from "../../API/api";
import appStorage from '../../Functions/storage.js';
import { TIERS, FEATURE_TIERS } from '../../Functions/tier.js';
import { t } from "../../i18n/index.js";

const { useState } = React;

const PLANS = [
    {
        id: "personal",
        name: "Personal",
        price: "€5",
        period: t("/month"),
        description: t("Essential consent tracking for individuals and small sites."),
        features: [
            t("Consent audit log"),
            t("CSV export"),
            t("GDPR & CCPA compliance"),
            t("Cookie consent banner"),
            t("Email support"),
        ],
    },
    {
        id: "starter",
        name: "Starter",
        price: "€15",
        period: t("/month"),
        description: t("Full analytics platform for growing businesses."),
        features: [
            t("Everything in Personal"),
            t("Consent analytics dashboard"),
            t("Reporting + CSV export"),
            t("Cookie scanner (automatic)"),
            t("Google Consent Mode"),
            t("Email support"),
            t("Intastellar Analytics"),
        ],
    },
    {
        id: "growth",
        name: "Growth",
        price: "€30",
        period: t("/month"),
        description: t("Advanced insights for teams that need deeper analytics."),
        features: [
            t("Everything in Starter"),
            t("Advanced reporting"),
            t("Team insights"),
            t("Ad platform reconciliation"),
            t("Analytics blind spot detection"),
            t("Cost per visible consent by channel"),
            t("Priority support"),
        ],
        highlighted: true,
    },
    {
        id: "agency-pro",
        name: "Agency Pro",
        price: "€79",
        period: t("/month"),
        description: t("Multi-client management for agencies and consultancies."),
        features: [
            t("Everything in Growth"),
            t("Multi-client management"),
            t("Client-level reporting"),
            t("Unlimited domains"),
            t("Client workspaces"),
            t("Dedicated support"),
        ],
    },
];

export default function SubscriptionPlans() {
    document.title = t("Choose your plan") + " | Intastellar Consents";

    const [selectedPlan, setSelectedPlan] = useState(null);
    const [checkout, setCheckout] = useState(null);
    const [error, setError] = useState(null);
    const [initiating, setInitiating] = useState(null);

    const companyName = (() => { try { return JSON.parse(appStorage.getItem("organisation"))?.name; } catch { return null; } })();
    const email = Authentication.getUserId();
    const fullName = (() => {
        try {
            const name = JSON.parse(appStorage.getItem("globals"))?.profile?.name;
            return [name?.first_name, name?.last_name].filter(Boolean).join(" ") || null;
        } catch { return null; }
    })();

    const handleSelectPlan = async (plan) => {
        setError(null);
        setInitiating(plan.id);
        try {
            const res = await fetch(API.CreateCheckoutSession.url, {
                method: "POST",
                headers: {
                    "Authorization": Authentication.getToken(),
                    "Organisation": Authentication.getOrganisation(),
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    planId: plan.id,
                    returnPath: window.location.pathname,
                }),
            });
            if (res.status === 409) {
                setError(t("This organisation already has a subscription. Reload the page, or manage it under Settings."));
                return;
            }
            if (!res.ok) throw new Error("Server error");
            const data = await res.json();
            if (!data.clientSecret || !data.publishableKey) throw new Error("Invalid response");
            setSelectedPlan(plan);
            setCheckout(data);
        } catch {
            setError(t("Unable to start checkout. Please try again or contact support."));
        } finally {
            setInitiating(null);
        }
    };

    const handleBack = () => {
        setSelectedPlan(null);
        setCheckout(null);
        setError(null);
    };

    // In the Analytics area, only offer plans that include Intastellar
    // Analytics (Starter and up) — the same rule the tier gates use.
    const inAnalytics = window.location.pathname.startsWith("/analytics");
    const minTier = inAnalytics ? FEATURE_TIERS.analytics_dashboard : null;
    const visiblePlans = minTier ? PLANS.filter(plan => TIERS[plan.id] >= TIERS[minTier]) : PLANS;
    // Split at {company} so the company name stays bold in every language.
    const [issuedBefore, issuedAfter] = t("Subscriptions and invoices issued to {company}.").split("{company}");

    if (selectedPlan && checkout) {
        return <CheckoutForm clientSecret={checkout.clientSecret} publishableKey={checkout.publishableKey} trialDays={checkout.trialDays || 0} plan={selectedPlan} companyName={companyName} fullName={fullName} email={email} onBack={handleBack} />;
    }

    return (
        <div className="plans-page">
            <header className="plans-header">
                <h1 className="plans-title">
                    {companyName ? t("Choose a plan for {company}", { company: companyName }) : t("Choose a plan")}
                </h1>
                <p className="plans-subtitle">
                    {inAnalytics ? t("Intastellar Analytics is included from Starter.") + " " : ""}{t("Every plan starts with a 30-day free trial — your card is only charged when the trial ends, and you can cancel any time before.")}
                </p>
            </header>

            {error && <p className="plans-error" role="alert">{error}</p>}

            <div className="plans-grid" style={{ "--plans-columns": visiblePlans.length }}>
                {visiblePlans.map(plan => (
                    <article
                        key={plan.id}
                        className={`plan-card${plan.highlighted ? " plan-card--highlighted" : ""}`}
                    >
                        <div className="plan-card__top">
                            <div className="plan-card__labels">
                                {plan.highlighted && (
                                    <span className="plan-card__popular">{t("Most popular")}</span>
                                )}
                                {plan.badge && (
                                    <span className="plan-card__badge">{plan.badge}</span>
                                )}
                            </div>
                            <h2 className="plan-card__name">{plan.name}</h2>
                            <div className="plan-card__pricing">
                                <span className="plan-card__price">{plan.price}</span>
                                <span className="plan-card__period">{plan.period}</span>
                            </div>
                            <p className="plan-card__subtext">{plan.subtext || t("30-day free trial")}</p>
                            <p className="plan-card__description">{plan.description}</p>
                        </div>

                        <ul className="plan-card__features">
                            {plan.features.map((f, i) => (
                                <li key={i} className="plan-card__feature">
                                    <svg className="plan-card__check" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                                        <circle cx="8" cy="8" r="7.25" stroke="currentColor" strokeWidth="1.5" opacity=".35" />
                                        <path d="M4.5 8.5l2.5 2.5 4.5-5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                                    </svg>
                                    {f}
                                </li>
                            ))}
                        </ul>

                        <button
                            className={`plan-card__cta${plan.highlighted ? " plan-card__cta--primary" : ""}`}
                            onClick={() => handleSelectPlan(plan)}
                            disabled={initiating !== null}
                            aria-busy={initiating === plan.id}
                        >
                            {initiating === plan.id ? t("Loading…") : t("Start free trial")}
                        </button>
                    </article>
                ))}
            </div>

            <footer className="plans-footer">
                {issuedBefore}<strong>{companyName || t("your company")}</strong>{issuedAfter}
                {email ? <> {t("Billing contact: {email}.", { email })}</> : null}
            </footer>
        </div>
    );
}
