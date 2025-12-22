import SideNav from "../../Components/Header/SideNav";
const useParams = window.ReactRouterDOM.useParams;

export const reportsLinks = [
    {
        name: "Consent decisions overview",
        path: "/reports/user-consents"
    },
    {
        name: "Countries",
        path: "/reports/countries"
    },
    {
        name: "User Agents",
        path: "/reports/user-agents"
    },
    {
        name: "Site Status",
        path: "/reports/site-status"
    }
]

export default function Reports() {
    document.title = "Reports | Intastellar Consents | CMP";
    return <>
        <SideNav links={reportsLinks} title="Reports" />
        <div className="dashboard-content">
            <h1>Reports</h1>
        </div>
    </>
}