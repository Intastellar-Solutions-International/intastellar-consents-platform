import { Card, Button } from "../ui";
import { Icon } from "../ui/icons.js";
import { useCmpAcceptance, useAnalyticsSnapshot } from "../../Functions/crossProduct.js";
import { BANNER_ACCEPTANCE, STATISTICS_CONSENT } from "../../Functions/consentMetrics.js";
import { switchModePath, analyticsGettingStartedPath } from "../../Functions/domainPathSegments.js";
import { canAccess } from "../../Functions/tier.js";
import { formatNumber, formatPercent } from "../../Functions/format.js";

const useHistory = window.ReactRouterDOM.useHistory;

function Stat({ label, value, title }) {
    return (
        <div className="tw-min-w-0" title={title}>
            <p className="tw-m-0 tw-text-xs tw-text-text-muted">{label}</p>
            <p className="tw-m-0 tw-text-lg tw-font-semibold tw-text-text-primary tw-tabular-nums">{value}</p>
        </div>
    );
}

/**
 * CMP Home → Analytics: the same domain's traffic in one line, linking
 * across with the date range kept. Hidden below Starter (no Analytics) and
 * while loading/failed; a nudge to Getting started when the domain has no
 * Analytics yet.
 */
export function AnalyticsBridge({ platform, domain, fromIso, toIso }) {
    const history = useHistory();
    const analyticsOnPlan = canAccess("starter");
    const snapshot = useAnalyticsSnapshot(analyticsOnPlan ? domain : null, fromIso, toIso);
    if (!analyticsOnPlan || !snapshot) return null;

    if (snapshot.noSite) {
        return (
            <Card padding="sm" className="tw-mb-4">
                <div className="tw-flex tw-flex-wrap tw-items-center tw-gap-3">
                    <Icon name="bar-chart" size={18} />
                    <p className="tw-m-0 tw-flex-1 tw-text-sm tw-text-text-secondary" style={{ flexBasis: 260 }}>
                        Analytics isn't on for <strong className="tw-text-text-primary">{domain}</strong> yet — consent-aware traffic from the same install as the banner.
                    </p>
                    <Button size="sm" onClick={() => history.push(analyticsGettingStartedPath())}>Turn on Analytics</Button>
                </div>
            </Card>
        );
    }

    return (
        <Card padding="sm" className="tw-mb-4">
            <div className="tw-flex tw-flex-wrap tw-items-center tw-gap-x-6 tw-gap-y-3">
                <span className="tw-flex tw-items-center tw-gap-2 tw-text-sm tw-font-semibold tw-text-text-primary">
                    <Icon name="bar-chart" size={18} /> Analytics
                </span>
                <Stat label="Active users" value={snapshot.activeUsers != null ? formatNumber(snapshot.activeUsers) : "—"} />
                <Stat label="Events" value={snapshot.events != null ? formatNumber(snapshot.events) : "—"} />
                <Stat label={STATISTICS_CONSENT.label} value={snapshot.statisticsConsent != null ? formatPercent(snapshot.statisticsConsent) : "—"} title={STATISTICS_CONSENT.description} />
                <Button size="sm" className="tw-ml-auto" iconRight="chevron-right"
                    onClick={() => history.push(switchModePath("analytics", platform, domain))}>
                    Open Analytics
                </Button>
            </div>
        </Card>
    );
}

/**
 * Analytics Consent → CMP: banner acceptance next to statistics consent for
 * the same domain and period, with why they differ — the two numbers people
 * otherwise compare and distrust.
 */
export function ConsentRatesBridge({ platform, domain, fromIso, toIso, statisticsConsent }) {
    const history = useHistory();
    const cmp = useCmpAcceptance(platform, domain, fromIso, toIso);
    if (!domain || !cmp) return null;

    return (
        <Card>
            <div className="tw-flex tw-flex-wrap tw-items-start tw-justify-between tw-gap-3">
                <div className="tw-min-w-0">
                    <h3 className="tw-m-0 tw-text-base tw-font-semibold tw-text-text-primary">Banner acceptance vs. statistics consent</h3>
                    <p className="tw-m-0 tw-mt-1 tw-text-sm tw-text-text-secondary" style={{ maxWidth: 720 }}>
                        Two different measurements of the same visitors. The banner counts each decision once; Analytics counts every page view and only
                        statistics consent — so it's usually lower.
                    </p>
                </div>
                <Button size="sm" iconRight="chevron-right" onClick={() => history.push(switchModePath("cmp", platform, domain))}>Open in CMP</Button>
            </div>
            <div className="tw-grid tw-gap-4 tw-mt-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
                <Stat
                    label={`${BANNER_ACCEPTANCE.label} (CMP)`}
                    value={cmp.rate != null ? formatPercent(cmp.rate) : "No decisions yet"}
                    title={BANNER_ACCEPTANCE.description}
                />
                <Stat
                    label={`${STATISTICS_CONSENT.label} (Analytics)`}
                    value={statisticsConsent != null ? formatPercent(statisticsConsent) : "—"}
                    title={STATISTICS_CONSENT.description}
                />
                <Stat label="Banner decisions" value={formatNumber(cmp.decisions)} />
            </div>
        </Card>
    );
}
