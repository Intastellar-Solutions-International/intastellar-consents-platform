import Card from "../../Components/ui/Card.js";
import Button from "../../Components/ui/Button.js";
import { Icon } from "../../Components/ui/icons.js";
import Authentication from "../../Authentication/Auth";
import { loadAuditReportIndex, addAuditReportEntry } from "../../Functions/auditReportsStorage";
import { REPORTS, reportTypeOf, requestReportPdf, downloadBlob, reportFilename, newReportEntry } from "../../Functions/auditReportPdf.js";
import { formatDate } from "../../Functions/format.js";
import { readCachedDomains } from "../../Functions/cachedDomains.js";

const { useState, useEffect, useMemo } = React;

const PRESETS = [
    { id: "audit", description: "Findings, evidence and full records for auditors" },
    { id: "summary", description: "One page on acceptance, categories and regions" },
    { id: "snapshot", description: "Latest scan results, vendors and what to act on" },
];
const PERIODS = [["7", "Last 7 days"], ["30", "Last 30 days"], ["90", "Last 90 days"]];
const RECENT_SHOWN = 3;
const FIELD = "tw-h-10 tw-w-full tw-px-2 tw-bg-bg-sunken tw-text-text-primary tw-border tw-border-solid tw-border-border-strong tw-rounded-md tw-font-sans tw-text-sm focus-visible:tw-outline-none focus-visible:tw-shadow-focus";
const LABEL = "tw-flex tw-flex-col tw-gap-1 tw-text-xs tw-text-text-muted tw-min-w-0";

function toYmd(d) {
    return d.toISOString().split("T")[0];
}

function periodRange(period, fromDate, toDate) {
    if (period === "page") return [toYmd(fromDate), toYmd(toDate)];
    const to = new Date();
    const from = new Date();
    from.setDate(to.getDate() - (Number(period) - 1));
    return [toYmd(from), toYmd(to)];
}

/**
 * One-click reports for the domain and period on the page. `domain` is the
 * page's domain, or null in the combined view, where the user picks one.
 */
