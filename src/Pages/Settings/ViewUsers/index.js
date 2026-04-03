import useFetch from "../../../Functions/FetchHook";
import API from "../../../API/api";
import Authentication from "../../../Authentication/Auth";
import { CurrentPageLoading } from "../../../Components/widget/Loading";
import SideNav from "../../../Components/Header/SideNav";
import { reportsLinks } from "../../../Components/Header/SideNavLinks";
import StickyPageTitle from "../../../Components/Header/Sticky";
import "../Style.css";

export default function ViewUsers() {
    document.title = "Users | Settings | Intastellar Consents | CMP";
    const role = Authentication.getCurrentOrganisationRole();
    const canManageUsers = role === "admin" || role === "super-admin";

    const [loading, data] = useFetch(
        1,
        API.settings.getOrgUsers.url,
        API.settings.getOrgUsers.method,
        API.settings.getOrgUsers.headers
    );

    const rows = Array.isArray(data) ? data : [];

    function editUser() {
        /* Edit flow not yet wired */
    }

    return (
        <>
            <SideNav links={reportsLinks} title="Settings" />
            <main className="dashboard-content settings-subpage settings-subpage--wide">
                <StickyPageTitle title="Users in organisation" />
                <p className="settings-subpage__intro">
                    Members of the organisation currently selected in the header. Admins can use actions
                    when available.
                </p>
                <div className="settings-table-wrap">
                    {loading ? (
                        <CurrentPageLoading />
                    ) : rows.length > 0 ? (
                        <table className="settings-table">
                            <thead>
                                <tr>
                                    <th>ID</th>
                                    <th>Name</th>
                                    <th>Email</th>
                                    <th>Role</th>
                                    <th style={{ width: 120 }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((d, key) => (
                                    <tr key={d.id ?? key}>
                                        <td>{d.id}</td>
                                        <td>{d.name}</td>
                                        <td>{d.email}</td>
                                        <td>{d.role}</td>
                                        <td>
                                            {canManageUsers ? (
                                                <button type="button" className="cta" onClick={() => editUser(d)}>
                                                    Edit
                                                </button>
                                            ) : (
                                                <span style={{ color: "rgba(180,180,180,0.6)" }}>—</span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    ) : (
                        <p className="settings-subpage__empty">No users found in your organisation.</p>
                    )}
                </div>
            </main>
        </>
    );
}
