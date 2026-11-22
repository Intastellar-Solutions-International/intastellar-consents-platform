const Link = window.ReactRouterDOM.Link;
import { useAnalyticsSiteStatus } from "../_shared.js";
import { analyticsGettingStartedPath } from "../../../Functions/domainPathSegments.js";
import { Icon } from "../../../Components/ui/icons.js";
import { t } from "../../../i18n/index.js";

/**
 * Shown at the top of an Analytics page when the selected domain has no
 * Analytics at all. Without it, pages whose API answers 404 "Site not found"
 * fell back to an empty "no data" state or a generic "Could not load" —
 * neither said what was actually wrong or how to fix it.
 * Renders nothing while checking, when the site exists, or when the check
 * itself failed (never claims "not set up" on a network blip).
 */
export default function AnalyticsSiteGate({ domain }) {
    const status = useAnalyticsSiteStatus(domain);
    if (status !== "none") return null;
    return (
        <div className="sa-site-gate" role="status">
            <Icon name="bar-chart" size={20} />
            <div className="sa-site-gate__text">
                <p className="sa-site-gate__title">{t("Analytics isn't turned on for {domain} yet", { domain })}</p>
                <p className="sa-site-gate__body">{t("Turn it on and add the tracker to your site — this page fills with data from the first visit.")}</p>
            </div>
            <Link className="sa-site-gate__cta" to={analyticsGettingStartedPath()}>{t("Set up Analytics")}</Link>
        </div>
    );
}
