const { useState, useEffect, useCallback } = React;
import SideNav from "../../../Components/Header/SideNav";
import { reportsLinks } from "../../../Components/Header/SideNavLinks";
import StickyPageTitle from "../../../Components/Header/Sticky";
import { Card, KpiTile, Table, ErrorState } from "../../../Components/UI/index.js";
import Authentication from "../../../Authentication/Auth";
import { TEAM_ACTIVITY_URL } from "../../../Functions/teamActivity.js";
import { sectionLabel } from "../../../Functions/teamSections.js";
import { formatDate, formatNumber } from "../../../Functions/format.js";
import "../Style.css";

const Link = window.ReactRouterDOM.Link;

const PERIODS = [7, 30, 90];

function isoDay(daysAgo) {
    return new Date(Date.now() - daysAgo * 86400000).toISOString().slice(0, 10);
}

function lastActiveLabel(iso) {
    if (!iso) return "—";
    const hours = (Date.now() - new Date(iso).getTime()) / 3600e3;
    if (hours < 1) return "Within the hour";
    if (hours < 24) return `${Math.floor(hours)} h ago`;
    if (hours < 48) return "Yesterday";
    return formatDate(iso);
}

function useTeamInsights(days) {
    const [state, setState] = useState({ loading: true, data: null, error: null, planRequired: false });

    const load = useCallback(() => {
        setState((s) => ({ ...s, loading: true, error: null }));
        const qs = new URLSearchParams({ from: isoDay(days - 1), to: isoDay(0) }).toString();
        fetch(`${TEAM_ACTIVITY_URL}?${qs}`, {
            headers: {
                Authorization: Authentication.getToken(),
                Organisation: String(Authentication.getOrganisation()),
            },
        })
            .then(async (res) => {
                if (res.status === 402) return setState({ loading: false, data: null, error: null, planRequired: true });
                if (!res.ok) throw new Error(`Server error (${res.status})`);
                setState({ loading: false, data: await res.json(), error: null, planRequired: false });
            })
            .catch((err) => setState({ loading: false, data: null, error: err.message, planRequired: false }));
    }, [days]);

    useEffect(() => { load(); }, [load]);
    return { ...state, reload: load };
}

const MEMBER_COLUMNS = (days) => [
    {
        key: "member", header: "Member",
        render: (m) => (
            <span className="tw-flex tw-flex-col tw-min-w-0">
                <span className="tw-text-text-primary tw-font-medium">{m.name || m.email}</span>
                {m.name && <span className="tw-text-xs tw-text-text-muted">{m.email}</span>}
            </span>
        ),
    },
    { key: "last_active", header: "Last active", render: (m) => lastActiveLabel(m.last_active) },
    { key: "active_days", header: "Active days", align: "right", render: (m) => `${m.active_days} of ${days}` },
    { key: "visits", header: "Sections opened", align: "right", render: (m) => formatNumber(m.visits) },
    { key: "top_sections", header: "Works most in", render: (m) => m.top_sections.map((s) => sectionLabel(s.section)).join(", ") || "—" },
    { key: "top_domains", header: "Domains", render: (m) => m.top_domains.map((d) => d.domain).join(", ") || "—" },
];

const SECTION_COLUMNS = [
    { key: "section", header: "Section", render: (s) => sectionLabel(s.section) },
    { key: "visits", header: "Opened", align: "right", render: (s) => formatNumber(s.visits) },
    { key: "members", header: "Members", align: "right" },
];

const DOMAIN_COLUMNS = [
    { key: "domain", header: "Domain" },
    { key: "visits", header: "Opened", align: "right", render: (d) => formatNumber(d.visits) },
    { key: "members", header: "Members", align: "right" },
    { key: "last_visit", header: "Last worked on", render: (d) => lastActiveLabel(d.last_visit) },
];

/**
 * Team insights (Growth plan): who in the organisation uses the platform,
 * how often, in which sections and on which domains. Built from the visits
 * TeamActivityTracker records (src/Functions/teamActivity.js).
 */
export default function TeamInsights() {
    document.title = "Team insights | Settings | Intastellar Consents | CMP";
    const [days, setDays] = useState(30);
    const { loading, data, error, planRequired, reload } = useTeamInsights(days);

    const topSection = data?.sections?.[0];
    const empty = { title: "No team activity yet", message: "Members appear here once they've used the platform. Activity is recorded from today." };

    return (
        <>
            <SideNav links={reportsLinks} title="Settings" />
            <main className="dashboard-content settings-subpage settings-subpage--wide">
                <StickyPageTitle title="Team insights" />
                <Link className="settings-subpage__back" to="/settings">← Back to settings</Link>

                <div className="tw-flex tw-flex-wrap tw-items-end tw-justify-between tw-gap-4 tw-mb-6">
                    <p className="settings-subpage__intro tw-m-0">
                        Who on your team uses the platform, how often, and which sections and domains they work on.
                    </p>
                    <label className="tw-flex tw-items-center tw-gap-2 tw-text-sm tw-text-text-muted">
                        Period
                        <select className="sa-form-select" value={days} onChange={(e) => setDays(Number(e.target.value))}>
                            {PERIODS.map((d) => <option key={d} value={d}>Last {d} days</option>)}
                        </select>
                    </label>
                </div>

                {planRequired ? (
                    <ErrorState title="Team insights require the Growth plan" message="Upgrade under Settings → Plans to see your team's activity." />
                ) : error ? (
                    <ErrorState title="Couldn't load team insights" message={error} onRetry={reload} />
                ) : (
                    <div className="tw-flex tw-flex-col tw-gap-6">
                        <div className="tw-grid tw-gap-4 tw-grid-cols-2 lg:tw-grid-cols-4">
                            <KpiTile loading={loading} label="Active members" value={formatNumber(data?.totals.active_members ?? 0)} hint={`Used the platform in the last ${days} days`} />
                            <KpiTile loading={loading} label="Sections opened" value={formatNumber(data?.totals.visits ?? 0)} />
                            <KpiTile loading={loading} label="Domains worked on" value={formatNumber(data?.totals.domains ?? 0)} />
                            <KpiTile loading={loading} label="Most used section" value={topSection ? sectionLabel(topSection.section) : "—"}
                                hint={topSection ? `${topSection.members} member${topSection.members === 1 ? "" : "s"}` : undefined} />
                        </div>

                        <Card title="Members" description="Sorted by most recently active." padding="none">
                            <Table caption="Team members" loading={loading} columns={MEMBER_COLUMNS(days)} rows={data?.members || []}
                                getRowKey={(m) => m.email} empty={empty} />
                        </Card>

                        <div className="tw-grid tw-gap-6 lg:tw-grid-cols-2">
                            <Card title="Most used sections" padding="none">
                                <Table caption="Most used sections" loading={loading} columns={SECTION_COLUMNS} rows={data?.sections || []}
                                    getRowKey={(s) => s.section} empty={empty} />
                            </Card>
                            <Card title="Domains your team works on" padding="none">
                                <Table caption="Domains your team works on" loading={loading} columns={DOMAIN_COLUMNS} rows={data?.domains || []}
                                    getRowKey={(d) => d.domain} empty={{ title: "No domains yet", message: "Domains appear once members open a domain's pages." }} />
                            </Card>
                        </div>

                        <p className="tw-m-0 tw-text-xs tw-text-text-muted">
                            Recorded per member: which platform section and domain they open, at most once every 10 minutes.
                            No page content, inputs or clicks. Kept for 12 months. Visible to admins only.
                        </p>
                    </div>
                )}
            </main>
        </>
    );
}
