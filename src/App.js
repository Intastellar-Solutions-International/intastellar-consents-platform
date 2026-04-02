const { useState, useEffect, useRef, createContext } = React;
const Router = window.ReactRouterDOM.BrowserRouter;
const Route = window.ReactRouterDOM.Route;
const Switch = window.ReactRouterDOM.Switch;
const Redirect = window.ReactRouterDOM.Redirect;
const punycode = require("punycode");

import "./App.css";
import Header from "./Components/Header/header";
import Footer from "./Components/Footer";
import Login from "./Login/Login";
import Signup from "./Login/Signup";
import Nav from "./Components/Header/Nav";
import CookiesDashboard from "./Pages/Dashboard/CookiesDashboard";
import API from "./API/api";
import Dashboard from "./Pages/Dashboard/Dashboard.js";
import FerryDashboard from "./Pages/Dashboard/ferry/Dashboard.js";
import Websites from "./Pages/Domains/index.js";
import Settings from "./Pages/Settings";
import CreateOrganisation from "./Pages/Settings/CreateOrganisation";
import AddUser from "./Pages/Settings/AddUser";
import ViewOrg from "./Pages/Settings/ViewOrganisations";
import ViewUsers from "./Pages/Settings/ViewUsers";
import DomainDashbord from "./Pages/Dashboard/DomainDashbord";
import Fetch from "./Functions/fetch";
import AddDomain from "./Components/AddDomain/AddDomain";
import SettingsAddDomain from "./Pages/Settings/AddDomain";
import Authentication from "./Authentication/Auth";
import UserConsents from "./Pages/UserConsents/UserConsents";
import Reports from "./Pages/Reports/Reports";
import ErrorBoundary from "./Components/Error/ErrorBoundary";
import Countries from "./Pages/Countries/Countries";
import BugReport from "./Components/BugReport/BugReport";
import PlatformSelector from "./Components/PlatformSelector/PlatformSelector";
import Crawler from "./Components/Crawler";
import UserAgents from "./Pages/Reports/UserAgents";
import UserPreferences from "./Pages/Settings/UserPreferences";
import StripePayment from "./Components/StripePayment";
import Compare from "./Pages/Reports/Compare";
import BlacklistIp from "./Pages/Settings/BlacklistIp";
import CreateUser from "./Pages/Settings/CreateUser";
import AuthLogin from "./Login/AuthLogin";
import Experiments from "./Pages/Experiments/Experiments";
import AuditReport from "./Pages/Reports/AuditReport";


/* import { IntastellarConsentProvider } from "@intastellar/consents-react"; */

export const OrganisationContext = createContext(localStorage.getItem("organisation"));
export const AllOrg = createContext(null);
export const DomainContext = createContext(null);

