import logo from "../Header/logo.svg"
const { useState, useEffect, useRef, useContext } = React;
import Authentication from "../../Authentication/Auth";
import "./Style/Stripe.css";
import { AllOrg } from "../../App";
import Select from "../SelectInput/Selector";

export default function StripePayment(props) {
    document.title = "Choose your Plan | Intastellar Consents";
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
            <div className="content">
                <h1>Choose a plan for {companyName}</h1>
                <stripe-pricing-table
                    class="stripe-price-table"
                    pricing-table-id={pricingTableId}
                    publishable-key={publishableKey}
                    customer-email={props.userId() || null}
                    client-reference-id={Authentication.getOrganisation() || null}
                >
                </stripe-pricing-table>
                <p>Subscriptions and invoices will be issued to {companyName}</p>
                <p>Billing contact: {props.userId() || "your email address"}.</p>
            </div>
        </>
    )
}