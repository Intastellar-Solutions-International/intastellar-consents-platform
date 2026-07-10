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

function getCurrentOrganisationId() {
    try {
        const o = JSON.parse(appStorage.getItem("organisation"));
        return o?.id != null ? String(o.id) : null;
    } catch {
        return null;
    }
}

export default function ViewUsers() {
    document.title = "Users | Settings | Intastellar Consents | CMP";
    const role = Authentication.getCurrentOrganisationRole();
    const canManageUsers = role === "admin" || role === "super-admin";

    const [listTick, setListTick] = useState(0);
    const [loading, data] = useFetch(
        1,
        API.settings.getOrgUsers.url,
        API.settings.getOrgUsers.method,
        API.settings.getOrgUsers.headers,
        undefined,
        listTick
    );

    const [modalUser, setModalUser] = useState(null);
    const [editName, setEditName] = useState("");
    const [editEmail, setEditEmail] = useState("");
    const [editRole, setEditRole] = useState("Manager");
    const [modalError, setModalError] = useState(null);
    const [pending, setPending] = useState(null);
    const [deleteConfirm, setDeleteConfirm] = useState(false);

    const rows = Array.isArray(data) ? data : [];

    const closeModal = useCallback(() => {
        setModalUser(null);
        setEditName("");
        setEditEmail("");
        setEditRole("Manager");
        setModalError(null);
        setPending(null);
        setDeleteConfirm(false);
    }, []);

    useEffect(() => {
        if (!modalUser) return undefined;
        const onKey = (e) => {
            if (e.key === "Escape") closeModal();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [modalUser, closeModal]);

    function openModal(u) {
        setModalUser(u);
        setEditName(u?.name ?? u?.userName ?? "");
        setEditEmail(u?.email ?? u?.userEmail ?? "");
        const rr = String(u?.role ?? "").toLowerCase();
        setEditRole(rr === "admin" || rr === "super-admin" ? "Admin" : "Manager");
        setModalError(null);
        setDeleteConfirm(false);
        setPending(null);
    }

    const isSelf =
        modalUser != null && String(modalUser.id ?? modalUser.userId) === String(Authentication.getUserId());

    function afterMutationSuccess() {
        setListTick((n) => n + 1);
        closeModal();
    }

    function handleSave(e) {
        e.preventDefault();
        if (!modalUser) return;
        const orgId = getCurrentOrganisationId();
        if (!orgId) {
            setModalError("No organisation selected.");
            return;
        }
        const name = editName.trim();
        const email = editEmail.trim();
        if (!name) {
            setModalError("Enter a name.");
            return;
        }
        if (!email) {
            setModalError("Enter an email.");
            return;
        }
        setModalError(null);
        setDeleteConfirm(false);
        setPending("save");
        Fetch(
            API.settings.updateOrgUser.url,
            API.settings.updateOrgUser.method,
            API.settings.updateOrgUser.headers,
            JSON.stringify({
                organisationId: orgId,
                userId: modalUser.id ?? modalUser.userId,
                userName: name,
                userEmail: email,
                userRole: editRole,
            })
        ).then((re) => {
            setPending(null);
            if (re === "Err_Login_Expired" || re === "Err_Token_Not_Found") {
                appStorage.removeItem("globals");
                window.location.href = "/login";
                return;
            }
            if (re === "Err_No_Access" || re === "Err_No_Permission" || re === "Err_Server_Error") {
                setModalError("Could not update the user. Check permissions or try again.");
                return;
            }
            if (re && typeof re === "object" && re.error) {
                setModalError(String(re.error));
                return;
            }
            afterMutationSuccess();
        });
    }

    function handleDelete() {
        if (!modalUser || isSelf) return;
        const orgId = getCurrentOrganisationId();
        if (!orgId) {
            setModalError("No organisation selected.");
            return;
        }
        setModalError(null);
        setPending("delete");
        Fetch(
            API.settings.deleteOrgUser.url,
            API.settings.deleteOrgUser.method,
            API.settings.deleteOrgUser.headers,
            JSON.stringify({
                organisationId: orgId,
                userId: modalUser.id ?? modalUser.userId,
            })
        ).then((re) => {
            setPending(null);
            if (re === "Err_Login_Expired" || re === "Err_Token_Not_Found") {
                appStorage.removeItem("globals");
                window.location.href = "/login";
                return;
            }
            if (re === "Err_No_Access" || re === "Err_No_Permission" || re === "Err_Server_Error") {
                setModalError("Could not remove the user. Check permissions or try again.");
                setDeleteConfirm(false);
                return;
            }
            if (re && typeof re === "object" && re.error) {
                setModalError(String(re.error));
                setDeleteConfirm(false);
                return;
            }
            afterMutationSuccess();
        });
    }

    const usersIntro =
        "Members of the organisation currently selected in the header. Admins can edit or remove users, and create new platform accounts from here.";

    return (
        <>
            <SideNav links={reportsLinks} title="Settings" />
            <main className="dashboard-content settings-subpage settings-subpage--wide">
                <StickyPageTitle title="Users in organisation" />
                <Link className="settings-subpage__back" to="/settings">
                    ← Back to settings
                </Link>
                {canManageUsers ? (
                    <div className="settings-subpage__toolbar">
                        <p className="settings-subpage__intro" style={{ margin: 0, flex: "1 1 280px" }}>
                            {usersIntro}
                        </p>
                        <Link className="cta" to="/settings/create-user">
                            Create user
                        </Link>
                    </div>
                ) : (
                    <p className="settings-subpage__intro">{usersIntro}</p>
                )}
                <div className="settings-table-wrap">
                    {loading ? (
                        <CurrentPageLoading />
                    ) : rows.length > 0 ? (
                        <table className="settings-table">
                            <thead>
                                <tr>
                                    <th>ID</th>
                                    <th>Name</th>
                                    <th>Email</th>
                                    <th>Role</th>
                                    <th style={{ width: 120 }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((d, key) => (
                                    <tr key={d.id ?? d.userId ?? key}>
                                        <td>{d.id ?? d.userId}</td>
                                        <td>{d.name ?? d.userName}</td>
                                        <td>{d.email ?? d.userEmail}</td>
                                        <td>{d.role}</td>
                                        <td>
                                            {canManageUsers ? (
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
                        <p className="settings-subpage__empty">No users found in your organisation.</p>
                    )}
                </div>
            </main>

            {modalUser ? (
                <div
                    className="settings-blacklist-modal"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="user-edit-modal-title"
                    onClick={(e) => {
                        if (e.target === e.currentTarget) closeModal();
                    }}
                >
                    <div className="settings-blacklist-modal__card">
                        <h2 id="user-edit-modal-title">Edit user</h2>
                        <form onSubmit={handleSave}>
                            <div className="settings-org-modal__field-block">
                                <label className="settings-org-modal__label" htmlFor="user-edit-name">
                                    Name
                                </label>
                                <input
                                    id="user-edit-name"
                                    className="settings-org-modal__text-input"
                                    type="text"
                                    value={editName}
                                    onChange={(e) => setEditName(e.target.value)}
                                    autoComplete="name"
                                    disabled={!!pending}
                                />
                            </div>
                            <div className="settings-org-modal__field-block">
                                <label className="settings-org-modal__label" htmlFor="user-edit-email">
                                    Email
                                </label>
                                <input
                                    id="user-edit-email"
                                    className="settings-org-modal__text-input"
                                    type="email"
                                    value={editEmail}
                                    onChange={(e) => setEditEmail(e.target.value)}
                                    autoComplete="email"
                                    disabled={!!pending}
                                />
                            </div>
                            <div className="settings-org-modal__field-block">
                                <label className="settings-org-modal__label" htmlFor="user-edit-role">
                                    Role
                                </label>
                                <select
                                    id="user-edit-role"
                                    className="settings-org-modal__select"
                                    value={editRole}
                                    onChange={(e) => setEditRole(e.target.value)}
                                    disabled={!!pending}
                                >
                                    <option value="Admin">Admin</option>
                                    <option value="Manager">Manager</option>
                                </select>
                            </div>
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
                                    {pending === "save" ? "Saving…" : "Save changes"}
                                </button>
                            </div>
                        </form>

                        <hr className="settings-org-modal__divider" />
                        <p className="settings-org-modal__danger-title">Danger zone</p>
                        {isSelf ? (
                            <p className="settings-org-modal__danger-desc">
                                You cannot remove your own account from this list. Ask another admin if you need
                                to transfer access.
                            </p>
                        ) : (
                            <>
                                <p className="settings-org-modal__danger-desc">
                                    Removing a user revokes their access to this organisation. This cannot be
                                    undone from here.
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
                                            Remove from organisation
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
                                            Cancel remove
                                        </button>
                                        <button
                                            type="button"
                                            className="settings-blacklist-modal__btn settings-blacklist-modal__btn--danger"
                                            onClick={handleDelete}
                                            disabled={!!pending}
                                        >
                                            {pending === "delete" ? "Removing…" : "Yes, remove user"}
                                        </button>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </div>
            ) : null}
        </>
    );
}
