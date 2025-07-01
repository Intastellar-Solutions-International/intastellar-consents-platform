import IntastellarLogo from "../Header/logo.png";
const { useState, useEffect, useRef, useContext } = React;
import Authentication from "../../Authentication/Auth";
import "./Style/Stripe.css";
import { AllOrg } from "../../App";
import Select from "../SelectInput/Selector";

export default function StripePayment(props) {
    document.title = "Choose your Plan | Intastellar Consents";
    const [allOrganisations, setallOrganisations] = useContext(AllOrg);
    const companyName = JSON.parse(localStorage.getItem("organisation"))?.name;

    const isProduction = process.env.NODE_ENV === "production";

    const pricingTableId = isProduction
        ? process.env.STRIPE_PRICING_TABLE_ID_LIVE
        : process.env.STRIPE_PRICING_TABLE_ID_TEST;

    const publishableKey = isProduction
        ? process.env.STRIPE_PUBLISHABLE_KEY_LIVE
        : process.env.STRIPE_PUBLISHABLE_KEY_TEST;

    return (
        <>
            <header className="payment-header">
                <img src={IntastellarLogo} alt="Intastellar Consents" className="logo" />
                Intastellar Consents
            </header>
            <div className="content">
                <h2>{companyName}</h2>
                <Select items={allOrganisations} onChange={(e) => {
                    localStorage.setItem("organisation", e);
                    window.location.reload();
                }} defaultValue={companyName} />
                <h1>Choose a Plan</h1>
                <p>Choose a plan that suits your needs. You´re about to select a plan for your company: {companyName}</p>
                <stripe-pricing-table
                    class="stripe-price-table"
                    pricing-table-id={pricingTableId}
                    publishable-key={publishableKey}
                    customer-email={props.userId()}
                    client-reference-id={Authentication.getOrganisation()}
                >
                </stripe-pricing-table>
            </div>
            <footer className="footer">
                <a href="https://www.intastellarsolutions.com/about/legal/terms" target="_blank">Terms of Service</a> | <a href="https://www.intastellarsolutions.com/about/legal/privacy" target="_blank">Privacy Policy</a> | <a href="https://www.intastellarsolutions.com/about/legal/subscriber-agreement">Subscriber agreement</a>
                <p>&copy; {new Date().getFullYear()} Intastellar Solutions, International. All rights reserved.</p>
            </footer>
        </>
    )
}