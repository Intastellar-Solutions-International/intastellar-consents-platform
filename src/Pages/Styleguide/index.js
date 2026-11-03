import {
    Icon, ICON_NAMES, Button, Badge, RiskBadge, Tag, Card, Table, Tabs, TabPanel, FilterBar, FilterSelect, FilterSearch,
    FilterChip, Drawer, EmptyState, ErrorState, SkeletonText, SkeletonKpiTile, SkeletonTableRows, SkeletonCard, KpiTile, HealthPill,
} from "../../Components/ui";
import { formatNumber, formatPercent, formatDate, formatDateTime, formatDateRange, appLocale } from "../../Functions/format.js";

const { useState } = React;

/**
 * /styleguide — every shared UI component in every state. Development builds
 * only (see App.js); not reachable in production.
 */
function Section({ id, title, children }) {
    return (
        <section aria-labelledby={id} className="tw-flex tw-flex-col tw-gap-4 tw-py-8 tw-border-0 tw-border-b tw-border-solid tw-border-border-subtle">
            <h2 id={id} className="tw-m-0 tw-text-xl tw-font-semibold tw-text-text-primary">{title}</h2>
            {children}
        </section>
    );
}
const Row = ({ children }) => <div className="tw-flex tw-flex-wrap tw-items-center tw-gap-3">{children}</div>;
const Grid = ({ children }) => <div className="tw-grid tw-gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}>{children}</div>;

const ROWS = [
    { vendor: "Microsoft Clarity", hosts: 9, category: "analytics", region: "US", risk: "medium" },
    { vendor: "Google Ads", hosts: 3, category: "advertising", region: "US", risk: "high" },
    { vendor: "Google Fonts", hosts: 2, category: "cdn", region: "EU", risk: "low" },
];

