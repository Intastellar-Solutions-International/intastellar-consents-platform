const { useState, useEffect } = window.React;
import API from "../../../API/api.js";
import SideNav from "../../../Components/Header/SideNav.js";
import { reportsLinks } from "../../../Components/Header/SideNavLinks/index.js";
import StickyPageTitle from "../../../Components/Header/Sticky/index.js";
import Authentication from "../../../Authentication/Auth.js";
import "../Style.css";
import {
    FRAMEWORK_IDS,
    FRAMEWORK_LABELS,
    FRAMEWORK_DESCRIPTIONS,
    FRAMEWORK_COUNTRY_COUNTS,
    BANNER_TYPE_BY_FRAMEWORK,
} from "../../../Functions/jurisdictionEngine.js";

const BANNER_TYPE_OPTIONS = [
    { value: "auto",         label: "Auto (recommended)" },
    { value: "opt-in",       label: "Opt-in banner" },
    { value: "opt-out",      label: "Opt-out banner" },
    { value: "notice-only",  label: "Notice only" },
];

const DEFAULT_CONFIG = Object.fromEntries(
    FRAMEWORK_IDS.map((fw) => [fw, { enabled: fw === "GDPR", bannerType: "auto" }])
);

export default function JurisdictionConfig() {
    document.title = "Jurisdiction Configuration | Settings | Intastellar Consents";

    const [config, setConfig] = useState(DEFAULT_CONFIG);
    const [saving, setSaving] = useState(false);
    const [status, setStatus] = useState(null);

    useEffect(() => {
        fetch(API.jurisdictionConfig.get.url, {
            method: API.jurisdictionConfig.get.method,
            headers: API.jurisdictionConfig.get.headers,
        })
            .then((r) => r.json())
            .then((data) => {
                if (data && typeof data === "object" && !data.error) {
                    setConfig({ ...DEFAULT_CONFIG, ...data });
                }
            })
            .catch(() => {});
    }, []);

    function toggle(fw) {
        setConfig((prev) => ({
            ...prev,
            [fw]: { ...prev[fw], enabled: !prev[fw].enabled },
        }));
    }

    function setBannerType(fw, value) {
        setConfig((prev) => ({
            ...prev,
            [fw]: { ...prev[fw], bannerType: value },
        }));
    }

    function save() {
        setSaving(true);
        setStatus(null);
        fetch(API.jurisdictionConfig.save.url, {
            method: API.jurisdictionConfig.save.method,
            headers: API.jurisdictionConfig.save.headers,
            body: JSON.stringify(config),
        })
            .then((r) => r.json())
            .then(() => setStatus("saved"))
            .catch(() => setStatus("error"))
            .finally(() => setSaving(false));
    }

    const resolvedBannerType = (fw) => {
        const override = config[fw]?.bannerType;
        return override && override !== "auto" ? override : BANNER_TYPE_BY_FRAMEWORK[fw] || "notice-only";
    };

    return (
        <>
            <SideNav links={reportsLinks} title="Settings" />
            <main className="dashboard-content settings-subpage settings-subpage--wide">
                <StickyPageTitle title="Jurisdiction Configuration" />
                <p className="settings-subpage__intro">
                    Enable the regulations that apply to your visitors and configure how the consent banner
                    behaves per jurisdiction. The banner type is set automatically based on each regulation
                    but can be overridden.
                </p>

                {status === "saved" && (
                    <p className="settings-subpage__status">Configuration saved successfully.</p>
                )}
                {status === "error" && (
                    <p className="settings-subpage__status settings-subpage__status--error">
                        Failed to save — please try again.
                    </p>
                )}

                <div style={{ display: "flex", flexDirection: "column", gap: "14px", marginBottom: "28px" }}>
                    {FRAMEWORK_IDS.map((fw) => {
                        const enabled = config[fw]?.enabled ?? false;
                        return (
                            <div key={fw} className="settings-subpage__panel" style={{ display: "flex", flexWrap: "wrap", gap: "16px 24px", alignItems: "flex-start" }}>
                                <div style={{ flex: "1 1 280px" }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "6px" }}>
                                        <button
                                            type="button"
                                            role="switch"
                                            aria-checked={enabled}
                                            onClick={() => toggle(fw)}
                                            style={{
                                                flexShrink: 0,
                                                width: "40px", height: "22px",
                                                borderRadius: "11px",
                                                border: "none",
                                                background: enabled ? "rgba(192,159,83,0.75)" : "rgba(100,100,100,0.4)",
                                                cursor: "pointer",
                                                position: "relative",
                                                transition: "background 0.2s",
                                            }}
                                        >
                                            <span style={{
                                                position: "absolute",
                                                top: "3px",
                                                left: enabled ? "21px" : "3px",
                                                width: "16px", height: "16px",
                                                borderRadius: "50%",
                                                background: "#fff",
                                                transition: "left 0.2s",
                                            }} />
                                        </button>
                                        <span style={{ fontWeight: 600, fontSize: "0.9375rem", color: enabled ? "#f2f2f2" : "#888" }}>
                                            {FRAMEWORK_LABELS[fw]}
                                        </span>
                                    </div>
                                    <p style={{ margin: 0, fontSize: "0.8125rem", color: "rgba(180,180,180,0.85)", lineHeight: 1.5 }}>
                                        {FRAMEWORK_DESCRIPTIONS[fw]}
                                        <span style={{ marginLeft: "8px", fontSize: "0.75rem", color: "rgba(192,159,83,0.75)" }}>
                                            {FRAMEWORK_COUNTRY_COUNTS[fw]} {FRAMEWORK_COUNTRY_COUNTS[fw] === 1 ? "country" : "countries"}
                                        </span>
                                    </p>
                                </div>

                                {enabled && (
                                    <div style={{ flex: "0 0 220px" }}>
                                        <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, color: "#b8b8b8", marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.07em" }}>
                                            Banner type
                                        </label>
                                        <select
                                            className="settings-subpage__select"
                                            value={config[fw]?.bannerType || "auto"}
                                            onChange={(e) => setBannerType(fw, e.target.value)}
                                            style={{ width: "100%" }}
                                        >
                                            {BANNER_TYPE_OPTIONS.map((o) => (
                                                <option key={o.value} value={o.value}>
                                                    {o.value === "auto" ? `${o.label} — ${resolvedBannerType(fw)}` : o.label}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                )}

                                {!enabled && (
                                    <div style={{ flex: "0 0 220px", display: "flex", alignItems: "center" }}>
                                        <span style={{ fontSize: "0.75rem", color: "rgba(140,140,140,0.7)", fontStyle: "italic" }}>Disabled — no banner shown</span>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>

                <button
                    type="button"
                    className="settings-subpage__submit"
                    onClick={save}
                    disabled={saving}
                >
                    {saving ? "Saving…" : "Save changes"}
                </button>
            </main>
        </>
    );
}
