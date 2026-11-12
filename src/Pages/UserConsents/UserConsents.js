import API from "../../API/api.js";
import { reportsLinks } from "../Reports/Reports.js";
import "./Style.css";
import SideNav from "../../Components/Header/SideNav.js";
import StickyPageTitle from "../../Components/Header/Sticky";
import { DomainContext } from "../../App.js";
import Authentication from "../../Authentication/Auth.js";
import { buildDemoConsentList, buildDemoConsentRecord } from "./userConsentsDemo.js";
import AuditSummary from "./AuditSummary.js";
import {
    useSyncDomainFromRoute,
    isCombinedOrClearDomain,
    consentsDomainFromRoute,
    toDomainsApiHeader,
} from "../../Functions/domainPathSegments.js";
import { defaultCompareWindowForPrimary } from "../../Components/Filter/filterDatePresets.js";
import { FRAMEWORK_IDS, frameworksForAuditRow } from "../../Components/AuditSnapshotCard/complianceRegions.js";
import punycode from "punycode";
import appStorage from '../../Functions/storage.js';
import { parseConsentTimestamp } from "../../Functions/consentTimestamp.js";
import BotFilterToggle from "../../Components/BotFilterToggle";
import { useExcludeBots } from "../../Functions/botFilter.js";
import { appLocale, formatNumber } from "../../Functions/format.js";
import { Badge, Button, Drawer, FilterBar, FilterChip, FilterSearch, FilterSelect, Icon, Table } from "../../Components/ui";
import { receiptHtml, reportHtml } from "./auditPrint.js";
import {
    BOT_REASON_LABELS,
    CHOICE_CATEGORIES,
    METHOD_NAMES,
    botCheck,
    cleanUrl,
    comparableUrl,
    consentChoices,
    exportRecord,
    findBursts,
    formatAuditTime,
    groupRepeats,
    languageLabel,
    methodLabel,
    pageLabel,
    summarizeRows,
    toCsv,
    transferSummary,
} from "./auditLogFormat.js";

const { useState, useEffect, useRef, useContext, useCallback, useMemo } = React;
const useParams = window.ReactRouterDOM.useParams;
const useLocation = window.ReactRouterDOM.useLocation;
const useHistory = window.ReactRouterDOM.useHistory;
const PAGE_SIZE = 50;
const TEXT_FILTER_DELAY_MS = 400;
/** Exports page through the API 500 at a time (its maximum) and stop at this many records. */
const EXPORT_PAGE_SIZE = 500;
const EXPORT_MAX = 20000;

const EMPTY_FILTERS = { framework: "", country: "", method: "", choice: "", language: "", version: "", uidSearch: "", page: "" };

/** Request header for each filter (see auditFilterSql() in getDomainStatistics.php). */
const FILTER_HEADERS = { framework: "Framework", country: "Country", method: "Method", choice: "Choice", language: "Language", version: "Version", uidSearch: "UIDSearch", page: "Page" };

const CHOICE_OPTIONS = CHOICE_CATEGORIES.filter((c) => c.type !== "necessary").flatMap((c) => [
    { value: `${c.type}:declined`, label: `${c.label} declined` },
    { value: `${c.type}:accepted`, label: `${c.label} accepted` },
]);

function readSearchParam(search, name) {
    if (!search || typeof search !== "string") return "";
    try {
        const raw = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search).get(name);
        return raw ? String(raw).trim() : "";
    } catch (_) {
        return "";
    }
}

function consentDateKey(d) {
    if (d == null) return "";
    if (d instanceof Date && Number.isFinite(d.getTime())) return d.toISOString().split("T")[0];
    return String(d).split("T")[0];
}

/** The API returns one row per (uid, timestamp, consent), so together they identify a record. */
function rowKey(row) {
    return `${row?.uid ?? ""}|${row?.consents_timestamp ?? ""}|${JSON.stringify(row?.consent ?? null)}`;
}

