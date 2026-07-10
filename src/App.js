import punycode from "punycode";
import "./App.css";
import Header from "./Components/Header/header";
import Footer from "./Components/Footer";
import Login from "./Login/Login";
import Signup from "./Login/Signup";
import Nav from "./Components/Header/Nav";
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
import SubscriptionPlans from "./Components/SubscriptionPlans";
import Compare from "./Pages/Reports/Compare";
import BlacklistIp from "./Pages/Settings/BlacklistIp";
import CreateUser from "./Pages/Settings/CreateUser";
import AuthLogin from "./Login/AuthLogin";
import Experiments from "./Pages/Experiments/Experiments";
import AuditReport from "./Pages/Reports/AuditReport";
import MarketingReport from "./Pages/Reports/MarketingReport";
import CompliancePage from "./Pages/Compliance";
import LoadingSpinner from "./Components/LoadingSpinner/LoadingSpinner";
import Workspaces from "./Pages/Settings/Workspaces";
import TierGate from "./Components/TierGate";
import DevTierSwitcher from "./Components/DevTierSwitcher";
import { canAccess } from "./Functions/tier.js";
import appStorage from './Functions/storage.js';

const { useState, useEffect, useRef, createContext } = React;
const Router = window.ReactRouterDOM.BrowserRouter;
const Route = window.ReactRouterDOM.Route;
const Switch = window.ReactRouterDOM.Switch;
const Redirect = window.ReactRouterDOM.Redirect;

/* import { IntastellarConsentProvider } from "@intastellar/consents-react"; */

export const OrganisationContext = createContext(appStorage.getItem("organisation"));
export const AllOrg = createContext(null);
export const DomainContext = createContext(null);
export const WorkspaceContext = createContext([null, () => {}]);

