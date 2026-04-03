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
                    Register a new organisation and nominate an admin email. Further steps may be sent by
                    email.
                </p>
                <form className="settings-subpage__panel settings-subpage__form" onSubmit={create}>
                    {status ? (
                        <p
                            className={
                                error ? "settings-subpage__status settings-subpage__status--error" : "settings-subpage__status"
                            }
                        >
                            {status}
                        </p>
                    ) : null}
                    <Text
                        onChange={(e) => setOrganisationName(e.target.value)}
                        label="Organisation name"
                        placeholder="Company or team name"
                    />
                    <Email
                        onChange={(e) => setOrganisationAdmin(e.target.value)}
                        label="Admin email"
                        placeholder="Primary administrator email"
                    />
                    <button type="submit" className="cta">
                        Create organisation
                    </button>
                </form>
            </main>
        </>
    );
}
