import { Badge } from "../../Components/ui";
import { formatDateTime, formatNumber } from "../../Functions/format.js";
import { addScanDeltas, formatScanDelta, scanRegionLabel } from "../../Functions/scanHistory.js";

const Link = window.ReactRouterDOM.Link;

const SOURCE = { dashboard: "Scan now", automatic: "Automatic scan" };
const STEP = { accepted: "banner accepted", none: "no accept step", unknown: "no consent tags" };

/** The domain's stored scans, newest first. Exactly one row is marked as the page's data. */
export default function ScanHistoryPanel({ scans, currentId, firstVisitId, basePath }) {
    if (!scans.length) return null;
    const rows = addScanDeltas(scans);
    const current = rows.some((s) => String(s.id) === String(currentId)) ? currentId : (rows.find((s) => s.scan_type !== "first_visit") || rows[0]).id;
    return (
        <section className="compliance-scan-history" aria-labelledby="scan-history-title">
            <h3 id="scan-history-title" className="compliance-scan-history__title">Scan history</h3>
            <p className="compliance-scan-history__hint">The latest 3 scans of each type are kept. Changes compare against the previous scan of the same type and region.</p>
            <ul className="compliance-scan-history__list">
                {rows.map((s) => {
                    const isCurrent = String(s.id) === String(current);
                    return (
                        <li key={s.id}>
                            <Link to={`${basePath}?scan=${s.id}`} className={"compliance-scan-history__row" + (isCurrent ? " --current" : "")} aria-current={isCurrent ? "true" : undefined}>
                                <span className="compliance-scan-history__when">
                                    <span className="compliance-scan-history__time">{formatDateTime(s.scanned_at)}</span>
                                    {isCurrent && <Badge tone="info" icon="check-circle">Current (used for this page)</Badge>}
                                    {String(s.id) === String(firstVisitId) && !isCurrent && <Badge tone="neutral" icon="check-circle">Used for before-consent results</Badge>}
                                </span>
                                <span>{s.scan_type === "first_visit" ? "First visit, not accepted" : `${SOURCE[s.source]} · ${STEP[s.consent_step]}`} · {scanRegionLabel(s.scan_region)} · {s.domain}</span>
                                <span>{formatNumber(s.vendors_found)} vendors · {formatNumber(s.cookies_found)} cookies</span>
                                <span>{formatScanDelta(s.delta)}</span>
                            </Link>
                        </li>
                    );
                })}
            </ul>
        </section>
    );
}