export default function App() {
    const [dashboardView, setDashboardView] = useState((localStorage.getItem("platform")) ? localStorage.getItem("platform") : null);
    const [organisation, setOrganisation] = useState((appStorage.getItem("organisation")) ? appStorage.getItem("organisation") : null);
    const [activeWorkspace, setActiveWorkspace] = useState(() => {
        try {
            const s = localStorage.getItem("current_workspace");
            return s ? JSON.parse(s) : null;
        } catch { return null; }
    });
    const [currentDomain, setCurrentDomain] = useState("combined view");
    const [organisations, setOrganisations] = useState(null);
    const [domains, setDomains] = useState(null);
    const [domainError, setDomainError] = useState(false);
    const [subscriptionStatus, setSubscriptionStatus] = useState(() => {
        const cached = appStorage.getItem("subscription");
        if (cached) {
            try { return JSON.parse(cached); } catch { /* ignore */ }
        }
        return { status: "loading", loading: true, subscription: null };
    });
    const [id, setId] = useState((localStorage.getItem("platform")) ? localStorage.getItem("platform") : null);
    const navigate = window.ReactRouterDOM.useHistory();

    useEffect(() => {
        const globals = appStorage.getItem("globals");
        const path = window.location.pathname;
        const isApiRoute = path === "/api" || path.startsWith("/api/");
        if (!globals && path !== "/login" && path !== "/" && !isApiRoute) {
            window.location.replace("/login");
        }
    }, []);

    if (appStorage.getItem("globals") != null) {
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
                    appStorage.removeItem("globals");
                    navigate.push("/login");
                    return;
                }
                setOrganisations(data);
            });

            Fetch(API.Subscription.url, API.Subscription.method, API.Subscription.headers, JSON.stringify({
                organization: Authentication.getOrganisation()
            })).then((data) => {
                if (data === "Err_Login_Expired") {
                    appStorage.removeItem("globals");
                    navigate.push("/login");
                    return;
                }
                setSubscriptionStatus(data);
                appStorage.setItem("subscription", JSON.stringify(data));
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
                        /*
                         * Mirror the names-only cache the header
                         * relies on to hydrate its dropdown
                         * synchronously on reload — even on routes
                         * (e.g. /experiments) whose API namespace
                         * doesn't expose getDomains and would
                         * otherwise leave the selector blank until a
                         * refetch resolves. We deliberately reuse the
                         * existing `domains` key rather than
                         * introducing a parallel one.
                         */
                        try {
                            const allowedDomains = data
                                .map((d) => punycode.toUnicode(d.domain))
                                .filter(
                                    (d) =>
                                        d &&
                                        d !== "undefined." &&
                                        d !== "combined view"
                                );
                            localStorage.setItem(
                                "domains",
                                JSON.stringify(allowedDomains)
                            );
                        } catch {
                            /* quota / privacy mode — ignore */
                        }
                    }
                });
            }

        }, []);

        const subscriptionLoading = subscriptionStatus?.subscription == null;
        const orgId = (() => { try { return JSON.parse(appStorage.getItem("organisation"))?.id; } catch { return null; } })();
        const needsPayment = !subscriptionLoading && subscriptionStatus?.subscription === "none" && Number(orgId) !== 1;

        if (id === null && organisations) {
            return (
                <>
                    <PlatformSelector setId={setId} platforms={organisations} />
                    <BugReport />
                </>
            )
        } else {
            return (
                <>
                    <Router>
                        <OrganisationContext.Provider value={[organisation, setOrganisation]}>
                            <WorkspaceContext.Provider value={[activeWorkspace, setActiveWorkspace]}>
                            <DomainContext.Provider value={[currentDomain, setCurrentDomain]}>
                                <ErrorBoundary>
                                    {id && window.location.pathname != "/" || window.location.pathname != "/login" ? <>
                                        <Header id={id} />
                                        <BugReport />
                                    </> : null}
                                </ErrorBoundary>
                                <div className="main-grid">
                                    {
                                        id && window.location.pathname != "/" || window.location.pathname != "/login" ? <Nav /> : null
                                    }
                                    <Switch>
                                        <Route path="/:id/dashboard" exact>
                                            <div style={{ flex: "1" }}>
                                                {subscriptionLoading ? <LoadingSpinner /> : needsPayment ? <SubscriptionPlans /> : !canAccess('starter') ? <TierGate minTier="starter" featureName="Analytics Dashboard" fullPage /> : <>
                                                    {domainError ? <AddDomain /> :
                                                        (id == "gdpr") ? <Dashboard dashboardView={dashboardView} setDashboardView={setDashboardView} /> : <FerryDashboard />
                                                    }
                                                </>}
                                            </div>
                                        </Route>
                                        <Route path='/:id/view/:handle'>
                                            <div style={{ flex: "1" }}>
                                                {subscriptionLoading ? <LoadingSpinner /> : needsPayment ? <SubscriptionPlans /> : !canAccess('starter') ? <TierGate minTier="starter" featureName="Analytics Dashboard" fullPage /> : <>
                                                    {domainError ? <AddDomain /> :
                                                        (id == "gdpr") ? <Dashboard dashboardView={dashboardView} setDashboardView={setDashboardView} /> : <FerryDashboard />
                                                    }
                                                </>}
                                            </div>
                                        </Route>
                                        <Route path="/signup" exact>
                                            <ErrorBoundary>
                                                <Signup />
                                            </ErrorBoundary>
                                        </Route>
                                        <Route path="/:id/domains" exact>
                                            {
                                                subscriptionLoading ? <LoadingSpinner /> : needsPayment ? <SubscriptionPlans /> : <ErrorBoundary>
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
                                                subscriptionLoading ? <LoadingSpinner /> : needsPayment ? <SubscriptionPlans /> : <ErrorBoundary>
                                                    {Authentication.getOrganisationAccessStatusForOrganisation(JSON.parse(appStorage.getItem("organisation")).id) === "admin" || Authentication.getOrganisationAccessStatusForOrganisation(JSON.parse(appStorage.getItem("organisation")).id) === "super-admin" ? <CreateOrganisation /> : <p>No access</p>}
                                                </ErrorBoundary>
                                            }
                                        </Route>
                                        <Route path="/settings/add-user">
                                            <ErrorBoundary>
                                                {Authentication.getOrganisationAccessStatusForOrganisation(JSON.parse(appStorage.getItem("organisation")).id) === "admin" || Authentication.getOrganisationAccessStatusForOrganisation(JSON.parse(appStorage.getItem("organisation")).id) === "super-admin" ? <AddUser /> : <p>No access</p>}
                                            </ErrorBoundary>
                                        </Route>
                                        <Route path="/settings/add-domain">
                                            {subscriptionLoading ? <LoadingSpinner /> : needsPayment ? <SubscriptionPlans /> :
                                                <ErrorBoundary>
                                                    {Authentication.getOrganisationAccessStatusForOrganisation(JSON.parse(appStorage.getItem("organisation")).id) === "admin" 
                                                    || Authentication.getOrganisationAccessStatusForOrganisation(JSON.parse(appStorage.getItem("organisation")).id) === "super-admin"
                                                    || Authentication.getOrganisationAccessStatusForOrganisation(JSON.parse(appStorage.getItem("organisation")).id) === "manager" ?
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
                                        <Route path="/:id/reports/view/:handle/user-consents" exact>
                                            {subscriptionLoading ? <LoadingSpinner /> : needsPayment ? <SubscriptionPlans /> : !canAccess('personal') ? <TierGate minTier="personal" featureName="Consent Audit Log" fullPage /> : <ErrorBoundary>
                                                {domainError ? <AddDomain /> : <UserConsents organisations={organisations} />}
                                            </ErrorBoundary>}
                                        </Route>
                                        <Route path="/:id/reports/view/:handle/user-consents/:uid" exact>
                                            {subscriptionLoading ? <LoadingSpinner /> : needsPayment ? <SubscriptionPlans /> : !canAccess('personal') ? <TierGate minTier="personal" featureName="Consent Audit Log" fullPage /> : <ErrorBoundary>
                                                {domainError ? <AddDomain /> : <UserConsents organisations={organisations} />}
                                            </ErrorBoundary>}
                                        </Route>
                                        <Route path="/:id/reports/view/:handle/audit-report" exact>
                                            {subscriptionLoading ? <LoadingSpinner /> : needsPayment ? <SubscriptionPlans /> : !canAccess('personal') ? <TierGate minTier="personal" featureName="Audit Report" fullPage /> : <ErrorBoundary>
                                                {domainError ? <AddDomain /> : <AuditReport organisations={organisations} />}
                                            </ErrorBoundary>}
                                        </Route>
                                        <Route path="/:id/reports/view/:handle/marketing" exact>
                                            {subscriptionLoading ? <LoadingSpinner /> : needsPayment ? <SubscriptionPlans /> : !canAccess('growth') ? <TierGate minTier="growth" featureName="Ad Platform Reconciliation" fullPage /> : <ErrorBoundary>
                                                {domainError ? <AddDomain /> : <MarketingReport organisations={organisations} />}
                                            </ErrorBoundary>}
                                        </Route>
                                        <Route path="/:id/reports/view/:handle/compliance" exact>
                                            {subscriptionLoading ? <LoadingSpinner /> : needsPayment ? <SubscriptionPlans /> : !canAccess('starter') ? <TierGate minTier="starter" featureName="Compliance Reports" fullPage /> : <ErrorBoundary>
                                                {domainError ? <AddDomain /> : <CompliancePage />}
                                            </ErrorBoundary>}
                                        </Route>
                                        <Route path="/:id/reports/compliance" exact>
                                            {subscriptionLoading ? <LoadingSpinner /> : needsPayment ? <SubscriptionPlans /> : !canAccess('starter') ? <TierGate minTier="starter" featureName="Compliance Reports" fullPage /> : <ErrorBoundary>
                                                {domainError ? <AddDomain /> : <CompliancePage />}
                                            </ErrorBoundary>}
                                        </Route>
                                        <Route path="/:id/reports/view/:handle" exact>
                                            {subscriptionLoading ? <LoadingSpinner /> : needsPayment ? <SubscriptionPlans /> : !canAccess('personal') ? <TierGate minTier="personal" featureName="Reports" fullPage /> : <ErrorBoundary>
                                                {domainError ? <AddDomain /> : <Reports organisations={organisations} />}
                                            </ErrorBoundary>}
                                        </Route>
                                        <Route path="/:id/reports" exact>
                                            {subscriptionLoading ? <LoadingSpinner /> : needsPayment ? <SubscriptionPlans /> : !canAccess('personal') ? <TierGate minTier="personal" featureName="Reports" fullPage /> : <ErrorBoundary>
                                                {domainError ? <AddDomain /> : <Reports organisations={organisations} />}
                                            </ErrorBoundary>}
                                        </Route>
                                        <Route path="/:id/reports/user-consents" exact>
                                            {subscriptionLoading ? <LoadingSpinner /> : needsPayment ? <SubscriptionPlans /> : !canAccess('personal') ? <TierGate minTier="personal" featureName="Consent Audit Log" fullPage /> : <ErrorBoundary>
                                                {domainError ? <AddDomain /> : <UserConsents organisations={organisations} />}
                                            </ErrorBoundary>}
                                        </Route>
                                        <Route path="/:id/reports/user-consents/:uid" exact>
                                            {subscriptionLoading ? <LoadingSpinner /> : needsPayment ? <SubscriptionPlans /> : !canAccess('personal') ? <TierGate minTier="personal" featureName="Consent Audit Log" fullPage /> : <ErrorBoundary>
                                                {domainError ? <AddDomain /> : <UserConsents organisations={organisations} />}
                                            </ErrorBoundary>}
                                        </Route>
                                        <Route path="/:id/reports/audit-report" exact>
                                            {subscriptionLoading ? <LoadingSpinner /> : needsPayment ? <SubscriptionPlans /> : !canAccess('personal') ? <TierGate minTier="personal" featureName="Audit Report" fullPage /> : <ErrorBoundary>
                                                {domainError ? <AddDomain /> : <AuditReport organisations={organisations} />}
                                            </ErrorBoundary>}
                                        </Route>
                                        <Route path="/:id/reports/marketing" exact>
                                            {subscriptionLoading ? <LoadingSpinner /> : needsPayment ? <SubscriptionPlans /> : !canAccess('growth') ? <TierGate minTier="growth" featureName="Ad Platform Reconciliation" fullPage /> : <ErrorBoundary>
                                                {domainError ? <AddDomain /> : <MarketingReport organisations={organisations} />}
                                            </ErrorBoundary>}
                                        </Route>
                                        <Route path="/dashboard">
                                            <ErrorBoundary>
                                                <PlatformSelector setId={setId} platforms={JSON.parse(appStorage.getItem("globals"))?.access?.type} />
                                            </ErrorBoundary>
                                        </Route>
                                        <Route path="/login" exact>
                                            <Login />
                                        </Route>
                                        <Route path="/auth-login">
                                            <AuthLogin />
                                        </Route>
                                        <Route path="/settings/config-gdpr"></Route>
                                        <Route path="/settings/blacklist-ip">
                                            <ErrorBoundary>
                                                {Authentication.getOrganisationAccessStatusForOrganisation(JSON.parse(appStorage.getItem("organisation")).id) === "admin" || Authentication.getOrganisationAccessStatusForOrganisation(JSON.parse(appStorage.getItem("organisation")).id) === "super-admin" ? <BlacklistIp /> : null}
                                            </ErrorBoundary>
                                        </Route>
                                        <Route path="/settings/workspaces">
                                            <ErrorBoundary>
                                                {(() => {
                                                    const orgRaw = appStorage.getItem("organisation");
                                                    let org = null;
                                                    try { org = JSON.parse(orgRaw); } catch { /* ignore */ }
                                                    const role = org?.id ? Authentication.getOrganisationAccessStatusForOrganisation(org.id) : null;
                                                    const isAdminRole = role === "admin" || role === "super-admin";
                                                    if (!canAccess('agency-pro')) return <TierGate minTier="agency-pro" featureName="Client Workspaces" fullPage />;
                                                    return isAdminRole ? <Workspaces /> : <p style={{ padding: "40px", color: "#999" }}>Admin access required.</p>;
                                                })()}
                                            </ErrorBoundary>
                                        </Route>
                                        <Route path="/settings/plans" exact>
                                            <ErrorBoundary>
                                                <SubscriptionPlans />
                                            </ErrorBoundary>
                                        </Route>
                                        <Route path="/settings/create-user">
                                            <ErrorBoundary>
                                                {Authentication.getOrganisationAccessStatusForOrganisation(JSON.parse(appStorage.getItem("organisation")).id) === "admin" || Authentication.getOrganisationAccessStatusForOrganisation(JSON.parse(appStorage.getItem("organisation")).id) === "super-admin" ? <CreateUser /> : null}
                                            </ErrorBoundary>
                                        </Route>
                                        <Route path="/" exact>
                                            <ErrorBoundary>
                                                <Login />
                                            </ErrorBoundary>
                                        </Route>
                                        <Route path="/:id/compare" exact>
                                            {subscriptionLoading ? <LoadingSpinner /> : needsPayment ? <SubscriptionPlans /> : !canAccess('growth') ? <TierGate minTier="growth" featureName="Portfolio Benchmark" fullPage /> : <ErrorBoundary>
                                                {domainError ? <AddDomain /> : <Compare organisations={organisations} domains={domains} />}
                                            </ErrorBoundary>}
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
                                        <Route path="/api" render={() => null} />
                                        <Redirect to="/login" />
                                    </Switch>
                                </div>
                                <ErrorBoundary>
                                    <Footer />
                                </ErrorBoundary>
                            </DomainContext.Provider>
                            </WorkspaceContext.Provider>
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
                    <DevTierSwitcher />
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
                    <Route path="/api" render={() => null} />
                </Switch>
            </Router>
        )
    }
}