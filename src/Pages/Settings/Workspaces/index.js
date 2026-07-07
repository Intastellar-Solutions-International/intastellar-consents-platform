const { useState, useEffect, useCallback } = React;
import Authentication from "../../../Authentication/Auth";
import API from "../../../API/api.js";
import { CurrentPageLoading } from "../../../Components/widget/Loading";
import SideNav from "../../../Components/Header/SideNav";
import { reportsLinks } from "../../../Components/Header/SideNavLinks";
import StickyPageTitle from "../../../Components/Header/Sticky";
import {
    getOrCreateVerificationRecord,
    getVerificationStatusLabel,
    checkDomainVerification,
    isDomainVerified,
    getDaysUntilReverification,
} from "../../../Functions/domainVerification";
import "../Style.css";

const Link = window.ReactRouterDOM.Link;

/**
 * Get current organisation ID
 */
function getCurrentOrgId() {
    try {
        const orgRaw = localStorage.getItem("organisation");
        if (orgRaw) {
            const org = JSON.parse(orgRaw);
            return org?.id || null;
        }
    } catch {
        /* ignore */
    }
    return null;
}


/**
 * Validate email format
 */
function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Validate domain format
 */
function isValidDomain(domain) {
    return /^[a-zA-Z0-9][a-zA-Z0-9-_.]*\.[a-zA-Z]{2,}$/.test(domain);
}

