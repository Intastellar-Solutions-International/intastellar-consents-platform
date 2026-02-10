import Fetch from "../../../Functions/fetch";
import useFetch from "../../../Functions/FetchHook";
import API from "../../../API/api";
import Authentication from "../../../Authentication/Auth";
import { Loading, CurrentPageLoading } from "../../../Components/widget/Loading";
import SideNav from "../../../Components/Header/SideNav";
import { reportsLinks } from "../../../Components/Header/SideNavLinks";
const { useState, useEffect, useRef } = React;
const Link = window.ReactRouterDOM.Link;
const useParams = window.ReactRouterDOM.useParams;
export default function ViewOrg() {
    document.title = "My Organisation | Intastellar Consents | CMP";
    const { handle, id } = useParams();

    const [loading, data, error, updated] = useFetch(1, API.settings.getOrganisation.url, API.settings.getOrganisation.method, API.settings.getOrganisation.headers, JSON.stringify({
        organisationMember: Authentication.getUserId()
    }))

    function editOrganisation(org) {
        window.location.href = `/settings/edit-organisation/${org.id}`;
    }

    return (
        <>
            <SideNav links={reportsLinks} title="Settings" />
            <main className="dashboard-content" style={{ padding: "20px", maxWidth: "1200px" }}>
                <h1>My Organisation</h1>
                <Link className="backLink" to="/settings">Back to settings</Link>
                <section>
                    <header className="grid-cols-5 grid no-gap">
                        <h3>Name</h3>
                        <h3>Actions</h3>
                    </header>
                    {(loading) ? <CurrentPageLoading /> : data.length > 0 ? data.map((d, key) => {
                        console.log("Data: ", d);
                        return (
                            <article key={key} className="grid-cols-5 grid border-gray-300 rounded-md mb-4 no-gap">
                                <p className="p-4 my-0 border">{d.name}</p>
                                {
                                    (Authentication.getOrganisationAccessStatusForOrganisation(d.id) === "admin" || Authentication.getOrganisationAccessStatusForOrganisation(d.id) === "super-admin") ?
                                        <p className="p-4 my-0 border"><button className="cta" onClick={() => editOrganisation({ name: d.name, id: d.id })}>Edit</button></p>
                                        : <p className="p-4 my-0 border">-</p>
                                }
                            </article>
                        )
                    }) : <p>No organisations found.</p>}
                </section>
            </main>
        </>
    )
}