import AddDomain from "../../../Components/AddDomain/AddDomain";
import SideNav from "../../../Components/Header/SideNav";
import { reportsLinks } from "../../../Components/Header/SideNavLinks";
import StickyPageTitle from "../../../Components/Header/Sticky";
import "../Style.css";

export default function SettingsAddDomain() {
    document.title = "Add domain | Settings | Intastellar Consents | CMP";

    return (
        <>
            <SideNav links={reportsLinks} title="Settings" />
            <main className="dashboard-content settings-subpage">
                <StickyPageTitle title="Add domain" />
                <AddDomain embedded />
            </main>
        </>
    );
}
