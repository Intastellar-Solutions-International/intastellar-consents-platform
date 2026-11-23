// What a data screen shows before it has a domain to show: loading the
// domain list, the list failed, or the organisation has no domains yet.
import { useSession } from "../lib/session.js";
import { Message } from "./ui.js";
import { SkeletonKpis } from "./Skeleton.js";
import { useOpenWeb } from "../lib/web.js";
import { t } from "../lib/i18n.js";

export default function DomainGate({ children }) {
    const openWeb = useOpenWeb();
    const { domainsState, domains, allDomainCount, domain, reloadDomains, organisationId } = useSession();
    if (organisationId == null) {
        return <Message title={t("Create your organisation")} body={t("Your domains, banner settings, analytics and billing all belong to an organisation. Name yours to get started — you can invite your team afterwards.")} action={t("Open on the web")} onAction={() => openWeb("/")} />;
    }
    if ((domainsState === "loading" || domainsState === "idle") && !domains.length) return <SkeletonKpis />;
    if (domainsState === "error") {
        return <Message tone="error" title={t("Domains couldn't be loaded")} action={t("Try again")} onAction={reloadDomains} />;
    }
    if (!domains.length && allDomainCount > 0) {
        return <Message title={t("No domain has Analytics yet")} body={t("Turn it on and add the tracker to your site — this page fills with data from the first visit.")} action={t("Set up Analytics")} onAction={() => openWeb("/analytics/getting-started")} />;
    }
    if (!domains.length || !domain) {
        return <Message title={t("Add your first domain")} body={t("Domains are added on the web dashboard. They appear here right after.")} action={t("Open on the web")} onAction={() => openWeb("/settings/add-domain")} />;
    }
    return children;
}
