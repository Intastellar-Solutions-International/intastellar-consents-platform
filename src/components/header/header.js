import { OrganisationContext, DomainContext } from "../../App";
import "./header.css";
import logo from "./logo.svg";
import Fetch from "../../Functions/fetch";
import API from "../../API/api";
import Authentication from "../../Authentication/Auth";
import Select from "../SelectInput/Selector";
import IntastellarAccounts from "../IntastellarAccounts/IntastellarAccounts";
import {
    parseHandleFromPath,
    decodeDomainPathSegment,
    navigateWithDomain,
} from "../../Functions/domainPathSegments.js";
import punycode from "punycode";

const { useState, useEffect, useContext, useMemo } = React;
const useHistory = window.ReactRouterDOM.useHistory;
const useLocation = window.ReactRouterDOM.useLocation;

function domainLabelForHeader(pathname, globalDomain) {
    const pathHandle = parseHandleFromPath(pathname);
    if (pathHandle != null) {
        const decoded = decodeDomainPathSegment(pathHandle);
        return decoded != null ? decoded : "combined view";
    }
    if (/\/[^/]+\/(?:reports|dashboard)(?:\/|$)/.test(pathname)) {
        return "combined view";
    }
    return globalDomain || "combined view";
}

/*
 * Hydrate the dropdown from the existing `domains` localStorage key
 * — a string array of allowed domain names persisted whenever this
 * header (or any other surface) successfully fetches domains. Using
 * the same cache the rest of the app already maintains avoids a
 * second source of truth.
 *
 * The cache stores names only (no `installed`/`icon` metadata), so
 * we synthesise minimal row objects shaped like the API response and
 * re-prepend the "combined view" entry the cache strips out before
 * persisting.
 */
function readCachedDomains() {
    try {
        const raw = localStorage.getItem("domains");
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed) || parsed.length === 0) return null;
        const names = parsed.filter(
            (n) => typeof n === "string" && n && n !== "combined view"
        );
        if (names.length === 0) return null;
        return [
            { domain: "combined view", installed: null, lastedVisited: null },
            ...names.map((domain) => ({
                domain,
                installed: null,
                lastedVisited: null,
            })),
        ];
    } catch {
        return null;
    }
}

/*
 * Resolve the platform key whose `getDomains` we should call. Routes
 * like /experiments or /settings aren't platform namespaces in the
 * API map, so the literal first path segment can't be used blindly.
 * We fall back to the platform stored at login time (or "gdpr" as a
 * last resort) whenever the derived key doesn't expose getDomains.
 */
function resolveDomainsPlatformKey(API) {
    const fromPath = window.location.pathname.split("/")[1];
    if (fromPath && API[fromPath]?.getDomains?.url) return fromPath;
    const fromStorage = localStorage.getItem("platform");
    if (fromStorage && API[fromStorage]?.getDomains?.url) return fromStorage;
    return "gdpr";
}