function downloadFile(name, text, type) {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Opens the print window straight from the click (later, after an await,
 * popup blockers stop it) and returns a function that fills it.
 */
function openPrintWindow() {
    const win = window.open("", "_blank");
    if (win) win.document.write("<p style='font-family:sans-serif'>Preparing…</p>");
    return (html) => {
        if (!win || win.closed) return false;
        win.document.open();
        win.document.write(html);
        win.document.close();
        return true;
    };
}

async function sha256Hex(text) {
    if (!window.crypto?.subtle) return "";
    const digest = await window.crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function organisationName() {
    try {
        return JSON.parse(appStorage.getItem("organisation"))?.name || "";
    } catch {
        return "";
    }
}

function regionName(code) {
    try {
        return new Intl.DisplayNames(["en"], { type: "region" }).of(code) || code;
    } catch {
        return code;
    }
}

/** Options for a filter menu: values seen in the period, plus the current one so it never vanishes. */
function menuOptions(allLabel, values, current, label = (v) => v) {
    const list = [...new Set([...(values || []), ...(current ? [current] : [])])];
    return [{ value: "", label: allLabel }, ...list.map((v) => ({ value: v, label: label(v) }))];
}

function copyText(text) {
    return navigator.clipboard?.writeText(String(text)).catch(() => {});
}

function AuditTime({ row }) {
    const t = formatAuditTime(parseConsentTimestamp(row?.consents_timestamp), appLocale());
    if (!t) return "—";
    return (
        <span className="tw-whitespace-nowrap tw-tabular-nums" title={`${t.iso} (UTC)`}>
            <span className="tw-text-text-primary">{t.date}</span> {t.time}
            <span className="tw-text-xs tw-text-text-muted"> {t.zone}</span>
        </span>
    );
}

function ChoiceChips({ consent }) {
    const choices = consentChoices(consent);
    return (
        <span className="tw-inline-flex tw-gap-1" role="list" aria-label="Choices">
            {choices.map((c) => {
                const word = c.state === "accepted" ? (c.type === "necessary" ? "always on" : "accepted") : c.state === "declined" ? "declined" : "not recorded";
                return (
                    <span
                        key={c.type}
                        role="listitem"
                        title={`${c.label}: ${word}`}
                        aria-label={`${c.label}: ${word}`}
                        className={`audit-choice audit-choice--${c.state}`}
                    >
                        {c.short}
                        <Icon name={c.state === "accepted" ? "check" : c.state === "declined" ? "x" : "minus-circle"} size={11} />
                    </span>
                );
            })}
        </span>
    );
}

/** The framework the banner applied, or "None applied" with what the country usually falls under. */
function FrameworkCell({ row }) {
    const applied = String(row?.regulation_applied ?? "").trim();
    if (applied) return <Badge>{applied}</Badge>;
    const usual = [...frameworksForAuditRow({ country_code: row?.country_code })];
    const hint = usual.length
        ? `The banner recorded no framework for this visitor. ${row?.country_code} usually falls under ${usual.join(" / ")}.`
        : "The banner recorded no framework for this visitor.";
    return <span className="tw-text-text-muted" title={hint}>None applied</span>;
}

function CopyUid({ uid }) {
    const [copied, setCopied] = useState(false);
    if (!uid) return null;
    return (
        <Button
            variant="ghost"
            size="sm"
            icon={copied ? "check" : "copy"}
            iconOnly
            aria-label={copied ? "UID copied" : `Copy UID ${uid}`}
            title={copied ? "Copied" : "Copy UID"}
            onClick={(e) => {
                e.stopPropagation();
                copyText(uid);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
            }}
        />
    );
}

function Detail({ label, children, wide = false }) {
    return (
        <div className={wide ? "audit-detail audit-detail--wide" : "audit-detail"}>
            <dt>{label}</dt>
            <dd>{children}</dd>
        </div>
    );
}

const BOT_TONE = { flagged: ["warning", "alert-triangle"], passed: ["success", "check-circle"], unchecked: ["neutral", "minus-circle"] };

function downloadReceiptJson(row) {
    const record = exportRecord(row);
    downloadFile(`consent-receipt-${record.uid || "record"}-${record.time_utc.replace(/[:]/g, "")}.json`, JSON.stringify(record, null, 2), "application/json");
}

async function printReceipt(row) {
    const fill = openPrintWindow();
    const record = exportRecord(row);
    const fingerprint = await sha256Hex(JSON.stringify(record));
    fill(receiptHtml(record, { fingerprint, company: organisationName() }));
}

function RecordDrawer({ row, group, burst, onClose, onShowHistory, onSelect }) {
    if (!row) return null;
    const bot = botCheck(row);
    const time = formatAuditTime(parseConsentTimestamp(row.consents_timestamp), appLocale());
    const transfer = transferSummary(row);
    const page = cleanUrl(row.url);
    const referrer = cleanUrl(row.referrer);
    const sameAsPage = referrer && comparableUrl(referrer) === comparableUrl(page);
    const priorConsentId = row.prior_consent_id ?? row.previous_consent_id ?? null;
    return (
        <Drawer
            open
            onClose={onClose}
            title="Consent record"
            width="lg"
            footer={(
                <>
                    <Button variant="secondary" size="sm" icon="file-text" onClick={() => printReceipt(row)}>Receipt (PDF)</Button>
                    <Button variant="ghost" size="sm" onClick={() => downloadReceiptJson(row)}>JSON</Button>
                    {row.uid ? <Button variant="secondary" size="sm" icon="clock" onClick={() => onShowHistory(String(row.uid))}>All records for this visitor</Button> : null}
                </>
            )}
        >
            <dl className="audit-details">
                <Detail label="UID" wide>
                    <span className="tw-inline-flex tw-items-center tw-gap-1 tw-font-mono tw-text-text-primary tw-break-all">
                        {row.uid ?? "—"}<CopyUid uid={row.uid} />
                    </span>
                </Detail>
                <Detail label="Time">
                    {time ? <>{time.date}, {time.time} {time.zone}<span className="tw-block tw-text-xs tw-text-text-muted">{time.iso} UTC</span></> : "—"}
                </Detail>
                <Detail label="Domain">{row.domain ? punycode.toUnicode(String(row.domain)) : "—"}</Detail>
                <Detail label="Country / state">{row.country_code && row.country_code !== "-" ? `${regionName(row.country_code)} (${row.country_code})` : "—"}{row.state_code && row.state_code !== "-" ? ` · ${row.state_code}` : ""}</Detail>
                <Detail label="Language">{languageLabel(row.language ?? row.banner_language) ?? "—"}</Detail>
                <Detail label="Method">{methodLabel(row.consent_method) ?? "Not recorded"}</Detail>
                <Detail label="Framework"><FrameworkCell row={row} /></Detail>
                <Detail label="Choices" wide>
                    <ul className="audit-choice-list">
                        {consentChoices(row.consent).map((c) => (
                            <li key={c.type}>
                                <span>{c.label}</span>
                                <Badge
                                    tone={c.state === "accepted" ? "success" : c.state === "declined" ? "danger" : "neutral"}
                                    icon={c.state === "accepted" ? "check" : c.state === "declined" ? "x" : "minus-circle"}
                                >
                                    {c.state === "accepted" ? (c.type === "necessary" ? "Always on" : "Accepted") : c.state === "declined" ? "Declined" : "Not recorded"}
                                </Badge>
                            </li>
                        ))}
                    </ul>
                </Detail>
                <Detail label="Data transfer" wide>
                    {transfer ? (
                        <>
                            <span className="tw-text-text-primary">{transfer.short}</span>
                            {transfer.instrument && <span className="tw-block">{transfer.instrument}</span>}
                            {transfer.importer && <span className="tw-block">Data importer: {transfer.importer}</span>}
                            {transfer.effective && <span className="tw-block">In effect since {transfer.effective}</span>}
                        </>
                    ) : "—"}
                </Detail>
                <Detail label="Page" wide><span className="tw-break-all">{page || "—"}</span></Detail>
                <Detail label="Referrer" wide>
                    {sameAsPage ? <span className="tw-text-text-muted">Same as page</span> : <span className="tw-break-all">{referrer || "—"}</span>}
                </Detail>
                <Detail label="Time to decision">{row.time_to_decision != null ? `${formatNumber(row.time_to_decision / 1000, { maximumFractionDigits: 1 })} s` : "—"}</Detail>
                <Detail label="Banner version">
                    {row.github_link
                        ? <a className="link" href={row.github_link} target="_blank" rel="noopener noreferrer">{row.code_version ?? "—"}</a>
                        : row.code_version ?? "—"}
                </Detail>
                <Detail label="Banner config">
                    {row.banner_config_version
                        ? <span className="tw-font-mono" title="Fingerprint of the domain's banner configuration on the server when this consent was recorded">{row.banner_config_version}</span>
                        : <span className="tw-text-text-muted">Not recorded</span>}
                </Detail>
                <Detail label="Policy schema">{row.banner_policy_id ?? "Legacy record"}</Detail>
                {row.tcf ? (
                    <Detail label="TCF" wide>
                        CMP version {row.tcf.cmp_version} · TCF policy v{row.tcf.tcf_policy_version} · vendor list v{row.tcf.vendor_list_version}
                        {row.tcf.consent_language ? ` · ${row.tcf.consent_language}` : ""}
                        <span className="tw-block tw-text-xs tw-text-text-muted">TC data last updated {row.tcf.last_updated}</span>
                    </Detail>
                ) : null}
                {row.shopify_consent_id ? <Detail label="Shopify consent ID"><span className="tw-break-all">{row.shopify_consent_id}</span></Detail> : null}
                {priorConsentId ? <Detail label="Prior consent"><span className="tw-break-all">{String(priorConsentId)}</span></Detail> : null}
                <Detail label="Bot check" wide>
                    <Badge tone={BOT_TONE[bot.status][0]} icon={BOT_TONE[bot.status][1]}>{bot.label}</Badge>
                    <span className="tw-block tw-text-xs tw-text-text-muted tw-mt-1">
                        {bot.status === "flagged" ? "Left out while \"Exclude suspected bots\" is on. " : ""}
                        Checks when recorded: datacenter IP address, a different choice by the same visitor within one second, more than 5 decisions by the visitor in a minute.
                    </span>
                    {burst ? (
                        <span className="tw-flex tw-items-start tw-gap-1 tw-mt-2 tw-text-warning">
                            <Icon name="alert-triangle" size={14} />
                            <span>
                                Possible automation: {burst.count} decisions{burst.where ? ` from ${burst.where}` : ""} with this choice on this page within {burst.seconds} s, by different visitors.
                                <span className="tw-text-text-muted"> A hint only; it is not excluded.</span>
                            </span>
                        </span>
                    ) : null}
                </Detail>
                {group && group.items.length > 1 ? (
                    <Detail label={`Repeats (${group.items.length} records within ${group.spanSeconds} s)`} wide>
                        <ul className="audit-repeats">
                            {group.items.map((item) => {
                                const t = formatAuditTime(parseConsentTimestamp(item.consents_timestamp), appLocale());
                                const current = item === row;
                                return (
                                    <li key={rowKey(item)}>
                                        <button type="button" aria-current={current || undefined} onClick={() => onSelect(item)}>
                                            <span className="tw-tabular-nums">{t ? t.time : "—"}</span>
                                            <span>{methodLabel(item.consent_method) ?? "Not recorded"}</span>
                                            <ChoiceChips consent={item.consent} />
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    </Detail>
                ) : null}
            </dl>
            <details className="audit-raw">
                <summary>Raw record</summary>
                <pre>{JSON.stringify(row, null, 2)}</pre>
            </details>
        </Drawer>
    );
}

export default function UserConsents(props) {
    document.title = "Audit log | Intastellar Consents";
    const settings = JSON.parse(localStorage.getItem("settings")) || { dateRange: 30 };
    const [currentDomain, setGlobalDomain] = useContext(DomainContext);
    const history = typeof useHistory === "function" ? useHistory() : null;
    const { handle, id, uid: uidFromPath } = useParams();
    useSyncDomainFromRoute(handle, setGlobalDomain);

    const listDomainLabel = useMemo(() => consentsDomainFromRoute(handle, currentDomain), [handle, currentDomain]);
    const domainsApiHeader = useMemo(() => toDomainsApiHeader(listDomainLabel), [listDomainLabel]);

    const routerLocation = typeof useLocation === "function" ? useLocation() : null;
    const currentSearch = routerLocation?.search ?? (typeof window !== "undefined" ? window.location.search : "");
    const routeUid = uidFromPath != null && String(uidFromPath).trim() !== "" ? decodeURIComponent(String(uidFromPath)) : "";

    /**
     * One visitor's full history: /user-consents/<uid> (or the older ?uid=).
     * The world map drawer deep-links a country with ?country=XX.
     */
    const [uidQuery, setUidQuery] = useState(routeUid || readSearchParam(currentSearch, "uid"));
    const [filters, setFilters] = useState(() => ({ ...EMPTY_FILTERS, country: readSearchParam(currentSearch, "country").toUpperCase() }));
    const [textFilters, setTextFilters] = useState({ uidSearch: "", page: "" });
    const [sortDirection, setSortDirection] = useState("desc");

    useEffect(() => {
        const fromUrl = routeUid || readSearchParam(routerLocation?.search ?? "", "uid");
        setUidQuery(fromUrl);
    }, [routerLocation?.search, uidFromPath]);

    useEffect(() => {
        const country = readSearchParam(routerLocation?.search ?? "", "country").toUpperCase();
        setFilters((f) => (f.country === country ? f : { ...f, country }));
    }, [routerLocation?.search]);

    // Typed filters wait for a pause so each keystroke isn't a request.
    useEffect(() => {
        const timer = setTimeout(() => setFilters((f) => (f.uidSearch === textFilters.uidSearch && f.page === textFilters.page ? f : { ...f, ...textFilters })), TEXT_FILTER_DELAY_MS);
        return () => clearTimeout(timer);
    }, [textFilters]);

    const replaceUrl = useCallback((pathname, mutateParams) => {
        const params = new URLSearchParams(currentSearch.replace(/^\?/, ""));
        mutateParams(params);
        const search = params.toString();
        const next = `${pathname}${search ? `?${search}` : ""}`;
        if (history?.replace) history.replace(next);
        else {
            try { window.history.replaceState({}, "", next); } catch (_) { /* in-memory state still applies */ }
        }
    }, [history, currentSearch]);

    const basePath = String(routerLocation?.pathname ?? window.location.pathname).replace(/\/user-consents(?:\/[^/?#]+)?$/, "/user-consents");

    const setFilter = useCallback((key, value) => {
        setFilters((f) => ({ ...f, [key]: value }));
        if (key === "country") replaceUrl(String(routerLocation?.pathname ?? window.location.pathname), (p) => (value ? p.set("country", value) : p.delete("country")));
    }, [replaceUrl, routerLocation?.pathname]);

    const showVisitorHistory = useCallback((uid) => {
        setUidQuery(uid);
        replaceUrl(`${basePath}/${encodeURIComponent(uid)}`, (p) => p.delete("uid"));
    }, [basePath, replaceUrl]);

    const clearVisitorHistory = useCallback(() => {
        setUidQuery("");
        replaceUrl(basePath, (p) => p.delete("uid"));
    }, [basePath, replaceUrl]);

    const clearFilters = useCallback(() => {
        setFilters(EMPTY_FILTERS);
        setTextFilters({ uidSearch: "", page: "" });
        replaceUrl(String(routerLocation?.pathname ?? window.location.pathname), (p) => p.delete("country"));
    }, [replaceUrl, routerLocation?.pathname]);

    const [demoMode, setDemoMode] = useState(Authentication.DemoMode);
    useEffect(() => Authentication.onDemoModeChange(setDemoMode), []);

    const [getLastDays, setLastDays] = useState((localStorage.getItem("settings") != null) ? JSON.parse(localStorage.getItem("settings")).dateRange : 30);
    const today = new Date();
    const rangeDays = settings?.dateRange ?? 30;
    const [fromDate, setFromDate] = useState(new Date(new Date().setDate(today.getDate() - (rangeDays - 1))));
    const [toDate, setToDate] = useState(new Date());
    const [compareRange, setCompareRange] = useState(0);
    const [previousPeriod, setPreviousPeriod] = useState(() => defaultCompareWindowForPrimary(new Date(new Date().setDate(new Date().getDate() - (rangeDays - 1))), new Date()).start);
    const [previousPeriod2, setPreviousPeriod2] = useState(() => defaultCompareWindowForPrimary(new Date(new Date().setDate(new Date().getDate() - (rangeDays - 1))), new Date()).end);

    const [excludeBots] = useExcludeBots();

    const [rows, setRows] = useState(null);
    const [total, setTotal] = useState(null);
    const [options, setOptions] = useState(null);
    const [summary, setSummary] = useState(null);
    const [status, setStatus] = useState("loading"); // loading | ready | error
    const [loadingMore, setLoadingMore] = useState(false);
    const [hasMore, setHasMore] = useState(false);
    const [selected, setSelected] = useState(null);
    const [reload, setReload] = useState(0);
    const [groupRepeatsOn, setGroupRepeatsOn] = useState(true);
    const [exporting, setExporting] = useState(null); // { format, done, total } while an export runs
    const [exportError, setExportError] = useState(null);

    const queryKey = JSON.stringify([id, domainsApiHeader, consentDateKey(fromDate), consentDateKey(toDate), uidQuery, excludeBots, sortDirection, filters, reload]);
    const latestQuery = useRef(queryKey);

    const fetchPage = useCallback(async (offset, { limit = PAGE_SIZE, exportMode = false } = {}) => {
        const headers = {
            ...API[id].getDomainsUrl.headers,
            Domains: domainsApiHeader,
            Offset: String(offset),
            Limit: String(limit),
            FromDate: consentDateKey(fromDate),
            ToDate: consentDateKey(toDate),
            SortOrder: sortDirection,
            IncludeTotal: "1",
        };
        if (exportMode) headers.Export = "1";
        delete headers.UID;
        if (uidQuery) headers.UID = uidQuery;
        for (const [key, header] of Object.entries(FILTER_HEADERS)) {
            if (filters[key]) headers[header] = encodeURIComponent(filters[key]);
        }
        const res = await fetch(API[id].getDomainsUrl.url, { method: API[id].getDomainsUrl.method, headers });
        if (res.status === 401) {
            appStorage.removeItem("globals");
            window.location.href = "/login";
            return null;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        // An API without IncludeTotal support answers with the bare array.
        if (Array.isArray(data)) return { rows: data, total: null, options: null, summary: null };
        if (data === "Err_No_Data_Found") return { rows: [], total: 0, options: null, summary: null };
        if (!data || !Array.isArray(data.rows)) throw new Error(typeof data === "string" ? data : data?.error || "Unexpected response");
        return data;
    }, [id, domainsApiHeader, fromDate, toDate, sortDirection, uidQuery, filters]);

    useEffect(() => {
        latestQuery.current = queryKey;
        setStatus("loading");
        setRows(null);
        setSelected(null);
        fetchPage(0)
            .then((data) => {
                if (!data || latestQuery.current !== queryKey) return;
                setRows(data.rows);
                setTotal(data.total);
                setSummary(data.summary || null);
                if (data.options) setOptions(data.options);
                setHasMore(data.total != null ? data.rows.length < data.total : data.rows.length === PAGE_SIZE);
                setStatus("ready");
            })
            .catch(() => {
                if (latestQuery.current === queryKey) setStatus("error");
            });
    }, [queryKey]);

    const loadMore = useCallback(async () => {
        if (loadingMore || !rows) return;
        const key = queryKey;
        setLoadingMore(true);
        try {
            const data = await fetchPage(rows.length);
            if (!data || latestQuery.current !== key) return;
            const next = [...rows, ...data.rows];
            setRows(next);
            setHasMore(data.total != null ? next.length < data.total : data.rows.length === PAGE_SIZE);
        } catch (_) {
            setHasMore(false);
        } finally {
            setLoadingMore(false);
        }
    }, [loadingMore, rows, queryKey, fetchPage]);

    const displayRows = useMemo(() => {
        if (!demoMode) return rows || [];
        if (!rows?.length) return status === "loading" ? [] : buildDemoConsentList(28);
        return rows.map((d, i) => buildDemoConsentRecord(i, d));
    }, [demoMode, rows, status]);
    const displayTotal = demoMode ? displayRows.length : total;
    const displaySummary = demoMode ? summarizeRows(displayRows) : summary;

    const activeCount = Object.values(filters).filter(Boolean).length;
    const titleDomainLabel = isCombinedOrClearDomain(listDomainLabel) ? null : listDomainLabel;

    // Rapid repeats and bursts are worked out over the records loaded so far.
    const groups = useMemo(
        () => (groupRepeatsOn ? groupRepeats(displayRows) : displayRows.map((row) => ({ row, items: [row], spanSeconds: 0 }))),
        [displayRows, groupRepeatsOn]
    );
    const groupOf = useMemo(() => {
        const map = new Map();
        for (const g of groups) for (const item of g.items) map.set(item, g);
        return map;
    }, [groups]);
    const bursts = useMemo(() => findBursts(displayRows), [displayRows]);
    const repeatCount = groups.reduce((n, g) => n + g.items.length - 1, 0);

    /** What the export covers, in words, for the report header. */
    const scopeText = () => {
        const parts = [titleDomainLabel ? punycode.toUnicode(titleDomainLabel) : "All domains", `${consentDateKey(fromDate)} to ${consentDateKey(toDate)}`];
        if (uidQuery) parts.push(`Visitor ${uidQuery}`);
        const names = { framework: "Framework", country: "Country", method: "Method", choice: "Choice", language: "Language", version: "Banner version", uidSearch: "UID contains", page: "Page contains" };
        for (const [key, value] of Object.entries(filters)) {
            if (!value) continue;
            const shown = key === "method" ? methodLabel(value) : key === "choice" ? CHOICE_OPTIONS.find((o) => o.value === value)?.label : value;
            parts.push(`${names[key]}: ${shown}`);
        }
        parts.push(excludeBots ? "Suspected bots excluded" : "Suspected bots included");
        return parts.join(" · ");
    };

    /** Every record matching the filters (up to EXPORT_MAX), as CSV, JSON or a printable report. */
    const exportAll = async (format) => {
        if (exporting) return;
        const fill = format === "pdf" ? openPrintWindow() : null;
        setExportError(null);
        let all = [];
        try {
            if (demoMode) {
                all = displayRows;
            } else {
                setExporting({ format, done: 0, total: total ?? null });
                for (let offset = 0; offset < EXPORT_MAX; offset += EXPORT_PAGE_SIZE) {
                    const data = await fetchPage(offset, { limit: Math.min(EXPORT_PAGE_SIZE, EXPORT_MAX - offset), exportMode: true });
                    if (!data) return;
                    all = all.concat(data.rows);
                    setExporting({ format, done: all.length, total: total ?? null });
                    if (data.rows.length < EXPORT_PAGE_SIZE) break;
                }
            }
            const records = all.map(exportRecord);
            const stamp = new Date().toISOString().slice(0, 10);
            const base = `consent-audit-log-${titleDomainLabel || "all-domains"}-${stamp}`;
            if (format === "csv") downloadFile(`${base}.csv`, `\uFEFF${toCsv(records)}`, "text/csv;charset=utf-8");
            if (format === "json") downloadFile(`${base}.json`, JSON.stringify({ scope: scopeText(), exported_at: new Date().toISOString(), total: displayTotal ?? records.length, records }, null, 2), "application/json");
            if (format === "pdf" && !fill(reportHtml(records, { scope: scopeText(), total: displayTotal ?? records.length }))) {
                setExportError("The report window was blocked. Allow pop-ups for this site and try again.");
            }
        } catch (_) {
            setExportError("The export couldn't be completed. Try again, or narrow the filters.");
        } finally {
            setExporting(null);
        }
    };

    const columns = useMemo(() => [
        {
            key: "time",
            header: "Time",
            sortable: true,
            width: "14rem",
            render: (r) => {
                const g = groupOf.get(r);
                return (
                    <span className="tw-inline-flex tw-items-center tw-gap-2">
                        <AuditTime row={r} />
                        {g && g.items.length > 1 ? (
                            <span className="audit-repeat-badge" title={`${g.items.length} records by this visitor within ${g.spanSeconds} s. Open to see each one.`}>×{g.items.length}</span>
                        ) : null}
                    </span>
                );
            },
        },
        {
            key: "uid",
            header: "UID",
            render: (r) => (
                <span className="audit-uid">
                    <span className="audit-uid__value" title={r.uid ?? ""}>{r.uid ?? "—"}</span>
                    <CopyUid uid={r.uid} />
                    {r.is_suspected_bot && (
                        <span title={`Suspected bot: ${BOT_REASON_LABELS[r.bot_reason] || "flagged as automated traffic"}`} className="tw-text-warning tw-inline-flex">
                            <Icon name="alert-triangle" size={14} label="Suspected bot" />
                        </span>
                    )}
                    {!r.is_suspected_bot && bursts.has(r) && (
                        <span title={`Possible automation: ${bursts.get(r).count} decisions from ${bursts.get(r).where || "one place"} on this page within ${bursts.get(r).seconds} s, by different visitors`} className="tw-text-info-text tw-inline-flex">
                            <Icon name="info" size={14} label="Possible automation" />
                        </span>
                    )}
                </span>
            ),
        },
        {
            key: "country",
            header: "Country",
            render: (r) => {
                const cc = r.country_code && r.country_code !== "-" ? r.country_code : "";
                const st = r.state_code && r.state_code !== "-" ? r.state_code : "";
                return cc ? <span title={[regionName(cc), st].filter(Boolean).join(" · ")} className="audit-country">{cc}{st ? <span className="tw-text-text-muted"> · {st}</span> : null}</span> : "—";
            },
        },
        { key: "method", header: "Method", render: (r) => <span className="tw-whitespace-nowrap">{methodLabel(r.consent_method) ?? <span className="tw-text-text-muted">Not recorded</span>}</span> },
        { key: "choices", header: "Choices", render: (r) => <ChoiceChips consent={r.consent} /> },
        { key: "framework", header: "Framework", hideOnMobile: true, render: (r) => <FrameworkCell row={r} /> },
        {
            key: "transfer",
            header: "Transfer",
            hideOnMobile: true,
            render: (r) => {
                const t = transferSummary(r);
                return t ? <span className="tw-whitespace-nowrap" title={t.full}>{t.short}</span> : "—";
            },
        },
        {
            key: "page",
            header: "Page",
            hideOnMobile: true,
            render: (r) => {
                const label = pageLabel(r.url, r.domain);
                return label ? <span className="audit-page" title={cleanUrl(r.url)}>{label}</span> : "—";
            },
        },
    ], [groupOf, bursts]);

    const frameworkMenu = menuOptions("All frameworks", [...FRAMEWORK_IDS], filters.framework);
    frameworkMenu.splice(1, 0, { value: "none", label: "None applied" });
    const methodMenu = menuOptions("All methods", [...new Set([...Object.keys(METHOD_NAMES).slice(0, 4), ...(options?.method || [])])], filters.method, methodLabel);
    methodMenu.push({ value: "none", label: "Not recorded" });

    const loading = status === "loading" && !demoMode;

    return (
        <>
            <SideNav links={reportsLinks} title="Reports" />
            <article style={{ flex: "1", minWidth: 0 }}>
                <StickyPageTitle demoMode={demoMode} loadingUpdated={loading} finalLoaded={loading} title={"Audit log" + (titleDomainLabel ? " for " + punycode.toUnicode(titleDomainLabel) : "")} numberofDays={setLastDays} getLastDays={getLastDays} setActiveData={setRows} fromDate={fromDate} toDate={toDate} setFromDate={setFromDate} setToDate={setToDate} previousPeriod={previousPeriod} previousPeriod2={previousPeriod2} compareRange={compareRange} setCompareRange={setCompareRange} setCompareWindowStart={setPreviousPeriod} setCompareWindowEnd={setPreviousPeriod2} />
                <div className="dashboard-content">
                    {uidQuery ? (
                        <div className="audit-visitor" role="status">
                            <span>Showing every record for visitor <strong className="tw-font-mono">{uidQuery}</strong></span>
                            <CopyUid uid={uidQuery} />
                            <Button variant="ghost" size="sm" icon="x" onClick={clearVisitorHistory}>Back to all visitors</Button>
                        </div>
                    ) : null}
                    <FilterBar activeCount={activeCount} onClear={clearFilters} label="Audit log filters">
                        <FilterSearch label="UID" value={textFilters.uidSearch} placeholder="Part of a UID" onChange={(v) => setTextFilters((f) => ({ ...f, uidSearch: v }))} />
                        <FilterSelect label="Country" value={filters.country} options={menuOptions("All countries", options?.country, filters.country, (c) => `${regionName(c)} (${c})`)} onChange={(v) => setFilter("country", v)} />
                        <FilterSelect label="Method" value={filters.method} options={methodMenu} onChange={(v) => setFilter("method", v)} />
                        <FilterSelect label="Choice" value={filters.choice} options={[{ value: "", label: "Any choice" }, ...CHOICE_OPTIONS]} onChange={(v) => setFilter("choice", v)} />
                        <FilterSelect label="Framework" value={filters.framework} options={frameworkMenu} onChange={(v) => setFilter("framework", v)} />
                        <FilterSelect label="Language" value={filters.language} options={menuOptions("All languages", options?.language, filters.language, (l) => languageLabel(l) || l)} onChange={(v) => setFilter("language", v)} />
                        <FilterSelect label="Banner version" value={filters.version} options={menuOptions("All versions", options?.version, filters.version)} onChange={(v) => setFilter("version", v)} />
                        <FilterSearch label="Page" value={textFilters.page} placeholder="/checkout" onChange={(v) => setTextFilters((f) => ({ ...f, page: v }))} />
                        <BotFilterToggle />
                    </FilterBar>
                    <AuditSummary summary={displaySummary} loading={loading} fromDay={consentDateKey(fromDate)} toDay={consentDateKey(toDate)} />
                    <div className="audit-toolbar">
                        <p className="audit-count" aria-live="polite">
                            {loading ? "Loading records…" : displayTotal != null
                                ? `${formatNumber(displayTotal)} ${displayTotal === 1 ? "record" : "records"}${displayRows.length < displayTotal ? ` · showing ${formatNumber(displayRows.length)}` : ""}`
                                : `${formatNumber(displayRows.length)} records loaded`}
                            {groupRepeatsOn && repeatCount > 0 ? ` · ${formatNumber(repeatCount)} rapid ${repeatCount === 1 ? "repeat" : "repeats"} grouped` : ""}
                            <span className="tw-text-text-muted"> · times in your time zone, hover for UTC</span>
                        </p>
                        <div className="audit-toolbar__actions">
                            <FilterChip label="Group repeats" pressed={groupRepeatsOn} onToggle={setGroupRepeatsOn} />
                            <span className="audit-toolbar__label" id="audit-export-label">Export</span>
                            <div role="group" aria-labelledby="audit-export-label" className="tw-inline-flex tw-gap-1">
                                {[["csv", "CSV"], ["json", "JSON"], ["pdf", "PDF"]].map(([format, label]) => (
                                    <Button key={format} variant="secondary" size="sm" disabled={loading || (!demoMode && !displayRows.length) || Boolean(exporting)} loading={exporting?.format === format} onClick={() => exportAll(format)}>{label}</Button>
                                ))}
                            </div>
                        </div>
                    </div>
                    {exporting ? (
                        <p className="audit-count" role="status">
                            Exporting {formatNumber(exporting.done)}{exporting.total != null ? ` of ${formatNumber(Math.min(exporting.total, EXPORT_MAX))}` : ""} records…
                            {exporting.total > EXPORT_MAX ? ` Only the first ${formatNumber(EXPORT_MAX)} are included; narrow the filters for the rest.` : ""}
                        </p>
                    ) : null}
                    {exportError ? <p className="audit-count tw-text-danger-text" role="alert">{exportError}</p> : null}
                    <div className="audit-table">
                        <Table
                            caption="Consent records"
                            columns={columns}
                            rows={groups.map((g) => g.row)}
                            getRowKey={rowKey}
                            loading={loading}
                            error={status === "error" && !demoMode ? { message: "The audit log couldn't be loaded.", onRetry: () => setReload((n) => n + 1) } : undefined}
                            empty={{ title: "No records", message: activeCount || uidQuery ? "Nothing matches these filters in the selected period." : "No consent decisions were recorded in the selected period." }}
                            sort={{ key: "time", direction: sortDirection }}
                            onSortChange={() => setSortDirection((d) => (d === "desc" ? "asc" : "desc"))}
                            onRowClick={setSelected}
                            selectedKey={selected ? rowKey(groupOf.get(selected)?.row ?? selected) : null}
                        />
                    </div>
                    {hasMore && !demoMode && status === "ready" ? (
                        <div className="tw-flex tw-justify-center tw-py-4">
                            <Button variant="secondary" loading={loadingMore} onClick={loadMore}>Load {formatNumber(PAGE_SIZE)} more</Button>
                        </div>
                    ) : null}
                </div>
            </article>
            <RecordDrawer
                row={selected}
                group={selected ? groupOf.get(selected) : null}
                burst={selected ? bursts.get(selected) : null}
                onClose={() => setSelected(null)}
                onSelect={setSelected}
                onShowHistory={(uid) => { setSelected(null); showVisitorHistory(uid); }}
            />
        </>
    );
}
