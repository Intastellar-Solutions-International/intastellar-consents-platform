const { useState, useEffect } = window.React;
const useParams = window.ReactRouterDOM.useParams;
import { use } from "react";
import API from "../../../API/api.js";
import SideNav from "../../../Components/Header/SideNav.js";
import { reportsLinks } from "../../../Components/Header/SideNavLinks/index.js";
export default function BlacklistIp() {
    const [blacklist, setBlacklist] = useState([]);
    const [userIp, setUserIp] = useState(null);

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

            console.log("User IP:", data.ip);

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
            <main className="dashboard-content">
                <h1>Blacklist IP</h1>
                <p>Manage the IP addresses that are blacklisted from accessing the platform.</p>
                <div className="blacklistIpContainer">
                    <input type="text" placeholder="Enter IP address to blacklist" defaultValue={userIp} />
                    <button
                        className="addBlacklistBtn" onClick={() => {
                            // Logic to add IP to blacklist
                            const newIp = document.querySelector('.blacklistIpContainer input').value;
                            if (newIp) {
                                setBlacklist([...blacklist, newIp]);
                                document.querySelector('.blacklistIpContainer input').value = ''; // Clear input

                                if (blacklist.length > 0) {
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
                            }
                        }}>
                        <i className="dashboard-icons add"></i>
                        <span className="hiddenCollapsed"> </span>
                        Add to Blacklist
                    </button>
                    <ul className="blacklistIpList">
                        {/* Example list item, replace with dynamic data */}
                        {blacklist.map((ip, index) => (
                            <li key={index} className="blacklistIpItem">
                                <span>{ip}</span>
                                <button className="removeBtn">Remove</button>
                            </li>
                        ))}
                    </ul>
                </div>
                <div className="blacklistIpActions">
                    <button className="removeAllBtn">Remove All</button>
                </div>
                <div className="blacklistIpFooter">
                    <p>Note: Blacklisted IPs will not be collected data from.</p>
                    <p>Ensure to manage the list carefully to avoid blocking legitimate users.</p>
                </div>
            </main>
        </>
    );
}