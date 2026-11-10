/**
 * HTML for the PDF reports (rendered by api/report-pdf.js). No I/O, so the
 * reports can be tested and previewed from plain data.
 *
 * data: { domain, fromDate, toDate, generatedAt, excludeBots, consent, countries, scan }
 *   consent   — getInteractions response
 *   countries — interactionsByCountry `Countries` rows, or []
 *   scan      — pre-consent-transfers response, or null when there is no scan
 *
 * Findings only state what the data shows. Anything a report cannot know from
 * its data (legal adequacy, banner wording) is out of scope and says so.
 */

import { LOGO_DATA_URI } from "./_report-logo.js";
import { vendorChapterV, chapterVSummary, chapterVLabels } from "./_transfer-compliance.js";

export const REPORT_TYPES = {
    audit: { title: "Consent audit", filename: "Consent_Audit" },
    summary: { title: "Consent summary", filename: "Consent_Summary" },
    snapshot: { title: "Compliance snapshot", filename: "Compliance_Snapshot" },
};

const STALE_SCAN_DAYS = 14;
const SCAN_BEHIND_PERIOD_DAYS = 7;
// Hosting-IP bot flagging started on this date; earlier records only went
// through the behavioural backfill.
const BOT_FLAG_START = "2026-11-03";
const ADVERTISING_CATEGORIES = ["advertising", "fingerprinting", "social"];
// EEA = EU-27 + Iceland, Liechtenstein, Norway. UK and Switzerland are outside it.
const EEA_COUNTRIES = new Set(["Austria", "Belgium", "Bulgaria", "Croatia", "Cyprus", "Czech Republic", "Czechia", "Denmark", "Estonia", "Finland", "France", "Germany", "Greece", "Hungary", "Iceland", "Ireland", "Italy", "Latvia", "Liechtenstein", "Lithuania", "Luxembourg", "Malta", "Netherlands", "The Netherlands", "Norway", "Poland", "Portugal", "Romania", "Slovakia", "Slovenia", "Spain", "Sweden", "EU"]);
export const OWN_CMP_HOST = /(^|\.)(intastellar[a-z-]*|consentsmanagement)\.[a-z.]+$/;
// Universal Analytics stopped processing data in 2024.
const STALE_TAG_COOKIE = /^(_gat_UA-|__utm[abcztv]$)/;
const DAY_MS = 86400000;

export const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const isNum = (v) => v !== null && v !== "" && Number.isFinite(Number(v));
const num = (v) => (isNum(v) ? new Intl.NumberFormat("en-GB").format(Number(v)) : "—");
const pct = (v) => (isNum(v) ? `${new Intl.NumberFormat("en-GB", { maximumFractionDigits: 1 }).format(Number(v))}%` : "—");
const utc = (ymd) => new Date(`${String(ymd).slice(0, 10)}T00:00:00Z`);
const dateLong = (d) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(d);
const dateMedium = (d) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(d);
const dateShort = (d) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).format(d);
const plural = (n, word) => `${num(n)} ${word}${Number(n) === 1 ? "" : "s"}`;

const signed = (v, unit) => `${Number(v) > 0 ? "+" : Number(v) < 0 ? "−" : ""}${new Intl.NumberFormat("en-GB", { maximumFractionDigits: 1 }).format(Math.abs(Number(v)))}${unit}`;

/** One entry per day of the range; a day without records has no rate. */
export function dailySeries(daily, fromDate, toDate) {
    const byDay = new Map((Array.isArray(daily) ? daily : []).map((d) => [String(d.date).slice(0, 10), d]));
    const out = [];
    for (let t = utc(fromDate).getTime(), end = utc(toDate).getTime(); t <= end; t += DAY_MS) {
        const key = new Date(t).toISOString().slice(0, 10);
        const row = byDay.get(key);
        out.push({
            key,
            num: Number(row?.num) || 0,
            rate: isNum(row?.accepted) ? Number(row.accepted) : null,
            prevRate: isNum(row?.previousPeriod?.accepted) ? Number(row.previousPeriod.accepted) : null,
        });
    }
    return out;
}

/** The latest scan, reduced to what loaded before consent where that is known. */
export function summarizeScan(scan, now = Date.now()) {
    if (!scan || !scan.scanned_at) return null;
    const phaseKnown = scan.consent_phase_known === true;
    const beforeConsent = (x) => !phaseKnown || x.consentPhase === "pre";
    const seen = (scan.pre_consent_transfers || []).filter(beforeConsent);
    const ownCmp = (t) => OWN_CMP_HOST.test(String(t.host || ""));
    const transfers = seen.filter((t) => !ownCmp(t));
    const cookies = (scan.pre_consent_cookies || []).filter(beforeConsent);
    const names = (list) => [...new Set(list.map((t) => t.service || t.host))];
    const byCookie = (...cats) => cookies.filter((c) => cats.includes(c.bannerCategory));
    return {
        scannedAt: new Date(scan.scanned_at),
        ageDays: Math.floor((now - new Date(scan.scanned_at).getTime()) / DAY_MS),
        phaseKnown,
        transfers,
        cookies,
        cmpInfrastructure: seen.filter(ownCmp),
        nonEU: transfers.filter((t) => t.dataRegion !== "eu" && !t.hostedInEU).length,
        euHosted: transfers.filter((t) => t.dataRegion !== "eu" && t.hostedInEU).length,
        trackers: names(transfers.filter((t) => ADVERTISING_CATEGORIES.includes(t.category))),
        analytics: names(transfers.filter((t) => t.category === "analytics")),
        ipTransfers: names(transfers.filter((t) => ["cdn", "functional", "third-party"].includes(t.category))),
        otherCmps: names(transfers.filter((t) => t.category === "cmp")),
        marketingCookies: byCookie("marketing"),
        analyticsCookies: byCookie("analytics"),
        otherCookies: byCookie("functional", "unclassified"),
        staleCookies: cookies.filter((c) => STALE_TAG_COOKIE.test(c.name)),
        rejectPass: scan.reject_pass || null,
        chapterV: chapterVReport((scan.pre_consent_transfers || []).filter((t) => !ownCmp(t)), scan.vendor_records || {}),
    };
}

