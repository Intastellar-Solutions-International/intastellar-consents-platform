const { useState, useEffect, useMemo } = window.React;
import API from "../../../API/api.js";
import SideNav from "../../../Components/Header/SideNav.js";
import { reportsLinks } from "../../../Components/Header/SideNavLinks/index.js";
import StickyPageTitle from "../../../Components/Header/Sticky/index.js";
import Authentication from "../../../Authentication/Auth.js";
import "../Style.css";
import "./Style.css";
import { PRIVACY_CATEGORIES, PRIVACY_SETTINGS } from "./privacySettingsCatalog.js";

function Toggle({ on, onToggle, disabled, label }) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={on}
            disabled={disabled}
            onClick={onToggle}
            className="org-privacy__toggle"
        >
            <span className={"org-privacy__toggle-track" + (on ? " org-privacy__toggle-track--on" : "")}>
                <span className="org-privacy__toggle-thumb" />
            </span>
            {label && <span className="org-privacy__toggle-label">{label}</span>}
        </button>
    );
}

// Org defaults are keyed by setting_key: { value, isLocked }. Absence of an
// entry means "no org default set" — the catalog's own defaultValue applies.
function SettingRow({ setting, current, onChangeValue, onToggleLock }) {
    const value = current?.value ?? setting.defaultValue;
    const isLocked = Boolean(current?.isLocked);

    return (
        <div className="org-privacy__row">
            <div className="org-privacy__row-main">
                <div className="org-privacy__row-text">
                    <span className="org-privacy__row-label">{setting.label}</span>
                    <p className="org-privacy__row-desc">{setting.description}</p>
                    <span className="org-privacy__row-products">{setting.products.join(" · ")}</span>
                </div>

                <div className="org-privacy__row-control">
                    {setting.dataType === "boolean" ? (
                        <Toggle
                            on={value === "true"}
                            onToggle={() => onChangeValue(setting.key, value === "true" ? "false" : "true")}
                        />
                    ) : (
                        <select
                            className="settings-subpage__select"
                            value={value}
                            onChange={(e) => onChangeValue(setting.key, e.target.value)}
                        >
                            {setting.enumOptions.map((o) => (
                                <option key={o.value} value={o.value}>{o.label}</option>
                            ))}
                        </select>
                    )}
                </div>
            </div>

            {setting.isLockable ? (
                <label className="org-privacy__lock">
                    <input
                        type="checkbox"
                        checked={isLocked}
                        onChange={() => onToggleLock(setting.key)}
                    />
                    Lock for all members — they won't be able to change this themselves
                </label>
            ) : (
                <span className="org-privacy__lock org-privacy__lock--fixed">Not overridable by members</span>
            )}
        </div>
    );
}

