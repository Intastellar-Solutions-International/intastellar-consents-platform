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
import { isNewShell, setNewShell } from "../../../Functions/featureFlags.js";
import { t, getLanguage, setLanguage } from "../../../i18n/index.js";
import LanguageMenu from "../../../Components/UI/LanguageMenu.js";

const { useState } = React;

const RANGE_ITEMS = [7, 14, 28, 30].map((n) => ({ id: n, name: t("{n} days", { n }) }));

const LOCALE_ITEMS = [
    { id: "de-DE", name: t("German (Germany)") },
    { id: "da-DK", name: t("Danish (Denmark)") },
    { id: "en-GB", name: t("English (UK)") },
    { id: "en-US", name: t("English (US)") },
    { id: "fr-FR", name: t("French (France)") },
    { id: "sv-SE", name: t("Swedish (Sweden)") },
];

export default function UserPreferences() {
    const [dateRange, setDateRange] = useState(() => {
        const s = readUserSettings();
        return typeof s.dateRange === "number" ? s.dateRange : 30;
    });
    const [defaultRange, setDefaultRange] = useState(() => {
        const row = RANGE_ITEMS.find((r) => r.id === dateRange);
        return row ? row.name : t("{n} days", { n: 30 });
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
                <StickyPageTitle title={t("My preferences")} />
                <div className="dashboard-content settings-subpage">
                    <div className="settings-subpage__panel settings-preferences">
                        <header className="settings-preferences__header">
                            <h2 className="settings-preferences__title">{t("Dashboard preferences")}</h2>
                            <p className="settings-preferences__lede">
                                {t("These settings apply to the home and domain dashboards when you work with analytics and reports.")}
                            </p>
                        </header>

                        <div className="settings-preferences__groups">
                            <section
                                className="settings-preferences__group"
                                aria-labelledby="pref-reporting-period"
                            >
                                <h3 className="settings-preferences__group-title" id="pref-reporting-period">
                                    {t("Reporting period")}
                                </h3>
                                <p className="settings-preferences__group-desc">
                                    {t("Pre-selected range when a view loads (you can still change dates in the filter).")}
                                </p>
                                <div className="settings-preferences__field">
                                    <label className="settings-preferences__label" htmlFor="settings-date-range">
                                        {t("Default range")}
                                    </label>
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
                            </section>

                            <section
                                className="settings-preferences__group"
                                aria-labelledby="pref-regional-format"
                            >
                                <h3 className="settings-preferences__group-title" id="pref-regional-format">
                                    {t("Regional format")}
                                </h3>
                                <p className="settings-preferences__group-desc">
                                    {t("How dates and numbers are shown in widgets, charts, and the compact date range next to the calendar.")}
                                </p>
                                <div className="settings-preferences__field">
                                    <label className="settings-preferences__label" htmlFor="settings-locale">
                                        {t("Locale")}
                                    </label>
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
                            </section>
                            <section className="settings-preferences__group" aria-labelledby="pref-language">
                                <h3 className="settings-preferences__group-title" id="pref-language">
                                    {t("Language")}
                                </h3>
                                <p className="settings-preferences__group-desc">
                                    {t("The language of the platform in this browser. Applies straight away.")}
                                </p>
                                <div className="settings-preferences__field">
                                    <span className="settings-preferences__label" aria-hidden="true">
                                        {t("Language")}
                                    </span>
                                    <LanguageMenu
                                        align="left"
                                        value={getLanguage()}
                                        onChange={(code) => setLanguage(code, { reload: true })}
                                        label={t("Language")}
                                    />
                                </div>
                            </section>
                            <section className="settings-preferences__group" aria-labelledby="pref-layout">
                                <h3 className="settings-preferences__group-title" id="pref-layout">
                                    {t("Layout (beta)")}
                                </h3>
                                <p className="settings-preferences__group-desc">
                                    {t("A labelled, grouped navigation and a top bar with the date range and domain health. Applies to this browser only; switch back any time.")}
                                </p>
                                <label className="settings-preferences__field" style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                                    <input
                                        type="checkbox"
                                        defaultChecked={isNewShell()}
                                        onChange={(e) => { setNewShell(e.target.checked); window.location.reload(); }}
                                    />
                                    {t("Use the new navigation")}
                                </label>
                            </section>
                        </div>

                        <footer className="settings-preferences__actions">
                            <Button
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
                                text={t("Save changes")}
                            />
                        </footer>
                    </div>
                </div>
            </article>
            {success ? (
                <SuccessWindow
                    message={t("Settings saved. Range: {range}. Format: {format}.", { range: defaultRange, format: localeLabel })}
                />
            ) : null}
        </>
    );
}
