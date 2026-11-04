import "./Style/Plans.css";
import { Icon, Button } from "../UI/index.js";
import { formatDate } from "../../Functions/format.js";

const { useEffect, useRef, useState } = React;

// Must match the API version the server pins in api/_stripe.js — the
// session is created in ui_mode "elements", which this build understands.
const STRIPE_JS = "https://js.stripe.com/endive/stripe.js";

function loadStripeJs() {
    if (window.Stripe) return Promise.resolve(window.Stripe);
    return new Promise((resolve, reject) => {
        let script = document.querySelector(`script[src="${STRIPE_JS}"]`);
        if (!script) {
            script = document.createElement("script");
            script.src = STRIPE_JS;
            document.head.appendChild(script);
        }
        script.addEventListener("load", () => resolve(window.Stripe));
        script.addEventListener("error", () => reject(new Error("Stripe.js failed to load")));
    });
}

// Stripe's fields render in iframes and can't read our CSS variables, so the
// design tokens are resolved here and passed in as concrete colours.
function token(name, alpha) {
    const channels = getComputedStyle(document.documentElement).getPropertyValue(name).trim().split(/\s+/);
    if (channels.length !== 3) return undefined;
    return alpha == null ? `rgb(${channels.join(", ")})` : `rgba(${channels.join(", ")}, ${alpha})`;
}

function elementsAppearance() {
    const border = token("--c-white", 0.1);
    return {
        theme: "night",
        variables: {
            colorPrimary:         token("--c-accent"),
            colorBackground:      token("--c-bg-sunken"),
            colorText:            token("--c-text-primary"),
            colorTextSecondary:   token("--c-text-muted"),
            colorTextPlaceholder: token("--c-text-muted", 0.7),
            colorDanger:          token("--c-danger"),
            fontFamily:           "Questrial, Arial, Helvetica, sans-serif",
            fontSizeBase:         "15px",
            borderRadius:         "8px",
            spacingUnit:          "4px",
        },
        rules: {
            ".Input":              { border: `1px solid ${border}`, boxShadow: "none" },
            ".Input:focus":        { border: `1px solid ${token("--c-accent")}`, boxShadow: `0 0 0 2px ${token("--c-accent-strong", 0.5)}` },
            ".Label":              { color: token("--c-text-secondary"), fontSize: "13px" },
            ".Tab":                { border: `1px solid ${border}`, boxShadow: "none" },
            ".Tab--selected":      { borderColor: token("--c-accent"), boxShadow: `0 0 0 1px ${token("--c-accent")}` },
            ".AccordionItem":      { border: `1px solid ${border}`, boxShadow: "none" },
        },
    };
}

const FONTS = [{ cssSrc: "https://fonts.googleapis.com/css2?family=Questrial&display=swap" }];

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * The platform's own checkout window. Layout, summary, button and errors are
 * ours; address, tax ID and payment fields are Stripe Elements (card data
 * must go straight to Stripe). Stripe redirects to the session's return_url
 * after payment, where App.js confirms the subscription.
 */
