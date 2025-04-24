import StickyPageTitle from "../../../Components/Header/Sticky";
import SideNav from "../../../Components/Header/SideNav";
import { reportsLinks } from "../../../Components/Header/SideNavLinks";
import Select from "../../../Components/SelectInput/Selector";
import Button from "../../../Components/Button/Button";
import Authentication from "../../../Authentication/Auth";
import API from "../../../API/api";
import SuccessWindow from "../../../Components/SuccessWindow";
const { useState, useEffect, useRef } = React;
const useParams = window.ReactRouterDOM.useParams;
const urlParams = new URLSearchParams(window.location.search);

export default function UserPreferences() {
    const { handle, id } = useParams();
    const [dateRange, setDateRange] = useState((localStorage.getItem("settings") != null) ? JSON.parse(localStorage.getItem("settings")).dateRange : 30);
    const [defaultRange, setDefaultRange] = useState(dateRange + " days");
    const [success, setSuccess] = useState(false);

    return (
        <>
            <SideNav links={reportsLinks} title="Settings" />
            <article style={{ flex: "1" }}>
                <StickyPageTitle title="Edit User Settings" />
                <div className="dashboard-content">
                    <div style={{ display: "flex" }}>
                        <label>Default date range</label>
                        <Select style={{ marginLeft: "35px" }} name="userPreferences" defaultValue={defaultRange} onChange={(e) => {
                            setDateRange(JSON.parse(e).id);
                            setDefaultRange(JSON.parse(e).name);
                        }} items={
                            [
                                {
                                    id: 7,
                                    name: "7 days",
                                },
                                {
                                    id: 14,
                                    name: "14 days",
                                },
                                {
                                    id: 28,
                                    name: "28 days",
                                },
                                {
                                    id: 30,
                                    name: "30 days",
                                }
                            ]
                        }></Select>
                    </div>
                    <Button style={{
                        padding: "10px 50px",
                        fontSize: "1.1rem",
                        marginTop: "20px"
                    }} onClick={() => {
                        fetch(API.settings.user.update.url, {
                            method: API.settings.user.update.method,
                            headers: API.settings.user.headers,
                            body: JSON.stringify({
                                setting: {
                                    dateRange: dateRange
                                },
                                userId: Authentication.getUserId()
                            })
                        }).then((res) => {
                            return res.json();
                        }).then((data) => {
                            setSuccess(true);
                            localStorage.setItem("settings", JSON.stringify({ dateRange: dateRange }));
                        })
                    }} text="Save" />
                </div>
            </article>
            {
                (success) ? <SuccessWindow message={"Settings updated successfully. Default days: " + dateRange} /> : null
            }
        </>
    )
}