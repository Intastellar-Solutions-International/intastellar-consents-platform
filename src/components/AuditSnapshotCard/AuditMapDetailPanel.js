import { FRAMEWORK_IDS } from "./complianceRegions.js";
import { auditMapCountryDisplayName, buildMapDetailWarnings } from "./auditMapSelectionWarnings.js";
import "./AuditMapDetailPanel.css";

/**
 * @param {object} props
 * @param {null | { kind: 'country', code: string } | { kind: 'framework', fw: string }} props.selection
 * @param {() => void} props.onClose
 * @param {Record<string, { status: string, source?: string }>} props.regionStatus
 * @param {object[]} [props.issues]
 * @param {string} [props.locale]
 */
export default function AuditMapDetailPanel({ selection, onClose, regionStatus, issues = [], locale }) {
    if (!selection) return null;

    const warnings = buildMapDetailWarnings(selection, { regionStatus, issues, locale });

    let title;
    if (selection.kind === "country") {
        const name = auditMapCountryDisplayName(selection.code, locale);
        title = `${selection.code} — ${name}`;
    } else {
        title = `${selection.fw} region`;
    }

    return (
        <div className="audit-map-detail-panel" role="region" aria-label="Map selection details">
            <div className="audit-map-detail-panel__head">
                <span className="audit-map-detail-panel__title">{title}</span>
                <button
                    type="button"
                    className="audit-map-detail-panel__close"
                    onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onClose();
                    }}
                    aria-label="Close details"
                >
                    ×
                </button>
            </div>
            {warnings.length === 0 ? (
                <p className="audit-map-detail-panel__empty">No extra warnings for this selection.</p>
            ) : (
                <ul className="audit-map-detail-panel__list">
                    {warnings.map((w, i) => (
                        <li
                            key={`${w.code}-${i}`}
                            className={`audit-map-detail-panel__item audit-map-detail-panel__item--${w.severity}`}
                        >
                            <span className="audit-map-detail-panel__code">{w.code}</span>
                            <span className="audit-map-detail-panel__text">{w.text}</span>
                        </li>
                    ))}
                </ul>
            )}
            {selection.kind === "framework" && FRAMEWORK_IDS.includes(selection.fw) ? (
                <p className="audit-map-detail-panel__hint">
                    Click a country inside this regulatory area for country-specific notes.
                </p>
            ) : null}
        </div>
    );
}
