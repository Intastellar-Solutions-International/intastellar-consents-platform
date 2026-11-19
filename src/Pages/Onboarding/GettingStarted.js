import Authentication from "../../Authentication/Auth";
import StickyPageTitle from "../../Components/Header/Sticky";
import { Button, Card, Badge } from "../../Components/ui";
import ErrorState from "../../Components/ui/ErrorState.js";
import { SkeletonText } from "../../Components/ui/Skeleton.js";
import { Icon } from "../../Components/ui/icons.js";
import { ScannerHost } from "../../API/host.js";
import { onboardingSteps } from "../../Functions/onboardingSteps.js";
import { useOnboardingFacts } from "../../Functions/onboardingFacts.js";
import { installSnippet } from "../../Functions/installSnippet.js";
import { analyticsConversionsPath } from "../../Functions/domainPathSegments.js";
import { canAccess } from "../../Functions/tier.js";
import { readJsonResult, errorMessage } from "../../Functions/apiResult.js";

const { useState, useEffect } = React;
const useParams = window.ReactRouterDOM.useParams;
const useHistory = window.ReactRouterDOM.useHistory;

const TRACKS = {
    consent: { title: "Consent", subtitle: "Cookie banner, compliance and reports", icon: "shield-check" },
    analytics: { title: "Analytics", subtitle: "Traffic, ads and conversions — consent-aware", icon: "bar-chart" },
};

function CopyCode({ text }) {
    const [copied, setCopied] = useState(false);
    return (
        <Button size="sm" icon={copied ? "check" : "copy"} onClick={() => {
            navigator.clipboard?.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }).catch(() => {});
        }}>
            {copied ? "Copied" : "Copy code"}
        </Button>
    );
}

function StepRow({ step, index, onAction }) {
    return (
        <li>
            <Card padding="sm">
                <div className="tw-flex tw-flex-wrap tw-items-center tw-gap-3">
                    <span className={`tw-flex tw-items-center tw-justify-center tw-shrink-0 tw-w-8 tw-h-8 tw-rounded-full tw-text-sm tw-tabular-nums ${step.done ? "tw-text-success" : "tw-bg-bg-sunken tw-text-text-secondary"}`}>
                        {step.done ? <Icon name="check-circle" size={24} label="Done" /> : index + 1}
                    </span>
                    <div className="tw-flex-1 tw-min-w-0" style={{ flexBasis: 200 }}>
                        <h3 className="tw-m-0 tw-flex tw-flex-wrap tw-items-center tw-gap-2 tw-text-base tw-font-semibold tw-text-text-primary">
                            {step.title}
                            {step.optional && <Badge>Optional</Badge>}
                        </h3>
                        <p className="tw-m-0 tw-text-sm tw-text-text-secondary">{step.description}</p>
                    </div>
                    {!step.done && !step.locked && (
                        <Button variant={step.next ? "primary" : "secondary"} size="sm" onClick={() => onAction(step)}>{step.action}</Button>
                    )}
                </div>
            </Card>
        </li>
    );
}

/**
 * Getting started — one checklist for the CMP and Analytics: a shared domain
 * step, one install snippet (banner + analytics tracker), then a Consent and
 * an Analytics track. Reachable from both products (/:id/onboarding and
 * /analytics/getting-started).
 */
