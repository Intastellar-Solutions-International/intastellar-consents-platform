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
    const role = Authentication.getCurrentOrganisationRole();
    const canManageUsers = role === "admin" || role === "super-admin";

    const [loading, data, error, updated] = useFetch(1, API.settings.getOrgUsers.url, API.settings.getOrgUsers.method, API.settings.getOrgUsers.headers)

    function editOrganisation(org) {
        console.log("Edit: ", org);
    }

    return (
        <>
            <SideNav links={reportsLinks} title="Settings" />
            <main className="dashboard-content" style={{maxWidth: "1200px"}}>
                <h1>Users in my organisation</h1>
                <section>
                    <header className="grid-cols-5 grid no-gap">
                        <h3>Org. ID</h3>
                        <h3>Name</h3>
                        <h3>Email</h3>
                        <h3>Role</h3>
                        <h3>Actions</h3>
                    </header>
                    {(loading) ? <CurrentPageLoading /> : data.length > 0 ? data.map((d, key) => {
                        console.log("Data: ", d);
                        return (
                            <article key={key} className="grid-cols-5 grid border-gray-300 rounded-md mb-4 no-gap">
                                <p className="p-4 my-0 border">{d.id}</p>
                                <p className="p-4 my-0 border">{d.name}</p>
                                <p className="p-4 my-0 border">{d.email}</p>
                                <p className="p-4 my-0 border">{d.role}</p>
                                {canManageUsers ? (
                                        <p className="p-4 my-0 border"><button className="cta" onClick={() => editOrganisation({ name: d.name, id: d.id })}>Edit</button></p>
                                    ) : (
                                        <p className="p-4 my-0 border">-</p>
                                    )}
                            </article>
                        )
                    }) : <p>No users found in your organisation.</p>}
                </section>
                {/* <div className="grid">
                    {
                        (loading) ? <Loading /> : data.map((d, key) => {
                            return (
                                <article key={key} className="widget">
                                    <h2 >{d.email}</h2>
                                    <h2 >{d.role}</h2>
                                    {canManageUsers ? (
                                            <button className="cta" onClick={() => editOrganisation({ name: d.name, id: d.id })}>Edit</button>
                                        ) : null}
                                </article>
                            )
                        })
                    }
                </div> */}
            </main>
        </>
    )
}