export default function OrganisationPrivacySettings() {
    document.title = "Organisation Privacy | Settings | Intastellar Consents";

    const role = Authentication.getCurrentOrganisationRole();
    const isAdmin = role === "admin" || role === "super-admin";

    const [defaults, setDefaults] = useState({});
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(false);
    const [saving, setSaving] = useState(false);
    const [status, setStatus] = useState(null); // null | "saved" | "error"
    const [dirtyKeys, setDirtyKeys] = useState(() => new Set());

    useEffect(() => {
        if (!isAdmin) { setLoading(false); return; }
        fetch(API.orgPrivacySettings.get.url, {
            method: API.orgPrivacySettings.get.method,
            headers: API.orgPrivacySettings.get.headers,
        })
            .then((r) => r.ok ? r.json() : Promise.reject())
            .then((data) => {
                setDefaults(data?.defaults || {});
            })
            .catch(() => setLoadError(true))
            .finally(() => setLoading(false));
    }, [isAdmin]);

    function markDirty(key) {
        setDirtyKeys((prev) => new Set(prev).add(key));
        setStatus(null);
    }

    function changeValue(key, value) {
        setDefaults((prev) => ({ ...prev, [key]: { ...prev[key], value, isLocked: Boolean(prev[key]?.isLocked) } }));
        markDirty(key);
    }

    function toggleLock(key) {
        setDefaults((prev) => {
            const setting = PRIVACY_SETTINGS.find((s) => s.key === key);
            const existing = prev[key] || { value: setting.defaultValue, isLocked: false };
            return { ...prev, [key]: { ...existing, isLocked: !existing.isLocked } };
        });
        markDirty(key);
    }

    function save() {
        setSaving(true);
        setStatus(null);
        const changes = Array.from(dirtyKeys).map((key) => ({
            settingKey: key,
            value: defaults[key]?.value ?? PRIVACY_SETTINGS.find((s) => s.key === key)?.defaultValue,
            isLocked: Boolean(defaults[key]?.isLocked),
        }));
        fetch(API.orgPrivacySettings.save.url, {
            method: API.orgPrivacySettings.save.method,
            headers: API.orgPrivacySettings.save.headers,
            body: JSON.stringify({ changes }),
        })
            .then((r) => r.ok ? r.json() : Promise.reject())
            .then(() => {
                setStatus("saved");
                setDirtyKeys(new Set());
            })
            .catch(() => setStatus("error"))
            .finally(() => setSaving(false));
    }

    const settingsByCategory = useMemo(() => {
        const map = {};
        for (const s of PRIVACY_SETTINGS) {
            (map[s.category] = map[s.category] || []).push(s);
        }
        return map;
    }, []);

    if (!isAdmin) {
        return (
            <>
                <SideNav links={reportsLinks} title="Settings" />
                <main className="dashboard-content settings-subpage">
                    <StickyPageTitle title="Organisation Privacy" />
                    <p style={{ padding: "24px 0", color: "rgba(180,180,180,0.85)" }}>Admin access required.</p>
                </main>
            </>
        );
    }

    return (
        <>
            <SideNav links={reportsLinks} title="Settings" />
            <main className="dashboard-content settings-subpage settings-subpage--wide">
                <StickyPageTitle title="Organisation Privacy" />

                <p className="settings-subpage__intro">
                    Defaults applied to every member of this organisation. A locked setting can't be changed by
                    members themselves — use that for anything this org needs to guarantee, not just prefer.
                </p>

                {status === "saved" && (
                    <p className="settings-subpage__status">Changes saved.</p>
                )}
                {status === "error" && (
                    <p className="settings-subpage__status settings-subpage__status--error">
                        Failed to save — please try again.
                    </p>
                )}
                {loadError && (
                    <p className="settings-subpage__status settings-subpage__status--error">
                        Couldn't load current defaults — showing catalog defaults instead. Changes you make here
                        still won't persist until the backend endpoint exists.
                    </p>
                )}

                {loading ? (
                    <p style={{ color: "rgba(180,180,180,0.85)" }}>Loading…</p>
                ) : (
                    <>
                        {PRIVACY_CATEGORIES.map((category) => (
                            <section key={category.key} className="org-privacy__category">
                                <h2 className="org-privacy__category-title">{category.label}</h2>
                                <div className="settings-subpage__panel settings-subpage__panel--flush">
                                    {(settingsByCategory[category.key] || []).map((setting) => (
                                        <SettingRow
                                            key={setting.key}
                                            setting={setting}
                                            current={defaults[setting.key]}
                                            onChangeValue={changeValue}
                                            onToggleLock={toggleLock}
                                        />
                                    ))}
                                </div>
                            </section>
                        ))}

                        <button
                            type="button"
                            className="settings-subpage__submit"
                            onClick={save}
                            disabled={saving || dirtyKeys.size === 0}
                        >
                            {saving ? "Saving…" : dirtyKeys.size > 0 ? `Save ${dirtyKeys.size} change${dirtyKeys.size > 1 ? "s" : ""}` : "Save changes"}
                        </button>
                    </>
                )}
            </main>
        </>
    );
}
