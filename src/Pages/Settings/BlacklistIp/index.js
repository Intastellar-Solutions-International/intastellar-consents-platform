const { useState, useEffect } = window.React;
import API from "../../../API/api.js";
import SideNav from "../../../Components/Header/SideNav.js";
import { reportsLinks } from "../../../Components/Header/SideNavLinks/index.js";
import StickyPageTitle from "../../../Components/Header/Sticky/index.js";
import "../Style.css";

export default function BlacklistIp() {
    document.title = "Blacklist IP | Settings | Intastellar Consents | CMP";
    const [blacklist, setBlacklist] = useState([]);
    const [openModal, setOpenModal] = useState(false);
    const [userIp, setUserIp] = useState(null);
    const [newIp, setNewIp] = useState("");

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

    function fetchAllBlacklistedIps() {
        fetch(API.gdpr.getBlackList.url, {
            method: API.gdpr.getBlackList.method,
            headers: API.gdpr.getBlackList.headers,
        })
            .then((response) => response.json())
            .then((data) => {
                if (data && Array.isArray(data.blacklisted_ips)) {
                    setBlacklist(data.blacklisted_ips);
                }
            })
            .catch(() => {});
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
                        onClick={() => setOpenModal(true)}
                    >
                        +
                    </button>
                </div>
                <ul className="settings-blacklist__list">
                    {blacklist.length === 0 ? (
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
                </ul>
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
                            />
                            <div className="settings-blacklist-modal__actions">
                                <button type="button" className="settings-blacklist-modal__btn" onClick={() => setOpenModal(false)}>
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    className="settings-blacklist-modal__btn settings-blacklist-modal__btn--primary"
                                    onClick={() => {
                                        if (!newIp?.trim()) {
                                            setOpenModal(false);
                                            return;
                                        }
                                        setBlacklist((prev) => [...prev, newIp.trim()]);
                                        fetch(API.gdpr.saveBlacklistIp.url, {
                                            method: API.gdpr.saveBlacklistIp.method,
                                            headers: API.gdpr.saveBlacklistIp.headers,
                                            body: API.gdpr.saveBlacklistIp.body(newIp.trim()),
                                        })
                                            .then((response) => response.json())
                                            .catch(() => {});
                                        setOpenModal(false);
                                    }}
                                >
                                    Add
                                </button>
                            </div>
                        </div>
                    </div>
                ) : null}
            </main>
        </>
    );
}