export default function CheckoutForm({ clientSecret, publishableKey, trialDays = 0, plan, companyName, fullName, email, onBack }) {
    const billingRef = useRef(null);
    const taxIdRef = useRef(null);
    const paymentRef = useRef(null);
    const actionsRef = useRef(null);

    const [session, setSession] = useState(null);
    const [ready, setReady] = useState(false);
    const [loadError, setLoadError] = useState(null);
    const [submitting, setSubmitting] = useState(false);
    const [message, setMessage] = useState(null);
    // Our own fields, prefilled from the account; sent to Stripe on submit.
    const [businessName, setBusinessName] = useState(companyName || "");
    const [billingEmail, setBillingEmail] = useState(email || "");

    useEffect(() => {
        if (!clientSecret || !publishableKey) return;
        let destroyed = false;
        const mounted = [];

        loadStripeJs()
            .then((Stripe) => {
                if (destroyed) return null;
                const checkout = Stripe(publishableKey).initCheckoutElementsSdk({
                    clientSecret,
                    elementsOptions: { appearance: elementsAppearance(), fonts: FONTS },
                    defaultValues: {
                        email: email || undefined,
                        billingAddress: fullName ? { name: fullName } : undefined,
                    },
                });
                checkout.on("change", (s) => { if (!destroyed) setSession(s); });
                for (const [create, ref, options] of [
                    ["createBillingAddressElement", billingRef],
                    // The company name is our own field (updateBusinessName).
                    ["createTaxIdElement", taxIdRef, { fields: { businessName: "never" } }],
                    ["createPaymentElement", paymentRef],
                ]) {
                    const element = checkout[create](options);
                    element.mount(ref.current);
                    mounted.push(element);
                }
                return checkout.loadActions();
            })
            .then((result) => {
                if (destroyed || !result) return;
                if (result.type === "error") throw new Error(result.error?.message);
                actionsRef.current = result.actions;
                setReady(true);
            })
            .catch((err) => {
                if (!destroyed) setLoadError(err?.message || "The payment form could not be loaded.");
            });

        return () => {
            destroyed = true;
            actionsRef.current = null;
            for (const element of mounted) {
                try { element.destroy(); } catch { /* already gone */ }
            }
        };
    }, [clientSecret, publishableKey]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        const actions = actionsRef.current;
        if (!actions) return;
        const emailValue = billingEmail.trim();
        if (!EMAIL_PATTERN.test(emailValue)) {
            setMessage("Enter a valid billing email address.");
            return;
        }
        setSubmitting(true);
        setMessage(null);
        try {
            for (const update of [
                () => actions.updateEmail(emailValue),
                () => actions.updateBusinessName(businessName.trim() || null),
            ]) {
                const updated = await update();
                if (updated?.type === "error") {
                    setMessage(updated.error?.message || "Please check your billing details.");
                    return;
                }
            }
            // Only returns on an immediate error (e.g. declined card); on
            // success Stripe redirects to the return URL.
            const result = await actions.confirm();
            if (result?.type === "error") setMessage(result.error?.message || "Payment failed. Please try again.");
        } catch (err) {
            setMessage(err?.message || "Payment failed. Please try again.");
        } finally {
            setSubmitting(false);
        }
    };

    const dueToday = session?.total?.total?.amount || (trialDays ? null : plan.price);
    const canSubmit = ready && session?.canConfirm && !submitting;
    // Stripe starts the trial at confirmation, so today + trialDays is the
    // first charge date.
    const firstCharge = trialDays ? formatDate(new Date(Date.now() + trialDays * 86400000)) : null;

    return (
        <div className="checkout-page">
            <button className="checkout-back" onClick={onBack} type="button">
                <Icon name="chevron-left" /> Back to plans
            </button>

            <div className="checkout-layout">
                <aside className="checkout-summary" aria-label="Order summary">
                    <p className="checkout-summary__eyebrow">{trialDays ? `${trialDays}-day free trial` : "Subscribe to"}</p>
                    <h1 className="checkout-title">{plan.name}</h1>
                    <p className="checkout-price">
                        {plan.price}
                        <span className="checkout-period">{plan.period}</span>
                    </p>
                    <p className="checkout-summary__description">{plan.description}</p>

                    <ul className="checkout-summary__features">
                        {plan.features.map((f) => (
                            <li key={f}><Icon name="check" className="checkout-summary__check" />{f}</li>
                        ))}
                    </ul>

                    <dl className="checkout-summary__totals">
                        <div>
                            <dt>Due today</dt>
                            <dd>{dueToday || "…"}</dd>
                        </div>
                        <div className="checkout-summary__then">
                            <dt>{firstCharge ? `From ${firstCharge}` : "Then"}</dt>
                            <dd>{plan.price}{plan.period}</dd>
                        </div>
                    </dl>

                    <p className="checkout-summary__billed">
                        Billed to <strong>{companyName || "your organisation"}</strong>
                        {billingEmail.trim() ? <> · invoices sent to {billingEmail.trim()}</> : null}
                    </p>
                </aside>

                <form className="checkout-form" onSubmit={handleSubmit} noValidate>
                    {loadError ? (
                        <div className="checkout-form__alert" role="alert">
                            <Icon name="alert-triangle" />
                            <span>{loadError}</span>
                        </div>
                    ) : null}

                    <section className="checkout-form__section">
                        <h2 className="checkout-form__heading">Billing details</h2>
                        <div className="checkout-form__fields">
                            <label className="checkout-form__field">
                                <span className="checkout-form__label">Company name</span>
                                <input
                                    className="checkout-form__input"
                                    type="text"
                                    autoComplete="organization"
                                    value={businessName}
                                    onChange={(e) => setBusinessName(e.target.value)}
                                    placeholder="Leave empty if you're buying as an individual"
                                />
                            </label>
                            <label className="checkout-form__field">
                                <span className="checkout-form__label">Billing email</span>
                                <input
                                    className="checkout-form__input"
                                    type="email"
                                    autoComplete="email"
                                    required
                                    value={billingEmail}
                                    onChange={(e) => setBillingEmail(e.target.value)}
                                    aria-describedby="billing-email-hint"
                                />
                                <span id="billing-email-hint" className="checkout-form__hint">
                                    Invoices and receipts go here — e.g. your accounts team. Can differ from your login.
                                </span>
                            </label>
                        </div>
                    </section>

                    <section className="checkout-form__section">
                        <h2 className="checkout-form__heading">Billing address</h2>
                        <div ref={billingRef} />
                    </section>

                    <section className="checkout-form__section">
                        <h2 className="checkout-form__heading">Business tax ID <span className="checkout-form__optional">optional</span></h2>
                        <div ref={taxIdRef} />
                    </section>

                    <section className="checkout-form__section">
                        <h2 className="checkout-form__heading">Payment method</h2>
                        <div ref={paymentRef} />
                    </section>

                    {!ready && !loadError ? <p className="checkout-form__loading" aria-live="polite">Loading secure payment form…</p> : null}

                    {message ? (
                        <div className="checkout-form__alert" role="alert">
                            <Icon name="alert-triangle" />
                            <span>{message}</span>
                        </div>
                    ) : null}

                    <Button type="submit" variant="primary" className="checkout-form__submit" disabled={!canSubmit} loading={submitting}>
                        {submitting ? "Processing…" : trialDays ? `Start ${trialDays}-day free trial` : `Subscribe · ${dueToday || plan.price}`}
                    </Button>

                    <p className="checkout-form__legal">
                        <Icon name="shield-check" />
                        <span>
                            {trialDays
                                ? `You won't be charged today. Your card is charged ${plan.price} on ${firstCharge}, then every month, unless you cancel before under Settings → Manage billing.`
                                : "Your subscription renews automatically; cancel any time under Settings → Manage billing."}
                            {" "}Payments are processed securely by Stripe — card details never reach our servers.
                        </span>
                    </p>
                </form>
            </div>
        </div>
    );
}
