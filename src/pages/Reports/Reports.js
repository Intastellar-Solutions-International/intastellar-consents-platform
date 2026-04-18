import SideNav from "../../Components/Header/SideNav";
import StickyPageTitle from "../../Components/Header/Sticky";
import { DomainContext } from "../../App.js";
import { useSyncDomainFromRoute, reportsPath, isCombinedOrClearDomain } from "../../Functions/domainPathSegments.js";
import "./Reports.css";

const useParams = window.ReactRouterDOM.useParams;
const Link = window.ReactRouterDOM.Link;
const { useContext, useMemo } = React;

const punycode = require("punycode");

export const reportsLinks = [
    {
        name: "Audit log",
        path: "/reports/user-consents",
    },
    {
        name: "Audit reports",
        path: "/reports/audit-report",
    },
    {
        name: "Marketing",
        path: "/reports/marketing",
    },
];

const HUB_CARDS = [
    {
        key: "audit-log",
        title: "Audit log",
        description:
            "Per-user consent history and timestamps for troubleshooting, support, and compliance review.",
        leaf: "/user-consents",
    },
    {
        key: "audit-reports",
        title: "Audit reports",
        description:
            "Aggregated audit views and exports to summarise consent activity for your selected scope.",
        leaf: "/audit-report",
    },
    {
        key: "marketing",
        title: "Marketing",
        description:
            "Consent volume and acceptance by channel and campaign (UTMs and landing URL marketing parameters).",
        leaf: "/marketing",
    },
];

export default function Reports() {
    document.title = "Reports | Intastellar Consents | CMP";
    const { handle, id } = useParams();
    const [globalDomain, setGlobalDomain] = useContext(DomainContext);
    useSyncDomainFromRoute(handle, setGlobalDomain);

    const scopeLabel = useMemo(() => {
        if (isCombinedOrClearDomain(globalDomain)) {
            return "All domains (combined view)";
        }
        try {
            return punycode.toUnicode(String(globalDomain).trim());
        } catch {
            return String(globalDomain);
        }
    }, [globalDomain]);

    const cardHrefs = useMemo(() => {
        const platformId = id || "gdpr";
        return HUB_CARDS.map((c) => ({
            ...c,
            to: reportsPath(platformId, globalDomain, c.leaf),
        }));
    }, [id, globalDomain]);

    return (
        <>
            <SideNav links={reportsLinks} title="Reports" />
            <div className="dashboard-content">
                <StickyPageTitle title="Reports" />
                <div className="reports-hub">
                    <p className="reports-hub__intro">
                        Use the sidebar for quick navigation, or open a report below. Data respects the{" "}
                        <strong>organisation</strong> and <strong>domain</strong> selected in the header.
                    </p>
                    <div className="reports-hub__scope" aria-live="polite">
                        <span className="reports-hub__scope-label">Current scope</span>
                        <span className="reports-hub__scope-value">{scopeLabel}</span>
                    </div>
                    <div className="reports-hub__grid">
                        {cardHrefs.map((card) => (
                            <Link key={card.key} className="reports-hub__card" to={card.to}>
                                <span className="reports-hub__card-title">
                                    {card.title}
                                    <span className="reports-hub__card-arrow" aria-hidden="true" />
                                </span>
                                <p className="reports-hub__card-desc">{card.description}</p>
                            </Link>
                        ))}
                    </div>
                </div>
            </div>
        </>
    );
}
