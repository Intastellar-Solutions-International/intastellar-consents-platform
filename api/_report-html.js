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

export const REPORT_TYPES = {
    audit: { title: "Consent audit", filename: "Consent_Audit" },
    summary: { title: "Consent summary", filename: "Consent_Summary" },
    snapshot: { title: "Compliance snapshot", filename: "Compliance_Snapshot" },
};

const STALE_SCAN_DAYS = 14;
const TRACKER_CATEGORIES = ["advertising", "fingerprinting", "social"];
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
    const transfers = (scan.pre_consent_transfers || []).filter(beforeConsent);
    const cookies = (scan.pre_consent_cookies || []).filter(beforeConsent);
    return {
        scannedAt: new Date(scan.scanned_at),
        ageDays: Math.floor((now - new Date(scan.scanned_at).getTime()) / DAY_MS),
        phaseKnown,
        transfers,
        cookies,
        nonEU: transfers.filter((t) => t.dataRegion !== "eu").length,
        trackers: [...new Set(transfers.filter((t) => TRACKER_CATEGORIES.includes(t.category)).map((t) => t.service || t.host))],
    };
}

export function scanFindings(scan) {
    if (!scan) return [{ severity: "warning", title: "No completed cookie scan", detail: "Without a scan this report cannot show which cookies and vendors load on the domain." }];
    const out = [];
    if (scan.trackers.length) {
        const vendors = plural(scan.trackers.length, "advertising or tracking vendor");
        out.push(scan.phaseKnown
            ? { severity: "danger", title: `${vendors} loaded before consent`, detail: scan.trackers.join(", ") }
            : { severity: "warning", title: `${vendors} found in the latest scan`, detail: `${scan.trackers.join(", ")}. This older scan cannot tell whether they loaded before or after consent.` });
    } else {
        out.push({ severity: "ok", title: "No advertising or tracking vendors found before consent", detail: "Based on the latest scan." });
    }
    if (scan.nonEU > 0) out.push({ severity: "warning", title: `${plural(scan.nonEU, "transfer")} outside the EU in the scan`, detail: "See the transfers table for the hosts involved." });
    if (scan.ageDays >= STALE_SCAN_DAYS) out.push({ severity: "warning", title: "The latest scan is out of date", detail: `It ran ${plural(scan.ageDays, "day")} ago. The site may have changed since.` });
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
    const declined = Number(consent?.interactions_number?.decline) || 0;
    out.push(declined > 0
        ? { severity: "ok", title: "Visitors declined optional cookies during the period", detail: `${num(declined)} essential-only decisions were recorded.` }
        : { severity: "warning", title: "No essential-only decisions were recorded", detail: "Check that declining is offered as clearly as accepting." });
    return [...out, ...scanFindings(summarizeScan(data.scan, data.generatedAt?.getTime?.()))];
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
        <p class="brand">Intastellar Consents</p>
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
    const tiles = [
        ["Acceptance", pct(consent?.Accepted), delta(change.accepted, " pts", "up")],
        ["Essential-only", pct(consent?.Declined), delta(change.declined, " pts", "down")],
        ["Consent decisions", num(consent?.Total), ""],
        ["Active users", num(consent?.activeUsers), ""],
    ];
    return `<section class="kpis">${tiles.map(([label, value, d]) => `<div><p class="label">${label}</p><p class="value">${value}</p>${d}</div>`).join("")}</section>`;
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
    const rows = [["Marketing", consent?.Marketing, "marketing"], ["Functional", consent?.Functional, "functional"], ["Analytics", consent?.Statics, "statics"]];
    return `<section class="block">
        <div class="block-head"><h2>Opt-in by category</h2><p class="legend"><span class="sw in"></span>Opted in <span class="sw out"></span>Opted out</p></div>
        ${rows.map(([name, rate, key]) => `<div class="cat">
            <div class="cat-head"><h3>${name}</h3><p><span>Accepted</span> ${num(consent?.interactions_number?.[key])}<span class="gap">Opt-in rate</span> <b>${pct(rate)}</b></p></div>
            <div class="bar"><i style="width:${Math.min(100, Math.max(0, Number(rate) || 0))}%"></i><u></u></div>
        </div>`).join("")}
        <p class="note">Categories are calculated independently and may overlap.</p>
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

function regions(consent) {
    const clamp = (v) => (isNum(v) ? Math.min(100, Math.max(0, Number(v))) : null);
    const rows = [["EU visitors", consent?.euUsers, clamp(consent?.euAcceptedRate)], ["Non-EU visitors", consent?.noneEUUsers, clamp(consent?.noneEUAcceptedRate)]];
    return `<div class="pair">${rows.map(([label, n, rate]) => `<div><p class="label">${label}</p><p class="mid">${num(n)}</p><p class="sub">${pct(rate)} accepted</p></div>`).join("")}</div>`;
}

function devices(consent) {
    const d = consent?.device_type || {};
    const counts = [["Mobile", Number(d.mobile) || 0], ["Desktop", Number(d.desktop) || 0], ["Tablet", Number(d.tablet) || 0]];
    const total = counts.reduce((s, [, n]) => s + n, 0);
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
            <div><p class="label">Transfers ${scope}</p><p class="mid">${num(scan.transfers.length)}</p><p class="sub">${scan.nonEU > 0 ? `${num(scan.nonEU)} outside the EU` : "All within the EU"}</p></div>
            <div><p class="label">Cookies ${scope}</p><p class="mid">${num(scan.cookies.length)}</p><p class="sub">Scanned ${esc(dateLong(scan.scannedAt))}</p></div>
        </div>
        <h3 class="table-title">Transfers</h3>
        ${scan.transfers.length ? `<table><thead><tr><th>Service</th><th>Host</th><th>Category</th><th>Region</th></tr></thead><tbody>
            ${scan.transfers.map((t) => `<tr><td>${esc(t.service || t.host)}</td><td class="mono">${esc(t.host)}</td><td>${esc(t.category || "—")}</td><td>${t.dataRegion === "eu" ? "EU" : esc(t.dataCountry || "Non-EU")}</td></tr>`).join("")}
        </tbody></table>` : `<p class="note">None found.</p>`}
        <h3 class="table-title">Cookies</h3>
        ${scan.cookies.length ? `<table><thead><tr><th>Name</th><th>Domain</th><th>Party</th><th>Category</th></tr></thead><tbody>
            ${scan.cookies.map((c) => `<tr><td class="mono">${esc(c.name)}</td><td class="mono">${esc(c.domain)}</td><td>${party(c)}</td><td>${esc(c.bannerCategory || "—")}</td></tr>`).join("")}
        </tbody></table>` : `<p class="note">None found.</p>`}`;
}

