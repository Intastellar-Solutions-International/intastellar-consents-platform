import "./Style/Style.css";
import { OrganisationContext } from "../../../App";
import Fetch from "../../../Functions/fetch";
import API from "../../../API/api";
import Text from "../../../Components/InputFields/textInput";
import Email from "../../../Components/InputFields/EmailInput";
import SuccessWindow from "../../../Components/SuccessWindow";
import SideNav from "../../../Components/Header/SideNav";
import { reportsLinks } from "../../../Components/Header/SideNavLinks";
const Link = window.ReactRouterDOM.Link;
const { useState, useEffect, useRef, useContext } = React;
export default function AddUser() {
    document.title = "Add User to an Organisation | Intastellar Consents Solutions";
    const [Organisation, setOrganisation] = useContext(OrganisationContext);
    const [userMail, setUserMail] = useState("");
    const [userRole, setUserRole] = useState("Admin");
    const [userName, setUserName] = useState("");
    const [status, setStatus] = useState(null);
    const [organisationId, setOrganisationId] = useState(null);
    const [style, setStyle] = useState({
        right: "-100%"
    });

    const addUser = (e) => {
        e.preventDefault();
        setStatus("Loading...");
        Fetch(API.settings.addUser.url, API.settings.addUser.method,
            API.settings.addUser.headers,
            JSON.stringify(
                {
                    organisationId: organisationId,
                    userEmail: userMail,
                    userRole: userRole
                }
            )
        ).then(
            (re) => {
                setStatus(null);
                if (re == "ERROR_ADDING_USER" || re === "Err_Token_Not_Found") {
                    setStatus(`We couldn´t add the user`);
                    setStyle({
                        right: "0",
                        borderColor: "red"
                    })
                } else {
                    setStatus(`User ${userName} added to ${Organisation?.name}`);
                    setStyle({
                        right: "0"
                    })
                }

                setTimeout(() => {
                    setStyle({
                        right: "-100%",
                        borderColor: "red"
                    })
                }, 6000)
            }
        )
    };

    return (
        <>
            <SideNav links={reportsLinks} title="Settings" />
            <main className="dashboard-content">
                <h1>Add user for {JSON.parse(Organisation).name}</h1>
                <Link className="backLink" to="/settings">Back to settings</Link>
                <SuccessWindow style={style} message={status} />
                <form onSubmit={addUser}>
                    <label for="name">Name</label>
                    <Text onChange={(e) => setUserName(e.target.value)} />
                    <label for="email">Email</label>
                    <Email onChange={(e) => setUserMail(e.target.value)} />
                    <label for="role">Role</label>
                    <select id="role" className="intInput" name="role" onChange={(e) => setUserRole(e.target.value)}>
                        <option>Admin</option>
                        <option selected>Manager</option>
                    </select>
                    <label for="organisation">Organisation</label>
                    <select id="organisation" className="intInput" disabled name="organisation" onChange={(e) => setOrganisationId(e.target.value)}>
                        <option value={JSON.parse(Organisation).id}>{JSON.parse(Organisation).name}</option>
                    </select>
                    <button className="cta">Add user</button>
                </form>
            </main>
        </>
    )
}