import SideNav from "../../Components/Header/SideNav";
const useParams = window.ReactRouterDOM.useParams;

export const reportsLinks = [
    {
        name: "Consent decisions overview",
        path: "/reports/user-consents"
    },
    {
        name: "Audit report",
        path: "/reports/audit-report"
    }
]

export default function Reports() {
    document.title = "Reports | Intastellar Consents | CMP";
    return <>
        <SideNav links={reportsLinks} title="Reports" />
        <div className="dashboard-content">
        </div>
    </>
}