export default function GettingStarted() {
    document.title = "Get started | Intastellar";
    const params = useParams();
    // Analytics' route has no platform segment; the CMP platform id is remembered at login.
    const platform = params.id || localStorage.getItem("platform") || "gdpr";
    const history = useHistory();
    const analyticsOnPlan = canAccess("starter");

    const { facts, domains, sites, loading, reload } = useOnboardingFacts(platform);
    const [activeDomain, setActiveDomain] = useState(null);
    const [enabling, setEnabling] = useState(false);
    const [enableError, setEnableError] = useState(null);

    // Default to the first domain that still needs Analytics, else the first.
    useEffect(() => {
        if (activeDomain || !domains.length || loading) return;
        const siteDomains = new Set(sites.map((s) => s.domain));
        setActiveDomain(domains.find((d) => !siteDomains.has(d.toLowerCase())) || domains[0]);
    }, [domains, sites, loading, activeDomain]);

    const site = activeDomain ? sites.find((s) => s.domain === activeDomain.toLowerCase()) : null;
    const plan = onboardingSteps(facts, platform, {
        analytics: analyticsOnPlan,
        conversionsPath: activeDomain ? analyticsConversionsPath(activeDomain) : undefined,
    });
    const finished = plan.completed === plan.total;
    const snippet = activeDomain ? installSnippet({ domain: activeDomain, siteKey: analyticsOnPlan ? site?.siteId : null }) : "";

    async function enableAnalytics() {
        if (!activeDomain) return;
        setEnabling(true);
        setEnableError(null);
        try {
            const response = await fetch(`${ScannerHost}/api/analytics-site`, {
                method: "POST",
                headers: { Authorization: Authentication.getToken(), Organisation: String(Authentication.getOrganisation() ?? ""), "Content-Type": "application/json" },
                body: JSON.stringify({ domain: activeDomain }),
            });
            await readJsonResult(response, "Couldn't turn on Analytics.");
            reload();
        } catch (err) {
            setEnableError(errorMessage(err));
        } finally {
            setEnabling(false);
        }
    }

    function onAction(step) {
        if (step.to === "#enable-analytics") {
            if (site) document.getElementById("install")?.scrollIntoView({ behavior: "smooth", block: "start" });
            else enableAnalytics();
            return;
        }
        if (step.to.startsWith("#")) {
            document.getElementById(step.to.slice(1))?.scrollIntoView({ behavior: "smooth", block: "start" });
            return;
        }
        history.push(step.to);
    }

    const shared = plan.steps.filter((s) => s.track === "shared");
    const byTrack = (track) => plan.steps.filter((s) => s.track === track);

    return (
        <>
            <StickyPageTitle title="Get started" />
            <div className="dashboard-content tw-flex tw-flex-col tw-gap-5" style={{ maxWidth: 1100 }}>
                <div>
                    <p className="tw-m-0 tw-text-sm tw-text-text-secondary">
                        {finished
                            ? "Everything's set up: the banner records consent and Analytics receives visits. The optional steps below add ad spend and conversions."
                            : "One setup for both products: add your domain, install one piece of code, then finish the Consent and Analytics steps."}
                    </p>
                    <p className="tw-m-0 tw-mt-3 tw-text-sm tw-text-text-primary tw-tabular-nums">{plan.completed} of {plan.total} required steps complete</p>
                    <div className="tw-h-2 tw-mt-1 tw-bg-white/10 tw-rounded-full" aria-hidden="true">
                        <div className="tw-h-full tw-bg-data tw-rounded-full" style={{ width: `${plan.total ? (plan.completed / plan.total) * 100 : 0}%`, transition: "width 0.3s ease" }} />
                    </div>
                </div>

                {loading ? <SkeletonText lines={8} label="Checking your setup…" /> : (
                    <>
                        <ol className="tw-m-0 tw-p-0 tw-list-none tw-flex tw-flex-col tw-gap-3">
                            {shared.map((step, i) => <StepRow key={step.id} step={step} index={i} onAction={onAction} />)}
                        </ol>

                        {domains.length > 0 && (
                            <section id="install" aria-labelledby="install-title" style={{ scrollMarginTop: 140 }}>
                                <Card>
                                    <div className="tw-flex tw-flex-wrap tw-items-start tw-justify-between tw-gap-3">
                                        <div className="tw-min-w-0">
                                            <h2 id="install-title" className="tw-m-0 tw-text-base tw-font-semibold tw-text-text-primary">Install on your site</h2>
                                            <p className="tw-m-0 tw-mt-1 tw-text-sm tw-text-text-secondary">
                                                Add this to the <code>&lt;head&gt;</code> of every page, before any other script that sets cookies.
                                                {site && analyticsOnPlan ? " It loads the cookie banner and the Analytics tracker — one install for both." : ""}
                                            </p>
                                        </div>
                                        {snippet && <CopyCode text={snippet} />}
                                    </div>

                                    {domains.length > 1 && (
                                        <div className="tw-flex tw-flex-wrap tw-gap-2 tw-mt-3" role="tablist" aria-label="Domain">
                                            {domains.map((d) => (
                                                <Button key={d} size="sm" role="tab" aria-selected={d === activeDomain}
                                                    variant={d === activeDomain ? "primary" : "secondary"} onClick={() => setActiveDomain(d)}>
                                                    {d}
                                                </Button>
                                            ))}
                                        </div>
                                    )}

                                    {snippet && (
                                        <pre className="tw-mt-3 tw-mb-0 tw-p-3 tw-rounded-md tw-bg-bg-sunken tw-text-xs tw-text-text-secondary" style={{ overflowX: "auto" }}><code>{snippet}</code></pre>
                                    )}

                                    {analyticsOnPlan && activeDomain && !site && (
                                        <div id="enable-analytics" className="tw-flex tw-flex-wrap tw-items-center tw-gap-3 tw-mt-3">
                                            <p className="tw-m-0 tw-flex-1 tw-text-sm tw-text-text-secondary" style={{ flexBasis: 240 }}>
                                                This code only installs the banner. Turn on Analytics for <strong className="tw-text-text-primary">{activeDomain}</strong> and the tracker is added to it.
                                            </p>
                                            <Button variant="primary" size="sm" loading={enabling} onClick={enableAnalytics}>Turn on Analytics</Button>
                                        </div>
                                    )}
                                    {enableError && <ErrorState compact className="tw-mt-3" title="Analytics wasn't turned on" message={enableError} onRetry={enableAnalytics} />}
                                    {site && site.active === false && (
                                        <p className="tw-m-0 tw-mt-3 tw-text-sm tw-text-warning">Analytics is paused for this domain — the tracker is in the code, but visits aren't stored.</p>
                                    )}
                                </Card>
                            </section>
                        )}

                        <div className="tw-grid tw-gap-5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(420px, 100%), 1fr))" }}>
                            {["consent", "analytics"].map((track) => {
                                const steps = byTrack(track);
                                const locked = steps.every((s) => s.locked);
                                const meta = TRACKS[track];
                                return (
                                    <section key={track} aria-labelledby={`track-${track}`} className="tw-flex tw-flex-col tw-gap-3 tw-min-w-0">
                                        <div className="tw-flex tw-items-center tw-gap-2">
                                            <Icon name={meta.icon} size={18} />
                                            <div className="tw-min-w-0">
                                                <h2 id={`track-${track}`} className="tw-m-0 tw-text-base tw-font-semibold tw-text-text-primary">{meta.title}</h2>
                                                <p className="tw-m-0 tw-text-xs tw-text-text-muted">{meta.subtitle}</p>
                                            </div>
                                            {!locked && (
                                                <span className="tw-ml-auto tw-text-xs tw-text-text-muted tw-tabular-nums">
                                                    {steps.filter((s) => s.done && !s.optional).length} of {steps.filter((s) => !s.optional).length}
                                                </span>
                                            )}
                                        </div>
                                        {locked ? (
                                            <Card>
                                                <p className="tw-m-0 tw-text-sm tw-text-text-secondary">
                                                    Analytics is included from the Starter plan: consent-aware traffic, ad spend and conversions for the same domains.
                                                </p>
                                                <Button className="tw-mt-3" size="sm" onClick={() => history.push("/settings/plans")}>See plans</Button>
                                            </Card>
                                        ) : (
                                            <ol className="tw-m-0 tw-p-0 tw-list-none tw-flex tw-flex-col tw-gap-3">
                                                {steps.map((step, i) => <StepRow key={step.id} step={step} index={i} onAction={onAction} />)}
                                            </ol>
                                        )}
                                    </section>
                                );
                            })}
                        </div>
                    </>
                )}
            </div>
        </>
    );
}
