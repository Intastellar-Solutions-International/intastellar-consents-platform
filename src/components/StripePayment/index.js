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
                <h1>Choose a Plan</h1>
                <p>Choose a plan that suits your needs. You´re about to select a plan for your company: {companyName}</p>
                <stripe-pricing-table
                    class="stripe-price-table"
                    pricing-table-id={pricingTableId}
                    publishable-key={publishableKey}
                    customer-email={props.userId() || null}
                    client-reference-id={Authentication.getOrganisation() || null}
                >
                </stripe-pricing-table>
            </div>
        </>
    )
}