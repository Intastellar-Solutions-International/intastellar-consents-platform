import SideNav from "../../../components/Header/SideNav";
import { reportsLinks } from "../../../components/Header/SideNavLinks";
import Text from "../../../components/InputFields/textInput";
import Email from "../../../components/InputFields/EmailInput";
import Password from "../../../components/InputFields/PasswordInput";
import Fetch from "../../../functions/fetch";
import API from "../../../api/api";
const { useState, useEffect } = React;
function CreateUser() {
    document.title = "Create User | Intastellar Consents | CMP";
    const [firstName, setFirstName] = useState("");
    const [lastName, setLastName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [role, setRole] = useState("Admin");
    const [allOrganisations, setAllOrganisations] = useState();


    useEffect(() => {
        Fetch(
            `${PrimaryHost}/cmp/get-organisation`,
            "GET",
            {
                "Authorization": Authentication.getToken(),
                "Content-Type": "application/json"
            }
        ).then((re) => re.json()).then((re) => {
            setAllOrganisations(re);
        })
        .catch((err) => {
            console.log(err);
        })
        .finally(() => {
            setStatus("Loading...");
        })
    },[]);
    const createUser = (e) => {
        e.preventDefault();
        Fetch(API.settings.createUser.url, API.settings.createUser.method,
            API.settings.createUser.headers,
            API.settings.createUser.body(firstName, lastName, email, password, role, organisation)
        ).then((re) => re.json()).then((re) => {
            console.log(re);
        })
        .catch((err) => {
            console.log(err);
        })
        .finally(() => {
            setStatus("Loading...");
        })
    }
    return (
        <>
        <SideNav links={reportsLinks} title="Settings" />
        <main className="dashboard-content" style={{ padding: "20px", maxWidth: "1200px" }}>
            <h1>Create User</h1>
            <form onSubmit={createUser}>
                <label for="name">First Name</label>
                <Text onChange={(e) => setFirstName(e.target.value)} />
                <label for="name">Last Name</label>
                <Text onChange={(e) => setLastName(e.target.value)} />
                <label for="email">Email</label>
                <Email onChange={(e) => setEmail(e.target.value)} />
                <label for="password">Password</label>
                <Password onChange={(e) => setPassword(e.target.value)} />
                <label for="organisation">Organisation</label>
                <select id="organisation" className="intInput" name="organisation" onChange={(e) => setOrganisation(e.target.value)}>
                    {allOrganisations.map((organisation) => (
                        <option value={organisation.id}>{organisation.name}</option>
                    ))}
                </select>
                <button className="cta" type="submit">Create User</button>
            </form>
        </main>
        </>
    )
}

export default CreateUser;