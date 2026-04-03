import { FRAMEWORK_IDS } from "./complianceRegions.js";
import AuditComplianceWorldMap from "./AuditComplianceWorldMap.js";
import AuditMapDetailPanel from "./AuditMapDetailPanel.js";
import "./AuditComplianceMiniMap.css";

/**
 * Regulatory snapshot with a real world map (TopoJSON) and framework legend.
 *
 * @param {object} props
 * @param {Record<string, { status: string, source?: string }>} props.regionStatus — keys: GDPR, LGPD, CCPA, POPIA
 * @param {boolean} [props.loading]
 * @param {boolean} [props.demoMode]
 * @param {string} [props.sampleCountryCodesKey] — comma-separated ISO alpha-2 from audit sample
 * @param {string|null} [props.selectedCountryCode]
 * @param {(updater: string | null | ((prev: string | null) => string | null)) => void} [props.onSelectCountry]
 * @param {null | { kind: 'country', code: string } | { kind: 'framework', fw: string }} [props.mapDetailSelection]
 * @param {object[]} [props.complianceIssues]
 * @param {string} [props.locale]
 * @param {() => void} [props.onCloseMapDetail]
 * @param {(fw: string) => void} [props.onSelectFramework]
 */
export default function AuditComplianceMiniMap({
    regionStatus,
    loading,
    demoMode,
    sampleCountryCodesKey = "",
    selectedCountryCode = null,
    onSelectCountry,
    mapDetailSelection = null,
    complianceIssues = [],
    locale,
    onCloseMapDetail,
    onSelectFramework,
}) {
    return (
        <div
            className={
                "audit-compliance-map" +
                (loading ? " audit-compliance-map--loading" : "") +
                (demoMode ? " audit-compliance-map--demo" : "")
            }
            aria-label="Regulatory coverage from recent audit sample on world map"
        >
            <div className="audit-compliance-map__header">
                <span className="audit-compliance-map__title">Regulatory snapshot</span>
                <span className="audit-compliance-map__subtitle">
                    Amber = regulated area, no matching consent row in this sample. Brighter green = that country
                    appears in the list. Click a row, map country, or framework label for details (again to clear).
                </span>
            </div>
            <div className="audit-compliance-map__map-shell">
                <AuditComplianceWorldMap
                    regionStatus={regionStatus}
                    sampleCountryCodesKey={sampleCountryCodesKey}
                    selectedCountryCode={selectedCountryCode}
                    onSelectCountry={onSelectCountry ?? (() => {})}
                    onSelectFramework={onSelectFramework}
                />
                <AuditMapDetailPanel
                    selection={mapDetailSelection}
                    onClose={onCloseMapDetail ?? (() => {})}
                    regionStatus={regionStatus}
                    issues={complianceIssues}
                    locale={locale}
                />
            </div>
            <ul className="audit-compliance-map__legend" aria-hidden>
                <li className="audit-compliance-map__legend-item audit-compliance-map__legend-item--potential">
                    Regulated · no sample
                </li>
                {FRAMEWORK_IDS.map((id) => {
                    const st = regionStatus?.[id]?.status ?? "none";
                    return (
                        <li
                            key={id}
                            className={`audit-compliance-map__legend-item audit-compliance-map__legend-item--${st}`}
                        >
                            {id}
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}
