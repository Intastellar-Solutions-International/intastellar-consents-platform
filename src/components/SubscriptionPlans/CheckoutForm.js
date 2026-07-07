import "./Style/Plans.css";

const { useEffect, useRef } = React;

const PUBLISHABLE_KEY = process.env.NODE_ENV === "production"
    ? process.env.STRIPE_PUBLISHABLE_KEY_LIVE
    : process.env.STRIPE_PUBLISHABLE_KEY_TEST;

function getStripe() {
    if (window.Stripe) return Promise.resolve(window.Stripe(PUBLISHABLE_KEY));
    return new Promise((resolve) => {
        const script = document.createElement("script");
        script.src = "https://js.stripe.com/v3/";
        script.onload = () => resolve(window.Stripe(PUBLISHABLE_KEY));
        document.head.appendChild(script);
    });
}

export default function CheckoutForm({ clientSecret, plan, onBack }) {
    const containerRef = useRef(null);
    const checkoutRef = useRef(null);

    useEffect(() => {
        if (!clientSecret) return;
        let destroyed = false;

        getStripe().then((stripe) => {
            if (destroyed) return;
            stripe.initEmbeddedCheckout({ clientSecret }).then((checkout) => {
                if (destroyed) {
                    checkout.destroy();
                    return;
                }
                checkoutRef.current = checkout;
                if (containerRef.current) checkout.mount(containerRef.current);
            });
        });

        return () => {
            destroyed = true;
            if (checkoutRef.current) {
                checkoutRef.current.destroy();
                checkoutRef.current = null;
            }
        };
    }, [clientSecret]);

    return (
        <div className="checkout-page">
            <header className="checkout-header">
                <button className="checkout-back" onClick={onBack} type="button">
                    ← Back to plans
                </button>
                <div className="checkout-summary">
                    <h2 className="checkout-title">{plan.name}</h2>
                    <p className="checkout-price">
                        {plan.price}
                        <span className="checkout-period">{plan.period}</span>
                        {plan.subtext && <span className="checkout-subtext">{plan.subtext}</span>}
                    </p>
                </div>
            </header>
            <div ref={containerRef} className="checkout-form-container" />
        </div>
    );
}
