import API from "../../API/api";
import Authentication from "../../Authentication/Auth";
import StickyPageTitle from "../../Components/Header/Sticky";
import { Button, Card } from "../../Components/ui";
import { SkeletonText } from "../../Components/ui/Skeleton.js";
import { Icon } from "../../Components/ui/icons.js";
import { readCachedDomains } from "../../Functions/cachedDomains.js";
import { isDomainVerified } from "../../Functions/domainVerification.js";
import { loadAuditReportIndex } from "../../Functions/auditReportsStorage";
import { fetchJsonWithTimeout } from "../../Functions/fetchWithTimeout.js";
import { onboardingSteps } from "../../Functions/onboardingSteps.js";

const { useState, useEffect, useMemo } = React;
const useParams = window.ReactRouterDOM.useParams;
const useHistory = window.ReactRouterDOM.useHistory;

const RECORDS_LOOKBACK_DAYS = 365;
const ymd = (d) => d.toISOString().split("T")[0];

async function countRecords(platform) {
    const api = API[platform].getInteractions;
    const data = await fetchJsonWithTimeout(api.url, {
        method: api.method,
        headers: { ...api.headers, Domains: "combined view", FromDate: ymd(new Date(Date.now() - RECORDS_LOOKBACK_DAYS * 86400000)), ToDate: ymd(new Date()) },
        body: JSON.stringify({ workspaceId: null }),
    });
    return Number(data?.Total) || 0;
}

async function countScans(platform, domains) {
    if (!domains.length) return 0;
    const api = API[platform].listPreConsentScans;
    const data = await fetchJsonWithTimeout(api.url, { method: api.method, headers: api.headers, body: JSON.stringify({ domains, pageSize: 1 }) });
    return Number(data?.total) || 0;
}

/** The checklist that takes a new customer from sign-up to a first report. */
export default function GettingStarted() {
    document.title = "Getting started | Intastellar Consents | CMP";
    const { id } = useParams();
    const history = useHistory();
    const domains = useMemo(() => readCachedDomains(), []);
    const [counts, setCounts] = useState(null);

    useEffect(() => {
        let active = true;
        Promise.all([countRecords(id).catch(() => 0), countScans(id, domains).catch(() => 0)]).then(([records, scans]) => {
            if (active) setCounts({ records, scans });
        });
        return () => { active = false; };
    }, [id, domains]);

    const orgId = Authentication.getOrganisation();
    const plan = onboardingSteps({
        domains: domains.length,
        records: counts?.records ?? 0,
        scans: counts?.scans ?? 0,
        verified: domains.filter((d) => isDomainVerified(d, orgId)).length,
        reports: domains.reduce((n, d) => n + loadAuditReportIndex(orgId, d).length, 0),
    }, id);
    const finished = plan.completed === plan.total;

    return (
        <>
            <StickyPageTitle title="Getting started" />
            <div className="dashboard-content tw-flex tw-flex-col tw-gap-5" style={{ maxWidth: 800 }}>
                <div>
                    <p className="tw-m-0 tw-text-sm tw-text-text-secondary">{finished ? "You've completed every step. Your site is set up and recording consent." : "Follow these steps to get consent management running on your website."}</p>
                    <p className="tw-m-0 tw-mt-3 tw-text-sm tw-text-text-primary tw-tabular-nums">{plan.completed} of {plan.total} complete</p>
                    <div className="tw-h-2 tw-mt-1 tw-bg-white/10 tw-rounded-full" aria-hidden="true">
                        <div className="tw-h-full tw-bg-data tw-rounded-full" style={{ width: `${(plan.completed / plan.total) * 100}%`, transition: "width 0.3s ease" }} />
                    </div>
                </div>
                {counts == null ? <SkeletonText lines={8} label="Checking your setup…" /> : (
                    <ol className="tw-m-0 tw-p-0 tw-list-none tw-flex tw-flex-col tw-gap-3">
                        {plan.steps.map((step, index) => (
                            <li key={step.id}>
                                <Card>
                                    <div className="tw-flex tw-flex-wrap tw-items-center tw-gap-4">
                                        <span className={`tw-flex tw-items-center tw-justify-center tw-shrink-0 tw-w-8 tw-h-8 tw-rounded-full tw-text-sm tw-tabular-nums ${step.done ? "tw-text-success" : "tw-bg-bg-sunken tw-text-text-secondary"}`}>
                                            {step.done ? <Icon name="check-circle" size={24} label="Done" /> : index + 1}
                                        </span>
                                        <div className="tw-flex-1 tw-min-w-0" style={{ flexBasis: 220 }}>
                                            <h2 className="tw-m-0 tw-text-base tw-font-semibold tw-text-text-primary">{step.title}</h2>
                                            <p className="tw-m-0 tw-text-sm tw-text-text-secondary">{step.description}</p>
                                        </div>
                                        {!step.done && <Button variant={step.next ? "primary" : "secondary"} onClick={() => history.push(step.to)}>{step.action}</Button>}
                                    </div>
                                </Card>
                            </li>
                        ))}
                    </ol>
                )}
            </div>
        </>
    );
}