export default function Workspaces() {
    document.title = "Client Workspaces | Settings | Intastellar Consents | CMP";

    const [loading, setLoading] = useState(true);
    const [workspaces, setWorkspaces] = useState([]);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [modalWorkspace, setModalWorkspace] = useState(null);

    // Form fields
    const [editName, setEditName] = useState("");
    const [editDescription, setEditDescription] = useState("");
    const [editDomains, setEditDomains] = useState([]);
    const [newDomain, setNewDomain] = useState("");
    const [editUsers, setEditUsers] = useState([]);
    const [newUserEmail, setNewUserEmail] = useState("");

    const [modalError, setModalError] = useState(null);
    const [pending, setPending] = useState(null);
    const [deleteConfirm, setDeleteConfirm] = useState(false);
    const [successMessage, setSuccessMessage] = useState(null);

    // Verification modal state
    const [verifyModalDomain, setVerifyModalDomain] = useState(null);
    const [verifyPending, setVerifyPending] = useState(false);
    const [verifyResult, setVerifyResult] = useState(null);
    const [verificationRefreshKey, setVerificationRefreshKey] = useState(0);

    const orgId = getCurrentOrgId();

    // Load workspaces from backend on mount
    useEffect(() => {
        if (!orgId) {
            setLoading(false);
            return;
        }
        fetch(API.workspaces.list.url, {
            method: "GET",
            headers: {
                "Authorization": Authentication.getToken(),
                "Organisation": String(orgId),
                "Content-Type": "application/json",
            },
        })
            .then((res) => res.json())
            .then((data) => setWorkspaces(data.workspaces || []))
            .catch(() => setWorkspaces([]))
            .finally(() => setLoading(false));
    }, []);

    const closeModal = useCallback(() => {
        setShowCreateModal(false);
        setModalWorkspace(null);
        setEditName("");
        setEditDescription("");
        setEditDomains([]);
        setNewDomain("");
        setEditUsers([]);
        setNewUserEmail("");
        setModalError(null);
        setPending(null);
        setDeleteConfirm(false);
    }, []);

    // Verification modal handlers
    async function openVerifyModal(domain) {
        if (!orgId) return;
        setVerifyModalDomain({ domain, record: null });
        setVerifyResult(null);
        setVerifyPending(false);
        try {
            const record = await getOrCreateVerificationRecord(domain, orgId);
            setVerifyModalDomain({ domain, record });
        } catch {
            // Modal stays open; token area will show "—"
        }
    }

    function closeVerifyModal() {
        setVerifyModalDomain(null);
        setVerifyResult(null);
        setVerifyPending(false);
    }

    async function handleVerifyCheck() {
        if (!verifyModalDomain || !orgId) return;
        setVerifyPending(true);
        setVerifyResult(null);

        try {
            const result = await checkDomainVerification(verifyModalDomain.domain, orgId);
            setVerifyResult(result);
            if (result.success) {
                // Refresh the verification status display
                setVerificationRefreshKey((k) => k + 1);
            }
        } catch (err) {
            setVerifyResult({
                success: false,
                message: "An error occurred while checking verification.",
            });
        } finally {
            setVerifyPending(false);
        }
    }

    function copyToClipboard(text) {
        navigator.clipboard.writeText(text).then(() => {
            // Could show a toast, but keeping it simple
        });
    }

    // Escape key handler
    useEffect(() => {
        if (!showCreateModal && !modalWorkspace && !verifyModalDomain) return undefined;
        const onKey = (e) => {
            if (e.key === "Escape") {
                if (verifyModalDomain) {
                    closeVerifyModal();
                } else {
                    closeModal();
                }
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [showCreateModal, modalWorkspace, verifyModalDomain, closeModal]);

    function openCreateModal() {
        setShowCreateModal(true);
        setEditName("");
        setEditDescription("");
        setEditDomains([]);
        setNewDomain("");
        setEditUsers([]);
        setNewUserEmail("");
        setModalError(null);
        setPending(null);
    }

    function openEditModal(workspace) {
        setModalWorkspace(workspace);
        setEditName(workspace?.name ?? "");
        setEditDescription(workspace?.description ?? "");
        setEditDomains(workspace?.domains ?? []);
        setNewDomain("");
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

    // Domain management
    function addDomain() {
        const domain = newDomain.trim().toLowerCase();
        if (!domain) {
            setModalError("Enter a domain.");
            return;
        }
        if (!isValidDomain(domain)) {
            setModalError("Enter a valid domain (e.g., client-site.com).");
            return;
        }
        if (editDomains.some((d) => d.domain.toLowerCase() === domain)) {
            setModalError("This domain has already been added.");
            return;
        }
        // Check across all workspaces for duplicate domains
        const allExistingDomains = workspaces
            .filter((ws) => !modalWorkspace || ws.id !== modalWorkspace.id)
            .flatMap((ws) => ws.domains || [])
            .map((d) => d.domain.toLowerCase());
        if (allExistingDomains.includes(domain)) {
            setModalError("This domain is already assigned to another workspace.");
            return;
        }

        const isPrimary = editDomains.length === 0;
        setEditDomains([...editDomains, { domain, isPrimary, addedAt: new Date().toISOString() }]);
        setNewDomain("");
        setModalError(null);
    }

    function removeDomain(domain) {
        const updated = editDomains.filter((d) => d.domain.toLowerCase() !== domain.toLowerCase());
        // If we removed the primary, make the first remaining one primary
        if (updated.length > 0 && !updated.some((d) => d.isPrimary)) {
            updated[0].isPrimary = true;
        }
        setEditDomains(updated);
    }

    function setPrimaryDomain(domain) {
        setEditDomains(
            editDomains.map((d) => ({
                ...d,
                isPrimary: d.domain.toLowerCase() === domain.toLowerCase(),
            }))
        );
    }

    // User management
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

    async function handleCreate(e) {
        e.preventDefault();
        const name = editName.trim();

        if (!name) {
            setModalError("Enter a workspace name.");
            return;
        }
        if (editDomains.length === 0) {
            setModalError("Add at least one domain to the workspace.");
            return;
        }

        setModalError(null);
        setPending("create");

        try {
            const res = await fetch(API.workspaces.create.url, {
                method: "POST",
                headers: {
                    "Authorization": Authentication.getToken(),
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    name,
                    description: editDescription.trim(),
                    organisationId: orgId,
                    domains: editDomains,
                    users: editUsers,
                }),
            });
            const data = await res.json();

            if (!res.ok) {
                setModalError(data.error || "Failed to create workspace.");
                setPending(null);
                return;
            }

            setWorkspaces((prev) => [...prev, data.workspace]);
            setPending(null);
            closeModal();
            setSuccessMessage("Workspace created successfully.");
            setTimeout(() => setSuccessMessage(null), 3000);
        } catch {
            setModalError("Network error. Please try again.");
            setPending(null);
        }
    }

    async function handleSave(e) {
        e.preventDefault();
        if (!modalWorkspace) return;

        const name = editName.trim();

        if (!name) {
            setModalError("Enter a workspace name.");
            return;
        }
        if (editDomains.length === 0) {
            setModalError("Add at least one domain to the workspace.");
            return;
        }

        setModalError(null);
        setDeleteConfirm(false);
        setPending("save");

        try {
            const res = await fetch(API.workspaces.update.url, {
                method: "POST",
                headers: {
                    "Authorization": Authentication.getToken(),
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    workspaceId: modalWorkspace.id,
                    name,
                    description: editDescription.trim(),
                    organisationId: orgId,
                    domains: editDomains,
                    users: editUsers,
                }),
            });
            const data = await res.json();

            if (!res.ok) {
                setModalError(data.error || "Failed to update workspace.");
                setPending(null);
                return;
            }

            setWorkspaces((prev) =>
                prev.map((ws) => ws.id === modalWorkspace.id ? data.workspace : ws)
            );
            setPending(null);
            closeModal();
            setSuccessMessage("Workspace updated successfully.");
            setTimeout(() => setSuccessMessage(null), 3000);
        } catch {
            setModalError("Network error. Please try again.");
            setPending(null);
        }
    }

    async function handleDelete() {
        if (!modalWorkspace) return;
        setModalError(null);
        setPending("delete");

        try {
            const res = await fetch(API.workspaces.delete.url, {
                method: "POST",
                headers: {
                    "Authorization": Authentication.getToken(),
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    workspaceId: modalWorkspace.id,
                    organisationId: orgId,
                }),
            });
            const data = await res.json();

            if (!res.ok) {
                setModalError(data.error || "Failed to delete workspace.");
                setPending(null);
                return;
            }

            setWorkspaces((prev) => prev.filter((ws) => ws.id !== modalWorkspace.id));
            setPending(null);
            closeModal();
            setSuccessMessage("Workspace deleted.");
            setTimeout(() => setSuccessMessage(null), 3000);
        } catch {
            setModalError("Network error. Please try again.");
            setPending(null);
        }
    }

    // Get primary domain for display
    function getPrimaryDomain(ws) {
        const primary = ws.domains?.find((d) => d.isPrimary);
        return primary?.domain || ws.domains?.[0]?.domain || ws.domain || "—";
    }

    // Helper — sync read from cache, safe to call during render
    function getVerificationInfo(domain) {
        if (!orgId) return { label: "—", type: "unknown", icon: "?" };
        return getVerificationStatusLabel(domain, orgId);
    }

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
                            Manage client workspaces for your agency. Each workspace can contain
                            multiple domains for clients with multiple sites.
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
                                    <th>Domains</th>
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
                                            <div className="settings-workspace__domains-cell">
                                                <span className="settings-workspace__domain">
                                                    {getPrimaryDomain(ws)}
                                                </span>
                                                {(ws.domains?.length || 0) > 1 && (
                                                    <span className="settings-workspace__domain-count">
                                                        +{ws.domains.length - 1} more
                                                    </span>
                                                )}
                                            </div>
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
                                    placeholder="e.g., Acme Corp"
                                    value={editName}
                                    onChange={(e) => setEditName(e.target.value)}
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
                                    placeholder="e.g., All websites for Acme Corp"
                                    value={editDescription}
                                    onChange={(e) => setEditDescription(e.target.value)}
                                    autoComplete="off"
                                    disabled={!!pending}
                                />
                            </div>

                            <div className="settings-workspace__domains-section">
                                <label className="settings-org-modal__label">
                                    Domains
                                </label>
                                <div className="settings-workspace__domains-add">
                                    <input
                                        type="text"
                                        className="settings-org-modal__text-input settings-workspace__domain-input"
                                        placeholder="e.g., client-site.com"
                                        value={newDomain}
                                        onChange={(e) => setNewDomain(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === "Enter") {
                                                e.preventDefault();
                                                addDomain();
                                            }
                                        }}
                                        disabled={!!pending}
                                    />
                                    <button
                                        type="button"
                                        className="settings-workspace__add-domain-btn"
                                        onClick={addDomain}
                                        disabled={!!pending}
                                    >
                                        Add
                                    </button>
                                </div>
                                {editDomains.length > 0 ? (
                                    <ul className="settings-workspace__domains-list" key={verificationRefreshKey}>
                                        {editDomains.map((d) => {
                                            const verifyInfo = getVerificationInfo(d.domain);
                                            const daysUntil = orgId ? getDaysUntilReverification(d.domain, orgId) : null;
                                            return (
                                                <li key={d.domain} className="settings-workspace__domain-item">
                                                    <div className="settings-workspace__domain-info">
                                                        <span className="settings-workspace__domain-name">{d.domain}</span>
                                                        {d.isPrimary && (
                                                            <span className="settings-workspace__primary-badge">Primary</span>
                                                        )}
                                                        <span
                                                            className={`settings-workspace__verify-badge settings-workspace__verify-badge--${verifyInfo.type}`}
                                                            title={
                                                                verifyInfo.type === "verified" && daysUntil != null
                                                                    ? `Re-verification in ${daysUntil} days`
                                                                    : verifyInfo.label
                                                            }
                                                        >
                                                            <span className="settings-workspace__verify-icon">{verifyInfo.icon}</span>
                                                            {verifyInfo.label}
                                                        </span>
                                                    </div>
                                                    <div className="settings-workspace__domain-actions">
                                                        <button
                                                            type="button"
                                                            className="settings-workspace__verify-btn"
                                                            onClick={() => openVerifyModal(d.domain)}
                                                            disabled={!!pending}
                                                            title="Verify domain ownership"
                                                        >
                                                            Verify
                                                        </button>
                                                        {!d.isPrimary && (
                                                            <button
                                                                type="button"
                                                                className="settings-workspace__set-primary-btn"
                                                                onClick={() => setPrimaryDomain(d.domain)}
                                                                disabled={!!pending}
                                                                title="Set as primary"
                                                            >
                                                                Set primary
                                                            </button>
                                                        )}
                                                        <button
                                                            type="button"
                                                            className="settings-workspace__remove-domain-btn"
                                                            onClick={() => removeDomain(d.domain)}
                                                            disabled={!!pending}
                                                            title="Remove domain"
                                                        >
                                                            ×
                                                        </button>
                                                    </div>
                                                </li>
                                            );
                                        })}
                                    </ul>
                                ) : (
                                    <p className="settings-workspace__no-domains">
                                        No domains added yet. Add at least one domain above.
                                    </p>
                                )}
                            </div>
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

                            <div className="settings-workspace__domains-section">
                                <label className="settings-org-modal__label">
                                    Domains
                                </label>
                                <div className="settings-workspace__domains-add">
                                    <input
                                        type="text"
                                        className="settings-org-modal__text-input settings-workspace__domain-input"
                                        placeholder="e.g., client-site.com"
                                        value={newDomain}
                                        onChange={(e) => setNewDomain(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === "Enter") {
                                                e.preventDefault();
                                                addDomain();
                                            }
                                        }}
                                        disabled={!!pending}
                                    />
                                    <button
                                        type="button"
                                        className="settings-workspace__add-domain-btn"
                                        onClick={addDomain}
                                        disabled={!!pending}
                                    >
                                        Add
                                    </button>
                                </div>
                                {editDomains.length > 0 ? (
                                    <ul className="settings-workspace__domains-list" key={verificationRefreshKey}>
                                        {editDomains.map((d) => {
                                            const verifyInfo = getVerificationInfo(d.domain);
                                            const daysUntil = orgId ? getDaysUntilReverification(d.domain, orgId) : null;
                                            return (
                                                <li key={d.domain} className="settings-workspace__domain-item">
                                                    <div className="settings-workspace__domain-info">
                                                        <span className="settings-workspace__domain-name">{d.domain}</span>
                                                        {d.isPrimary && (
                                                            <span className="settings-workspace__primary-badge">Primary</span>
                                                        )}
                                                        <span
                                                            className={`settings-workspace__verify-badge settings-workspace__verify-badge--${verifyInfo.type}`}
                                                            title={
                                                                verifyInfo.type === "verified" && daysUntil != null
                                                                    ? `Re-verification in ${daysUntil} days`
                                                                    : verifyInfo.label
                                                            }
                                                        >
                                                            <span className="settings-workspace__verify-icon">{verifyInfo.icon}</span>
                                                            {verifyInfo.label}
                                                        </span>
                                                    </div>
                                                    <div className="settings-workspace__domain-actions">
                                                        <button
                                                            type="button"
                                                            className="settings-workspace__verify-btn"
                                                            onClick={() => openVerifyModal(d.domain)}
                                                            disabled={!!pending}
                                                            title="Verify domain ownership"
                                                        >
                                                            Verify
                                                        </button>
                                                        {!d.isPrimary && (
                                                            <button
                                                                type="button"
                                                                className="settings-workspace__set-primary-btn"
                                                                onClick={() => setPrimaryDomain(d.domain)}
                                                                disabled={!!pending}
                                                                title="Set as primary"
                                                            >
                                                                Set primary
                                                            </button>
                                                        )}
                                                        <button
                                                            type="button"
                                                            className="settings-workspace__remove-domain-btn"
                                                            onClick={() => removeDomain(d.domain)}
                                                            disabled={!!pending}
                                                            title="Remove domain"
                                                        >
                                                            ×
                                                        </button>
                                                    </div>
                                                </li>
                                            );
                                        })}
                                    </ul>
                                ) : (
                                    <p className="settings-workspace__no-domains">
                                        No domains added yet. Add at least one domain above.
                                    </p>
                                )}
                            </div>
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
                            Deleting this workspace removes it and all its domains from your agency.
                            This action cannot be undone.
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

            {/* Domain Verification Modal */}
            {verifyModalDomain && (
                <div
                    className="settings-blacklist-modal"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="verify-modal-title"
                    onClick={(e) => {
                        if (e.target === e.currentTarget) closeVerifyModal();
                    }}
                >
                    <div className="settings-blacklist-modal__card settings-blacklist-modal__card--wide">
                        <h2 id="verify-modal-title">Verify Domain Ownership</h2>
                        <p className="settings-verify-modal__domain">
                            {verifyModalDomain.domain}
                        </p>

                        <div className="settings-verify-modal__instructions">
                            <p className="settings-verify-modal__intro">
                                To verify ownership of this domain, add one of the following to your website:
                            </p>

                            <div className="settings-verify-modal__method">
                                <h4>Option 1: Meta Tag</h4>
                                <p>Add this meta tag to the <code>&lt;head&gt;</code> section of your homepage:</p>
                                <div className="settings-verify-modal__code-block">
                                    <code>{`<meta name="intastellar-verification" content="${verifyModalDomain.record?.token || ""}">`}</code>
                                    <button
                                        type="button"
                                        className="settings-verify-modal__copy-btn"
                                        onClick={() => copyToClipboard(`<meta name="intastellar-verification" content="${verifyModalDomain.record?.token || ""}">`)}
                                        title="Copy to clipboard"
                                    >
                                        Copy
                                    </button>
                                </div>
                            </div>

                            <div className="settings-verify-modal__method">
                                <h4>Option 2: JavaScript Variable</h4>
                                <p>Add this to your Intastellar banner configuration:</p>
                                <div className="settings-verify-modal__code-block">
                                    <code>{`window.INTA = { verification: "${verifyModalDomain.record?.token || ""}" };`}</code>
                                    <button
                                        type="button"
                                        className="settings-verify-modal__copy-btn"
                                        onClick={() => copyToClipboard(`window.INTA = { verification: "${verifyModalDomain.record?.token || ""}" };`)}
                                        title="Copy to clipboard"
                                    >
                                        Copy
                                    </button>
                                </div>
                            </div>

                            <div className="settings-verify-modal__token-info">
                                <strong>Your verification token:</strong>
                                <code className="settings-verify-modal__token">{verifyModalDomain.record?.token || "—"}</code>
                            </div>
                        </div>

                        {verifyResult && (
                            <div
                                className={`settings-verify-modal__result settings-verify-modal__result--${verifyResult.success ? "success" : "error"}`}
                            >
                                <span className="settings-verify-modal__result-icon">
                                    {verifyResult.success ? "✓" : "✗"}
                                </span>
                                {verifyResult.message}
                            </div>
                        )}

                        <div className="settings-blacklist-modal__actions">
                            <button
                                type="button"
                                className="settings-blacklist-modal__btn"
                                onClick={closeVerifyModal}
                                disabled={verifyPending}
                            >
                                Close
                            </button>
                            <button
                                type="button"
                                className="settings-blacklist-modal__btn settings-blacklist-modal__btn--primary"
                                onClick={handleVerifyCheck}
                                disabled={verifyPending}
                            >
                                {verifyPending ? "Checking…" : "Check Verification"}
                            </button>
                        </div>

                        {verifyModalDomain.record?.verified && (
                            <div className="settings-verify-modal__status">
                                <p>
                                    <strong>Status:</strong> Verified on{" "}
                                    {new Date(verifyModalDomain.record.verifiedAt).toLocaleDateString()}
                                </p>
                                {verifyModalDomain.record.nextVerificationDue && (
                                    <p>
                                        <strong>Next verification due:</strong>{" "}
                                        {new Date(verifyModalDomain.record.nextVerificationDue).toLocaleDateString()}
                                    </p>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </>
    );
}
