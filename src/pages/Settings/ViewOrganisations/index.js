import useFetch from "../../../Functions/FetchHook";
import API from "../../../API/api";
import Authentication from "../../../Authentication/Auth";
import { CurrentPageLoading } from "../../../Components/widget/Loading";
import SideNav from "../../../Components/Header/SideNav";
import { reportsLinks } from "../../../Components/Header/SideNavLinks";
import StickyPageTitle from "../../../Components/Header/Sticky";
import "../Style.css";

const Link = window.ReactRouterDOM.Link;

export default function ViewOrg() {
    document.title = "Organisations | Settings | Intastellar Consents | CMP";

    const [loading, data] = useFetch(
        1,
        API.settings.getOrganisation.url,
        API.settings.getOrganisation.method,
        API.settings.getOrganisation.headers,
        JSON.stringify({
            organisationMember: Authentication.getUserId(),
        })
    );

    const rows = Array.isArray(data) ? data : [];

    function editOrganisation(org) {
        window.location.href = `/settings/edit-organisation/${org.id}`;
    }

    function canEditOrg(orgId) {
        const r = Authentication.getOrganisationAccessStatusForOrganisation(orgId);
        return r === "admin" || r === "super-admin";
    }

    return (
        <>
            <SideNav links={reportsLinks} title="Settings" />
            <main className="dashboard-content settings-subpage settings-subpage--wide">
                <StickyPageTitle title="Organisations" />
                <Link className="settings-subpage__back" to="/settings">
                    ← Back to settings
                </Link>
                <p className="settings-subpage__intro">
                    Organisations your account can access. Edit is only available where you are admin or
                    super-admin.
                </p>
                <div className="settings-table-wrap">
                    {loading ? (
                        <CurrentPageLoading />
                    ) : rows.length > 0 ? (
                        <table className="settings-table">
                            <thead>
                                <tr>
                                    <th>Name</th>
                                    <th style={{ width: 140 }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((d) => (
                                    <tr key={d.id}>
                                        <td>{d.name}</td>
                                        <td>
                                            {canEditOrg(d.id) ? (
                                                <button type="button" className="cta" onClick={() => editOrganisation(d)}>
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
                        <p className="settings-subpage__empty">No organisations found.</p>
                    )}
                </div>
            </main>
        </>
    );
}
