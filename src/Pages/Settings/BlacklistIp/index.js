const { useState, useEffect } = window.React;
import API from "../../../API/api.js";
import SideNav from "../../../Components/Header/SideNav.js";
import { reportsLinks } from "../../../Components/Header/SideNavLinks/index.js";
import StickyPageTitle from "../../../Components/Header/Sticky/index.js";
import ErrorState from "../../../Components/ui/ErrorState.js";
import { readJsonResult, errorMessage } from "../../../Functions/apiResult.js";
import "../Style.css";

export default function BlacklistIp() {
    document.title = "Blacklist IP | Settings | Intastellar Consents | CMP";
    const [blacklist, setBlacklist] = useState([]);
    const [openModal, setOpenModal] = useState(false);
    const [userIp, setUserIp] = useState(null);
    const [newIp, setNewIp] = useState("");
    const [listError, setListError] = useState(null);
    const [listLoading, setListLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState(null);

    const fetchUserIp = async () => {
        try {
            const response = await fetch("https://apis.intastellarsolutions.com/user-ip", {
                method: "GET",
                headers: {
                    "Content-Type": "application/json",
                    Accept: "application/json",
                    Expires: new Date(Date.now() + 1000 * 60 * 60).toUTCString(),
                    "Cache-Control": "public, max-age=3600",
                },
            });
            const data = await response.json();
            setNewIp(data.ip);
            setUserIp(data.ip);
        } catch {
            setUserIp(null);
        }
    };

    // A failed load must not read as "No blacklisted IPs yet" — that would
    // tell the user nothing is excluded when the list just didn't arrive.
    function fetchAllBlacklistedIps() {
        setListLoading(true);
        setListError(null);
        return fetch(API.gdpr.getBlackList.url, {
            method: API.gdpr.getBlackList.method,
            headers: API.gdpr.getBlackList.headers,
        })
            .then((response) => readJsonResult(response, "Couldn't load the blacklist."))
            .then((data) => {
                setBlacklist(Array.isArray(data?.blacklisted_ips) ? data.blacklisted_ips : []);
            })
            .catch((err) => setListError(errorMessage(err)))
            .finally(() => setListLoading(false));
    }

    // Saved first, shown second: the IP only appears in the list once the
    // server has it, so the list never claims an exclusion that isn't active.
    async function addIp() {
        const ip = newIp?.trim();
        if (!ip) { setOpenModal(false); return; }
        setSaving(true);
        setSaveError(null);
        try {
            const response = await fetch(API.gdpr.saveBlacklistIp.url, {
                method: API.gdpr.saveBlacklistIp.method,
                headers: API.gdpr.saveBlacklistIp.headers,
                body: API.gdpr.saveBlacklistIp.body(ip),
            });
            await readJsonResult(response, "Couldn't add the IP.");
            setOpenModal(false);
            await fetchAllBlacklistedIps();
        } catch (err) {
            setSaveError(errorMessage(err));
        } finally {
            setSaving(false);
        }
    }

    useEffect(() => {
        fetchUserIp();
        fetchAllBlacklistedIps();
    }, []);

    return (
        <>
            <SideNav links={reportsLinks} title="Settings" />
            <main className="dashboard-content settings-subpage settings-subpage--wide">
                <StickyPageTitle title="Blacklist IP" />
                <p className="settings-subpage__intro">
                    IP addresses on this list are excluded from platform analytics and related reporting for
                    your workspace.
                </p>
                <div className="settings-blacklist__toolbar">
                    <div>
                        <p>
                            Your current IP:{" "}
                            <span className="settings-blacklist__ip">{userIp ?? "Unavailable"}</span>
                        </p>
                    </div>
                    <button
                        type="button"
                        className="settings-blacklist__add"
                        aria-label="Add IP address"
                        onClick={() => { setSaveError(null); setOpenModal(true); }}
                    >
                        +
                    </button>
                </div>
                {listError && (
                    <ErrorState title="Couldn't load the blacklist" message={listError} onRetry={fetchAllBlacklistedIps} />
                )}
                {!listError && <ul className="settings-blacklist__list">
                    {listLoading && blacklist.length === 0 ? (
                        <li className="settings-blacklist__item settings-subpage__empty" style={{ border: "none" }}>
                            Loading…
                        </li>
                    ) : blacklist.length === 0 ? (
                        <li className="settings-blacklist__item settings-subpage__empty" style={{ border: "none" }}>
                            No blacklisted IPs yet.
                        </li>
                    ) : (
                        blacklist.map((ip, index) => (
                            <li key={`${ip}-${index}`} className="settings-blacklist__item">
                                {ip}
                            </li>
                        ))
                    )}
                </ul>}
                {openModal ? (
                    <div
                        className="settings-blacklist-modal"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="blacklist-modal-title"
                    >
                        <div className="settings-blacklist-modal__card">
                            <h2 id="blacklist-modal-title">Add IP to blacklist</h2>
                            <input
                                type="text"
                                placeholder="e.g. 203.0.113.10"
                                value={newIp}
                                onChange={(e) => setNewIp(e.target.value)}
                                autoComplete="off"
                                aria-invalid={saveError ? true : undefined}
                                aria-describedby={saveError ? "blacklist-save-error" : undefined}
                            />
                            {saveError && (
                                <p id="blacklist-save-error" role="alert" className="settings-blacklist-modal__error">
                                    {saveError}
                                </p>
                            )}
                            <div className="settings-blacklist-modal__actions">
                                <button type="button" className="settings-blacklist-modal__btn" onClick={() => setOpenModal(false)}>
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    className="settings-blacklist-modal__btn settings-blacklist-modal__btn--primary"
                                    onClick={addIp}
                                    disabled={saving}
                                >
                                    {saving ? "Adding…" : "Add"}
                                </button>
                            </div>
                        </div>
                    </div>
                ) : null}
            </main>
        </>
    );
}
