import Authentication from "../../Authentication/Auth";
import { ScannerHost } from "../../API/host";

const { useState, useEffect } = React;

const headers = () => ({ Authorization: Authentication.getToken(), Organisation: String(Authentication.getOrganisation()), "Content-Type": "application/json" });

/** On/off per notification type. Everything is on until someone turns it off. */
export default function NotificationSettings() {
    const [types, setTypes] = useState(null);
    const [error, setError] = useState(null);

    useEffect(() => {
        fetch(`${ScannerHost}/api/ad-alerts?resource=notification-preferences`, { headers: headers() })
            .then((r) => (r.ok ? r.json() : Promise.reject(new Error("failed"))))
            .then((data) => setTypes(data.types || []))
            .catch(() => setError("Notification settings couldn't be loaded."));
    }, []);

    function toggle(id, enabled) {
        setError(null);
        setTypes((list) => list.map((x) => (x.id === id ? { ...x, enabled } : x)));
        fetch(`${ScannerHost}/api/ad-alerts`, { method: "POST", headers: headers(), body: JSON.stringify({ action: "set-notification-preference", type: id, enabled }) })
            .then((r) => { if (!r.ok) throw new Error("failed"); })
            .catch(() => {
                setTypes((list) => list.map((x) => (x.id === id ? { ...x, enabled: !enabled } : x)));
                setError("That change couldn't be saved. Please try again.");
            });
    }

    if (error && !types) return <p className="settings-preferences__group-desc">{error}</p>;
    if (!types) return <p className="settings-preferences__group-desc">Loading…</p>;
    return (
        <>
            {types.map((type) => (
                <label key={type.id} className="settings-preferences__field" style={{ display: "flex", alignItems: "flex-start", gap: "var(--space-2)" }}>
                    <input type="checkbox" checked={type.enabled} onChange={(e) => toggle(type.id, e.target.checked)} style={{ marginTop: 3 }} />
                    <span>
                        <span style={{ display: "block" }}>{type.label}</span>
                        <span style={{ display: "block", fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>{type.description}</span>
                    </span>
                </label>
            ))}
            {error && <p role="alert" className="settings-preferences__group-desc">{error}</p>}
        </>
    );
}