export default function QuickReport({ platformId, domain, fromDate, toDate }) {
    const orgId = Authentication.getOrganisation();
    const [preset, setPreset] = useState("audit");
    const [chosenDomain, setChosenDomain] = useState("");
    const [period, setPeriod] = useState("page");
    const [reports, setReports] = useState([]);
    const [busyId, setBusyId] = useState(null);
    const [result, setResult] = useState(null);

    useEffect(() => {
        setChosenDomain(domain || "");
        setResult(null);
    }, [domain]);

    useEffect(() => {
        setReports(orgId != null && chosenDomain ? loadAuditReportIndex(orgId, chosenDomain) : []);
    }, [orgId, chosenDomain]);

    const domains = useMemo(() => {
        const list = readCachedDomains();
        return domain && !list.includes(domain) ? [domain, ...list] : list;
    }, [domain]);

    async function download(key, type, fromYmd, toYmd, onDone) {
        setBusyId(key);
        setResult(null);
        try {
            const res = await requestReportPdf(platformId, type, chosenDomain, fromYmd, toYmd);
            if (res.ok) {
                downloadBlob(res.blob, reportFilename(type, chosenDomain, fromYmd, toYmd));
                onDone?.();
                setResult({ ok: true, text: "Report downloaded." });
            } else if (res.error) {
                setResult({ ok: false, text: `The report couldn't be generated: ${res.error}` });
            }
        } catch {
            setResult({ ok: false, text: "The report couldn't be generated. Check your connection and try again." });
        } finally {
            setBusyId(null);
        }
    }

    function generate() {
        const [fromYmd, toYmd] = periodRange(period, fromDate, toDate);
        download("new", preset, fromYmd, toYmd, () => {
            setReports(addAuditReportEntry(orgId, chosenDomain, newReportEntry(preset, chosenDomain, fromYmd, toYmd)));
        });
    }

    return (
        <Card title="Quick report">
            <div className="tw-flex tw-flex-col tw-gap-3">
                <fieldset className="tw-m-0 tw-p-0 tw-border-0 tw-flex tw-flex-col tw-gap-1">
                    <legend className="tw-p-0 tw-pb-1 tw-text-xs tw-text-text-muted">Report type</legend>
                    {PRESETS.map((p) => (
                        <label key={p.id} className={`tw-flex tw-items-start tw-gap-2 tw-px-2 tw-py-2 tw-rounded-md tw-cursor-pointer ${preset === p.id ? "tw-bg-accent-subtle" : "hover:tw-bg-white/5"}`}>
                            <input type="radio" name="quick-report-preset" checked={preset === p.id} onChange={() => { setPreset(p.id); setResult(null); }} style={{ accentColor: "rgb(var(--c-accent))", marginTop: 3 }} />
                            <span className="tw-min-w-0">
                                <span className="tw-block tw-text-sm tw-text-text-primary">{REPORTS[p.id].name}</span>
                                <span className="tw-block tw-text-xs tw-text-text-muted">{p.description}</span>
                            </span>
                        </label>
                    ))}
                </fieldset>
                <div className="tw-grid tw-grid-cols-2 tw-gap-2">
                    <label className={LABEL}>
                        Domain
                        <select className={FIELD} value={chosenDomain} onChange={(e) => { setChosenDomain(e.target.value); setResult(null); }} style={{ colorScheme: "dark" }}>
                            <option value="">Choose…</option>
                            {domains.map((d) => <option key={d} value={d}>{d}</option>)}
                        </select>
                    </label>
                    <label className={LABEL}>
                        Period
                        <select className={FIELD} value={period} onChange={(e) => { setPeriod(e.target.value); setResult(null); }} style={{ colorScheme: "dark" }}>
                            <option value="page">Same as page</option>
                            {PERIODS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                        </select>
                    </label>
                </div>
                <Button variant="primary" loading={busyId === "new"} disabled={!chosenDomain || busyId != null} onClick={generate}>
                    {busyId === "new" ? "Generating…" : "Generate report"}
                </Button>
                {!chosenDomain && <p className="tw-m-0 tw-text-xs tw-text-text-muted">Choose a domain to generate this report.</p>}
                {result && (
                    <p role={result.ok ? "status" : "alert"} className={`tw-m-0 tw-flex tw-items-center tw-gap-1 tw-text-sm ${result.ok ? "tw-text-success" : "tw-text-danger-text"}`}>
                        <Icon name={result.ok ? "check-circle" : "alert-octagon"} size={16} />{result.text}
                    </p>
                )}
                {reports.length > 0 && (
                    <div className="tw-pt-3 tw-border-0 tw-border-t tw-border-solid tw-border-border-subtle">
                        <p className="tw-m-0 tw-text-xs tw-text-text-muted">Recent</p>
                        <ul className="tw-m-0 tw-p-0 tw-list-none">
                            {reports.slice(0, RECENT_SHOWN).map((r) => (
                                <li key={r.id} className="tw-flex tw-items-center tw-justify-between tw-gap-2 tw-py-1">
                                    <span className="tw-min-w-0">
                                        <span className="tw-block tw-text-sm tw-text-text-secondary tw-truncate">{REPORTS[reportTypeOf(r)].name}</span>
                                        <span className="tw-block tw-text-xs tw-text-text-muted tw-truncate">{formatDate(r.fromDate)} – {formatDate(r.toDate)}</span>
                                    </span>
                                    <Button size="sm" variant="ghost" loading={busyId === r.id} disabled={busyId != null} aria-label={`Download ${REPORTS[reportTypeOf(r)].name} for ${r.fromDate} to ${r.toDate}`} onClick={() => download(r.id, reportTypeOf(r), r.fromDate, r.toDate)}>Download</Button>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
            </div>
        </Card>
    );
}
