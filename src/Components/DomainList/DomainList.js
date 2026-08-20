import "./DomainList.css";
import Button from "../Button/Button";
const { useState, useEffect, useRef, createContext } = React;
import SuccessWindow from "../SuccessWindow/index";
import API from "../../API/api";
import Fetch from "../../Functions/fetch";
import appStorage, { getOrg } from '../../Functions/storage.js';
export default function DomainList(props) {
    const currentDomain = props.domains;
    const [viewPopUp, setPopUp] = useState(false);
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState(false);
    const [errorMessage, setErrorMessage] = useState("");
    const [savedDomains, setSavedDomains] = useState([]);
    const organisationId = getOrg()?.id ?? null;
    const [organisation, setOrganisation] = useState(getOrg());
    const [privacyPolicyLink, setPrivacyPolicyLink] = useState("");
    const [choosenColor, setChoosenColor] = useState("red");
    const [bannerArrangement, setBannerArrangement] = useState("ltr");
    const [companyLogo, setCompanyLogo] = useState("");
    const [requiredCookies, setRequiredCookies] = useState("");
    const [partnerDomain, setPartnerDomain] = useState("");

    function saveDomains(domains, settings) {

        Fetch(API.settings.addDomain.url, API.settings.addDomain.method,
            API.settings.addDomain.headers,
            JSON.stringify(
                {
                    organisationId: organisationId,
                    domains: domains,
                    settings: settings
                }
            )
        ).then(
            re => {
                if (re === "success") {
                    setSuccess(true);
                    setPopUp(true);
                    setSavedDomains(domains);
                } else if (re === "error") {
                    setError(true);
                    setErrorMessage("Something went wrong, please try again later");
                } else {
                    setError(true);
                }
            }
        ).catch(setErrorMessage);

    }

    function copy(item) {
        navigator.clipboard.writeText(item);
    }

    if (currentDomain.length > 0 && privacyPolicyLink.length === 0) {
        setPrivacyPolicyLink("https://" + currentDomain[0] + "/privacy-policy")
    }

    return <>
        <div className="domain-list">
            {
                (success) ? <>
                    <h2>Domains added</h2>
                    <p>You have added the following domains to your Organisation: {organisation.name}</p>
                    <ul>
                        {
                            savedDomains.map((domain, index) => {
                                return <li key={index}>{domain}</li>
                            }
                            )}
                    </ul>
                    <p>Now you can add these two lines of code into your head tag of your Website:</p>
                    <button className="copyCta" onClick={() => {
                        copy(
                            `<script src='https://downloads.intastellarsolutions.com/cookieconsents/${savedDomains[0]}/config.js'></script>
                            <script src='https://consents.cdn.intastellarsolutions.com/uc.js'></script>`
                        )
                    }}>Copy</button>
                    <div style={{ clear: "both" }}></div>
                    {
                        `<script src='https://downloads.intastellarsolutions.com/cookieconsents/${savedDomains[0]}/config.js'></script> \n
                        <script src='https://consents.cdn.intastellarsolutions.com/uc.js'></script>`
                    }
                </> : <>
                    <h2>Domains to be added</h2>
                    <p>You´re about to add these domains to your Organisation: {organisation.name}</p>
                    <ul>
                        {
                            currentDomain.map((domain, index) => {
                                return <li key={index}>{domain}</li>
                            })
                        }
                    </ul>
                    <p>Now you have added your domains to your Organisation, you need to implement the Intastellar Cookie Consents on your website. If not already.</p>
                    <h4>Edit the file below</h4>
                    <p>You can edit the following attributes:</p>
                    <ul>
                        <li>policy_link: The link to your privacy policy</li>
                        <li>color: The color of the banner</li>
                        <li>arrange: The arrangement of the banner</li>
                        <li>logo: The logo of your company, this needs to be a link to the logo</li>
                        <li>requiredCookies: The cookies that are required for your website to function. (Please do not remove the brackets)</li>
                        <li>partnerDomain: The domains of your partners (Please do not remove the brackets)</li>
                    </ul>
                    <code className="editor">
                        Privacy Policy Link: <span contentEditable={true}
                            suppressContentEditableWarning={true} onInput={(e) => {
                                setPrivacyPolicyLink(e.target.innerHTML);
                            }} className="editable">"{(currentDomain[0] != undefined) ? `https://${currentDomain[0]}/privacy-policy` : null}"</span>
                        <br />
                        Color: <span contentEditable={true} suppressContentEditableWarning={true} className="editable" onInput={(e) => {
                            setChoosenColor(e.target.innerHTML);
                        }}>"{choosenColor}"</span>
                        <br />
                        Banner Arrangement: <span contentEditable={true} suppressContentEditableWarning={true} className="editable" onInput={(e) => {
                            setBannerArrangement(e.target.innerHTML);
                        }}>"{bannerArrangement}"</span>
                        <br />
                        Company Logo: <span contentEditable={true} suppressContentEditableWarning={true} className="editable" onInput={(e) => {
                            setCompanyLogo(e.target.innerHTML);
                        }}>"{companyLogo}"</span>
                        <br />
                        Required Cookies: <span contentEditable={true} suppressContentEditableWarning={true} className="editable" onInput={(e) => {
                            setRequiredCookies(e.target.innerHTML);
                        }}>[{requiredCookies}]</span>
                        <br />
                        Partner Domains: <span contentEditable={true} suppressContentEditableWarning={true} className="editable" onInput={(e) => {
                            setPartnerDomain(e.target.innerHTML);
                        }}>[{partnerDomain}]</span>
                        <br />
                    </code>
                    {/* window.INTA = &#123; <br />
                            policy_link: <span contentEditable={true}
                                    suppressContentEditableWarning={true} onInput={() => {
                                setPrivacyPolicyLink(document.querySelector(".editable").innerHTML);
                            }} className="editable">"{(currentDomain[0] != undefined) ? `https://${currentDomain[0]}/privacy-policy` : null}"</span> <br />
                            settings: &#123; <br />
                                company: "{organisation.name}", <br />
                                color: <span contentEditable={true} suppressContentEditableWarning={true} className="editable">"{choosenColor}"</span>, <br />
                                arrange: <span contentEditable={true} suppressContentEditableWarning={true} className="editable">"{bannerArrangement}"</span>, <br />
                                logo: <span contentEditable={true} suppressContentEditableWarning={true} className="editable">"{companyLogo}"</span>, <br />
                                requiredCookies:
                                    <span contentEditable={true} suppressContentEditableWarning={true} className="editable">[{requiredCookies}]</span>
                                , <br />
                                partnerDomain:
                                    <span contentEditable={true} suppressContentEditableWarning={true} className="editable">[{partnerDomain}]</span>
                                <br />&#125; <br />
                        &#125; <br />
                    </code> */}

                    <p>Read the full documentation under: <a href="https://developers.intastellarsolutions.com/cookie-solutions/docs/js-docs" target="_blank">https://developers.intastellarsolutions.com/cookie-solutions/docs/js-docs</a></p>
                </>
            }
            {
                (currentDomain.length > 0 && !success) ? <Button text="Save" onClick={() => {

                    saveDomains(currentDomain, `
                    <script>
                        window.INTA = {
                            policy_link: '${privacyPolicyLink}',
                            settings: {
                                company: '${organisation.name}',
                                color: '${choosenColor}',
                                arrange: '${bannerArrangement}',
                                logo: '${companyLogo}',
                                requiredCookies: '${requiredCookies}',
                                partnerDomain: '${savedDomains}',
                            }
                        }
                    </>`);
                }} />
                    : ""
            }
        </div>
        {
            (viewPopUp && success) ?
                <SuccessWindow message={
                    <>
                        <h2>Success!</h2>
                        <p>You have added the following domains:</p>
                        <ul>
                            {
                                savedDomains.map((domain, index) => {
                                    return <li key={index}>{domain}</li>
                                })
                            }
                        </ul>
                    </>
                } />
                : null
        }
    </>
}