import Fetch from "../../../Functions/fetch";
import Text from "../../../Components/InputFields/textInput";
import Email from "../../../Components/InputFields/EmailInput";
import SideNav from "../../../Components/Header/SideNav";
import { reportsLinks } from "../../../Components/Header/SideNavLinks";
import StickyPageTitle from "../../../Components/Header/Sticky";
import API from "../../../API/api";
import "../Style.css";

const { useState } = React;

export default function CreateOrganisation() {
    document.title = "Create organisation | Settings | Intastellar Consents | CMP";
    const [organisationName, setOrganisationName] = useState("");
    const [organisationAdmin, setOrganisationAdmin] = useState("");
    const [status, setStatus] = useState(null);
    const [error, setError] = useState(false);

    const create = (e) => {
        e.preventDefault();
        setStatus("Creating…");
        setError(false);
        Fetch(
            API.settings.createOrganisation.url,
            API.settings.createOrganisation.method,
            API.settings.createOrganisation.headers,
            JSON.stringify({
                organisationName,
                organisationMember: organisationAdmin,
            })
        ).then((re) => {
            if (re === "ERROR_CREATING_ORGANISATION" || re === "Err_Token_Not_Found") {
                setStatus("Could not create the organisation. Check your permissions and try again.");
                setError(true);
                return;
            }
            setStatus(`Organisation created: ${organisationName}`);
            setError(false);
        });
    };

    return (
        <>
            <SideNav links={reportsLinks} title="Settings" />
            <main className="dashboard-content settings-subpage">
                <StickyPageTitle title="Create organisation" />
                <p className="settings-subpage__intro">
                    Register a new organisation and nominate an admin. Follow-up may arrive by email.
                </p>
                <form className="settings-subpage__panel settings-preferences" onSubmit={create} noValidate>
                    <header className="settings-preferences__header">
                        <h2 className="settings-preferences__title">New organisation</h2>
                        <p className="settings-preferences__lede">
                            The name appears in the app and in invitations; the admin email is the primary
                            contact for this workspace.
                        </p>
                    </header>

                    {status ? (
                        <p
                            className={
                                error ? "settings-subpage__status settings-subpage__status--error" : "settings-subpage__status"
                            }
                            style={{ marginBottom: 18 }}
                        >
                            {status}
                        </p>
                    ) : null}

                    <div className="settings-preferences__groups">
                        <section className="settings-preferences__group" aria-labelledby="create-org-details">
                            <h3 className="settings-preferences__group-title" id="create-org-details">
                                Organisation details
                            </h3>
                            <p className="settings-preferences__group-desc">
                                Use the legal or brand name your team recognises. The admin should be someone
                                who can verify billing and user access.
                            </p>
                            <div className="settings-preferences__control-stack">
                                <Text
                                    id="create-org-name"
                                    label="Organisation name"
                                    placeholder="Company or team name"
                                    value={organisationName}
                                    onChange={(e) => setOrganisationName(e.target.value)}
                                />
                                <Email
                                    id="create-org-admin-email"
                                    label="Admin email"
                                    placeholder="Primary administrator email"
                                    value={organisationAdmin}
                                    autoComplete="off"
                                    onChange={(e) => setOrganisationAdmin(e.target.value)}
                                />
                            </div>
                        </section>
                    </div>

                    <footer className="settings-preferences__actions">
                        <button type="submit" className="cta">
                            Create organisation
                        </button>
                    </footer>
                </form>
            </main>
        </>
    );
}