/** One row per vendor, from every host the scan saw, before or after consent. */
export function chapterVReport(transfers, records = {}) {
    const byVendor = new Map();
    for (const t of transfers) {
        const key = t.service || t.host;
        if (!byVendor.has(key)) byVendor.set(key, []);
        byVendor.get(key).push(t);
    }
    const vendors = [...byVendor].map(([vendor, hosts]) => {
        const eu = hosts.filter((h) => h.dataRegion === "eu").length;
        return { vendor, region: eu === hosts.length ? "eu" : eu === 0 ? "non-eu" : "mixed", transferMechanism: hosts.find((h) => h.transferMechanism)?.transferMechanism || null };
    });
    const rows = vendors.map((v) => ({ ...v, chapter: vendorChapterV(v, records[v.vendor]), labels: chapterVLabels(v, records[v.vendor]) }));
    return { rows, ...chapterVSummary(vendors, records) };
}

function chapterVFindings(report) {
    if (!report.rows.length) return [];
    const names = (rows) => rows.map((r) => r.vendor).join(", ");
    const out = [];
    const problems = report.rows.filter((r) => r.chapter.status === "problem");
    const unconfirmed = report.rows.filter((r) => r.chapter.status === "unconfirmed");
    const noDpa = report.rows.filter((r) => r.chapter.needsDpa);
    if (problems.length) out.push({ severity: "danger", title: `${plural(problems.length, "vendor")} outside the EU with no transfer mechanism on record`, detail: `${names(problems)}. GDPR Chapter V requires a documented basis for these transfers.` });
    if (unconfirmed.length) out.push({ severity: "warning", title: `${plural(unconfirmed.length, "transfer mechanism")} not yet confirmed`, detail: `${names(unconfirmed)}. These are suggestions from our vendor catalogue until your organisation confirms them.` });
    if (noDpa.length) out.push({ severity: "warning", title: `${plural(noDpa.length, "vendor")} without a confirmed data processing agreement`, detail: names(noDpa) });
    if (!out.length) out.push({ severity: "ok", title: "Every vendor has a documented transfer basis and DPA", detail: "As recorded by your organisation." });
    return out;
}

function vendorFinding(label, vendors, cookies, scan) {
    const cookieNames = cookies.map((c) => c.name);
    if (!vendors.length && !cookieNames.length) return { severity: "ok", title: `No ${label} vendors or cookies found before consent`, detail: "Based on the latest scan." };
    const detail = [vendors.join(", "), cookieNames.length ? `Cookies: ${cookieNames.join(", ")}` : ""].filter(Boolean).join(". ");
    return scan.phaseKnown
        ? { severity: "danger", title: `${label[0].toUpperCase()}${label.slice(1)} vendors or cookies loaded before consent`, detail }
        : { severity: "warning", title: `${label[0].toUpperCase()}${label.slice(1)} vendors or cookies found in the latest scan`, detail: `${detail}. This older scan cannot tell whether they loaded before or after consent.` };
}

function rejectFindings(pass) {
    if (!pass || pass.available === false) {
        return [{ severity: "warning", title: "Reject behaviour has not been tested", detail: pass?.reason === "no-banner" ? "The scan did not find the Intastellar banner on the page." : "Run “Scan now” on this domain to test what happens after a visitor rejects." }];
    }
    const out = [];
    out.push(pass.firstLayerReject
        ? (pass.rejectAsProminent
            ? { severity: "ok", title: "A reject option is on the first layer, as prominent as accept", detail: "Compared by size and text size. Colour and wording need a human review." }
            : { severity: "warning", title: "The reject option is less prominent than accept", detail: "Reject is on the first layer but is smaller or uses smaller text." })
        : { severity: "danger", title: "No reject option found on the first layer", detail: "Rejecting should be as easy as accepting." });
    const still = (pass.transfers || []).filter((t) => ADVERTISING_CATEGORIES.includes(t.category) || t.category === "analytics");
    const cookies = (pass.cookies || []).filter((c) => ["marketing", "analytics"].includes(c.bannerCategory));
    out.push(still.length || cookies.length
        ? { severity: "danger", title: "Vendors or cookies present after reject", detail: [...new Set(still.map((t) => t.service))].concat(cookies.map((c) => c.name)).join(", ") }
        : { severity: "ok", title: "No advertising or analytics loaded after reject", detail: "Tested by rejecting and reloading the page." });
    if (pass.bannerShownAgain === true) out.push({ severity: "warning", title: "The banner appeared again after a choice was made", detail: "The choice does not appear to persist across page loads." });
    else if (pass.bannerShownAgain === false) out.push({ severity: "ok", title: "The visitor's choice persisted after reloading", detail: "The banner did not reappear." });
    return out;
}

