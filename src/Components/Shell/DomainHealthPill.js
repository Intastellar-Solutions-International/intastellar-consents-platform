import { DomainContext } from "../../App.js";
import { t } from "../../i18n/index.js";
import HealthPill, { StatusPill } from "../ui/HealthPill.js";
import useDomainHealth from "./useDomainHealth.js";
import useDomainCompliance from "./useDomainCompliance.js";
import { isCombinedOrClearDomain, reportsPath } from "../../Functions/domainPathSegments.js";

const { useContext } = React;

const LEVEL = {
    critical: { status: "error", word: "Critical" },
    attention: { status: "warning", word: "Needs attention" },
    healthy: { status: "ok", word: "Healthy" },
    unknown: { status: "unknown", word: "Status unknown" },
};
const LOGGING_WORD = { ok: "active", warning: "delayed", error: "no recent consents", unknown: "unknown" };

function issueSummary({ scanned, breakdown }) {
    if (!scanned) return "No cookie scan for this domain yet.";
    const parts = [
        [breakdown.consent, "tracking before consent"],
        [breakdown.mechanism, "no transfer mechanism"],
        [breakdown.dpa, "no confirmed DPA"],
        [breakdown.unconfirmed, "unconfirmed mechanism"],
    ].filter(([n]) => n).map(([n, label]) => `${n} ${label}`);
    return parts.length ? parts.join(", ") : "No open issues in the latest scan.";
}

/** Top-bar status for the selected domain: compliance, and consent logging on its own (new shell only). */
export default function DomainHealthPill() {
    const [currentDomain] = useContext(DomainContext);
    const checks = useDomainHealth(currentDomain);
    const compliance = useDomainCompliance(currentDomain);
    if (isCombinedOrClearDomain(currentDomain)) {
        return <HealthPill checks={[{ label: t("Domain"), status: "unknown", detail: t("select a domain to see its health") }]} />;
    }
    const logging = checks?.[0];
    const level = LEVEL[compliance?.level] || LEVEL.unknown;
    const platform = localStorage.getItem("platform") || "gdpr";
    return (
        <>
            {logging && <StatusPill status={logging.status} word={`Consent logging: ${LOGGING_WORD[logging.status]}`} title={logging.detail} className="shell-logging-pill" />}
            <StatusPill
                status={level.status}
                word={compliance?.count ? `${level.word} · ${compliance.count} issue${compliance.count === 1 ? "" : "s"}` : level.word}
                title={compliance ? issueSummary(compliance) : "Checking the latest scan…"}
                to={`${reportsPath(platform, currentDomain, "/compliance")}#open-issues`}
                onClick={() => document.getElementById("open-issues")?.scrollIntoView({ behavior: "smooth" })}
            />
        </>
    );
}
