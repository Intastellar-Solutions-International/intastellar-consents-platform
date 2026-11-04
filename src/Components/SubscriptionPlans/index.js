import Authentication from "../../Authentication/Auth";
import CheckoutForm from "./CheckoutForm";
import "./Style/Plans.css";
import API from "../../API/api";
import appStorage from '../../Functions/storage.js';

const { useState } = React;

const PLANS = [
    {
        id: "personal",
        name: "Personal",
        price: "€5",
        period: "/month",
        description: "Essential consent tracking for individuals and small sites.",
        features: [
            "Consent audit log",
            "CSV export",
            "GDPR & CCPA compliance",
            "Cookie consent banner",
            "Email support",
        ],
    },
    {
        id: "starter",
        name: "Starter",
        price: "€15",
        period: "/month",
        description: "Full analytics platform for growing businesses.",
        features: [
            "Everything in Personal",
            "Consent analytics dashboard",
            "Reporting + CSV export",
            "Cookie scanner (automatic)",
            "Google Consent Mode",
            "Email support",
            "Intastellar Analytics",
        ],
    },
    {
        id: "growth",
        name: "Growth",
        price: "€30",
        period: "/month",
        description: "Advanced insights for teams that need deeper analytics.",
        features: [
            "Everything in Starter",
            "Advanced reporting",
            "Team insights",
            "Ad platform reconciliation",
            "Analytics blind spot detection",
            "Cost per visible consent by channel",
            "Priority support",
        ],
        highlighted: true,
    },
    {
        id: "agency-pro",
        name: "Agency Pro",
        price: "€79",
        period: "/month",
        description: "Multi-client management for agencies and consultancies.",
        features: [
            "Everything in Growth",
            "Multi-client management",
            "Client-level reporting",
            "Unlimited domains",
            "Client workspaces",
            "Dedicated support",
        ],
    },
];

export default function SubscriptionPlans() {
    document.title = "Choose your Plan | Intastellar Consents";

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
                setError("This organisation already has a subscription. Reload the page, or manage it under Settings.");
                return;
            }
            if (!res.ok) throw new Error("Server error");
            const data = await res.json();
            if (!data.clientSecret || !data.publishableKey) throw new Error("Invalid response");
            setSelectedPlan(plan);
            setCheckout(data);
        } catch {
            setError("Unable to start checkout. Please try again or contact support.");
        } finally {
            setInitiating(null);
        }
    };

    const handleBack = () => {
        setSelectedPlan(null);
        setCheckout(null);
        setError(null);
    };

    if (selectedPlan && checkout) {
        return <CheckoutForm clientSecret={checkout.clientSecret} publishableKey={checkout.publishableKey} trialDays={checkout.trialDays || 0} plan={selectedPlan} companyName={companyName} fullName={fullName} email={email} onBack={handleBack} />;
    }

    return (
        <div className="plans-page">
            <header className="plans-header">
                <h1 className="plans-title">
                    Choose a plan{companyName ? ` for ${companyName}` : ""}
                </h1>
                <p className="plans-subtitle">
                    Every plan starts with a 30-day free trial — your card is only charged when the trial ends, and you can cancel any time before.
                </p>
            </header>

            {error && <p className="plans-error" role="alert">{error}</p>}

            <div className="plans-grid">
                {PLANS.map(plan => (
                    <article
                        key={plan.id}
                        className={`plan-card${plan.highlighted ? " plan-card--highlighted" : ""}`}
                    >
                        <div className="plan-card__top">
                            <div className="plan-card__labels">
                                {plan.highlighted && (
                                    <span className="plan-card__popular">Most popular</span>
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
                            <p className="plan-card__subtext">{plan.subtext || "30-day free trial"}</p>
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
                            {initiating === plan.id ? "Loading…" : "Start free trial"}
                        </button>
                    </article>
                ))}
            </div>

            <footer className="plans-footer">
                Subscriptions and invoices issued to <strong>{companyName || "your company"}</strong>.
                {email ? <> Billing contact: {email}.</> : null}
            </footer>
        </div>
    );
}
