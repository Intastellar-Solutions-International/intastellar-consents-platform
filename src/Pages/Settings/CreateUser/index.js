const { useState, useEffect, useMemo } = window.React;
import Fetch from "../../../Functions/fetch";
import API from "../../../API/api";
import Text from "../../../Components/InputFields/textInput";
import Email from "../../../Components/InputFields/EmailInput";
import Password from "../../../Components/InputFields/PasswordInput";
import Select from "../../../Components/SelectInput/Selector";
import SideNav from "../../../Components/Header/SideNav";
import { reportsLinks } from "../../../Components/Header/SideNavLinks";
import StickyPageTitle from "../../../Components/Header/Sticky";
import "../Style.css";

const ROLE_ITEMS = [
    { id: "Admin", name: "Admin" },
    { id: "Manager", name: "Manager" },
];

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
    const [orgsLoaded, setOrgsLoaded] = useState(false);
    const [status, setStatus] = useState(null);
    const [error, setError] = useState(false);

    const orgSelectItems = useMemo(() => {
        if (!orgsLoaded && organisations.length === 0) {
            return [{ id: "", name: "Loading organisations…" }];
        }
        if (orgsLoaded && organisations.length === 0) {
            return [{ id: "", name: "No organisations available" }];
        }
        return organisations.map((org) => ({
            id: String(org.id ?? org.organisationId ?? ""),
            name: String(org.name ?? org.organisationName ?? org.id ?? "—"),
        }));
    }, [organisations, orgsLoaded]);

    const orgSelectDefault = useMemo(() => {
        const row = orgSelectItems.find((i) => i.id === organisationId);
        const name = row?.name ?? "Select organisation";
        return JSON.stringify({ id: organisationId, name });
    }, [orgSelectItems, organisationId]);

    useEffect(() => {
        Fetch(
            API.settings.getAllOrganisations.url,
            API.settings.getAllOrganisations.method,
            API.settings.getAllOrganisations.headers
        )
            .then((re) => {
                const list = typeof re === "string" && re.startsWith("Err_") ? [] : normaliseOrganisationList(re);
                setOrganisations(list);
                if (list.length && !organisationId) {
                    setOrganisationId(String(list[0].id ?? list[0].organisationId ?? ""));
                }
            })
            .finally(() => setOrgsLoaded(true));
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
                    Provision a new account and assign it to an organisation. They sign in with the email and
                    password you set here.
                </p>
                <form className="settings-subpage__panel settings-preferences" onSubmit={createUser} noValidate>
                    <header className="settings-preferences__header">
                        <h2 className="settings-preferences__title">New user account</h2>
                        <p className="settings-preferences__lede">
                            Identity details first, then which organisation and role they receive.
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
                        <section className="settings-preferences__group" aria-labelledby="create-user-identity">
                            <h3 className="settings-preferences__group-title" id="create-user-identity">
                                Identity
                            </h3>
                            <p className="settings-preferences__group-desc">
                                Legal or display name, contact email, and an initial password they can change after
                                first login.
                            </p>
                            <div className="settings-preferences__fields-grid settings-preferences__fields-grid--2">
                                <Text
                                    id="create-user-first"
                                    label="First name"
                                    placeholder="First name"
                                    value={firstName}
                                    onChange={(e) => setFirstName(e.target.value)}
                                />
                                <Text
                                    id="create-user-last"
                                    label="Last name"
                                    placeholder="Last name"
                                    value={lastName}
                                    onChange={(e) => setLastName(e.target.value)}
                                />
                            </div>
                            <div className="settings-preferences__control-stack" style={{ marginTop: 16 }}>
                                <Email
                                    id="create-user-email"
                                    label="Email"
                                    placeholder="Email address"
                                    value={email}
                                    autoComplete="off"
                                    onChange={(e) => setEmail(e.target.value)}
                                />
                                <Password
                                    id="create-user-password"
                                    label="Password"
                                    placeholder="Temporary password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                />
                            </div>
                        </section>

                        <section className="settings-preferences__group" aria-labelledby="create-user-access">
                            <h3 className="settings-preferences__group-title" id="create-user-access">
                                Access
                            </h3>
                            <p className="settings-preferences__group-desc">
                                Role controls what they can do in that organisation. You can invite additional
                                users from “Add user” on the current org.
                            </p>
                            <div className="settings-preferences__control-stack">
                                <div className="settings-preferences__field">
                                    <span className="settings-preferences__label">Role</span>
                                    <Select
                                        key={`role-${role}`}
                                        name="createUserRole"
                                        defaultValue={JSON.stringify({ id: role, name: role })}
                                        onChange={(ev) => {
                                            const p = JSON.parse(ev);
                                            setRole(p.id);
                                        }}
                                        items={ROLE_ITEMS}
                                        align="left"
                                    />
                                </div>
                                <div className="settings-preferences__field">
                                    <span className="settings-preferences__label">Organisation</span>
                                    <Select
                                        key={`org-${organisationId}-${orgSelectItems.map((i) => i.id).join("|")}`}
                                        name="createUserOrganisation"
                                        defaultValue={orgSelectDefault}
                                        onChange={(ev) => {
                                            const p = JSON.parse(ev);
                                            setOrganisationId(String(p.id));
                                        }}
                                        items={orgSelectItems}
                                        align="left"
                                    />
                                </div>
                            </div>
                        </section>
                    </div>

                    <footer className="settings-preferences__actions">
                        <button type="submit" className="cta">
                            Create user
                        </button>
                    </footer>
                </form>
            </main>
        </>
    );
}