export default function Styleguide() {
    document.title = "Styleguide | Intastellar Consents";
    const [tab, setTab] = useState("overview");
    const [drawer, setDrawer] = useState(null);
    const [sort, setSort] = useState({ key: "vendor", direction: "asc" });
    const [region, setRegion] = useState("all");
    const [query, setQuery] = useState("");
    const [preOnly, setPreOnly] = useState(false);
    const sorted = [...ROWS].sort((a, b) => (a[sort.key] > b[sort.key] ? 1 : -1) * (sort.direction === "asc" ? 1 : -1));
    const active = (region !== "all") + (query !== "") + preOnly;

    return (
        <main className="tw-font-sans tw-text-text-secondary tw-bg-bg-base tw-min-h-screen tw-px-8 tw-pb-16" style={{ maxWidth: 1200, margin: "0 auto" }}>
            <header className="tw-py-8">
                <h1 className="tw-m-0 tw-text-3xl tw-font-semibold tw-text-text-primary">Styleguide</h1>
                <p className="tw-m-0 tw-mt-2 tw-text-sm tw-text-text-muted">Shared components (src/Components/ui) on the design tokens (src/styles/tokens.css). Development only.</p>
            </header>

            <Section id="sg-colours" title="Tokens">
                <Grid>
                    {[["bg-sunken", "tw-bg-bg-sunken"], ["bg-base", "tw-bg-bg-base"], ["bg-raised", "tw-bg-bg-raised"], ["accent", "tw-bg-accent"], ["success", "tw-bg-success"], ["warning", "tw-bg-warning"], ["danger", "tw-bg-danger"], ["info", "tw-bg-info"]].map(([n, cls]) => (
                        <div key={n} className="tw-flex tw-items-center tw-gap-3">
                            <span className={`tw-block tw-h-10 tw-w-10 tw-rounded-md tw-border tw-border-solid tw-border-border ${cls}`} />
                            <code className="tw-text-sm">{n}</code>
                        </div>
                    ))}
                </Grid>
                <Row>
                    <span className="tw-text-text-primary">text-primary</span>
                    <span className="tw-text-text-secondary">text-secondary</span>
                    <span className="tw-text-text-muted">text-muted</span>
                    <span className="tw-text-accent-strong">accent-strong (gold text)</span>
                </Row>
                {/* Class names must be literal so Tailwind can find them. */}
                <Row>{[["xs", "tw-text-xs"], ["sm", "tw-text-sm"], ["base", "tw-text-base"], ["lg", "tw-text-lg"], ["xl", "tw-text-xl"], ["2xl", "tw-text-2xl"], ["3xl", "tw-text-3xl"]].map(([s, cls]) => <span key={s} className={`${cls} tw-text-text-primary`}>{s} {s === "xs" ? "(13px minimum)" : ""}</span>)}</Row>
            </Section>

            <Section id="sg-icons" title="Icons">
                <Grid>
                    {ICON_NAMES.map((n) => (
                        <div key={n} className="tw-flex tw-items-center tw-gap-2 tw-text-sm"><Icon name={n} size={20} /> <code>{n}</code></div>
                    ))}
                </Grid>
            </Section>

            <Section id="sg-button" title="Button">
                {["primary", "secondary", "ghost", "danger"].map((v) => (
                    <Row key={v}>
                        <Button variant={v}>{v}</Button>
                        <Button variant={v} icon="refresh">With icon</Button>
                        <Button variant={v} size="sm">Small</Button>
                        <Button variant={v} loading>Loading</Button>
                        <Button variant={v} disabled>Disabled</Button>
                        <Button variant={v} icon="settings" iconOnly aria-label="Settings" />
                    </Row>
                ))}
            </Section>

            <Section id="sg-badge" title="Badge, risk, tag">
                <Row>
                    <Badge>Neutral</Badge>
                    <Badge tone="success" icon="check-circle">Logging</Badge>
                    <Badge tone="warning" icon="alert-triangle">Stale scan</Badge>
                    <Badge tone="danger" icon="alert-octagon">Pre-consent tracker</Badge>
                    <Badge tone="info" icon="info">Beta</Badge>
                </Row>
                <Row><RiskBadge level="high" /><RiskBadge level="medium" /><RiskBadge level="low" /><RiskBadge level="none" /></Row>
                <Row><Tag>shop.example.com</Tag><Tag onRemove={() => {}}>Region: EU</Tag></Row>
            </Section>

            <Section id="sg-kpi" title="KPI tile">
                <Grid>
                    <KpiTile label="Consents" value={formatNumber(9959)} delta={{ value: 4.2, formatted: formatPercent(4.2), goodWhen: "up", label: "vs previous 30 days" }} />
                    <KpiTile label="Essential-only rate" value={formatPercent(30.1)} delta={{ value: 2.1, formatted: formatPercent(2.1), goodWhen: "down", label: "vs previous" }} />
                    <KpiTile label="Acceptance" value={formatPercent(61.2)} delta={{ value: 0, formatted: formatPercent(0) }} hint="No change" />
                    <KpiTile label="Loading" loading />
                    <KpiTile label="Consents" error={{ message: "No response within 30 seconds.", onRetry: () => {} }} />
                </Grid>
            </Section>

            <Section id="sg-health" title="Health pill">
                <Row>
                    <HealthPill checks={[{ label: "Logging", status: "ok", detail: "last consent 2 min ago" }, { label: "Last scan", status: "ok", detail: "1 day ago" }]} />
                    <HealthPill checks={[{ label: "Logging", status: "ok" }, { label: "Last scan", status: "warning", detail: "16 days ago" }]} onClick={() => {}} />
                    <HealthPill checks={[{ label: "Logging", status: "error", detail: "no consent in 24 h" }]} />
                    <HealthPill checks={[]} />
                </Row>
            </Section>

            <Section id="sg-card" title="Card">
                <Grid>
                    <Card title="Card title" description="Optional description" actions={<Button size="sm" variant="ghost" icon="external-link">Open</Button>}>Body content.</Card>
                    <Card>Card without header.</Card>
                </Grid>
            </Section>

            <Section id="sg-tabs" title="Tabs">
                <Tabs label="Example tabs" idPrefix="sg" value={tab} onChange={setTab} tabs={[{ id: "overview", label: "Overview" }, { id: "transfers", label: "Transfers", count: 60 }, { id: "cookies", label: "Cookies", count: 30 }, { id: "off", label: "Disabled", disabled: true }]} />
                {["overview", "transfers", "cookies"].map((id) => <TabPanel key={id} idPrefix="sg" id={id} active={tab === id} className="tw-py-3">Panel: {id}</TabPanel>)}
            </Section>

            <Section id="sg-table" title="Filter bar + table + drawer">
                <FilterBar activeCount={active} onClear={() => { setRegion("all"); setQuery(""); setPreOnly(false); }} resultCount={sorted.length}>
                    <FilterSelect label="Region" value={region} onChange={setRegion} options={[{ value: "all", label: "All regions" }, { value: "eu", label: "EU" }, { value: "non-eu", label: "Non-EU" }]} />
                    <FilterSearch label="Vendor" value={query} onChange={setQuery} placeholder="Search vendors" />
                    <FilterChip label="Pre-consent only" pressed={preOnly} onToggle={setPreOnly} />
                </FilterBar>
                <Card padding="none">
                    <Table
                        caption="Vendors"
                        columns={[
                            { key: "vendor", header: "Vendor", sortable: true },
                            { key: "hosts", header: "Hosts", align: "right", sortable: true },
                            { key: "region", header: "Region" },
                            { key: "risk", header: "Risk", render: (r) => <RiskBadge level={r.risk} /> },
                        ]}
                        rows={sorted}
                        getRowKey={(r) => r.vendor}
                        sort={sort}
                        onSortChange={(key) => setSort((s) => ({ key, direction: s.key === key && s.direction === "asc" ? "desc" : "asc" }))}
                        onRowClick={(r) => setDrawer(r)}
                        selectedKey={drawer?.vendor}
                    />
                </Card>
                <Grid>
                    <Card title="Loading"><Table columns={[{ key: "a", header: "A" }, { key: "b", header: "B" }]} loading /></Card>
                    <Card title="Empty"><Table columns={[{ key: "a", header: "A" }]} rows={[]} empty={{ title: "No records", message: "No consent records in this period." }} /></Card>
                    <Card title="Error"><Table columns={[{ key: "a", header: "A" }]} error={{ message: "The server returned an error (500).", onRetry: () => {} }} /></Card>
                </Grid>
                <Drawer open={Boolean(drawer)} onClose={() => setDrawer(null)} title={drawer?.vendor || ""} footer={<Button variant="primary" onClick={() => setDrawer(null)}>Done</Button>}>
                    {drawer && <dl className="tw-m-0 tw-grid tw-gap-2" style={{ gridTemplateColumns: "120px 1fr" }}><dt>Hosts</dt><dd className="tw-m-0">{drawer.hosts}</dd><dt>Region</dt><dd className="tw-m-0">{drawer.region}</dd></dl>}
                </Drawer>
            </Section>

            <Section id="sg-states" title="Empty, error, skeleton">
                <Grid>
                    <Card><EmptyState title="Not scanned" message="No cookie scan has run for this domain yet." action={{ label: "Scan now", onClick: () => {} }} /></Card>
                    <Card><ErrorState message="No response within 30 seconds." onRetry={() => {}} /></Card>
                    <Card><ErrorState compact title="Map unavailable" onRetry={() => {}} /></Card>
                </Grid>
                <Grid><SkeletonKpiTile /><SkeletonCard /><Card><SkeletonText /></Card></Grid>
                <Card padding="none"><SkeletonTableRows rows={3} columns={4} /></Card>
            </Section>

            <Section id="sg-format" title={`Formatting (locale: ${appLocale()})`}>
                <dl className="tw-m-0 tw-grid tw-gap-2 tw-text-sm" style={{ gridTemplateColumns: "220px 1fr" }}>
                    <dt>formatNumber(9959)</dt><dd className="tw-m-0">{formatNumber(9959)}</dd>
                    <dt>formatPercent(92.1)</dt><dd className="tw-m-0">{formatPercent(92.1)}</dd>
                    <dt>formatDate(today)</dt><dd className="tw-m-0">{formatDate(new Date())}</dd>
                    <dt>formatDateTime(now)</dt><dd className="tw-m-0">{formatDateTime(new Date())}</dd>
                    <dt>formatDateRange(last 30 days)</dt><dd className="tw-m-0">{formatDateRange(new Date(Date.now() - 29 * 864e5), new Date())}</dd>
                </dl>
            </Section>
        </main>
    );
}
