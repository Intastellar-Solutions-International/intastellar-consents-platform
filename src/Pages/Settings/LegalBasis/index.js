const { useState, useEffect } = window.React;
import API from "../../../API/api.js";
import SideNav from "../../../Components/Header/SideNav.js";
import { reportsLinks } from "../../../Components/Header/SideNavLinks/index.js";
import StickyPageTitle from "../../../Components/Header/Sticky/index.js";
import "../Style.css";
import { LEGAL_BASES, PROCESSING_PURPOSES, DEFAULT_LEGAL_BASIS } from "../../../Functions/legalBasisDefinitions.js";
import { FRAMEWORK_IDS } from "../../../Components/AuditSnapshotCard/complianceRegions.js";

function buildDefault() {
    const out = {};
    for (const fw of FRAMEWORK_IDS) {
        out[fw] = {};
        for (const p of PROCESSING_PURPOSES) {
            out[fw][p.id] = DEFAULT_LEGAL_BASIS[fw]?.[p.id] || (LEGAL_BASES[fw]?.[0]?.id ?? "consent");
        }
    }
    return out;
}

export default function LegalBasis() {
    document.title = "Legal Basis Tracking | Settings | Intastellar Consents";

    const [config, setConfig] = useState(buildDefault);
    const [saving, setSaving] = useState(false);
    const [status, setStatus] = useState(null);

    useEffect(() => {
        fetch(API.legalBasis.get.url, {
            method: API.legalBasis.get.method,
            headers: API.legalBasis.get.headers,
        })
            .then((r) => r.json())
            .then((data) => {
                if (data && typeof data === "object" && !data.error) {
                    setConfig((prev) => ({ ...prev, ...data }));
                }
            })
            .catch(() => {});
    }, []);

    function setBase(fw, purposeId, value) {
        setConfig((prev) => ({
            ...prev,
            [fw]: { ...prev[fw], [purposeId]: value },
        }));
    }

    function save() {
        setSaving(true);
        setStatus(null);
        fetch(API.legalBasis.save.url, {
            method: API.legalBasis.save.method,
            headers: API.legalBasis.save.headers,
            body: JSON.stringify(config),
        })
            .then((r) => r.json())
            .then(() => setStatus("saved"))
            .catch(() => setStatus("error"))
            .finally(() => setSaving(false));
    }

    const activeFrameworks = FRAMEWORK_IDS.filter((fw) => LEGAL_BASES[fw]);

    return (
        <>
            <SideNav links={reportsLinks} title="Settings" />
            <main className="dashboard-content settings-subpage settings-subpage--wide">
                <StickyPageTitle title="Legal Basis Tracking" />
                <p className="settings-subpage__intro">
                    Assign a legal basis to each processing purpose under each active regulation. These
                    assignments are shown alongside consent decisions in the audit log, making it easy to
                    demonstrate compliance during an inspection or DSR response.
                </p>

                {status === "saved" && (
                    <p className="settings-subpage__status">Legal basis configuration saved.</p>
                )}
                {status === "error" && (
                    <p className="settings-subpage__status settings-subpage__status--error">
                        Failed to save — please try again.
                    </p>
                )}

                <div style={{ overflowX: "auto", marginBottom: "24px" }}>
                    <table style={{ borderCollapse: "collapse", width: "100%", minWidth: `${220 + activeFrameworks.length * 180}px` }}>
                        <thead>
                            <tr>
                                <th style={{ textAlign: "left", padding: "12px 16px", fontSize: "0.65rem", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(192,159,83,0.95)", borderBottom: "1px solid rgba(255,255,255,0.1)", background: "rgba(0,0,0,0.25)", width: "200px" }}>
                                    Processing purpose
                                </th>
                                {activeFrameworks.map((fw) => (
                                    <th key={fw} style={{ textAlign: "left", padding: "12px 16px", fontSize: "0.65rem", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(192,159,83,0.95)", borderBottom: "1px solid rgba(255,255,255,0.1)", background: "rgba(0,0,0,0.25)" }}>
                                        {fw}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {PROCESSING_PURPOSES.map((p, i) => (
                                <tr key={p.id} style={{ background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.015)" }}>
                                    <td style={{ padding: "12px 16px", fontSize: "0.875rem", color: "#e0e0e0", borderBottom: "1px solid rgba(255,255,255,0.06)", fontWeight: 500 }}>
                                        {p.label}
                                    </td>
                                    {activeFrameworks.map((fw) => {
                                        const bases = LEGAL_BASES[fw] || [];
                                        return (
                                            <td key={fw} style={{ padding: "8px 16px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                                                <select
                                                    className="settings-subpage__select"
                                                    style={{ width: "100%", minWidth: "160px" }}
                                                    value={config[fw]?.[p.id] || ""}
                                                    onChange={(e) => setBase(fw, p.id, e.target.value)}
                                                >
                                                    {bases.map((b) => (
                                                        <option key={b.id} value={b.id}>{b.label}</option>
                                                    ))}
                                                </select>
                                            </td>
                                        );
                                    })}
                                </tr>
                            ))}
                        </tbody>
                    </table>
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
