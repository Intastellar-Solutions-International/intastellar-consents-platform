const { useState, useEffect } = window.React;
import Fetch from "../../../Functions/fetch";
import API from "../../../API/api";
import Text from "../../../Components/InputFields/textInput";
import Email from "../../../Components/InputFields/EmailInput";
import Password from "../../../Components/InputFields/PasswordInput";
import SideNav from "../../../Components/Header/SideNav";
import { reportsLinks } from "../../../Components/Header/SideNavLinks";
import StickyPageTitle from "../../../Components/Header/Sticky";
import "../Style.css";

function normaliseOrganisationList(re) {
    if (Array.isArray(re)) return re;
    if (re && typeof re === "object") {
        if (Array.isArray(re.organisations)) return re.organisations;
        if (Array.isArray(re.data)) return re.data;
    }
    return [];
}

export default function CreateUser() {
    document.title = "Create user | Settings | Intastellar Consents | CMP";
    const [firstName, setFirstName] = useState("");
    const [lastName, setLastName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [role, setRole] = useState("Admin");
    const [organisationId, setOrganisationId] = useState("");
    const [organisations, setOrganisations] = useState([]);
    const [status, setStatus] = useState(null);
    const [error, setError] = useState(false);

    useEffect(() => {
        Fetch(
            API.settings.getAllOrganisations.url,
            API.settings.getAllOrganisations.method,
            API.settings.getAllOrganisations.headers
        ).then((re) => {
            const list = typeof re === "string" && re.startsWith("Err_") ? [] : normaliseOrganisationList(re);
            setOrganisations(list);
            if (list.length && !organisationId) {
                setOrganisationId(String(list[0].id ?? list[0].organisationId ?? ""));
            }
        });
    }, []);

    const createUser = (e) => {
        e.preventDefault();
        if (!organisationId) {
            setStatus("Choose an organisation.");
            setError(true);
            return;
        }
        setStatus("Creating user…");
        setError(false);
        Fetch(
            API.settings.createUser.url,
            API.settings.createUser.method,
            API.settings.createUser.headers,
            API.settings.createUser.body(firstName, lastName, email, password, role, organisationId)
        ).then((re) => {
            if (re === "Err_Login_Expired" || re === "Err_No_Permission" || re === "Err_Token_Not_Found") {
                setStatus("You do not have permission to create users, or your session expired.");
                setError(true);
                return;
            }
            if (re === "Err_Server_Error" || re === "Err_Not_Found") {
                setStatus("The server could not complete this request. Try again later.");
                setError(true);
                return;
            }
            if (re && typeof re === "object" && re.error) {
                setStatus(String(re.error));
                setError(true);
                return;
            }
            setStatus(`User created for ${email || "the given email"}.`);
            setError(false);
            setFirstName("");
            setLastName("");
            setEmail("");
            setPassword("");
        });
    };

    return (
        <>
            <SideNav links={reportsLinks} title="Settings" />
            <main className="dashboard-content settings-subpage">
                <StickyPageTitle title="Create user" />
                <p className="settings-subpage__intro">
                    Provision a new account and assign it to an organisation. The person can sign in with the
                    email and password you set here.
                </p>
                <form className="settings-subpage__panel settings-subpage__form" onSubmit={createUser}>
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
                        label="First name"
                        placeholder="First name"
                        onChange={(e) => setFirstName(e.target.value)}
                    />
                    <Text
                        label="Last name"
                        placeholder="Last name"
                        onChange={(e) => setLastName(e.target.value)}
                    />
                    <Email label="Email" placeholder="Email address" onChange={(e) => setEmail(e.target.value)} />
                    <Password
                        label="Password"
                        placeholder="Temporary password"
                        onChange={(e) => setPassword(e.target.value)}
                    />
                    <div>
                        <label className="settings-subpage__intro" style={{ display: "block", marginBottom: 8 }}>
                            Role
                        </label>
                        <select
                            id="create-user-role"
                            className="settings-subpage__select"
                            name="role"
                            value={role}
                            onChange={(e) => setRole(e.target.value)}
                        >
                            <option value="Admin">Admin</option>
                            <option value="Manager">Manager</option>
                        </select>
                    </div>
                    <div>
                        <label className="settings-subpage__intro" style={{ display: "block", marginBottom: 8 }}>
                            Organisation
                        </label>
                        <select
                            id="organisation"
                            className="settings-subpage__select"
                            name="organisation"
                            value={organisationId}
                            onChange={(e) => setOrganisationId(e.target.value)}
                        >
                            {organisations.length === 0 ? (
                                <option value="">No organisations loaded</option>
                            ) : null}
                            {organisations.map((org) => (
                                <option key={org.id ?? org.organisationId} value={String(org.id ?? org.organisationId)}>
                                    {org.name ?? org.organisationName ?? org.id}
                                </option>
                            ))}
                        </select>
                    </div>
                    <button type="submit" className="cta">
                        Create user
                    </button>
                </form>
            </main>
        </>
    );
}
