import StickyPageTitle from "../../../Components/Header/Sticky";
import SideNav from "../../../Components/Header/SideNav";
import { reportsLinks } from "../../../Components/Header/SideNavLinks";
import Select from "../../../Components/SelectInput/Selector";
import Button from "../../../Components/Button/Button";
import Authentication from "../../../Authentication/Auth";
import API from "../../../API/api";
import SuccessWindow from "../../../Components/SuccessWindow";
import "../Style.css";

const { useState } = React;

const RANGE_ITEMS = [
    { id: 7, name: "7 days" },
    { id: 14, name: "14 days" },
    { id: 28, name: "28 days" },
    { id: 30, name: "30 days" },
];

export default function UserPreferences() {
    const [dateRange, setDateRange] = useState(() => {
        try {
            const s = localStorage.getItem("settings");
            if (s) return JSON.parse(s).dateRange ?? 30;
        } catch {
            /* ignore */
        }
        return 30;
    });
    const [defaultRange, setDefaultRange] = useState(() => {
        const row = RANGE_ITEMS.find((r) => r.id === dateRange);
        return row ? row.name : "30 days";
    });
    const [success, setSuccess] = useState(false);

    return (
        <>
            <SideNav links={reportsLinks} title="Settings" />
            <article style={{ flex: 1 }}>
                <StickyPageTitle title="My preferences" />
                <div className="dashboard-content settings-subpage">
                    <p className="settings-subpage__intro">
                        Default date range is used on dashboards and reports that support relative ranges.
                    </p>
                    <div className="settings-subpage__panel">
                        <div className="settings-subpage__field-row">
                            <label htmlFor="settings-date-range">Default date range</label>
                            <Select
                                name="userPreferences"
                                defaultValue={JSON.stringify({
                                    id: dateRange,
                                    name: defaultRange,
                                })}
                                onChange={(e) => {
                                    const parsed = JSON.parse(e);
                                    setDateRange(parsed.id);
                                    setDefaultRange(parsed.name);
                                }}
                                items={RANGE_ITEMS}
                                align="left"
                            />
                        </div>
                        <Button
                            style={{ marginTop: 12 }}
                            onClick={() => {
                                fetch(API.settings.user.update.url, {
                                    method: API.settings.user.update.method,
                                    headers: API.settings.user.headers,
                                    body: JSON.stringify({
                                        setting: { dateRange },
                                        userId: Authentication.getUserId(),
                                    }),
                                })
                                    .then((res) => res.json())
                                    .then(() => {
                                        setSuccess(true);
                                        localStorage.setItem("settings", JSON.stringify({ dateRange }));
                                    });
                            }}
                            text="Save"
                        />
                    </div>
                </div>
            </article>
            {success ? (
                <SuccessWindow
                    message={`Settings updated successfully. Default range: ${defaultRange}.`}
                />
            ) : null}
        </>
    );
}
