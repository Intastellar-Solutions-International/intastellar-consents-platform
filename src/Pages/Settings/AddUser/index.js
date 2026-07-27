import { OrganisationContext } from "../../../App";
import Fetch from "../../../Functions/fetch";
import API from "../../../API/api";
import Text from "../../../Components/InputFields/textInput";
import Email from "../../../Components/InputFields/EmailInput";
import SuccessWindow from "../../../Components/SuccessWindow";
import SideNav from "../../../Components/Header/SideNav";
import { reportsLinks } from "../../../Components/Header/SideNavLinks";
import StickyPageTitle from "../../../Components/Header/Sticky";
import "../Style.css";

const { useState, useContext } = React;

export default function AddUser() {
    document.title = "Add user | Settings | Intastellar Consents | CMP";
    const [Organisation] = useContext(OrganisationContext);
    const org = JSON.parse(Organisation);
    const [userMail, setUserMail] = useState("");
    const [userRole, setUserRole] = useState("Manager");
    const [userName, setUserName] = useState("");
    const [status, setStatus] = useState(null);
    const [organisationId] = useState(org.id);
    const [toastStyle, setToastStyle] = useState({ right: "-100%" });

    const addUser = (e) => {
        e.preventDefault();
        setStatus("Loading...");
        Fetch(
            API.settings.addUser.url,
            API.settings.addUser.method,
            API.settings.addUser.headers,
            JSON.stringify({
                organisationId,
                userEmail: userMail,
                userRole,
                userName,
                orgName: org.name,
            })
        ).then((re) => {
            setStatus(null);
            if (re === "ERROR_ADDING_USER" || re === "Err_Token_Not_Found") {
                setStatus(`We couldn't add the user.`);
                setToastStyle({ right: "0", borderColor: "red" });
            } else {
                setStatus(`User ${userName} added to ${org.name}.`);
                setToastStyle({ right: "0" });
            }
            setTimeout(() => {
                setToastStyle({ right: "-100%", borderColor: undefined });
            }, 6000);
        });
    };

    return (
        <>
            <SideNav links={reportsLinks} title="Settings" />
            <main className="dashboard-content settings-subpage">
                <StickyPageTitle title="Add user" />
                <p className="settings-subpage__intro">
                    Invite someone to <strong>{org.name}</strong>. They will receive access according to the role
                    you choose.
                </p>
                <SuccessWindow style={toastStyle} message={status} />
                <form className="settings-subpage__panel settings-subpage__form" onSubmit={addUser}>
                    <Text label="Name" placeholder="Full name" onChange={(e) => setUserName(e.target.value)} />
                    <Email label="Email" placeholder="Email address" onChange={(e) => setUserMail(e.target.value)} />
                    <div>
                        <label className="settings-subpage__intro" style={{ display: "block", marginBottom: 8 }}>
                            Role
                        </label>
                        <select
                            id="role"
                            className="settings-subpage__select"
                            name="role"
                            value={userRole}
                            onChange={(e) => setUserRole(e.target.value)}
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
                            disabled
                            value={String(org.id)}
                        >
                            <option value={String(org.id)}>{org.name}</option>
                        </select>
                    </div>
                    <button type="submit" className="cta">
                        Add user
                    </button>
                </form>
            </main>
        </>
    );
}
