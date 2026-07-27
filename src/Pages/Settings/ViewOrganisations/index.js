const { useState, useEffect, useCallback } = React;
import useFetch from "../../../Functions/FetchHook";
import Fetch from "../../../Functions/fetch";
import API from "../../../API/api";
import Authentication from "../../../Authentication/Auth";
import { CurrentPageLoading } from "../../../Components/widget/Loading";
import SideNav from "../../../Components/Header/SideNav";
import { reportsLinks } from "../../../Components/Header/SideNavLinks";
import StickyPageTitle from "../../../Components/Header/Sticky";
import "../Style.css";
import appStorage from '../../../Functions/storage.js';

const Link = window.ReactRouterDOM.Link;

const listBody = () =>
    JSON.stringify({
        organisationMember: Authentication.getUserId(),
    });

export default function ViewOrg() {
    document.title = "Organisations | Settings | Intastellar Consents | CMP";

    const [listTick, setListTick] = useState(0);
    const [loading, data] = useFetch(
        1,
        API.settings.getOrganisation.url,
        API.settings.getOrganisation.method,
        API.settings.getOrganisation.headers,
        listBody(),
        listTick
    );

    const [modalOrg, setModalOrg] = useState(null);
    const [editName, setEditName] = useState("");
    const [modalError, setModalError] = useState(null);
    /** null | "save" | "delete" */
    const [pending, setPending] = useState(null);
    const [deleteConfirm, setDeleteConfirm] = useState(false);

    const rows = Array.isArray(data) ? data : [];

    const closeModal = useCallback(() => {
        setModalOrg(null);
        setEditName("");
        setModalError(null);
        setPending(null);
        setDeleteConfirm(false);
    }, []);

    useEffect(() => {
        if (!modalOrg) return undefined;
        const onKey = (e) => {
            if (e.key === "Escape") closeModal();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [modalOrg, closeModal]);

    function openModal(org) {
        setModalOrg(org);
        setEditName(org?.name ?? "");
        setModalError(null);
        setDeleteConfirm(false);
        setPending(null);
    }

    function canEditOrg(orgId) {
        const r = Authentication.getOrganisationAccessStatusForOrganisation(orgId);
        return r === "admin" || r === "super-admin";
    }

    function canCreateOrganisationFromHere() {
        try {
            const id = JSON.parse(appStorage.getItem("organisation")).id;
            const r = Authentication.getOrganisationAccessStatusForOrganisation(id);
            return r === "admin" || r === "super-admin";
        } catch {
            return false;
        }
    }

    function afterMutationSuccess() {
        setListTick((n) => n + 1);
        closeModal();
    }

    function handleSave(e) {
        e.preventDefault();
        if (!modalOrg) return;
        const name = editName.trim();
        if (!name) {
            setModalError("Enter an organisation name.");
            return;
        }
        setModalError(null);
        setDeleteConfirm(false);
        setPending("save");
        Fetch(
            API.settings.updateOrganisation.url,
            API.settings.updateOrganisation.method,
            API.settings.updateOrganisation.headers,
            JSON.stringify({
                organisationId: modalOrg.id,
                organisationName: name,
            })
        ).then((re) => {
            setPending(null);
            if (re === "Err_Login_Expired" || re === "Err_Token_Not_Found") {
                appStorage.removeItem("globals");
                window.location.href = "/login";
                return;
            }
            if (re === "Err_No_Access" || re === "Err_No_Permission" || re === "Err_Server_Error") {
                setModalError("Could not update the organisation. Check permissions or try again.");
                return;
            }
            if (re && typeof re === "object" && re.error) {
                setModalError(String(re.error));
                return;
            }
            try {
                const raw = appStorage.getItem("organisation");
                if (raw) {
                    const o = JSON.parse(raw);
                    if (String(o.id) === String(modalOrg.id)) {
                        localStorage.setItem(
                            "organisation",
                            JSON.stringify({ ...o, name })
                        );
                    }
                }
            } catch {
                /* ignore */
            }
            afterMutationSuccess();
        });
    }

    function handleDelete() {
        if (!modalOrg) return;
        setModalError(null);
        setPending("delete");
        Fetch(
            API.settings.deleteOrganisation.url,
            API.settings.deleteOrganisation.method,
            API.settings.deleteOrganisation.headers,
            JSON.stringify({
                organisationId: modalOrg.id,
            })
        ).then((re) => {
            setPending(null);
            if (re === "Err_Login_Expired" || re === "Err_Token_Not_Found") {
                appStorage.removeItem("globals");
                window.location.href = "/login";
                return;
            }
            if (re === "Err_No_Access" || re === "Err_No_Permission" || re === "Err_Server_Error") {
                setModalError("Could not delete the organisation. Check permissions or try again.");
                setDeleteConfirm(false);
                return;
            }
            if (re && typeof re === "object" && re.error) {
                setModalError(String(re.error));
                setDeleteConfirm(false);
                return;
            }
            try {
                const raw = appStorage.getItem("organisation");
                if (raw) {
                    const o = JSON.parse(raw);
                    if (String(o.id) === String(modalOrg.id)) {
                        appStorage.removeItem("organisation");
                        window.location.href = "/settings";
                        return;
                    }
                }
            } catch {
                /* ignore */
            }
            afterMutationSuccess();
        });
    }

    return (
        <>
            <SideNav links={reportsLinks} title="Settings" />
            <main className="dashboard-content settings-subpage settings-subpage--wide">
                <StickyPageTitle title="Organisations" />
                <Link className="settings-subpage__back" to="/settings">
                    ← Back to settings
                </Link>
                {canCreateOrganisationFromHere() ? (
                    <div className="settings-subpage__toolbar">
                        <p className="settings-subpage__intro" style={{ margin: 0, flex: "1 1 280px" }}>
                            Organisations your account can access. Edit is only available where you are admin
                            or super-admin. Create additional organisations from here.
                        </p>
                        <Link className="cta" to="/settings/create-organisation">
                            Create organisation
                        </Link>
                    </div>
                ) : (
                    <p className="settings-subpage__intro">
                        Organisations your account can access. Edit is only available where you are admin or
                        super-admin.
                    </p>
                )}
                <div className="settings-table-wrap">
                    {loading ? (
                        <CurrentPageLoading />
                    ) : rows.length > 0 ? (
                        <table className="settings-table">
                            <thead>
                                <tr>
                                    <th>Name</th>
                                    <th style={{ width: 140 }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((d) => (
                                    <tr key={d.id}>
                                        <td>{d.name}</td>
                                        <td>
                                            {canEditOrg(d.id) ? (
                                                <button type="button" className="cta" onClick={() => openModal(d)}>
                                                    Edit
                                                </button>
                                            ) : (
                                                <span style={{ color: "rgba(180,180,180,0.6)" }}>—</span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    ) : (
                        <p className="settings-subpage__empty">No organisations found.</p>
                    )}
                </div>
            </main>

            {modalOrg ? (
                <div
                    className="settings-blacklist-modal"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="org-edit-modal-title"
                    onClick={(e) => {
                        if (e.target === e.currentTarget) closeModal();
                    }}
                >
                    <div className="settings-blacklist-modal__card">
                        <h2 id="org-edit-modal-title">Edit organisation</h2>
                        <form onSubmit={handleSave}>
                            <label className="settings-org-modal__label" htmlFor="org-edit-name">
                                Name
                            </label>
                            <input
                                id="org-edit-name"
                                className="settings-org-modal__text-input"
                                type="text"
                                value={editName}
                                onChange={(e) => setEditName(e.target.value)}
                                autoComplete="organization"
                                disabled={!!pending}
                            />
                            {modalError ? (
                                <p
                                    className="settings-subpage__status settings-subpage__status--error"
                                    style={{ marginBottom: 14, fontSize: "0.8125rem" }}
                                >
                                    {modalError}
                                </p>
                            ) : null}
                            <div className="settings-blacklist-modal__actions">
                                <button
                                    type="button"
                                    className="settings-blacklist-modal__btn"
                                    onClick={closeModal}
                                    disabled={!!pending}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="settings-blacklist-modal__btn settings-blacklist-modal__btn--primary"
                                    disabled={!!pending}
                                >
                                    {pending === "save" ? "Saving…" : "Save name"}
                                </button>
                            </div>
                        </form>

                        <hr className="settings-org-modal__divider" />
                        <p className="settings-org-modal__danger-title">Danger zone</p>
                        <p className="settings-org-modal__danger-desc">
                            Deleting removes this organisation and its data from the platform for all members.
                            This cannot be undone.
                        </p>
                        {!deleteConfirm ? (
                            <div className="settings-blacklist-modal__actions">
                                <button
                                    type="button"
                                    className="settings-blacklist-modal__btn settings-blacklist-modal__btn--danger"
                                    onClick={() => {
                                        setDeleteConfirm(true);
                                        setModalError(null);
                                    }}
                                    disabled={!!pending}
                                >
                                    Delete organisation
                                </button>
                            </div>
                        ) : (
                            <div className="settings-blacklist-modal__actions">
                                <button
                                    type="button"
                                    className="settings-blacklist-modal__btn"
                                    onClick={() => setDeleteConfirm(false)}
                                    disabled={!!pending}
                                >
                                    Cancel delete
                                </button>
                                <button
                                    type="button"
                                    className="settings-blacklist-modal__btn settings-blacklist-modal__btn--danger"
                                    onClick={handleDelete}
                                    disabled={!!pending}
                                >
                                    {pending === "delete" ? "Deleting…" : "Yes, delete permanently"}
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            ) : null}
        </>
    );
}
