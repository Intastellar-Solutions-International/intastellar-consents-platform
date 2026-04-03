import { FRAMEWORK_IDS } from "./complianceRegions.js";
import AuditComplianceWorldMap from "./AuditComplianceWorldMap.js";
import "./AuditComplianceMiniMap.css";

/**
 * Regulatory snapshot with a real world map (TopoJSON) and framework legend.
 *
 * @param {object} props
 * @param {Record<string, { status: string, source?: string }>} props.regionStatus — keys: GDPR, LGPD, CCPA, POPIA
 * @param {boolean} [props.loading]
 * @param {boolean} [props.demoMode]
 */
export default function AuditComplianceMiniMap({ regionStatus, loading, demoMode }) {
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
                    Live compliance coverage by region
                </span>
            </div>
            <div className="audit-compliance-map__map-shell">
                <AuditComplianceWorldMap regionStatus={regionStatus} />
            </div>
            <ul className="audit-compliance-map__legend" aria-hidden>
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