export default function Header(props) {

    const [Organisation, setOrganisation] = useContext(OrganisationContext);
    const [globalDomain, setGlobalDomain] = useContext(DomainContext);
    const location = useLocation();
    const displayDomain = useMemo(
        () => domainLabelForHeader(location.pathname, globalDomain),
        [location.pathname, globalDomain]
    );
    const [currentDomain, setCurrentDomain] = useState(displayDomain);
    const profileImage = JSON.parse(localStorage.getItem("globals"))?.user?.avatar;
    let domainList = null;
    const history = useHistory();
    const platformId = props.id || window.location.pathname.split("/").filter(Boolean)[0] || "gdpr";
    const [allOrganisations, setallOrganisations] = useState(null);
    /*
     * Bootstrap order on first render:
     *   1. props.domains (passed by App.js once it has fetched)
     *   2. cached domains from localStorage (so a hard reload on
     *      /experiments still has a populated dropdown before any
     *      network round-trip resolves)
     *   3. null — the placeholder selector renders briefly until the
     *      effect below repopulates from the API.
     */
    const [domains, setDomains] = useState(
        () => props.domains || readCachedDomains()
    );
    const [viewUserProfile, setViewUserProfile] = useState(false);
    const Platform = (localStorage.getItem("platform") == "gdpr") ? "Intastellar Consents | CMP" : "Ferry Booking";


    useEffect(() => {
        setCurrentDomain(displayDomain);
    }, [displayDomain]);

    useEffect(() => {

        Fetch(API.settings.getOrganisation.url, API.settings.getOrganisation.method, API.settings.getOrganisation.headers, JSON.stringify({
            organisationMember: Authentication.getUserId()
        })).then((data) => {
            if (data === "Err_Login_Expired") {
                localStorage.removeItem("globals");
                window.location.href = "/login";
                return;
            }

            if (JSON.parse(localStorage.getItem("globals")).organisation == null) {
                JSON.parse(localStorage.getItem("globals")).organisation = data;
            }
            setallOrganisations(data);
        });

        const platformKey = resolveDomainsPlatformKey(API);
        const domainsApi = API[platformKey]?.getDomains;
        if (!domainsApi?.url) {
            return;
        }
        Fetch(domainsApi.url, domainsApi.method, domainsApi.headers).then((data) => {
            if (data === "Err_Login_Expired") {
                localStorage.removeItem("globals");
                window.location.href = "/login";
                return;
            }

            if (data?.error == "Err_No_Domains") {

            } else if (Array.isArray(data)) {
                data.unshift({ domain: "combined view", installed: null, lastedVisited: null });
                data?.map((d) => {
                    return punycode.toUnicode(d.domain);
                }).filter((d) => {
                    return d !== undefined && d !== "" && d !== "undefined.";
                });
                setDomains(data);

                const allowedDomains = data?.map((d) => {
                    return punycode.toUnicode(d.domain);
                }).filter((d) => {
                    return d !== undefined && d !== "" && d !== "undefined." && d !== "combined view";
                });

                localStorage.setItem("domains", JSON.stringify(allowedDomains));

            }
        });
    }, []);


    domainList = domains?.map((d) => {
        return {
            icon: d.icon || null,
            name: punycode.toUnicode(d.domain)
        }
    })

    return (
        <>
            <header className="dashboard-header">
                <div className="dashboard-profile">
                    <section className="logo-selector-container">
                        <section className="logo_container">
                            <button className="menu" onClick={() => {
                                document.querySelector(".navOverlay").classList.toggle("expand");
                            }}>
                                <div className="menu-bar"></div>
                                <div className="menu-bar"></div>
                                <div className="menu-bar"></div>
                            </button>
                            <img className="dashboard-logo" src={logo} alt="Intastellar Solutions Logo" />
                        </section>
                        <section className="company_container">
                            {(allOrganisations && Organisation) ? (
                                <Select
                                    defaultValue={Organisation}
                                    onChange={(e) => {
                                        setOrganisation(e);
                                        localStorage.setItem("organisation", e);
                                        window.location.reload();
                                    }}
                                    items={allOrganisations}
                                    align="right"
                                />
                            ) : (
                                <div className="selector selector--placeholder" aria-hidden="true" />
                            )}
                            {domains && currentDomain ? (
                                <Select
                                    key={`domain-${location.pathname}`}
                                    defaultValue={currentDomain}
                                    onChange={(e) => {
                                        const domain = JSON.parse(e).name;
                                        setCurrentDomain(domain);
                                        setGlobalDomain(domain);
                                        navigateWithDomain(history, platformId, domain, location.pathname);
                                    }}
                                    items={domainList}
                                    align="left"
                                />
                            ) : (
                                <div className="selector selector--placeholder" aria-hidden="true" />
                            )}
                        </section>
                    </section>
                    <div className="flex profileImage">
                        <img src={profileImage} className="content-img" onClick={() => setViewUserProfile(!viewUserProfile)} />
                    </div>
                </div>
                {(viewUserProfile) ? <IntastellarAccounts profile={{
                    image: profileImage,
                    name: JSON.parse(localStorage.getItem("globals"))?.user?.name?.firstName,
                    email: JSON.parse(localStorage.getItem("globals"))?.user?.email,
                }} setIsOpen={setViewUserProfile} /> : null}
            </header>
        </>
    )
}
