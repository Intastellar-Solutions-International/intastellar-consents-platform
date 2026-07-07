const { useState, useEffect, useCallback } = React;
import Authentication from "../../../Authentication/Auth";
import { CurrentPageLoading } from "../../../Components/widget/Loading";
import SideNav from "../../../Components/Header/SideNav";
import { reportsLinks } from "../../../Components/Header/SideNavLinks";
import StickyPageTitle from "../../../Components/Header/Sticky";
import "../Style.css";

const Link = window.ReactRouterDOM.Link;

/**
 * Generate a simple unique ID for workspaces (temporary until backend)
 */
function generateId() {
    return "ws_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9);
}

/**
 * Get workspaces from localStorage (temporary storage until backend)
 */
function getStoredWorkspaces() {
    try {
        const stored = localStorage.getItem("agency_workspaces");
        if (stored) {
            return JSON.parse(stored);
        }
    } catch {
        /* ignore */
    }
    return [];
}

/**
 * Save workspaces to localStorage (temporary storage until backend)
 */
function saveWorkspaces(workspaces) {
    try {
        localStorage.setItem("agency_workspaces", JSON.stringify(workspaces));
    } catch {
        /* ignore */
    }
}

/**
 * Validate email format
 */
function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export default function Workspaces() {
    document.title = "Client Workspaces | Settings | Intastellar Consents | CMP";

    const [loading, setLoading] = useState(true);
    const [workspaces, setWorkspaces] = useState([]);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [modalWorkspace, setModalWorkspace] = useState(null);

    // Form fields
    const [editName, setEditName] = useState("");
    const [editDomain, setEditDomain] = useState("");
    const [editDescription, setEditDescription] = useState("");
    const [editUsers, setEditUsers] = useState([]);
    const [newUserEmail, setNewUserEmail] = useState("");

    const [modalError, setModalError] = useState(null);
    const [pending, setPending] = useState(null);
    const [deleteConfirm, setDeleteConfirm] = useState(false);
    const [successMessage, setSuccessMessage] = useState(null);

    // Load workspaces on mount
    useEffect(() => {
        // Simulate loading delay for consistency with other pages
        const timer = setTimeout(() => {
            setWorkspaces(getStoredWorkspaces());
            setLoading(false);
        }, 300);
        return () => clearTimeout(timer);
    }, []);

    const closeModal = useCallback(() => {
        setShowCreateModal(false);
        setModalWorkspace(null);
        setEditName("");
        setEditDomain("");
        setEditDescription("");
        setEditUsers([]);
        setNewUserEmail("");
        setModalError(null);
        setPending(null);
        setDeleteConfirm(false);
    }, []);

    // Escape key handler
    useEffect(() => {
        if (!showCreateModal && !modalWorkspace) return undefined;
        const onKey = (e) => {
            if (e.key === "Escape") closeModal();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [showCreateModal, modalWorkspace, closeModal]);

    function openCreateModal() {
        setShowCreateModal(true);
        setEditName("");
        setEditDomain("");
        setEditDescription("");
        setEditUsers([]);
        setNewUserEmail("");
        setModalError(null);
        setPending(null);
    }

    function openEditModal(workspace) {
        setModalWorkspace(workspace);
        setEditName(workspace?.name ?? "");
        setEditDomain(workspace?.domain ?? "");
        setEditDescription(workspace?.description ?? "");
        setEditUsers(workspace?.users ?? []);
        setNewUserEmail("");
        setModalError(null);
        setDeleteConfirm(false);
        setPending(null);
    }

    function canManageWorkspaces() {
        const role = Authentication.getCurrentOrganisationRole();
        return role === "admin" || role === "super-admin";
    }

    function addUser() {
        const email = newUserEmail.trim().toLowerCase();
        if (!email) {
            setModalError("Enter an email address.");
            return;
        }
        if (!isValidEmail(email)) {
            setModalError("Enter a valid email address.");
            return;
        }
        if (editUsers.some((u) => u.email.toLowerCase() === email)) {
            setModalError("This user has already been added.");
            return;
        }
        setEditUsers([...editUsers, { email, addedAt: new Date().toISOString() }]);
        setNewUserEmail("");
        setModalError(null);
    }

    function removeUser(email) {
        setEditUsers(editUsers.filter((u) => u.email.toLowerCase() !== email.toLowerCase()));
    }

    function handleCreate(e) {
        e.preventDefault();
        const name = editName.trim();
        const domain = editDomain.trim();

        if (!name) {
            setModalError("Enter a workspace name.");
            return;
        }
        if (!domain) {
            setModalError("Enter a client domain.");
            return;
        }

        // Basic domain validation
        if (!/^[a-zA-Z0-9][a-zA-Z0-9-_.]*\.[a-zA-Z]{2,}$/.test(domain)) {
            setModalError("Enter a valid domain (e.g., client-site.com).");
            return;
        }

        // Check for duplicate domain
        const existingDomain = workspaces.find(
            (ws) => ws.domain.toLowerCase() === domain.toLowerCase()
        );
        if (existingDomain) {
            setModalError("A workspace with this domain already exists.");
            return;
        }

        setModalError(null);
        setPending("create");

        // Simulate API call delay
        setTimeout(() => {
            const newWorkspace = {
                id: generateId(),
                name: name,
                domain: domain,
                description: editDescription.trim(),
                users: editUsers,
                createdAt: new Date().toISOString(),
                createdBy: Authentication.getUserId(),
            };

            const updated = [...workspaces, newWorkspace];
            setWorkspaces(updated);
            saveWorkspaces(updated);
            setPending(null);
            closeModal();
            setSuccessMessage("Workspace created successfully.");
            setTimeout(() => setSuccessMessage(null), 3000);
        }, 500);
    }

    function handleSave(e) {
        e.preventDefault();
        if (!modalWorkspace) return;

        const name = editName.trim();
        const domain = editDomain.trim();

        if (!name) {
            setModalError("Enter a workspace name.");
            return;
        }
        if (!domain) {
            setModalError("Enter a client domain.");
            return;
        }

        // Basic domain validation
        if (!/^[a-zA-Z0-9][a-zA-Z0-9-_.]*\.[a-zA-Z]{2,}$/.test(domain)) {
            setModalError("Enter a valid domain (e.g., client-site.com).");
            return;
        }

        // Check for duplicate domain (excluding current workspace)
        const existingDomain = workspaces.find(
            (ws) => ws.id !== modalWorkspace.id && ws.domain.toLowerCase() === domain.toLowerCase()
        );
        if (existingDomain) {
            setModalError("A workspace with this domain already exists.");
            return;
        }

        setModalError(null);
        setDeleteConfirm(false);
        setPending("save");

        // Simulate API call delay
        setTimeout(() => {
            const updated = workspaces.map((ws) =>
                ws.id === modalWorkspace.id
                    ? {
                          ...ws,
                          name: name,
                          domain: domain,
                          description: editDescription.trim(),
                          users: editUsers,
                          updatedAt: new Date().toISOString(),
                      }
                    : ws
            );
            setWorkspaces(updated);
            saveWorkspaces(updated);
            setPending(null);
            closeModal();
            setSuccessMessage("Workspace updated successfully.");
            setTimeout(() => setSuccessMessage(null), 3000);
        }, 500);
    }

    function handleDelete() {
        if (!modalWorkspace) return;
        setModalError(null);
        setPending("delete");

        // Simulate API call delay
        setTimeout(() => {
            const updated = workspaces.filter((ws) => ws.id !== modalWorkspace.id);
            setWorkspaces(updated);
            saveWorkspaces(updated);
            setPending(null);
            closeModal();
            setSuccessMessage("Workspace deleted.");
            setTimeout(() => setSuccessMessage(null), 3000);
        }, 500);
    }

    // User list component used in both modals
    const UserManagementSection = () => (
        <div className="settings-workspace__users-section">
            <label className="settings-org-modal__label">
                Users
            </label>
            <div className="settings-workspace__users-add">
                <input
                    type="email"
                    className="settings-org-modal__text-input settings-workspace__user-input"
                    placeholder="user@example.com"
                    value={newUserEmail}
                    onChange={(e) => setNewUserEmail(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === "Enter") {
                            e.preventDefault();
                            addUser();
                        }
                    }}
                    disabled={!!pending}
                />
                <button
                    type="button"
                    className="settings-workspace__add-user-btn"
                    onClick={addUser}
                    disabled={!!pending}
                >
                    Add
                </button>
            </div>
            {editUsers.length > 0 ? (
                <ul className="settings-workspace__users-list">
                    {editUsers.map((user) => (
                        <li key={user.email} className="settings-workspace__user-item">
                            <span className="settings-workspace__user-email">{user.email}</span>
                            <button
                                type="button"
                                className="settings-workspace__remove-user-btn"
                                onClick={() => removeUser(user.email)}
                                disabled={!!pending}
                                title="Remove user"
                            >
                                ×
                            </button>
                        </li>
                    ))}
                </ul>
            ) : (
                <p className="settings-workspace__no-users">
                    No users added yet. Add users by email above.
                </p>
            )}
        </div>
    );

    return (
        <>
            <SideNav links={reportsLinks} title="Settings" />
            <main className="dashboard-content settings-subpage settings-subpage--wide">
                <StickyPageTitle title="Client Workspaces" />
                <Link className="settings-subpage__back" to="/settings">
                    ← Back to settings
                </Link>

                {successMessage && (
                    <p className="settings-subpage__status">{successMessage}</p>
                )}

                {canManageWorkspaces() ? (
                    <div className="settings-subpage__toolbar">
                        <p
                            className="settings-subpage__intro"
                            style={{ margin: 0, flex: "1 1 280px" }}
                        >
                            Manage client workspaces for your agency. Each workspace represents
                            a client domain you manage on behalf of your clients.
                        </p>
                        <button className="cta" onClick={openCreateModal}>
                            Create workspace
                        </button>
                    </div>
                ) : (
                    <p className="settings-subpage__intro">
                        Client workspaces managed by your agency. Contact an admin to add or
                        modify workspaces.
                    </p>
                )}

                <div className="settings-table-wrap">
                    {loading ? (
                        <CurrentPageLoading />
                    ) : workspaces.length > 0 ? (
                        <table className="settings-table">
                            <thead>
                                <tr>
                                    <th>Name</th>
                                    <th>Domain</th>
                                    <th>Users</th>
                                    <th>Description</th>
                                    <th style={{ width: 140 }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {workspaces.map((ws) => (
                                    <tr key={ws.id}>
                                        <td>{ws.name}</td>
                                        <td>
                                            <span className="settings-workspace__domain">
                                                {ws.domain}
                                            </span>
                                        </td>
                                        <td>
                                            <span className="settings-workspace__user-count">
                                                {ws.users?.length || 0} user{(ws.users?.length || 0) !== 1 ? "s" : ""}
                                            </span>
                                        </td>
                                        <td>
                                            <span className="settings-workspace__description">
                                                {ws.description || "—"}
                                            </span>
                                        </td>
                                        <td>
                                            {canManageWorkspaces() ? (
                                                <button
                                                    type="button"
                                                    className="cta"
                                                    onClick={() => openEditModal(ws)}
                                                >
                                                    Edit
                                                </button>
                                            ) : (
                                                <span style={{ color: "rgba(180,180,180,0.6)" }}>
                                                    —
                                                </span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    ) : (
                        <p className="settings-subpage__empty">
                            No client workspaces yet. Create one to start managing client domains.
                        </p>
                    )}
                </div>
            </main>

            {/* Create Modal */}
            {showCreateModal && (
                <div
                    className="settings-blacklist-modal"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="ws-create-modal-title"
                    onClick={(e) => {
                        if (e.target === e.currentTarget) closeModal();
                    }}
                >
                    <div className="settings-blacklist-modal__card settings-blacklist-modal__card--wide">
                        <h2 id="ws-create-modal-title">Create workspace</h2>
                        <form onSubmit={handleCreate}>
                            <div className="settings-org-modal__field-block">
                                <label
                                    className="settings-org-modal__label"
                                    htmlFor="ws-create-name"
                                >
                                    Workspace name
                                </label>
                                <input
                                    id="ws-create-name"
                                    className="settings-org-modal__text-input"
                                    type="text"
                                    placeholder="e.g., Acme Corp Website"
                                    value={editName}
                                    onChange={(e) => setEditName(e.target.value)}
                                    autoComplete="off"
                                    disabled={!!pending}
                                />
                            </div>
                            <div className="settings-org-modal__field-block">
                                <label
                                    className="settings-org-modal__label"
                                    htmlFor="ws-create-domain"
                                >
                                    Client domain
                                </label>
                                <input
                                    id="ws-create-domain"
                                    className="settings-org-modal__text-input"
                                    type="text"
                                    placeholder="e.g., acme-corp.com"
                                    value={editDomain}
                                    onChange={(e) => setEditDomain(e.target.value)}
                                    autoComplete="off"
                                    disabled={!!pending}
                                />
                            </div>
                            <div className="settings-org-modal__field-block">
                                <label
                                    className="settings-org-modal__label"
                                    htmlFor="ws-create-desc"
                                >
                                    Description (optional)
                                </label>
                                <input
                                    id="ws-create-desc"
                                    className="settings-org-modal__text-input"
                                    type="text"
                                    placeholder="e.g., Main marketing website"
                                    value={editDescription}
                                    onChange={(e) => setEditDescription(e.target.value)}
                                    autoComplete="off"
                                    disabled={!!pending}
                                />
                            </div>

                            <UserManagementSection />

                            {modalError && (
                                <p
                                    className="settings-subpage__status settings-subpage__status--error"
                                    style={{ marginBottom: 14, fontSize: "0.8125rem" }}
                                >
                                    {modalError}
                                </p>
                            )}
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
                                    {pending === "create" ? "Creating…" : "Create workspace"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Edit Modal */}
            {modalWorkspace && (
                <div
                    className="settings-blacklist-modal"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="ws-edit-modal-title"
                    onClick={(e) => {
                        if (e.target === e.currentTarget) closeModal();
                    }}
                >
                    <div className="settings-blacklist-modal__card settings-blacklist-modal__card--wide">
                        <h2 id="ws-edit-modal-title">Edit workspace</h2>
                        <form onSubmit={handleSave}>
                            <div className="settings-org-modal__field-block">
                                <label
                                    className="settings-org-modal__label"
                                    htmlFor="ws-edit-name"
                                >
                                    Workspace name
                                </label>
                                <input
                                    id="ws-edit-name"
                                    className="settings-org-modal__text-input"
                                    type="text"
                                    value={editName}
                                    onChange={(e) => setEditName(e.target.value)}
                                    autoComplete="off"
                                    disabled={!!pending}
                                />
                            </div>
                            <div className="settings-org-modal__field-block">
                                <label
                                    className="settings-org-modal__label"
                                    htmlFor="ws-edit-domain"
                                >
                                    Client domain
                                </label>
                                <input
                                    id="ws-edit-domain"
                                    className="settings-org-modal__text-input"
                                    type="text"
                                    value={editDomain}
                                    onChange={(e) => setEditDomain(e.target.value)}
                                    autoComplete="off"
                                    disabled={!!pending}
                                />
                            </div>
                            <div className="settings-org-modal__field-block">
                                <label
                                    className="settings-org-modal__label"
                                    htmlFor="ws-edit-desc"
                                >
                                    Description (optional)
                                </label>
                                <input
                                    id="ws-edit-desc"
                                    className="settings-org-modal__text-input"
                                    type="text"
                                    value={editDescription}
                                    onChange={(e) => setEditDescription(e.target.value)}
                                    autoComplete="off"
                                    disabled={!!pending}
                                />
                            </div>

                            <UserManagementSection />

                            {modalError && (
                                <p
                                    className="settings-subpage__status settings-subpage__status--error"
                                    style={{ marginBottom: 14, fontSize: "0.8125rem" }}
                                >
                                    {modalError}
                                </p>
                            )}
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
                        <p className="settings-org-modal__danger-desc">
                            Deleting this workspace removes it from your agency. This action
                            cannot be undone.
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
                                    Delete workspace
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
                                    {pending === "delete"
                                        ? "Deleting…"
                                        : "Yes, delete permanently"}
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </>
    );
}