export default function App() {
    const [dashboardView, setDashboardView] = useState((localStorage.getItem("platform")) ? localStorage.getItem("platform") : null);
    const [organisation, setOrganisation] = useState((localStorage.getItem("organisation")) ? localStorage.getItem("organisation") : null);
    const [currentDomain, setCurrentDomain] = useState("combined view");
    const [handle, setHandle] = useState(null);
    const [organisations, setOrganisations] = useState(null);
    const [domains, setDomains] = useState(null);
    const [domainError, setDomainError] = useState(false);
    const [subscriptionStatus, setSubscriptionStatus] = useState({
        status: "loading",
        loading: false,
        subscription: null
    });
    const [id, setId] = useState((localStorage.getItem("platform")) ? localStorage.getItem("platform") : null);
    const navigate = window.ReactRouterDOM.useHistory();

    useEffect(() => {
        const globals = localStorage.getItem("globals");
        const path = window.location.pathname;
        if (!globals && path !== "/login" && path !== "/") {
            window.location.replace("/login");
        }
    }, []);

    if (localStorage.getItem("globals") != null) {
        const path = window.location.pathname;
        // Only redirect if id is present and not already on dashboard
        if ((path === "/login" || path === "/") && id) {
            if (!path.startsWith("/" + id + "/dashboard")) {
                window.location.replace("/" + id + "/dashboard");
                return null;
            }
        }

        /* const [domainLoadings, data, error, getUpdated] = useFetch(null, API[id].getDomains.url, API[id].getDomains.method, API[id].getDomains.headers); */
        useEffect(() => {
            Fetch(API.settings.getOrganisation.url, API.settings.getOrganisation.method, API.settings.getOrganisation.headers, JSON.stringify({
                organisationMember: Authentication.getUserId()
            })).then((data) => {
                if (data === "Err_Login_Expired") {
                    localStorage.removeItem("globals");
                    navigate.push("/login");
                    return;
                }
                setOrganisations(data);
            });

            Fetch(API.Subscription.url, API.Subscription.method, API.Subscription.headers, JSON.stringify({
                organization: Authentication.getOrganisation()
            })).then((data) => {
                if (data === "Err_Login_Expired") {
                    localStorage.removeItem("globals");
                    navigate.push("/login");
                    return;
                }
                setSubscriptionStatus(data);
                localStorage.setItem("subscription", JSON.stringify(data));
            });

            if (id && API[id]?.getDomains?.url != undefined) {
                Fetch(API[id].getDomains.url, API[id].getDomains.method, API[id].getDomains.headers).then((data) => {
                    if (data.error === "Err_No_Domains" || data.length === 0) {
                        setDomainError(true);
                    } else {
                        data.unshift({ domain: "combined view", installed: null, lastedVisited: null });
                        data?.map((d) => {
                            return punycode.toUnicode(d.domain);
                        }).filter((d) => {
                            return d !== undefined && d !== "" && d !== "undefined.";
                        });
                        setDomains(data);
                    }
                });
            }

        }, []);

        if (id === null && organisations) {
            return (
                <>
                    <PlatformSelector setId={setId} platforms={organisations} />
                    {/* <BugReport /> */}
                </>
            )
        } else {
            return (
                <>
                    <Router>
                        <OrganisationContext.Provider value={[organisation, setOrganisation]}>
                            <DomainContext.Provider value={[currentDomain, setCurrentDomain]}>
                                <ErrorBoundary>
                                    {id && window.location.pathname != "/" || window.location.pathname != "/login" ? <>
                                        <Header handle={handle} id={id} />
                                        {/* <BugReport /> */}
                                    </> : null}
                                </ErrorBoundary>
                                <div className="main-grid">
                                    {
                                        id && window.location.pathname != "/" || window.location.pathname != "/login" ? <Nav /> : null
                                    }
                                    <Switch>
                                        <Route path="/:id/dashboard" exact>
                                            <div style={{ flex: "1" }}>
                                                {
                                                (localStorage.getItem("subscription") == null || JSON.parse(localStorage.getItem("subscription")).subscription == "none" && JSON.parse(localStorage.getItem("organisation")).id  != 1) ? <StripePayment userId={Authentication.getUserId} /> : <>
                                                        {domainError ? <AddDomain /> :
                                                            (id == "gdpr") ? <Dashboard dashboardView={dashboardView} setDashboardView={setDashboardView} /> : <FerryDashboard />
                                                        }
                                                </>}
                                            </div>
                                        </Route>
                                        <Route path='/:id/view/:handle'>
                                            {
                                                (localStorage.getItem("subscription") == null || JSON.parse(localStorage.getItem("subscription")).subscription == "none" && JSON.parse(localStorage.getItem("organisation")).id  != 1) ? <StripePayment userId={Authentication.getUserId} /> : <>
                                                    <ErrorBoundary>
                                                        {domainError ? <AddDomain /> : <DomainDashbord setHandle={setHandle} />}
                                                    </ErrorBoundary>
                                                </>
                                            }
                                        </Route>
                                        <Route path="/signup" exact>
                                            <ErrorBoundary>
                                                <Signup />
                                            </ErrorBoundary>
                                        </Route>
                                        <Route path="/:id/domains" exact>
                                            {
                                                (localStorage.getItem("subscription") == null || JSON.parse(localStorage.getItem("subscription")).subscription == "none" && JSON.parse(localStorage.getItem("organisation")).id  != 1) ? <StripePayment userId={Authentication.getUserId} /> : <ErrorBoundary>
                                                    {domainError ? <AddDomain /> : <Websites />}
                                                </ErrorBoundary>
                                            }
                                        </Route>
                                        <Route path="/settings" exact>
                                            {
                                                <ErrorBoundary>
                                                    {domainError ? <AddDomain /> : <Settings organisations={organisations} subscriptionStatus={subscriptionStatus} />}
                                                </ErrorBoundary>
                                            }
                                        </Route>
                                        <Route path="/settings/create-organisation">
                                            {
                                                (localStorage.getItem("subscription") == null || JSON.parse(localStorage.getItem("subscription")).subscription == "none" && JSON.parse(localStorage.getItem("organisation")).id  != 1) ? <StripePayment userId={Authentication.getUserId} /> : <ErrorBoundary>
                                                    {Authentication.getOrganisationAccessStatusForOrganisation(JSON.parse(localStorage.getItem("organisation")).id) === "admin" || Authentication.getOrganisationAccessStatusForOrganisation(JSON.parse(localStorage.getItem("organisation")).id) === "super-admin" ? <CreateOrganisation /> : <p>No access</p>}
                                                </ErrorBoundary>
                                            }
                                        </Route>
                                        <Route path="/settings/add-user">
                                            <ErrorBoundary>
                                                {Authentication.getOrganisationAccessStatusForOrganisation(JSON.parse(localStorage.getItem("organisation")).id) === "admin" || Authentication.getOrganisationAccessStatusForOrganisation(JSON.parse(localStorage.getItem("organisation")).id) === "super-admin" ? <AddUser /> : <p>No access</p>}
                                            </ErrorBoundary>
                                        </Route>
                                        <Route path="/settings/add-domain">
                                            {localStorage.getItem("subscription") == null || JSON.parse(localStorage.getItem("subscription")).subscription == "none" && JSON.parse(localStorage.getItem("organisation")).id  != 1 ? <StripePayment userId={Authentication.getUserId} /> :
                                                <ErrorBoundary>
                                                    {Authentication.getOrganisationAccessStatusForOrganisation(JSON.parse(localStorage.getItem("organisation")).id) === "admin" 
                                                    || Authentication.getOrganisationAccessStatusForOrganisation(JSON.parse(localStorage.getItem("organisation")).id) === "super-admin"
                                                    || Authentication.getOrganisationAccessStatusForOrganisation(JSON.parse(localStorage.getItem("organisation")).id) === "manager" ?
                                                        <SettingsAddDomain /> : <p>No access</p>}
                                                </ErrorBoundary>
                                            }
                                        </Route>
                                        <Route path="/settings/view-users">
                                            <ErrorBoundary>
                                                {domainError ? <AddDomain /> : <ViewUsers />}
                                            </ErrorBoundary>
                                        </Route>
                                        <Route path="/settings/view-organisations">
                                            <ErrorBoundary>
                                                {domainError ? <AddDomain /> : <ViewOrg />}
                                            </ErrorBoundary>
                                        </Route>
                                        <Route path="/settings/preferences">
                                            <ErrorBoundary>
                                                {domainError ? <AddDomain /> : <UserPreferences />}
                                            </ErrorBoundary>
                                        </Route>
                                        <Route path="/:id/cookies" exact>
                                            {
                                                (localStorage.getItem("subscription") == null || JSON.parse(localStorage.getItem("subscription")).subscription == "none" && JSON.parse(localStorage.getItem("organisation")).id  != 1) ? <StripePayment userId={Authentication.getUserId} /> : <ErrorBoundary>
                                                    {domainError ? <AddDomain /> : <CookiesDashboard />}
                                                </ErrorBoundary>
                                            }
                                        </Route>
                                        <Route path="/:id/reports" exact>
                                            {
                                                (localStorage.getItem("subscription") == null || JSON.parse(localStorage.getItem("subscription")).subscription == "none" && JSON.parse(localStorage.getItem("organisation")).id  != 1) ? <StripePayment userId={Authentication.getUserId} /> : <ErrorBoundary>
                                                    {domainError ? <AddDomain /> : <Reports organisations={organisations} />}
                                                </ErrorBoundary>
                                            }
                                        </Route>
                                        <Route path="/:id/reports/user-consents">
                                            {
                                                (localStorage.getItem("subscription") == null || JSON.parse(localStorage.getItem("subscription")).subscription == "none" && JSON.parse(localStorage.getItem("organisation")).id  != 1) ? <StripePayment userId={Authentication.getUserId} /> : <ErrorBoundary>
                                                    {domainError ? <AddDomain /> : <UserConsents organisations={organisations} />}
                                                </ErrorBoundary>
                                            }
                                        </Route>
                                        <Route path="/:id/reports/audit-report">
                                            {
                                                (localStorage.getItem("subscription") == null || JSON.parse(localStorage.getItem("subscription")).subscription == "none" && JSON.parse(localStorage.getItem("organisation")).id  != 1) ? <StripePayment userId={Authentication.getUserId} /> : <ErrorBoundary>
                                                    {domainError ? <AddDomain /> : <AuditReport organisations={organisations} />}
                                                </ErrorBoundary>
                                            }
                                        </Route>
                                        <Route path="/dashboard">
                                            <ErrorBoundary>
                                                <PlatformSelector setId={setId} platforms={JSON.parse(localStorage.getItem("globals"))?.access?.type} />
                                            </ErrorBoundary>
                                        </Route>
                                        <Router path="/login" exact>
                                            <Login />
                                        </Router>
                                        <Route path="/auth-login">
                                            <AuthLogin />
                                        </Route>
                                        <Route path="/settings/config-gdpr"></Route>
                                        <Route path="/settings/blacklist-ip">
                                            <ErrorBoundary>
                                                {Authentication.getOrganisationAccessStatusForOrganisation(JSON.parse(localStorage.getItem("organisation")).id) === "admin" || Authentication.getOrganisationAccessStatusForOrganisation(JSON.parse(localStorage.getItem("organisation")).id) === "super-admin" ? <BlacklistIp /> : null}
                                            </ErrorBoundary>
                                        </Route>
                                        <Route path="/settings/create-user">
                                            <ErrorBoundary>
                                                {Authentication.getOrganisationAccessStatusForOrganisation(JSON.parse(localStorage.getItem("organisation")).id) === "admin" || Authentication.getOrganisationAccessStatusForOrganisation(JSON.parse(localStorage.getItem("organisation")).id) === "super-admin" ? <CreateUser /> : null}
                                            </ErrorBoundary>
                                        </Route>
                                        <Route path="/" exact>
                                            <ErrorBoundary>
                                                <Login />
                                            </ErrorBoundary>
                                        </Route>
                                        <Route path="/:id/compare" exact>
                                            {
                                                (localStorage.getItem("subscription") == null || JSON.parse(localStorage.getItem("subscription")).subscription == "none" && JSON.parse(localStorage.getItem("organisation")).id  != 1) ? <StripePayment userId={Authentication.getUserId} /> : <ErrorBoundary>
                                                    {domainError ? <AddDomain /> : <Compare organisations={organisations} domains={domains} />}
                                                </ErrorBoundary>
                                            }
                                        </Route>
                                        <Route path="/experiments" exact>
                                            <ErrorBoundary>
                                                <Experiments />
                                            </ErrorBoundary>
                                        </Route>
                                        <Route path="/experiments/:experimentId">
                                            <ErrorBoundary>
                                                <Experiments />
                                            </ErrorBoundary>
                                        </Route>
                                        <Redirect to="/login" />
                                    </Switch>
                                </div>
                                <ErrorBoundary>
                                    <Footer />
                                </ErrorBoundary>
                            </DomainContext.Provider>
                        </OrganisationContext.Provider>
                        <Route path="/check">
                            <div className="cookieCheckContainer">
                                <img src="https://www.intastellarsolutions.com/assets/logos/intastellar-new-planet.svg" className="crawlerPage-logo" />
                                <Crawler />
                                <footer>
                                    <p>Powered by Intastellar Cookie Consents</p>
                                    <p>&copy; {new Date().getFullYear()} Intastellar Solutions, International</p>
                                </footer>
                            </div>
                        </Route>
                    </Router>
                </>
            )
        }
    } else {
        return (
            <Router>
                <Switch>
                    <Route path="/login" exact>
                        <Login />
                    </Route>
                    <Route path="/" exact>
                        <ErrorBoundary>
                            <Login />
                        </ErrorBoundary>
                    </Route>
                    <Route path="/check">
                        <div className="cookieCheckContainer">
                            <img src="https://www.intastellarsolutions.com/assets/logos/intastellar-new-planet.svg" className="crawlerPage-logo" />
                            <Crawler />
                            <footer>
                                <p>Powered by Intastellar Cookie Consents</p>
                                <p>&copy; {new Date().getFullYear()} Intastellar Solutions, International</p>
                            </footer>
                        </div>
                    </Route>
                </Switch>
            </Router>
        )
    }
}