const SCAN_METHOD = "Cookie and vendor results come from an automated browser visit to the site. A scan is a point-in-time check of the pages it reached from one location, so content shown only to certain regions, logged-in users or later in a visit may not appear.";

// ── Reports ──────────────────────────────────────────────────────────────────

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
            <section class="block"><div class="block-head"><h2>Regions</h2></div><div class="stack">${regions(data.consent)}</div></section>
        </div>`;
}

function snapshotBody(data) {
    const scan = summarizeScan(data.scan, data.generatedAt.getTime());
    const facts = [["Domain", data.domain], ["Latest scan", scan ? dateLong(scan.scannedAt) : "None"], ["Generated", dateLong(data.generatedAt)]];
    return `${masthead("Compliance snapshot", "What the latest cookie scan found on this domain, and what to act on.", facts)}
        <section class="block"><div class="block-head"><h2>Findings</h2></div>${findingsList(scanFindings(scan))}</section>
        <section class="fine keep"><p>${SCAN_METHOD} This snapshot supports a compliance review. It does not assess legal adequacy, and the data controller remains responsible for how the site processes personal data.</p></section>
        <section class="block"><div class="block-head"><h2>Scan results</h2></div>${scanBlock(scan, data.domain)}</section>`;
}

function auditBody(data) {
    const scan = summarizeScan(data.scan, data.generatedAt.getTime());
    const series = dailySeries(data.consent?.dailyNum, data.fromDate, data.toDate);
    return `${masthead("Consent audit", "A record of consent activity on this domain for the period, for internal review and auditors.", periodFacts(data))}
        ${kpiBand(data.consent)}
        <section class="block"><div class="block-head"><h2>Findings</h2></div>${findingsList(auditFindings(data))}</section>
        ${trendChart(data.consent, data.fromDate, data.toDate)}
        ${categories(data.consent)}
        <section class="block keep"><div class="block-head"><h2>Scope</h2></div>
            <p>This audit covers consent interactions recorded by the Intastellar Consent Management Platform for the domain and period above. It does not assess controller-side data processing, third-party script behaviour beyond the cookie scan, or downstream use of data.</p>
            <p>The data controller remains responsible for ensuring the consent implementation meets the applicable legal requirements.</p></section>
        <section class="block keep"><div class="block-head"><h2>Evidence</h2></div>
            <p>Figures are aggregated from consent records captured when visitors interact with the cookie banner. Each record holds the consent choice, a timestamp, device information and the visitor's country. Suspected bot traffic is ${data.excludeBots ? "excluded" : "included"}.</p>
            <p>${SCAN_METHOD}</p></section>
        <section class="block keep"><div class="block-head"><h2>Limitations</h2></div>
            <p>Results reflect the data available for this period. Differences in banner setup, traffic and external factors affect consent rates, and category figures may overlap. This report supports a compliance review and is not legal advice.</p></section>
        <section class="appendix"><h2>Appendix A: Daily records</h2>
            <table><thead><tr><th>Date</th><th class="r">Decisions</th><th class="r">Acceptance</th></tr></thead><tbody>
            ${series.map((d) => `<tr><td>${esc(dateLong(utc(d.key)))}</td><td class="r">${num(d.num)}</td><td class="r">${d.rate == null ? "—" : pct(d.rate)}</td></tr>`).join("")}
            </tbody></table></section>
        <section class="appendix"><h2>Appendix B: Countries</h2>${regions(data.consent)}${rankedCountries(data.countries, data.consent)}</section>
        <section class="appendix"><h2>Appendix C: Cookie scan</h2>${scanBlock(scan, data.domain)}</section>`;
}

const STYLES = `
@page { size: A4; margin: 20mm 16mm 18mm; }
* { box-sizing: border-box; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { margin: 0; color: #1f1f1f; font: 10pt/1.5 Inter, Arial, Helvetica, sans-serif; font-variant-numeric: tabular-nums; }
h1, h2, h3, p, dl, dd, ul { margin: 0; padding: 0; }
h1, h2, .brand { font-family: Questrial, Inter, Arial, sans-serif; font-weight: 400; }
ul { list-style: none; }
.fine { margin-top: 6mm; padding-top: 3mm; border-top: 1px solid #e3e3e3; font-size: 8.5pt; color: #4a4a4a; }
.stack .pair { grid-template-columns: 1fr; gap: 3mm; }
.masthead { padding-bottom: 7mm; border-bottom: 2px solid #c09f53; }
.brand { font-size: 10pt; color: #7a5f24; }
h1 { font-size: 30pt; line-height: 1.15; margin-top: 2mm; }
.lead { margin-top: 1mm; font-size: 11pt; color: #4a4a4a; }
.facts { display: grid; grid-template-columns: 1.1fr 2fr 1.1fr 1fr; gap: 5mm; margin-top: 7mm; }
dt, .label { font-size: 8.5pt; color: #5f5f5f; }
dd { margin-top: .5mm; overflow-wrap: anywhere; }
.kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 5mm; padding: 7mm 0; border-bottom: 1px solid #e3e3e3; }
.value { font: 24pt/1.15 Questrial, Inter, Arial, sans-serif; }
.delta { font-size: 8.5pt; } .delta span { color: #5f5f5f; }
.delta.good { color: #1f7a4d; } .delta.bad { color: #b42318; }
.block { margin-top: 8mm; }
.keep, .kpis, .cat, .findings li, .device, tr, svg { break-inside: avoid; }
.block-head { display: flex; align-items: baseline; justify-content: space-between; gap: 4mm; margin-bottom: 3mm; break-after: avoid; }
h2 { font-size: 15pt; line-height: 1.25; }
h3 { font-size: 10.5pt; font-weight: 600; }
.block p + p { margin-top: 2mm; }
.legend { font-size: 8.5pt; color: #4a4a4a; display: flex; align-items: center; gap: 1.5mm; }
.sw { display: inline-block; width: 3mm; height: 3mm; border-radius: .5mm; margin-left: 2mm; }
.sw.in { background: #3f8f66; } .sw.out { background: #e6e6e6; }
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
.appendix { break-before: page; }
.appendix h2 { padding-bottom: 2mm; border-bottom: 2px solid #c09f53; margin-bottom: 4mm; }
`;

const BODIES = { audit: auditBody, summary: summaryBody, snapshot: snapshotBody };

export function buildReportHtml(type, data) {
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(REPORT_TYPES[type].title)} · ${esc(data.domain)}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Questrial&display=swap">
<style>${STYLES}</style></head><body class="${type}">${BODIES[type](data)}</body></html>`;
}