export function scanFindings(scan, periodEnd = null) {
    if (!scan) return [{ severity: "warning", title: "No completed cookie scan", detail: "Without a scan this report cannot show which cookies and vendors load on the domain." }];
    const out = [vendorFinding("advertising", scan.trackers, scan.marketingCookies, scan), vendorFinding("analytics", scan.analytics, scan.analyticsCookies, scan)];
    if (scan.otherCookies.length) {
        out.push({ severity: scan.phaseKnown ? "danger" : "warning", title: "Cookies that are not strictly necessary were set before consent", detail: scan.otherCookies.map((c) => c.name).join(", ") });
    }
    out.push(...rejectFindings(scan.rejectPass));
    out.push(...chapterVFindings(scan.chapterV));
    if (scan.ipTransfers.length) out.push({ severity: "warning", title: "Third-party requests share visitor IP addresses before consent", detail: `${scan.ipTransfers.join(", ")}. These are not tracking vendors, but each request sends the visitor's IP address to the provider.` });
    if (scan.otherCmps.length) out.push({ severity: "warning", title: "A second consent banner loads on the page", detail: `${scan.otherCmps.join(", ")}. Two consent tools can conflict and record different choices.` });
    if (scan.staleCookies.length) out.push({ severity: "warning", title: "Outdated tracking tags are still present", detail: `${scan.staleCookies.map((c) => c.name).join(", ")}. Universal Analytics stopped processing data in 2024, so these can be removed.` });
    if (scan.nonEU > 0) out.push({ severity: "warning", title: `${plural(scan.nonEU, "request")} to hosts outside the EU before consent`, detail: scan.euHosted > 0 ? `A further ${num(scan.euHosted)} go to EU-hosted services of non-EU companies.` : "See the transfers table for the hosts involved." });
    if (scan.ageDays >= STALE_SCAN_DAYS) out.push({ severity: "warning", title: "The latest scan is out of date", detail: `It ran ${plural(scan.ageDays, "day")} ago. The site may have changed since.` });
    else if (periodEnd && (utc(periodEnd).getTime() - scan.scannedAt.getTime()) / DAY_MS > SCAN_BEHIND_PERIOD_DAYS) out.push({ severity: "warning", title: "The scan is older than the end of the reporting period", detail: `It ran on ${dateLong(scan.scannedAt)}, so later site changes are not reflected.` });
    return out;
}

export function auditFindings(data) {
    const { consent } = data;
    const series = dailySeries(consent?.dailyNum, data.fromDate, data.toDate);
    const logged = series.filter((d) => d.num > 0).length;
    const out = [];
    if (series.length) {
        const missing = series.length - logged;
        out.push(missing === 0
            ? { severity: "ok", title: "Consent decisions were recorded on every day of the period", detail: `${plural(series.length, "day")} covered.` }
            : { severity: "warning", title: `No consent decisions were recorded on ${plural(missing, "day")}`, detail: `Records exist for ${num(logged)} of ${plural(series.length, "day")}. Low traffic or an interruption in logging can both cause gaps.` });
    }
    const failed = dataChecks(data).filter((c) => c.ok === false);
    if (failed.length) out.push({ severity: "danger", title: "Report figures did not reconcile", detail: failed.map((c) => c.label).join(", ") });
    return [...out, ...scanFindings(summarizeScan(data.scan, data.generatedAt?.getTime?.()), data.toDate)];
}

/** Accepted, essential-only and custom always cover every decision. */
export function decisionMix(consent) {
    const total = Number(consent?.Total) || 0;
    const accept = Number(consent?.interactions_number?.accept) || 0;
    const essential = Number(consent?.interactions_number?.decline) || 0;
    const partial = Math.max(0, total - accept - essential);
    const share = (n) => (total > 0 ? (n / total) * 100 : 0);
    return { total, accept, essential, partial, acceptPct: share(accept), essentialPct: share(essential), partialPct: share(partial) };
}

/** EEA, outside the EEA and Unknown, computed only from the country rows. */
export function regionTotals(countries) {
    const bucket = () => ({ count: 0, accepted: 0, rate: null });
    const out = { eea: bucket(), nonEea: bucket(), unknown: bucket() };
    for (const c of countries || []) {
        const key = !c.country || c.country === "Unknown" ? "unknown" : EEA_COUNTRIES.has(c.country) ? "eea" : "nonEea";
        out[key].count += Number(c.num?.total) || 0;
        out[key].accepted += Number(c.num?.accept) || 0;
    }
    for (const b of Object.values(out)) b.rate = b.count > 0 ? (b.accepted / b.count) * 100 : null;
    return out;
}

/** Self-checks printed on the report; ok is null when a check could not run. */
export function dataChecks(data) {
    const total = Number(data.consent?.Total);
    const checks = [];
    if (data.consent) {
        const daily = dailySeries(data.consent.dailyNum, data.fromDate, data.toDate).reduce((s, d) => s + d.num, 0);
        checks.push({ label: "Daily records match the total", ok: daily === total });
        const countries = data.countries || [];
        const hasCountries = countries.length > 0;
        const sum = countries.reduce((s, c) => s + (Number(c.num?.total) || 0), 0);
        checks.push({ label: "Countries match the total", ok: hasCountries ? sum === total : null });
        const r = regionTotals(countries);
        checks.push({ label: "Regions match the total", ok: hasCountries ? r.eea.count + r.nonEea.count + r.unknown.count === total : null });
        const m = decisionMix(data.consent);
        checks.push({ label: "Decision types cover 100%", ok: m.total === 0 || Math.abs(m.acceptPct + m.essentialPct + m.partialPct - 100) < 0.01 });
    }
    return checks;
}

