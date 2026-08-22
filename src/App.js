import punycode from "punycode";
import "./App.css";
import Header from "./Components/Header/header";
import Footer from "./Components/Footer";
import Login from "./Login/Login";
import Signup from "./Login/Signup";
import Nav from "./Components/Header/Nav";
import AnalyticsSideNav from "./Components/Header/AnalyticsSideNav";
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
import ReconcilePage from "./Pages/Reports/MarketingReport/ReconcilePage";
import CompliancePage from "./Pages/Compliance";
import LoadingSpinner from "./Components/LoadingSpinner/LoadingSpinner";
import Workspaces from "./Pages/Settings/Workspaces";
import JurisdictionConfig from "./Pages/Settings/Jurisdiction";
import LegalBasis from "./Pages/Settings/LegalBasis";
import ROPA from "./Pages/Settings/ROPA";
import ROPAEntry from "./Pages/Settings/ROPA/ROPAEntry";
import DSR from "./Pages/DSR";
import DSRDetail from "./Pages/DSR/DSRDetail";
import AdConnectionsSettings from "./Pages/Settings/AdConnections";
import AnalyticsScriptSettings from "./Pages/Settings/AnalyticsScript";
import SiteAnalytics from "./Pages/Analytics";
import AnalyticsAudience from "./Pages/Analytics/Audience.js";
import AnalyticsAcquisition from "./Pages/Analytics/Acquisition.js";
import AnalyticsConsent from "./Pages/Analytics/Consent.js";
import AnalyticsHeatmap from "./Pages/Analytics/Heatmap.js";
import AnalyticsRecordings, { AnalyticsRecordingDetail } from "./Pages/Analytics/Recordings.js";
import AnalyticsBots from "./Pages/Analytics/Bots.js";
import AnalyticsUserFlow from "./Pages/Analytics/UserFlow.js";
import AnalyticsConversionsOverview from "./Pages/Analytics/ConversionsOverview.js";
import PageExperiments from "./Pages/Analytics/PageExperiments.js";
import PageExperimentEditor from "./Pages/Analytics/PageExperimentEditor.js";
import PageExperimentVariantDetail from "./Pages/Analytics/PageExperimentVariantDetail.js";
import AnalyticsAdSpend from "./Pages/Analytics/AdSpend.js";
import ConversionAttribution from "./Pages/Analytics/ConversionAttribution.js";
import AnalyticsGoogleAnalytics from "./Pages/Analytics/GoogleAnalytics.js";
import AnalyticsSearchConsole from "./Pages/Analytics/SearchConsole.js";
import AnalyticsCohorts from "./Pages/Analytics/Cohorts.js";
import AnalyticsAlerts from "./Pages/Analytics/AlertConfigs.js";
import AnalyticsSavedReports from "./Pages/Analytics/SavedReports.js";
import AnalyticsReportBuilder from "./Pages/Analytics/ReportBuilder.js";
import AnalyticsReportView from "./Pages/Analytics/ReportView.js";
import CookieDatabase from "./Pages/CookieDatabase";
import TierGate from "./Components/TierGate";
import DevTierSwitcher from "./Components/DevTierSwitcher";
import { canAccess } from "./Functions/tier.js";
import appStorage, { getOrg } from './Functions/storage.js';

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
                user: Authentication.getUserId(),
                org_id: getOrg()?.id
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

        const orgId = getOrg()?.id;
        const isDevOrg = Number(orgId) === 1;
        const hasNoSubscription = subscriptionStatus?.subscription === "none"
            || (typeof subscriptionStatus?.message === "string" && subscriptionStatus.message.includes("Subscription not found"));
        const subscriptionLoading = !isDevOrg && !hasNoSubscription && subscriptionStatus?.subscription == null;
        const needsPayment = !isDevOrg && !subscriptionLoading && hasNoSubscription;

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
                                        id && window.location.pathname != "/" || window.location.pathname != "/login" ? <>
                                            <Nav />
                                            <AnalyticsSideNav />
                                        </> : null
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
                                        <Route path="/analytics/:handle/audience" exact>
                                            {subscriptionLoading ? <LoadingSpinner /> : needsPayment ? <SubscriptionPlans /> : !canAccess('starter') ? <TierGate minTier="starter" featureName="Audience Analytics" fullPage /> : <ErrorBoundary>
                                                <AnalyticsAudience />
                                            </ErrorBoundary>}
                                        </Route>
                                        <Route path="/analytics/audience" exact>
                                            {subscriptionLoading ? <LoadingSpinner /> : needsPayment ? <SubscriptionPlans /> : !canAccess('starter') ? <TierGate minTier="starter" featureName="Audience Analytics" fullPage /> : <ErrorBoundary>
                                                <AnalyticsAudience />
                                            </ErrorBoundary>}
                                        </Route>
                                        <Route path="/analytics/:handle/acquisition" exact>
                                            {subscriptionLoading ? <LoadingSpinner /> : needsPayment ? <SubscriptionPlans /> : !canAccess('starter') ? <TierGate minTier="starter" featureName="Acquisition Analytics" fullPage /> : <ErrorBoundary>
                                                <AnalyticsAcquisition />
                                            </ErrorBoundary>}
                                        </Route>
                                        <Route path="/analytics/acquisition" exact>
                                            {subscriptionLoading ? <LoadingSpinner /> : needsPayment ? <SubscriptionPlans /> : !canAccess('starter') ? <TierGate minTier="starter" featureName="Acquisition Analytics" fullPage /> : <ErrorBoundary>
                                                <AnalyticsAcquisition />
                                            </ErrorBoundary>}
                                        </Route>
                                        <Route path="/analytics/:handle/consent" exact>
                                            {subscriptionLoading ? <LoadingSpinner /> : needsPayment ? <SubscriptionPlans /> : !canAccess('starter') ? <TierGate minTier="starter" featureName="Consent Analytics" fullPage /> : <ErrorBoundary>
                                                <AnalyticsConsent />
                                            </ErrorBoundary>}
                                        </Route>
                                        <Route path="/analytics/consent" exact>
                                            {subscriptionLoading ? <LoadingSpinner /> : needsPayment ? <SubscriptionPlans /> : !canAccess('starter') ? <TierGate minTier="starter" featureName="Consent Analytics" fullPage /> : <ErrorBoundary>
                                                <AnalyticsConsent />
                                            </ErrorBoundary>}
                                        </Route>
                                        <Route path="/analytics/:handle/heatmap" exact>
                                            {subscriptionLoading ? <LoadingSpinner /> : needsPayment ? <SubscriptionPlans /> : !canAccess('starter') ? <TierGate minTier="starter" featureName="Heatmap Analytics" fullPage /> : <ErrorBoundary>
                                                <AnalyticsHeatmap />
                                            </ErrorBoundary>}
                                        </Route>
                                        <Route path="/analytics/heatmap" exact>
                                            {subscriptionLoading ? <LoadingSpinner /> : needsPayment ? <SubscriptionPlans /> : !canAccess('starter') ? <TierGate minTier="starter" featureName="Heatmap Analytics" fullPage /> : <ErrorBoundary>
                                                <AnalyticsHeatmap />
                                            </ErrorBoundary>}
                                        </Route>
                                        <Route path="/analytics/:handle/recordings/:recordingId" exact>
                                            {subscriptionLoading ? <LoadingSpinner /> : needsPayment ? <SubscriptionPlans /> : !canAccess('growth') ? <TierGate minTier="growth" featureName="Session Recordings" fullPage /> : <ErrorBoundary>
                                                <AnalyticsRecordingDetail />
                                            </ErrorBoundary>}
                                        </Route>
                                        <Route path="/analytics/:handle/recordings" exact>
                                            {subscriptionLoading ? <LoadingSpinner /> : needsPayment ? <SubscriptionPlans /> : !canAccess('growth') ? <TierGate minTier="growth" featureName="Session Recordings" fullPage /> : <ErrorBoundary>
                                                <AnalyticsRecordings />
                                            </ErrorBoundary>}
                                        </Route>
                                        <Route path="/analytics/recordings" exact>
                                            {subscriptionLoading ? <LoadingSpinner /> : needsPayment ? <SubscriptionPlans /> : !canAccess('growth') ? <TierGate minTier="growth" featureName="Session Recordings" fullPage /> : <ErrorBoundary>
                                                <AnalyticsRecordings />
                                            </ErrorBoundary>}
                                        </Route>
                                        <Route path="/analytics/:handle/bots" exact>
                                            {subscriptionLoading ? <LoadingSpinner /> : needsPayment ? <SubscriptionPlans /> : !canAccess('starter') ? <TierGate minTier="starter" featureName="Bot Traffic" fullPage /> : <ErrorBoundary>
                                                <AnalyticsBots />
                                            </ErrorBoundary>}
                                        </Route>
                                        <Route path="/analytics/bots" exact>
                                            {subscriptionLoading ? <LoadingSpinner /> : needsPayment ? <SubscriptionPlans /> : !canAccess('starter') ? <TierGate minTier="starter" featureName="Bot Traffic" fullPage /> : <ErrorBoundary>
                                                <AnalyticsBots />
                                            </ErrorBoundary>}
                                        </Route>
                                        <Route path="/analytics/:handle/user-flow" exact>
                                            {subscriptionLoading ? <LoadingSpinner /> : needsPayment ? <SubscriptionPlans /> : !canAccess('growth') ? <TierGate minTier="growth" featureName="User Flow" fullPage /> : <ErrorBoundary>
                                                <AnalyticsUserFlow />
                                            </ErrorBoundary>}
                                        </Route>
                                        <Route path="/analytics/user-flow" exact>
                                            {subscriptionLoading ? <LoadingSpinner /> : needsPayment ? <SubscriptionPlans /> : !canAccess('growth') ? <TierGate minTier="growth" featureName="User Flow" fullPage /> : <ErrorBoundary>
                                                <AnalyticsUserFlow />
                                            </ErrorBoundary>}
                                        </Route>
                                        <Route path="/analytics/:handle/conversions/:section?" exact>
                                            {subscriptionLoading ? <LoadingSpinner /> : needsPayment ? <SubscriptionPlans /> : !canAccess('starter') ? <TierGate minTier="starter" featureName="Conversions" fullPage /> : <ErrorBoundary>
                                                <AnalyticsConversionsOverview />
                                            </ErrorBoundary>}
                                        </Route>
                                        <Route path="/analytics/conversions/:section?" exact>
                                            {subscriptionLoading ? <LoadingSpinner /> : needsPayment ? <SubscriptionPlans /> : !canAccess('starter') ? <TierGate minTier="starter" featureName="Conversions" fullPage /> : <ErrorBoundary>
                                                <AnalyticsConversionsOverview />
                                            </ErrorBoundary>}
                                        </Route>
                                        <Route path="/analytics/:handle/page-experiments" exact>
                                            {subscriptionLoading ? <LoadingSpinner /> : needsPayment ? <SubscriptionPlans /> : !canAccess('growth') ? <TierGate minTier="growth" featureName="Page Experiments" fullPage /> : <ErrorBoundary>
                                                <PageExperiments />
                                            </ErrorBoundary>}
                                        </Route>
                                        <Route path="/analytics/page-experiments" exact>
                                            {subscriptionLoading ? <LoadingSpinner /> : needsPayment ? <SubscriptionPlans /> : !canAccess('growth') ? <TierGate minTier="growth" featureName="Page Experiments" fullPage /> : <ErrorBoundary>
                                                <PageExperiments />
                                            </ErrorBoundary>}
                                        </Route>
                                        <Route path="/analytics/:handle/page-experiments/:testId" exact>
                                            {subscriptionLoading ? <LoadingSpinner /> : needsPayment ? <SubscriptionPlans /> : !canAccess('growth') ? <TierGate minTier="growth" featureName="Page Experiments" fullPage /> : <ErrorBoundary>
                                                <PageExperimentEditor />
                                            </ErrorBoundary>}
                                        </Route>
                                        <Route path="/analytics/:handle/page-experiments/:testId/variants/:variantId" exact>
                                            {subscriptionLoading ? <LoadingSpinner /> : needsPayment ? <SubscriptionPlans /> : !canAccess('growth') ? <TierGate minTier="growth" featureName="Page Experiments" fullPage /> : <ErrorBoundary>
                                                <PageExperimentVariantDetail />
                                            </ErrorBoundary>}
                                        </Route>
                                        <Route path="/analytics/:handle/marketing" exact>
                                            {subscriptionLoading ? <LoadingSpinner /> : needsPayment ? <SubscriptionPlans /> : !canAccess('growth') ? <TierGate minTier="growth" featureName="Channel Analytics" fullPage /> : <ErrorBoundary>
                                                {domainError ? <AddDomain /> : <MarketingReport organisations={organisations} />}
                                            </ErrorBoundary>}
                                        </Route>
                                        <Route path="/analytics/marketing" exact>
                                            {subscriptionLoading ? <LoadingSpinner /> : needsPayment ? <SubscriptionPlans /> : !canAccess('growth') ? <TierGate minTier="growth" featureName="Channel Analytics" fullPage /> : <ErrorBoundary>
                                                {domainError ? <AddDomain /> : <MarketingReport organisations={organisations} />}
                                            </ErrorBoundary>}
                                        </Route>
                                        <Route path="/analytics/:handle/ad-spend" exact>
                                            {subscriptionLoading ? <LoadingSpinner /> : needsPayment ? <SubscriptionPlans /> : !canAccess('growth') ? <TierGate minTier="growth" featureName="Ad Spend" fullPage /> : <ErrorBoundary>
                                                <AnalyticsAdSpend />
                                            </ErrorBoundary>}
                                        </Route>
                                        <Route path="/analytics/ad-spend" exact>
                                            {subscriptionLoading ? <LoadingSpinner /> : needsPayment ? <SubscriptionPlans /> : !canAccess('growth') ? <TierGate minTier="growth" featureName="Ad Spend" fullPage /> : <ErrorBoundary>
                                                <AnalyticsAdSpend />
                                            </ErrorBoundary>}
                                        </Route>
                                        <Route path="/analytics/:handle/attribution" exact>
                                            {subscriptionLoading ? <LoadingSpinner /> : needsPayment ? <SubscriptionPlans /> : !canAccess('growth') ? <TierGate minTier="growth" featureName="Conversion Attribution" fullPage /> : <ErrorBoundary>
                                                <ConversionAttribution />
                                            </ErrorBoundary>}
                                        </Route>
                                        <Route path="/analytics/attribution" exact>
                                            {subscriptionLoading ? <LoadingSpinner /> : needsPayment ? <SubscriptionPlans /> : !canAccess('growth') ? <TierGate minTier="growth" featureName="Conversion Attribution" fullPage /> : <ErrorBoundary>
                                                <ConversionAttribution />
                                            </ErrorBoundary>}
                                        </Route>
                                        <Route path="/analytics/:handle/google-analytics" exact>
                                            {subscriptionLoading ? <LoadingSpinner /> : needsPayment ? <SubscriptionPlans /> : !canAccess('growth') ? <TierGate minTier="growth" featureName="Google Analytics" fullPage /> : <ErrorBoundary>
                                                <AnalyticsGoogleAnalytics />
                                            </ErrorBoundary>}
                                        </Route>
                                        <Route path="/analytics/google-analytics" exact>
                                            {subscriptionLoading ? <LoadingSpinner /> : needsPayment ? <SubscriptionPlans /> : !canAccess('growth') ? <TierGate minTier="growth" featureName="Google Analytics" fullPage /> : <ErrorBoundary>
                                                <AnalyticsGoogleAnalytics />
                                            </ErrorBoundary>}
                                        </Route>
                                        <Route path="/analytics/:handle/search-console" exact>
                                            {subscriptionLoading ? <LoadingSpinner /> : needsPayment ? <SubscriptionPlans /> : !canAccess('growth') ? <TierGate minTier="growth" featureName="Search Console" fullPage /> : <ErrorBoundary>
                                                <AnalyticsSearchConsole />
                                            </ErrorBoundary>}
                                        </Route>
                                        <Route path="/analytics/search-console" exact>
                                            {subscriptionLoading ? <LoadingSpinner /> : needsPayment ? <SubscriptionPlans /> : !canAccess('growth') ? <TierGate minTier="growth" featureName="Search Console" fullPage /> : <ErrorBoundary>
                                                <AnalyticsSearchConsole />
                                            </ErrorBoundary>}
                                        </Route>
                                        <Route path="/analytics/:handle/cohorts" exact>
                                            {subscriptionLoading ? <LoadingSpinner /> : needsPayment ? <SubscriptionPlans /> : !canAccess('starter') ? <TierGate minTier="starter" featureName="Retention Cohorts" fullPage /> : <ErrorBoundary>
                                                <AnalyticsCohorts />
                                            </ErrorBoundary>}
                                        </Route>
                                        <Route path="/analytics/cohorts" exact>
                                            {subscriptionLoading ? <LoadingSpinner /> : needsPayment ? <SubscriptionPlans /> : !canAccess('starter') ? <TierGate minTier="starter" featureName="Retention Cohorts" fullPage /> : <ErrorBoundary>
                                                <AnalyticsCohorts />
                                            </ErrorBoundary>}
                                        </Route>
                                        <Route path="/analytics/:handle/alerts" exact>
                                            {subscriptionLoading ? <LoadingSpinner /> : needsPayment ? <SubscriptionPlans /> : !canAccess('starter') ? <TierGate minTier="starter" featureName="Analytics Alerts" fullPage /> : <ErrorBoundary>
                                                <AnalyticsAlerts />
                                            </ErrorBoundary>}
                                        </Route>
                                        <Route path="/analytics/alerts" exact>
                                            {subscriptionLoading ? <LoadingSpinner /> : needsPayment ? <SubscriptionPlans /> : !canAccess('starter') ? <TierGate minTier="starter" featureName="Analytics Alerts" fullPage /> : <ErrorBoundary>
                                                <AnalyticsAlerts />
                                            </ErrorBoundary>}
                                        </Route>
                                        <Route path="/analytics/:handle/reports/:reportId/view" exact>
                                            {subscriptionLoading ? <LoadingSpinner /> : needsPayment ? <SubscriptionPlans /> : !canAccess('starter') ? <TierGate minTier="starter" featureName="Custom Reports" fullPage /> : <ErrorBoundary>
                                                <AnalyticsReportView />
                                            </ErrorBoundary>}
                                        </Route>
                                        <Route path="/analytics/reports/:reportId/view" exact>
                                            {subscriptionLoading ? <LoadingSpinner /> : needsPayment ? <SubscriptionPlans /> : !canAccess('starter') ? <TierGate minTier="starter" featureName="Custom Reports" fullPage /> : <ErrorBoundary>
                                                <AnalyticsReportView />
                                            </ErrorBoundary>}
                                        </Route>
                                        <Route path="/analytics/:handle/reports/new" exact>
                                            {subscriptionLoading ? <LoadingSpinner /> : needsPayment ? <SubscriptionPlans /> : !canAccess('starter') ? <TierGate minTier="starter" featureName="Custom Reports" fullPage /> : <ErrorBoundary>
                                                <AnalyticsReportBuilder />
                                            </ErrorBoundary>}
                                        </Route>
                                        <Route path="/analytics/reports/new" exact>
                                            {subscriptionLoading ? <LoadingSpinner /> : needsPayment ? <SubscriptionPlans /> : !canAccess('starter') ? <TierGate minTier="starter" featureName="Custom Reports" fullPage /> : <ErrorBoundary>
                                                <AnalyticsReportBuilder />
                                            </ErrorBoundary>}
                                        </Route>
                                        <Route path="/analytics/:handle/reports/:reportId" exact>
                                            {subscriptionLoading ? <LoadingSpinner /> : needsPayment ? <SubscriptionPlans /> : !canAccess('starter') ? <TierGate minTier="starter" featureName="Custom Reports" fullPage /> : <ErrorBoundary>
                                                <AnalyticsReportBuilder />
                                            </ErrorBoundary>}
                                        </Route>
                                        <Route path="/analytics/reports/:reportId" exact>
                                            {subscriptionLoading ? <LoadingSpinner /> : needsPayment ? <SubscriptionPlans /> : !canAccess('starter') ? <TierGate minTier="starter" featureName="Custom Reports" fullPage /> : <ErrorBoundary>
                                                <AnalyticsReportBuilder />
                                            </ErrorBoundary>}
                                        </Route>
                                        <Route path="/analytics/:handle/reports" exact>
                                            {subscriptionLoading ? <LoadingSpinner /> : needsPayment ? <SubscriptionPlans /> : !canAccess('starter') ? <TierGate minTier="starter" featureName="Custom Reports" fullPage /> : <ErrorBoundary>
                                                <AnalyticsSavedReports />
                                            </ErrorBoundary>}
                                        </Route>
                                        <Route path="/analytics/reports" exact>
                                            {subscriptionLoading ? <LoadingSpinner /> : needsPayment ? <SubscriptionPlans /> : !canAccess('starter') ? <TierGate minTier="starter" featureName="Custom Reports" fullPage /> : <ErrorBoundary>
                                                <AnalyticsSavedReports />
                                            </ErrorBoundary>}
                                        </Route>
                                        <Route path="/analytics/:handle" exact>
                                            {subscriptionLoading ? <LoadingSpinner /> : needsPayment ? <SubscriptionPlans /> : !canAccess('starter') ? <TierGate minTier="starter" featureName="Site Analytics" fullPage /> : <ErrorBoundary>
                                                <SiteAnalytics />
                                            </ErrorBoundary>}
                                        </Route>
                                        <Route path="/analytics" exact>
                                            {subscriptionLoading ? <LoadingSpinner /> : needsPayment ? <SubscriptionPlans /> : !canAccess('starter') ? <TierGate minTier="starter" featureName="Site Analytics" fullPage /> : <ErrorBoundary>
                                                <SiteAnalytics />
                                            </ErrorBoundary>}
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
                                                    {Authentication.getOrganisationAccessStatusForOrganisation(getOrg()?.id) === "admin" || Authentication.getOrganisationAccessStatusForOrganisation(getOrg()?.id) === "super-admin" ? <CreateOrganisation /> : <p>No access</p>}
                                                </ErrorBoundary>
                                            }
                                        </Route>
                                        <Route path="/settings/add-user">
                                            <ErrorBoundary>
                                                {Authentication.getOrganisationAccessStatusForOrganisation(getOrg()?.id) === "admin" || Authentication.getOrganisationAccessStatusForOrganisation(getOrg()?.id) === "super-admin" ? <AddUser /> : <p>No access</p>}
                                            </ErrorBoundary>
                                        </Route>
                                        <Route path="/settings/add-domain">
                                            {subscriptionLoading ? <LoadingSpinner /> : needsPayment ? <SubscriptionPlans /> :
                                                <ErrorBoundary>
                                                    {Authentication.getOrganisationAccessStatusForOrganisation(getOrg()?.id) === "admin" 
                                                    || Authentication.getOrganisationAccessStatusForOrganisation(getOrg()?.id) === "super-admin"
                                                    || Authentication.getOrganisationAccessStatusForOrganisation(getOrg()?.id) === "manager" ?
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
                                        <Route path="/:id/reports/view/:handle/reconcile" exact>
                                            {subscriptionLoading ? <LoadingSpinner /> : needsPayment ? <SubscriptionPlans /> : !canAccess('growth') ? <TierGate minTier="growth" featureName="Ad Reconciliation" fullPage /> : <ErrorBoundary>
                                                {domainError ? <AddDomain /> : <ReconcilePage />}
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
                                        <Route path="/:id/reports/reconcile" exact>
                                            {subscriptionLoading ? <LoadingSpinner /> : needsPayment ? <SubscriptionPlans /> : !canAccess('growth') ? <TierGate minTier="growth" featureName="Ad Reconciliation" fullPage /> : <ErrorBoundary>
                                                {domainError ? <AddDomain /> : <ReconcilePage />}
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
                                        <Route path="/settings/config-gdpr">
                                            <ErrorBoundary>
                                                {subscriptionLoading ? <LoadingSpinner /> : needsPayment ? <SubscriptionPlans /> : !canAccess('starter') ? <TierGate minTier="starter" featureName="Jurisdiction Configuration" fullPage /> : <JurisdictionConfig />}
                                            </ErrorBoundary>
                                        </Route>
                                        <Route path="/settings/legal-basis">
                                            <ErrorBoundary>
                                                {subscriptionLoading ? <LoadingSpinner /> : needsPayment ? <SubscriptionPlans /> : !canAccess('growth') ? <TierGate minTier="growth" featureName="Legal Basis Tracking" fullPage /> : <LegalBasis />}
                                            </ErrorBoundary>
                                        </Route>
                                        <Route path="/settings/ropa/:entryId">
                                            <ErrorBoundary>
                                                {subscriptionLoading ? <LoadingSpinner /> : needsPayment ? <SubscriptionPlans /> : !canAccess('growth') ? <TierGate minTier="growth" featureName="RoPA Builder" fullPage /> : <ROPAEntry />}
                                            </ErrorBoundary>
                                        </Route>
                                        <Route path="/settings/ropa" exact>
                                            <ErrorBoundary>
                                                {subscriptionLoading ? <LoadingSpinner /> : needsPayment ? <SubscriptionPlans /> : !canAccess('growth') ? <TierGate minTier="growth" featureName="RoPA Builder" fullPage /> : <ROPA />}
                                            </ErrorBoundary>
                                        </Route>
                                        <Route path="/:id/reports/dsr/:requestId" exact>
                                            {subscriptionLoading ? <LoadingSpinner /> : needsPayment ? <SubscriptionPlans /> : !canAccess('personal') ? <TierGate minTier="personal" featureName="Data Subject Requests" fullPage /> : <ErrorBoundary><DSRDetail /></ErrorBoundary>}
                                        </Route>
                                        <Route path="/:id/reports/dsr" exact>
                                            {subscriptionLoading ? <LoadingSpinner /> : needsPayment ? <SubscriptionPlans /> : !canAccess('personal') ? <TierGate minTier="personal" featureName="Data Subject Requests" fullPage /> : <ErrorBoundary><DSR /></ErrorBoundary>}
                                        </Route>
                                        <Route path="/settings/blacklist-ip">
                                            <ErrorBoundary>
                                                {Authentication.getOrganisationAccessStatusForOrganisation(getOrg()?.id) === "admin" || Authentication.getOrganisationAccessStatusForOrganisation(getOrg()?.id) === "super-admin" ? <BlacklistIp /> : null}
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
                                        <Route path="/settings/ad-connections" exact>
                                            <ErrorBoundary>
                                                {subscriptionLoading ? <LoadingSpinner /> : needsPayment ? <SubscriptionPlans /> : !canAccess('growth') ? <TierGate minTier="growth" featureName="Ad Connections" fullPage /> : <AdConnectionsSettings />}
                                            </ErrorBoundary>
                                        </Route>
                                        <Route path="/settings/analytics-script" exact>
                                            <ErrorBoundary>
                                                {subscriptionLoading ? <LoadingSpinner /> : needsPayment ? <SubscriptionPlans /> : !canAccess('starter') ? <TierGate minTier="starter" featureName="Analytics Script" fullPage /> : <AnalyticsScriptSettings />}
                                            </ErrorBoundary>
                                        </Route>
                                        <Route path="/settings/plans" exact>
                                            <ErrorBoundary>
                                                <SubscriptionPlans />
                                            </ErrorBoundary>
                                        </Route>
                                        <Route path="/settings/create-user">
                                            <ErrorBoundary>
                                                {Authentication.getOrganisationAccessStatusForOrganisation(getOrg()?.id) === "admin" || Authentication.getOrganisationAccessStatusForOrganisation(getOrg()?.id) === "super-admin" ? <CreateUser /> : null}
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
                                        <Route path="/cookie-database" exact>
                                            <ErrorBoundary>
                                                {Number(getOrg()?.id) === 1 ? <CookieDatabase /> : <p style={{ padding: "40px", color: "#999" }}>Admin access required.</p>}
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