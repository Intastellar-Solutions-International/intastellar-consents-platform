const { useState, useEffect } = window.React;
import API from "../../../API/api.js";
import SideNav from "../../../Components/Header/SideNav.js";
import { reportsLinks } from "../../../Components/Header/SideNavLinks/index.js";
import StickyPageTitle from "../../../Components/Header/Sticky/index.js";
import "../Style.css";
import { LEGAL_BASES, PROCESSING_PURPOSES, DEFAULT_LEGAL_BASIS } from "../../../Functions/legalBasisDefinitions.js";
import { FRAMEWORK_IDS } from "../../../Components/AuditSnapshotCard/complianceRegions.js";
import ServicesEditor from "./ServicesEditor.js";

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
    const [services, setServices] = useState([]);
    const [saving, setSaving] = useState(false);
    const [status, setStatus] = useState(null);
    const [error, setError] = useState(null);

    function apply(data) {
        if (data.matrix) setConfig((prev) => ({ ...prev, ...data.matrix }));
        if (Array.isArray(data.services)) setServices(data.services.map((s) => ({ ...s, hosts: (s.hosts || []).join(", ") })));
    }

    useEffect(() => {
        fetch(API.legalBasis.url, { headers: API.legalBasis.headers })
            .then((r) => r.json())
            .then((data) => {
                if (data && typeof data === "object" && !data.error) apply(data);
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
        setError(null);
        fetch(API.legalBasis.url, {
            method: "POST",
            headers: API.legalBasis.headers,
            body: JSON.stringify({ matrix: config, services }),
        })
            .then(async (r) => {
                const data = await r.json().catch(() => ({}));
                if (!r.ok) throw new Error(data.error || "Failed to save — please try again.");
                apply(data);
                if (data.sync && !data.sync.ok) {
                    setError(`Saved, but the banner on your sites isn't updated yet: ${data.sync.error}. Save again to retry.`);
                    setStatus("error");
                } else {
                    setStatus("saved");
                }
            })
            .catch((err) => {
                setError(err.message);
                setStatus("error");
            })
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
                    demonstrate compliance during an inspection or DSR response. Services listed under
                    “Services without consent” are passed to the cookie banner through each domain's config.js.
                </p>

                {status === "saved" && (
                    <p className="settings-subpage__status">Legal basis configuration saved.</p>
                )}
                {status === "error" && (
                    <p className="settings-subpage__status settings-subpage__status--error">
                        {error}
                    </p>
                )}

                <div style={{ overflowX: "auto", marginBottom: "24px" }}>
                    <table style={{ borderCollapse: "collapse", width: "100%", minWidth: `${220 + activeFrameworks.length * 180}px` }}>
                        <thead>
                            <tr>
                                <th style={{ textAlign: "left", padding: "12px 16px", fontSize: "var(--text-xs)", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgb(var(--c-accent) / 0.95)", borderBottom: "1px solid rgb(var(--c-white) / 0.1)", background: "rgb(var(--c-black) / 0.25)", width: "200px" }}>
                                    Processing purpose
                                </th>
                                {activeFrameworks.map((fw) => (
                                    <th key={fw} style={{ textAlign: "left", padding: "12px 16px", fontSize: "var(--text-xs)", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgb(var(--c-accent) / 0.95)", borderBottom: "1px solid rgb(var(--c-white) / 0.1)", background: "rgb(var(--c-black) / 0.25)" }}>
                                        {fw}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {PROCESSING_PURPOSES.map((p, i) => (
                                <tr key={p.id} style={{ background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.015)" }}>
                                    <td style={{ padding: "12px 16px", fontSize: "var(--text-sm)", color: "var(--color-text-secondary)", borderBottom: "1px solid rgb(var(--c-white) / 0.06)", fontWeight: 500 }}>
                                        {p.label}
                                    </td>
                                    {activeFrameworks.map((fw) => {
                                        const bases = LEGAL_BASES[fw] || [];
                                        return (
                                            <td key={fw} style={{ padding: "8px 16px", borderBottom: "1px solid rgb(var(--c-white) / 0.06)" }}>
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

                <ServicesEditor services={services} onChange={setServices} />

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
