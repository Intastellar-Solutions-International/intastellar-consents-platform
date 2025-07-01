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
export default function ViewUsers() {
    document.title = "Users in the Organisation | Intastellar Consents | CMP";
    const { handle, id } = useParams();

    const [loading, data, error, updated] = useFetch(1, API.settings.getOrgUsers.url, API.settings.getOrgUsers.method, API.settings.getOrgUsers.headers)

    function editOrganisation(org) {
        console.log("Edit: ", org);
    }

    return (
        <>
            <SideNav links={reportsLinks} title="Settings" />
            <main className="dashboard-content">
                <h1>Users in my organisation</h1>
                <Link className="backLink" to="/settings">Back to settings</Link>
                <div className="grid">
                    {
                        (loading) ? <Loading /> : data.map((d, key) => {
                            return (
                                <article key={key} className="widget">
                                    <h2 >{d.email}</h2>
                                    <h2 >{d.role}</h2>
                                    {
                                        (Authentication.User.Status === "admin" || Authentication.User.Status === "super-admin") ?
                                            <button className="cta" onClick={() => editOrganisation({ name: d.name, id: d.id })}>Edit</button>
                                            : null
                                    }
                                </article>
                            )
                        })
                    }
                </div>
            </main>
        </>
    )
}