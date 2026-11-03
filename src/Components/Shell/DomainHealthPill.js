import { DomainContext } from "../../App.js";
import HealthPill from "../ui/HealthPill.js";
import useDomainHealth from "./useDomainHealth.js";
import { isCombinedOrClearDomain } from "../../Functions/domainPathSegments.js";

const { useContext } = React;

/** Top-bar health pill for the selected domain (new shell only). */
export default function DomainHealthPill() {
    const [currentDomain] = useContext(DomainContext);
    const checks = useDomainHealth(currentDomain);
    if (isCombinedOrClearDomain(currentDomain)) {
        return <HealthPill checks={[{ label: "Domain", status: "unknown", detail: "select a domain to see its health" }]} />;
    }
    if (!checks) return <HealthPill checks={[{ label: "Health", status: "unknown", detail: "checking…" }]} />;
    return <HealthPill checks={checks} />;
}
