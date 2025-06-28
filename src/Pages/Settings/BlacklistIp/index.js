const { useState, useEffect } = window.React;
const useParams = window.ReactRouterDOM.useParams;
import API from "../../../API/api.js";
import SideNav from "../../../Components/Header/SideNav.js";
import { reportsLinks } from "../../../Components/Header/SideNavLinks/index.js";
import StickyPageTitle from "../../../Components/Header/Sticky/index.js";

import "./Style.css";

export default function BlacklistIp() {
    const [blacklist, setBlacklist] = useState([]);
    const [openModal, setOpenModal] = useState(false);
    const [userIp, setUserIp] = useState(null);
    const [newIp, setNewIp] = useState("");

    const { handle, id } = useParams();

    // Get user's IP address if available

    const fetchUserIp = async () => {
        try {
            const response = await fetch('https://apis.intastellarsolutions.com/user-ip', {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'Expires': new Date(Date.now() + 1000 * 60 * 60).toUTCString(), // 1 hour expiration
                    'Cache-Control': 'public, max-age=3600' // Cache for 1 hour
                }
            });
            const data = await response.json();

            setNewIp(data.ip);
            setUserIp(data.ip);
        } catch (error) {
            console.error("Error fetching user IP:", error);
        }
    }

    function fetchAllBlacklistedIps() {
        fetch(API["gdpr"].getBlackList.url, {
            method: API["gdpr"].getBlackList.method,
            headers: API["gdpr"].getBlackList.headers
        })
            .then(response => response.json())
            .then(data => {
                if (data && Array.isArray(data.blacklisted_ips)) {
                    setBlacklist(data.blacklisted_ips);
                } else {
                    console.error("Invalid data format for blacklisted IPs:", data);
                }
            })
            .catch(error => {
                console.error("Error fetching blacklisted IPs:", error);
            });
    }

    useEffect(() => {
        fetchUserIp();
        fetchAllBlacklistedIps();
    }, []);

    return (
        <>
            <SideNav links={reportsLinks} title="Settings" />
            <main className="dashboard-content black-list">
                <StickyPageTitle title="Blacklist IP" />
                <section className="filter">
                    <p>Manage the IP addresses that are blacklisted from accessing the platform.</p>
                    <p>Your current IP: {userIp ? userIp : "Fetching..."}</p>
                    <button className="fetchIpBtn" onClick={
                        () => {
                            setOpenModal(true);
                        }
                    }>+</button>
                </section>
                <h1>Blacklist IP</h1>
                <p>Manage the IP addresses that are blacklisted from accessing the platform.</p>
                <div className="blacklistIpContainer">

                    <ul className="blacklistIpList">
                        {/* Example list item, replace with dynamic data */}
                        {blacklist.map((ip, index) => (
                            <li key={index} className="blacklistIpItem">
                                <span>{ip}</span>
                            </li>
                        ))}
                    </ul>
                </div>
                {
                    openModal && (
                        <div className="modal">
                            <div className="modal-content">
                                <h2>Add IP to Blacklist</h2>
                                <input
                                    type="text"
                                    placeholder="Enter IP address"
                                    value={newIp}
                                    onChange={(e) => setNewIp(e.target.value)}
                                />
                                <button onClick={() => {
                                    if (newIp) {
                                        setBlacklist([...blacklist, newIp]);

                                        fetch(API["gdpr"].saveBlacklistIp.url, {
                                            method: API["gdpr"].saveBlacklistIp.method,
                                            headers: API["gdpr"].saveBlacklistIp.headers,
                                            body: JSON.stringify({
                                                ipAddresses: newIp
                                            })
                                        })
                                            .then(response => response.json())
                                            .then(data => {
                                                console.log("Blacklist updated:", data);
                                            })
                                            .catch(error => {
                                                console.error("Error updating blacklist:", error);
                                            });
                                    }
                                    setOpenModal(false);
                                }}>
                                    Add to Blacklist
                                </button>
                                <button onClick={() => setOpenModal(false)}>Cancel</button>
                            </div>
                        </div>
                    )
                }
            </main>
        </>
    );
}