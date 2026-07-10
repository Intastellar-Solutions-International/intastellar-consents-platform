import Authentication from "../../Authentication/Auth";
import CheckoutForm from "./CheckoutForm";
import "./Style/Plans.css";
import { PrimaryHost } from "../../API/host";

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
        price: "€39",
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
    const [clientSecret, setClientSecret] = useState(null);
    const [error, setError] = useState(null);
    const [initiating, setInitiating] = useState(null);

    const companyName = (() => { try { return JSON.parse(localStorage.getItem("organisation"))?.name; } catch { return null; } })();
    const email = Authentication.getUserId();

    const handleSelectPlan = async (plan) => {
        setError(null);
        setInitiating(plan.id);
        try {
            const res = await fetch(`${PrimaryHost}/payment/subscription/v1/create-checkout-session`, {
                method: "POST",
                headers: {
                    "Authorization": Authentication.getToken(),
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    planId: plan.id,
                    organisationId: Authentication.getOrganisation(),
                    email,
                }),
            });
            if (!res.ok) throw new Error("Server error");
            const data = await res.json();
            if (!data.clientSecret) throw new Error("Invalid response");
            setSelectedPlan(plan);
            setClientSecret(data.clientSecret);
        } catch {
            setError("Unable to start checkout. Please try again or contact support.");
        } finally {
            setInitiating(null);
        }
    };

    const handleBack = () => {
        setSelectedPlan(null);
        setClientSecret(null);
        setError(null);
    };

    if (selectedPlan && clientSecret) {
        return <CheckoutForm clientSecret={clientSecret} plan={selectedPlan} onBack={handleBack} />;
    }

    return (
        <div className="plans-page">
            <header className="plans-header">
                <h1 className="plans-title">
                    Choose a plan{companyName ? ` for ${companyName}` : ""}
                </h1>
                <p className="plans-subtitle">
                    All plans include a free cookie consent banner. Upgrade to unlock the full analytics platform.
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
                            {plan.subtext && (
                                <p className="plan-card__subtext">{plan.subtext}</p>
                            )}
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
                            {initiating === plan.id ? "Loading…" : "Get started"}
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
