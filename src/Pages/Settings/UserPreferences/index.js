import StickyPageTitle from "../../../Components/Header/Sticky";
import SideNav from "../../../Components/Header/SideNav";
import { reportsLinks } from "../../../Components/Header/SideNavLinks";
import Select from "../../../Components/SelectInput/Selector";
import Button from "../../../Components/Button/Button";
import Authentication from "../../../Authentication/Auth";
import API from "../../../API/api";
import SuccessWindow from "../../../Components/SuccessWindow";
import {
    readUserSettings,
    getUserLocale,
    dispatchUserSettingsChanged,
} from "../../../Functions/userLocale";
import "../Style.css";

const { useState } = React;

const RANGE_ITEMS = [
    { id: 7, name: "7 days" },
    { id: 14, name: "14 days" },
    { id: 28, name: "28 days" },
    { id: 30, name: "30 days" },
];

const LOCALE_ITEMS = [
    { id: "de-DE", name: "German (Germany)" },
    { id: "da-DK", name: "Danish (Denmark)" },
    { id: "en-GB", name: "English (UK)" },
    { id: "en-US", name: "English (US)" },
    { id: "fr-FR", name: "French (France)" },
    { id: "sv-SE", name: "Swedish (Sweden)" },
];

export default function UserPreferences() {
    const [dateRange, setDateRange] = useState(() => {
        const s = readUserSettings();
        return typeof s.dateRange === "number" ? s.dateRange : 30;
    });
    const [defaultRange, setDefaultRange] = useState(() => {
        const row = RANGE_ITEMS.find((r) => r.id === dateRange);
        return row ? row.name : "30 days";
    });
    const [locale, setLocale] = useState(() => getUserLocale());
    const [localeLabel, setLocaleLabel] = useState(() => {
        const loc = getUserLocale();
        const row = LOCALE_ITEMS.find((x) => x.id === loc);
        return row ? row.name : loc;
    });
    const [success, setSuccess] = useState(false);

    return (
        <>
            <SideNav links={reportsLinks} title="Settings" />
            <article style={{ flex: 1 }}>
                <StickyPageTitle title="My preferences" />
                <div className="dashboard-content settings-subpage">
                    <p className="settings-subpage__intro">
                        Default date range and regional formatting apply to the home and domain dashboards
                        (numbers, dates in widgets, charts, and the date filter).
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
                        <div className="settings-subpage__field-row">
                            <label htmlFor="settings-locale">Date &amp; number format</label>
                            <Select
                                name="userLocale"
                                defaultValue={JSON.stringify({
                                    id: locale,
                                    name: localeLabel,
                                })}
                                onChange={(e) => {
                                    const parsed = JSON.parse(e);
                                    setLocale(parsed.id);
                                    setLocaleLabel(parsed.name);
                                }}
                                items={LOCALE_ITEMS}
                                align="left"
                            />
                        </div>
                        <Button
                            style={{ marginTop: 12 }}
                            onClick={() => {
                                const prev = readUserSettings();
                                const next = { ...prev, dateRange, locale };
                                fetch(API.settings.user.update.url, {
                                    method: API.settings.user.update.method,
                                    headers: API.settings.user.headers,
                                    body: JSON.stringify({
                                        setting: { dateRange, locale },
                                        userId: Authentication.getUserId(),
                                    }),
                                })
                                    .then((res) => res.json())
                                    .then(() => {
                                        localStorage.setItem("settings", JSON.stringify(next));
                                        dispatchUserSettingsChanged();
                                        setSuccess(true);
                                    });
                            }}
                            text="Save"
                        />
                    </div>
                </div>
            </article>
            {success ? (
                <SuccessWindow
                    message={`Settings saved. Range: ${defaultRange}. Format: ${localeLabel}.`}
                />
            ) : null}
        </>
    );
}
