import "./Style.css";
import SideNav from "../../Components/Header/SideNav";
import { reportsLinks } from "../../Components/Header/SideNavLinks";
const { useState, useEffect, useRef } = React;
const Link = window.ReactRouterDOM.Link;
const useParams = window.ReactRouterDOM.useParams;

export default function Settings(props) {
    document.title = "Settings | Intastellar Consents Solutions";
    const { handle, id } = useParams();

    return (
        <>
            <SideNav links={reportsLinks} title="Settings" />
            <main className="dashboard-content">

            </main>
        </>
    )
}