// ── Building blocks ──────────────────────────────────────────────────────────

const SEVERITY = { danger: "Action needed", warning: "Check", ok: "OK" };

function periodFacts(data) {
    return [
        ["Domain", data.domain],
        ["Period", `${dateMedium(utc(data.fromDate))} – ${dateMedium(utc(data.toDate))}`],
        ["Generated", dateLong(data.generatedAt)],
        ["Suspected bots", data.excludeBots ? "Excluded" : "Included"],
    ];
}

function masthead(title, purpose, facts) {
    return `<header class="masthead">
        <img class="brand" src="${LOGO_DATA_URI}" alt="Intastellar Consents">
        <h1>${esc(title)}</h1>
        <p class="lead">${esc(purpose)}</p>
        <dl class="facts">${facts.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl>
    </header>`;
}

function kpiBand(consent) {
    const change = consent?.changeRate || {};
    const delta = (v, unit, goodWhen) => {
        if (!isNum(v) || Number(v) === 0) return "";
        const good = goodWhen === "down" ? Number(v) < 0 : Number(v) > 0;
        return `<p class="delta ${good ? "good" : "bad"}">${signed(v, unit)} <span>vs previous period</span></p>`;
    };
    const users = Number(consent?.activeUsers) || 0;
    const perUser = users > 0 ? `<p class="delta"><span>${new Intl.NumberFormat("en-GB", { maximumFractionDigits: 1 }).format((Number(consent?.Total) || 0) / users)} records per user</span></p>` : "";
    const tiles = [
        ["Acceptance", pct(consent?.Accepted), delta(change.accepted, " pts", "up")],
        ["Essential-only", pct(consent?.Declined), delta(change.declined, " pts", "down")],
        ["Consent records", num(consent?.Total), ""],
        ["Active users", num(consent?.activeUsers), perUser],
    ];
    return `<section class="kpis">${tiles.map(([label, value, d]) => `<div><p class="label">${label}</p><p class="value">${value}</p>${d}</div>`).join("")}</section>`;
}

function decisionTypes(consent) {
    const m = decisionMix(consent);
    if (m.total === 0) return `<section class="block"><div class="block-head"><h2>Decision types</h2></div><p class="empty">No data recorded for this period.</p></section>`;
    const seg = (cls, value) => (value > 0 ? `<i class="${cls}" style="width:${value}%"></i>` : "");
    const item = (cls, label, n, value) => `<p><span class="sw ${cls}"></span>${label} <b>${pct(value)}</b> <span class="muted">${num(n)}</span></p>`;
    return `<section class="block"><div class="block-head"><h2>Decision types</h2></div>
        <div class="mix">${seg("in", m.acceptPct)}${seg("partial", m.partialPct)}${seg("out", m.essentialPct)}</div>
        <div class="mix-legend">${item("in", "Accepted all", m.accept, m.acceptPct)}${item("partial", "Custom choice", m.partial, m.partialPct)}${item("out", "Essential only", m.essential, m.essentialPct)}</div>
    </section>`;
}

