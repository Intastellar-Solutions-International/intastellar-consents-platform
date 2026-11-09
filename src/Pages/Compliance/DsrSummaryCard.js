import API from "../../API/api";
import { Card, Badge } from "../../Components/ui";
import { formatNumber } from "../../Functions/format.js";
import { DSR_DEADLINES_DAYS } from "../../Functions/jurisdictionEngine.js";
import { dsrSummary } from "../../Functions/dsrSummary.js";

const { useState, useEffect } = React;
const Link = window.ReactRouterDOM.Link;

/** Open data subject requests across the organisation, linking to the DSR portal. */
export default function DsrSummaryCard({ platformId }) {
    const [summary, setSummary] = useState(null);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        const ac = new AbortController();
        fetch(API.dsr.list.url, { method: API.dsr.list.method, headers: API.dsr.list.headers, signal: ac.signal })
            .then((r) => r.json())
            .then((data) => {
                if (!Array.isArray(data)) throw new Error("unexpected response");
                setSummary(dsrSummary(data, DSR_DEADLINES_DAYS));
            })
            .catch((e) => { if (e.name !== "AbortError") setFailed(true); });
        return () => ac.abort();
    }, []);

    const figure = (label, value, badge) => (
        <div className="tw-flex tw-flex-col tw-gap-1 tw-min-w-0">
            <span className="tw-text-xs tw-text-text-muted">{label}</span>
            <span className="tw-text-2xl tw-font-semibold tw-text-text-primary tw-tabular-nums">{summary ? formatNumber(value) : "—"}</span>
            {badge}
        </div>
    );

    return (
        <Card title="Data subject requests" description="Across your organisation" id="dsr-summary" className="tw-mt-5">
            {failed ? (
                <p className="tw-m-0 tw-text-sm tw-text-text-muted">The requests couldn't be loaded.</p>
            ) : (
                <div className="tw-grid tw-grid-cols-3 tw-gap-3">
                    {figure("Open", summary?.open)}
                    {figure("Due within 7 days", summary?.dueSoon, summary?.dueSoon > 0 && <Badge tone="warning" icon="alert-triangle">Due soon</Badge>)}
                    {figure("Overdue", summary?.overdue, summary?.overdue > 0 && <Badge tone="danger" icon="alert-octagon">Overdue</Badge>)}
                </div>
            )}
            <Link to={`/${platformId}/reports/dsr`} className="tw-inline-block tw-mt-3 tw-text-sm tw-font-semibold tw-text-accent-strong">Open DSR portal</Link>
        </Card>
    );
}
