import Fetch from "../../../Functions/fetch";
import Text from "../../../Components/InputFields/textInput";
import Email from "../../../Components/InputFields/EmailInput";
import { reportsLinks } from "../../../Components/Header/SideNavLinks";
import { OrganisationContext } from "../../../App";
import API from "../../../API/api";
const { useState, useEffect, useRef, useContext } = React;
const Link = window.ReactRouterDOM.Link;
export default function NewOrganisation() {
    document.title = "Create a new Organisation | Intastellar Consents | CMP";
    const [organisationName, setOrganisationName] = useState("");
    const [organisationAdmin, setOrganisationAdmin] = useState("");

    const [status, setStatus] = useState(null);
    const create = (e) => {
        e.preventDefault();
        setStatus("Loading...");
        Fetch(API.settings.createOrganisation.url, API.settings.createOrganisation.method,
            API.settings.createOrganisation.headers,
            JSON.stringify(
                {
                    organisationName: organisationName,
                    organisationMember: organisationAdmin
                }
            )
        ).then(
            (re) => {
                setStatus(null);
                if (re == "ERROR_CREATING_ORGANISATION" || re === "Err_Token_Not_Found") return;
                setStatus(`Organisation Created with the name: ${organisationName}`);
            }
        )
    };

    return (
        <>
            <main className="dashboard-content">
                <h1>Create a Organisation</h1>
                <form onSubmit={create}>
                    <p>{(status != null) ? status : null}</p>
                    <label htmlFor="orgName">Organisation Name</label><br />
                    <label htmlFor="MemberName">Admin Email</label><br />
                    <Text onChange={(e) => setOrganisationName(e.target.value)} />
                    <Email onChange={(e) => setOrganisationAdmin(e.target.value)} />
                    <button type="submit">Create Organisation</button>
                </form>
            </main>
        </>
    )
}