function trendChart(consent, fromDate, toDate) {
    const series = dailySeries(consent?.dailyNum, fromDate, toDate);
    if (!series.some((d) => d.num > 0)) return "";
    const hasRate = series.some((d) => d.rate != null);
    const W = 680, H = 150, L = 40, R = 8, T = 10, B = 24;
    const values = series.map((d) => (hasRate ? d.rate : d.num));
    const previous = hasRate ? series.map((d) => d.prevRate) : [];
    const known = [...values, ...previous].filter((v) => v != null);
    let yMin = 0, yMax, step;
    if (hasRate) {
        yMin = Math.max(0, Math.floor((Math.min(...known) - 5) / 20) * 20);
        yMax = 100;
        step = 20;
    } else {
        const peak = Math.max(...known, 5), mag = 10 ** Math.floor(Math.log10(peak / 4)), f = peak / 4 / mag;
        step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * mag;
        yMax = Math.ceil(peak / step) * step;
    }
    const x = (i) => L + ((series.length === 1 ? 0.5 : i / (series.length - 1)) * (W - L - R));
    const y = (v) => T + ((yMax - v) / (yMax - yMin)) * (H - T - B);
    const path = (arr) => {
        let d = "", run = false;
        arr.forEach((v, i) => {
            if (v == null) { run = false; return; }
            d += `${run ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)} `;
            run = true;
        });
        return d;
    };
    const ticks = [];
    for (let v = yMin; v <= yMax + step / 2; v += step) ticks.push(v);
    const labels = [0, Math.floor((series.length - 1) / 2), series.length - 1].filter((v, i, a) => a.indexOf(v) === i);
    const showPrev = previous.some((v) => v != null);
    return `<section class="block">
        <div class="block-head"><h2>${hasRate ? "Daily acceptance rate" : "Daily consent decisions"}</h2>
        ${showPrev ? `<p class="legend"><span class="sw line"></span>This period <span class="sw dash"></span>Previous period</p>` : ""}</div>
        <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${hasRate ? "Daily acceptance rate" : "Daily consent decisions"}">
            ${ticks.map((v) => `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" class="grid"/><text x="${L - 6}" y="${y(v) + 3}" text-anchor="end">${hasRate ? `${v}%` : num(v)}</text>`).join("")}
            ${showPrev ? `<path d="${path(previous)}" class="prev"/>` : ""}
            <path d="${path(values)}" class="cur"/>
            ${labels.map((i) => `<text x="${x(i)}" y="${H - 6}" text-anchor="${i === 0 ? "start" : i === series.length - 1 ? "end" : "middle"}">${esc(dateShort(utc(series[i].key)))}</text>`).join("")}
        </svg>
    </section>`;
}

function categories(consent) {
    const total = Number(consent?.Total) || 0;
    if (total === 0) return `<section class="block"><div class="block-head"><h2>Opt-in by category</h2></div><p class="empty">No data recorded for this period.</p></section>`;
    const rows = [["Marketing", consent?.Marketing, "marketing"], ["Functional", consent?.Functional, "functional"], ["Analytics", consent?.Statics, "statics"]];
    return `<section class="block">
        <div class="block-head"><h2>Opt-in by category</h2><p class="legend"><span class="sw in"></span>Opted in <span class="sw out"></span>Not opted in</p></div>
        ${rows.map(([name, rate, key]) => {
            const count = Number(consent?.interactions_number?.[key]) || 0;
            return `<div class="cat">
            <div class="cat-head"><h3>${name}</h3><p><span>Accepted</span> ${num(count)}<span class="gap">Opt-in rate</span> <b>${pct(rate)}</b></p></div>
            ${count > 0 ? `<div class="bar"><i style="width:${Math.min(100, Math.max(0, Number(rate) || 0))}%"></i><u></u></div>` : `<p class="empty">No opt-ins recorded.</p>`}
        </div>`;
        }).join("")}
        <p class="note">Includes visitors who accepted all. A custom choice currently records one category per decision, so category rates are a lower bound. Categories may overlap.</p>
    </section>`;
}

function rankedCountries(countries, consent, limit) {
    const rows = [...(countries || [])].filter((c) => Number(c.num?.total) > 0).sort((a, b) => b.num.total - a.num.total);
    const shown = limit ? rows.slice(0, limit) : rows;
    if (!shown.length) return `<p class="note">No country data for this period.</p>`;
    const max = Number(shown[0].num.total);
    return `<table class="ranked"><thead><tr><th>Country</th><th></th><th class="r">Decisions</th><th class="r">Accepted</th></tr></thead><tbody>
        ${shown.map((c) => `<tr><td>${esc(c.country)}</td><td class="meter"><i style="width:${(Number(c.num.total) / max) * 100}%"></i></td><td class="r">${num(c.num.total)}</td><td class="r">${pct(c.accepted)}</td></tr>`).join("")}
    </tbody></table>`;
}

function regions(countries) {
    const r = regionTotals(countries);
    const rows = [["EEA visitors", r.eea], ["Outside the EEA", r.nonEea], ["Unknown location", r.unknown]].filter(([, b], i) => i < 2 || b.count > 0);
    return `<div class="pair">${rows.map(([label, b]) => `<div><p class="label">${label}</p><p class="mid">${num(b.count)}</p><p class="sub">${b.rate == null ? "No data recorded" : `${pct(b.rate)} accepted`}</p></div>`).join("")}</div>`;
}

function devices(consent) {
    const d = consent?.device_type || {};
    const counts = [["Mobile", Number(d.mobile) || 0], ["Desktop", Number(d.desktop) || 0], ["Tablet", Number(d.tablet) || 0]];
    const total = counts.reduce((s, [, n]) => s + n, 0);
    if (total === 0) return `<p class="empty">No data recorded for this period.</p>`;
    return counts.map(([label, n]) => {
        const share = total > 0 ? (n / total) * 100 : 0;
        return `<div class="device"><p><span>${label}</span><span>${pct(share)}</span></p><div class="meter-track"><i style="width:${share}%"></i></div></div>`;
    }).join("");
}

function findingsList(findings) {
    return `<ul class="findings">${findings.map((f) => `<li class="${f.severity}"><p class="sev">${SEVERITY[f.severity]}</p><div><h3>${esc(f.title)}</h3><p>${esc(f.detail)}</p></div></li>`).join("")}</ul>`;
}

function scanBlock(scan, domain) {
    if (!scan) return `<p class="note">No completed cookie scan is available for this domain.</p>`;
    const bare = String(domain).replace(/^www\./, "");
    const party = (c) => (String(c.domain || "").replace(/^\./, "").endsWith(bare) ? "First-party" : "Third-party");
    const scope = scan.phaseKnown ? "before consent" : "in the scan";
    return `<div class="pair">
            <div><p class="label">Transfers ${scope}</p><p class="mid">${num(scan.transfers.length)}</p><p class="sub">${scan.nonEU > 0 ? `${num(scan.nonEU)} hosted outside the EU` : "None hosted outside the EU"}</p></div>
            <div><p class="label">Cookies ${scope}</p><p class="mid">${num(scan.cookies.length)}</p><p class="sub">Scanned ${esc(dateLong(scan.scannedAt))}</p></div>
        </div>
        <h3 class="table-title">Transfers</h3>
        ${scan.transfers.length ? `<table><thead><tr><th>Service</th><th>Host</th><th>Category</th><th>Region</th></tr></thead><tbody>
            ${scan.transfers.map((t) => `<tr><td>${esc(t.service || t.host)}</td><td class="mono">${esc(t.host)}</td><td>${esc(t.category || "—")}</td><td>${t.dataRegion === "eu" ? "EU" : t.hostedInEU ? `EU-hosted, ${esc(t.dataCountry || "non-EU")} company` : esc(t.dataCountry || "Outside the EU")}</td></tr>`).join("")}
        </tbody></table>` : `<p class="note">None found.</p>`}
        <h3 class="table-title">Cookies</h3>
        ${scan.cookies.length ? `<table><thead><tr><th>Name</th><th>Domain</th><th>Party</th><th>Category</th></tr></thead><tbody>
            ${scan.cookies.map((c) => `<tr><td class="mono">${esc(c.name)}</td><td class="mono">${esc(c.domain)}</td><td>${party(c)}</td><td>${esc(c.bannerCategory || "—")}</td></tr>`).join("")}
        </tbody></table>` : `<p class="note">None found.</p>`}
        ${scan.cmpInfrastructure.length ? `<p class="note">CMP infrastructure, not counted above: ${esc([...new Set(scan.cmpInfrastructure.map((t) => t.host))].join(", "))}.</p>` : ""}`;
}

function chapterVTable(scan) {
    if (!scan?.chapterV.rows.length) return "";
    const region = { eu: "EU", "non-eu": "Outside the EU", mixed: "EU and outside" };
    return `<h3 class="table-title">International transfers (GDPR Chapter V)</h3>
        <table><thead><tr><th>Vendor</th><th>Region</th><th>Transfer mechanism</th><th>DPA</th></tr></thead><tbody>
            ${scan.chapterV.rows.map((r) => `<tr><td>${esc(r.vendor)}</td><td>${region[r.region]}</td><td>${esc(r.labels.transfer)}</td><td>${esc(r.labels.dpa)}</td></tr>`).join("")}
        </tbody></table>
        <p class="note">Covers every vendor in the scan, before or after consent. Confirmed values are as recorded by your organisation; “unconfirmed” values are suggestions from our vendor catalogue.</p>`;
}

const SCAN_METHOD = "Cookie and vendor results come from an automated browser visit to the site. A scan is a point-in-time check of the pages it reached from one location, so content shown only to certain regions, logged-in users or later in a visit may not appear.";

// ── Reports ──────────────────────────────────────────────────────────────────

function methodology(data) {
    const comparisonNote = data.fromDate <= BOT_FLAG_START ? " Hosting-IP bot flagging began on 3 November 2026, so earlier records have been filtered less strictly and a comparison across that date should be read with care." : "";
    const rows = [
        ["Consent record", "One stored consent event. The banner currently stores one on page loads where a choice already exists, so one visitor can have several; records per user shows how many."],
        ["Acceptance", "Records of accept-all divided by all consent records. Essential-only and custom choice are computed the same way, and the three add up to 100%."],
        ["Bot exclusion", data.excludeBots ? "Records from hosting or data-centre IP addresses and records showing automated behaviour are excluded." : "Suspected bot records are included in this report."],
        ["Previous period", `The same number of days immediately before the reporting period, with the same filters.${comparisonNote}`],
        ["EEA", "The 27 EU member states plus Iceland, Liechtenstein and Norway. The UK and Switzerland count as outside the EEA."],
    ];
    return `<section class="method keep"><h2>Methodology and definitions</h2><dl>${rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl></section>`;
}

function qualityLine(data, scan) {
    const parts = dataChecks(data).filter((c) => c.ok !== null).map((c) => `${c.label}: ${c.ok ? "passed" : "FAILED"}`);
    parts.push(scan ? `Scan age: ${plural(scan.ageDays, "day")}` : "No scan");
    parts.push(`Bot exclusion: ${data.excludeBots ? "on" : "off"}`);
    return `<p class="quality">Data checks. ${esc(parts.join(" · "))}</p>`;
}

function summaryBody(data) {
    return `${masthead("Consent summary", "How visitors answered the cookie banner in this period.", periodFacts(data))}
        ${kpiBand(data.consent)}
        ${trendChart(data.consent, data.fromDate, data.toDate)}
        <div class="columns">
            ${categories(data.consent)}
            <section class="block"><div class="block-head"><h2>Devices</h2></div>${devices(data.consent)}</section>
        </div>
        <div class="columns">
            <section class="block"><div class="block-head"><h2>Top countries</h2></div>${rankedCountries(data.countries, data.consent, 4)}</section>
            <section class="block"><div class="block-head"><h2>Regions</h2></div><div class="stack">${regions(data.countries)}</div></section>
        </div>`;
}

function snapshotBody(data) {
    const scan = summarizeScan(data.scan, data.generatedAt.getTime());
    const facts = [["Domain", data.domain], ["Latest scan", scan ? dateLong(scan.scannedAt) : "None"], ["Generated", dateLong(data.generatedAt)]];
    return `${masthead("Compliance snapshot", "What the latest cookie scan found on this domain, and what to act on.", facts)}
        <section class="block"><div class="block-head"><h2>Findings</h2>${scan ? `<p class="legend">Scan date: ${esc(dateLong(scan.scannedAt))}</p>` : ""}</div>${findingsList(scanFindings(scan))}</section>
        <section class="fine keep"><p>${SCAN_METHOD} This snapshot supports a compliance review. It does not assess legal adequacy, and the data controller remains responsible for how the site processes personal data.</p></section>
        <section class="block"><div class="block-head"><h2>Scan results</h2></div>${scanBlock(scan, data.domain)}${chapterVTable(scan)}</section>`;
}

function auditBody(data) {
    const scan = summarizeScan(data.scan, data.generatedAt.getTime());
    const series = dailySeries(data.consent?.dailyNum, data.fromDate, data.toDate);
    return `${masthead("Consent audit", "A record of consent activity on this domain for the period, for internal review and auditors.", periodFacts(data))}
        ${kpiBand(data.consent)}
        ${decisionTypes(data.consent)}
        <section class="block"><div class="block-head"><h2>Findings</h2>${scan ? `<p class="legend">Scan date: ${esc(dateLong(scan.scannedAt))}</p>` : ""}</div>${findingsList(auditFindings(data))}</section>
        ${trendChart(data.consent, data.fromDate, data.toDate)}
        ${categories(data.consent)}
        <section class="block keep"><div class="block-head"><h2>Scope</h2></div>
            <p>This audit covers consent interactions recorded by the Intastellar Consent Management Platform for the domain and period above. It does not assess controller-side data processing, third-party script behaviour beyond the cookie scan, or downstream use of data.</p>
            <p>The data controller remains responsible for ensuring the consent implementation meets the applicable legal requirements.</p></section>
        <section class="block keep"><div class="block-head"><h2>Evidence</h2></div>
            <p>Figures are aggregated from consent records stored by the cookie banner. Each record holds the consent choice, a timestamp, device information and the visitor's country. Suspected bot traffic is ${data.excludeBots ? "excluded" : "included"}.</p>
            <p>${SCAN_METHOD}</p></section>
        <section class="block keep"><div class="block-head"><h2>Limitations</h2></div>
            <p>Results reflect the data available for this period. Differences in banner setup, traffic and external factors affect consent rates, and category figures may overlap. This report supports a compliance review and is not legal advice.</p></section>
        ${methodology(data)}
        ${qualityLine(data, scan)}
        <section class="appendix"><h2>Appendix A: Daily records</h2>
            <table><thead><tr><th>Date</th><th class="r">Decisions</th><th class="r">Acceptance</th></tr></thead><tbody>
            ${series.map((d) => `<tr><td>${esc(dateLong(utc(d.key)))}</td><td class="r">${num(d.num)}</td><td class="r">${d.rate == null ? "—" : pct(d.rate)}</td></tr>`).join("")}
            </tbody></table></section>
        <section class="appendix"><h2>Appendix B: Countries</h2>${regions(data.countries)}${rankedCountries(data.countries, data.consent)}</section>
        <section class="appendix"><h2>Appendix C: Cookie scan</h2>${scanBlock(scan, data.domain)}${chapterVTable(scan)}</section>`;
}

const STYLES = `
@page { size: A4; margin: 20mm 16mm 18mm; }
* { box-sizing: border-box; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { margin: 0; color: #1f1f1f; font: 10pt/1.5 Inter, Arial, Helvetica, sans-serif; font-variant-numeric: tabular-nums; }
h1, h2, h3, p, dl, dd, ul { margin: 0; padding: 0; }
h1, h2 { font-family: Questrial, Inter, Arial, sans-serif; font-weight: 400; }
ul { list-style: none; }
.fine { margin-top: 6mm; padding-top: 3mm; border-top: 1px solid #e3e3e3; font-size: 8.5pt; color: #4a4a4a; }
.stack .pair { grid-template-columns: 1fr; gap: 3mm; }
.masthead { padding-bottom: 7mm; border-bottom: 2px solid #c09f53; }
.brand { display: block; height: 9mm; width: auto; margin-left: -2.3mm; }
h1 { font-size: 30pt; line-height: 1.15; margin-top: 5mm; }
.lead { margin-top: 1mm; font-size: 11pt; color: #4a4a4a; }
.facts { display: grid; grid-template-columns: 1.1fr 2fr 1.1fr 1fr; gap: 5mm; margin-top: 7mm; }
dt, .label { font-size: 8.5pt; color: #5f5f5f; }
dd { margin-top: .5mm; overflow-wrap: anywhere; }
.kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 5mm; padding: 7mm 0; border-bottom: 1px solid #e3e3e3; }
.value { font: 24pt/1.15 Questrial, Inter, Arial, sans-serif; }
.delta { font-size: 8.5pt; } .delta span { color: #5f5f5f; }
.delta.good { color: #1f7a4d; } .delta.bad { color: #b42318; }
.block { margin-top: 8mm; }
.keep, .kpis, .cat, .findings li, .device, .pair, tr, svg { break-inside: avoid; }
.block-head { display: flex; align-items: baseline; justify-content: space-between; gap: 4mm; margin-bottom: 3mm; break-after: avoid; }
h2 { font-size: 15pt; line-height: 1.25; }
h3 { font-size: 10.5pt; font-weight: 600; }
.block p + p { margin-top: 2mm; }
.legend { font-size: 8.5pt; color: #4a4a4a; display: flex; align-items: center; gap: 1.5mm; }
.sw { display: inline-block; width: 3mm; height: 3mm; border-radius: .5mm; margin-left: 2mm; }
.sw.in { background: #3f8f66; } .sw.out { background: #d9d9d9; } .sw.partial { background: #c09f53; }
.sw.line { height: 0; border-top: 2px solid #3f8f66; border-radius: 0; width: 5mm; }
.sw.dash { height: 0; border-top: 2px dashed #8a8a8a; border-radius: 0; width: 5mm; }
svg { display: block; width: 100%; height: auto; }
svg text { font: 8px Inter, Arial, sans-serif; fill: #5f5f5f; }
svg .grid { stroke: #ececec; stroke-width: 1; }
svg path { fill: none; stroke-linejoin: round; stroke-linecap: round; }
svg .cur { stroke: #3f8f66; stroke-width: 2; }
svg .prev { stroke: #8a8a8a; stroke-width: 1.25; stroke-dasharray: 4 3; }
.columns { display: grid; grid-template-columns: 1.7fr 1fr; gap: 8mm; }
.cat { margin-top: 3.5mm; }
.cat-head { display: flex; justify-content: space-between; align-items: baseline; gap: 4mm; }
.cat-head p { font-size: 9pt; white-space: nowrap; } .cat-head span { color: #5f5f5f; } .cat-head .gap { margin-left: 3mm; }
.bar { display: flex; gap: 2px; height: 4mm; margin-top: 1mm; }
.bar i { background: #3f8f66; border-radius: 1mm 0 0 1mm; } .bar u { flex: 1; background: #e6e6e6; border-radius: 0 1mm 1mm 0; }
.note { margin-top: 2mm; font-size: 8.5pt; color: #5f5f5f; }
.device { margin-top: 3mm; } .device p { display: flex; justify-content: space-between; }
.meter-track { height: 2.5mm; background: #e6e6e6; border-radius: 1mm; margin-top: .75mm; }
.meter-track i, td.meter i { display: block; height: 2.5mm; background: #3f8f66; border-radius: 1mm; }
.pair { display: grid; grid-template-columns: 1fr 1fr; gap: 5mm; }
.mid { font: 17pt/1.2 Questrial, Inter, Arial, sans-serif; } .sub { font-size: 8.5pt; color: #4a4a4a; }
table { width: 100%; border-collapse: collapse; margin-top: 3mm; font-size: 9pt; }
thead { display: table-header-group; }
th { text-align: left; font-weight: 500; font-size: 8.5pt; color: #5f5f5f; padding: 1.25mm 2mm 1.25mm 0; border-bottom: 1px solid #c9c9c9; }
td { padding: 1.25mm 2mm 1.25mm 0; border-bottom: 1px solid #ececec; vertical-align: top; overflow-wrap: anywhere; }
.r { text-align: right; padding-right: 0; }
.mono { font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 8pt; }
td.meter { width: 45%; vertical-align: middle; }
.table-title { margin-top: 6mm; }
.findings li { display: grid; grid-template-columns: 26mm 1fr; gap: 3mm; padding: 2.5mm 0; border-top: 1px solid #e3e3e3; }
.findings li:first-child { border-top: 0; padding-top: 0; }
.sev { font-size: 8.5pt; font-weight: 600; }
.danger .sev { color: #b42318; } .warning .sev { color: #a15c00; } .ok .sev { color: #1f7a4d; }
.findings p:not(.sev) { color: #4a4a4a; font-size: 9.5pt; overflow-wrap: anywhere; }
.summary .masthead { padding-bottom: 5mm; } .summary .facts { margin-top: 5mm; } .summary .kpis { padding: 5mm 0; } .summary .block { margin-top: 6mm; }
.empty { margin-top: 1mm; font-size: 9pt; color: #5f5f5f; font-style: italic; }
.mix { display: flex; gap: 2px; height: 5mm; }
.mix i { display: block; } .mix .in { background: #3f8f66; } .mix .partial { background: #c09f53; } .mix .out { background: #d9d9d9; }
.mix i:first-child { border-radius: 1mm 0 0 1mm; } .mix i:last-child { border-radius: 0 1mm 1mm 0; }
.mix-legend { display: flex; flex-wrap: wrap; gap: 2mm 8mm; margin-top: 2mm; font-size: 9pt; } .mix-legend p { margin: 0; } .mix-legend .sw { margin: 0 1.5mm 0 0; } .muted { color: #5f5f5f; }
.method { margin-top: 8mm; padding: 4mm 5mm; background: #f6f5f1; border-radius: 1.5mm; }
.method h2 { font-size: 12pt; margin-bottom: 2mm; }
.method dl { display: grid; gap: 1.5mm; } .method dl div { display: grid; grid-template-columns: 30mm 1fr; gap: 3mm; }
.method dt { font-weight: 600; color: #1f1f1f; font-size: 9pt; } .method dd { margin: 0; font-size: 9pt; color: #4a4a4a; }
.quality { margin-top: 4mm; font-size: 8pt; color: #5f5f5f; }
.appendix { break-before: page; }
.appendix h2 { padding-bottom: 2mm; border-bottom: 2px solid #c09f53; margin-bottom: 4mm; }
`;

const BODIES = { audit: auditBody, summary: summaryBody, snapshot: snapshotBody };

export function buildReportHtml(type, data) {
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(REPORT_TYPES[type].title)} · ${esc(data.domain)}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Questrial&display=swap">
<style>${STYLES}</style></head><body class="${type}">${BODIES[type](data)}</body></html>`;
}
