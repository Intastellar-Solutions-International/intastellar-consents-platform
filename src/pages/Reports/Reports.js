import SideNav from "../../Components/Header/SideNav";
import { DomainContext } from "../../App.js";
import { useSyncDomainFromRoute } from "../../Functions/domainPathSegments.js";
const useParams = window.ReactRouterDOM.useParams;
const { useContext } = React;

export const reportsLinks = [
    {
        name: "Consent decisions overview",
        path: "/reports/user-consents",
    },
    {
        name: "Audit reports",
        path: "/reports/audit-report",
    },
];

export default function Reports() {
    document.title = "Reports | Intastellar Consents | CMP";
    const { handle } = useParams();
    const [, setGlobalDomain] = useContext(DomainContext);
    useSyncDomainFromRoute(handle, setGlobalDomain);

    return <>
        <SideNav links={reportsLinks} title="Reports" />
        <div className="dashboard-content">
        </div>
    </>
}