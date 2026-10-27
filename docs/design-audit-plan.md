# Analytics Dashboard Design Audit — Phase 0 Plan (read-only)

**Status: awaiting your review. No code has been changed. Do not start Phase 1 until this plan is approved.**

Site under audit: **asasoftware.aero**, viewport ~1,100 px wide, matching the live-site screenshots
that prompted this audit.

**Methodology:** full read of the frontend stack (build tooling, global/CDN dependencies), the
Analytics section's layout wrappers (`src/Pages/Analytics/*.js`, `Analytics.css`, nav components),
its chart implementations, its existing design-token system, and its accessibility posture — cross-
checked against the specific symptoms in your bug list. No application code was changed; this
document is the only output of Phase 0. Static reading can't fully confirm pixel-level behavior
("does the map scale really look inverted," "is Marketing's overlap literally reproducible at
1100 px") — those are flagged below as **verify live** rather than asserted.

Legend: ✅ confirmed (code evidence) · 🟡 root cause plausible, needs a live screenshot/repro to
confirm · ❓ investigated, no code-level explanation found — needs live data

---

## 0. Stack and conventions (read first — this shapes every later recommendation)

- **Framework:** React 18 + React Router v5, loaded as **global UMD scripts from CDN**
  (`src/index.html:103-114`) — not npm imports. Every component file starts with
  `const { useState, ... } = React;` and uses `window.ReactRouterDOM`. `react`/`react-dom`/
  `react-router-dom` are webpack `externals` (`webpack.config.js:17-21`), so the bundle only
  contains this repo's own code.
- **Build:** Webpack + Babel (`@babel/preset-env`/`@babel/preset-react`), plain CSS via
  `style-loader`/`css-loader` — **no CSS Modules, no Sass/Less, no Tailwind, no CSS-in-JS.** Every
  `.css` file is global and loaded by whichever `.js` file `import`s it.
- **Charts, corrected finding:** my first grep pass wrongly flagged `react-chartjs-2`/`chart.js` as
  used across `ReportView.js`, `ReportBuilder.js`, `Forms.js`, `SearchConsole.js` — that was a
  **false positive**: the grep pattern matched the substring `"Chart.js"` inside
  `TrendLineChart.js`, not an actual chart.js import. Verified properly
  (`grep "from \"react-chartjs-2\""` repo-wide): chart.js is used **only** in
  `src/Components/widget/*` (the consent-banner preview widget) and `src/Pages/Experiments/
  Experiments.js` — neither is part of this audit. **Every chart in the Analytics section is
  hand-rolled inline SVG**, and this is a *deliberate, stated* convention —
  `PageExperimentEditor.js:1403-1405` says so explicitly: *"Hand-rolled SVG rather than Chart.js/
  react-chartjs-2 — nothing [...] is inline SVG, so this stays consistent."* This matters: Phase 5's
  "shared chart wrapper" should **generalize the existing SVG approach**, not introduce a charting
  library. See §5.
- **The map** uses a third CDN library, `svgMap` (StephanWagner/svgMap, loaded in
  `index.html:120-124`, wrapped by `src/Pages/Analytics/AnalyticsWorldMap.js`). Two *other* map
  libraries (`react-world-map`, `anychart`) are also loaded globally but are used by unrelated
  pages (CMP/Compliance/Dashboard, `src/Components/Charts/WorldMap` for a different, older map) —
  not in scope here, don't touch them.
- **Existing design tokens — already exist, already substantial.** `Analytics.css:1-40` has a
  `:root` block: `--sa-surface*`, `--sa-border`, `--sa-radius(-lg)`, `--sa-gap`,
  `--sa-shadow-panel`, `--sa-accent` (brand gold, RGB triplet), a 4-step gray text ladder
  (`--sa-text-dim/muted/secondary/text`), and 6 named hues (`--sa-c-green/blue/amber/purple/teal/
  red` + matching `--sa-bg-*`). A prior session (2026-10-20) already consolidated ~150 hardcoded
  gray/gold literals onto these tokens. **What's unfinished, confirmed by this audit:** the
  `--sa-c-*` hue tokens are defined but have ~0 real call sites (components still hardcode literal
  `rgba(...)` per chart); 22 of 38 page files still inline `style={{color:"rgba(...)"}}` instead of
  the token ladder; the actual red in use (`rgba(239,68,68,X)`) doesn't match the defined
  `--sa-c-red: #f87171`. **Phase 1 should extend this existing system, not replace it** — adding
  the 5-semantic-color layer (good/warn/bad/info/neutral) on top of what's there, reconciling the
  mismatched red, and finishing the inline-style sweep.
- **Mobile drawer, partially done already:** `SideNav.js:12-56` already has a working hamburger-
  drawer pattern (`mobileOpen` state, Escape-to-close, body-scroll-lock, a `matchMedia` listener)
  — but it switches at **769 px**, not the 1024 px Phase 3 asks for. Reuse this, just move the
  breakpoint and extend it to the icon rail.

---

## 1. Navigation — ✅ three systems confirmed, root mechanism for the overlay bug found

**Three nav layers, by file:**

| Layer | File | What it is |
|---|---|---|
| Icon rail | `src/Components/Header/Nav.js` | 5 icons (Overview/Audience/Acquisition/Behavior/Conversions) + Settings/Logout. Always mounted in "analytics" mode. |
| Grouped sidebar | `src/Components/Header/AnalyticsSideNav.js` → `SideNav.js`, links from `SideNavLinks/index.js`'s `buildAnalyticsLinks()` | ~25-27 links across 6 groups. Mounted next to the icon rail on every analytics sub-page *except* Overview (`isAnalyticsOverviewPath` check). |
| Horizontal tab strip | `AnalyticsSubNav` in `_shared.js:563+` | 11 tabs, Overview-only. |

A prior session's memory claims "Overview intentionally has no sidebar, mirrors GA's own snapshot
page" — true, but doesn't resolve your complaint: you're describing the **icon rail being
unlabeled** and **the tab strip clipping/hiding tabs**, both real regardless of whether the
no-sidebar-on-Overview decision itself was intentional.

**Icon rail is unlabeled by default — ✅ confirmed, and it's a keyboard-accessibility bug, not
just a visual one.** `Nav.js:54-56` renders `<span className="hiddenCollapsed">Overview</span>`
for every icon — the markup *has* labels. But `header.css:98-103`:
```css
.collapsed .hiddenCollapsed { opacity: 0; width: 0; visibility: hidden; }
```
and the only way to un-hide them (`header.css:105-111`) is `.sidebar:hover` or an `.expand` class
toggle — **hover only**. A keyboard user tabbing through these links never sees a label, ever. This
is the same mechanism Phase 3 needs to replace.

**Sidebar overlay-not-push — 🟡 root mechanism found, Marketing-specific trigger not confirmed.**
The grouped sidebar's actual link list (`SideNav.js:64-69`) renders `<nav className="collapsed
expand">` — reusing the **same `.collapsed` class** as the icon rail, which is unconditionally
`position: fixed` (`header.css:71-84`). A `position: fixed` element is removed from the page's
normal flow; it does **not** push flex/grid siblings regardless of its own width. The reason it
*looks* like it pushes content on most pages is coincidental: its parent `<aside className="sidebar
expand">` has `min-width: 231px` and **is** in normal flow (reserves 231px of space), and the fixed
nav's un-set `top`/`left` makes it render at its own original static-layout position, which happens
to coincide with that reserved space. This is fragile, not structural — any page whose own content
starts flush-left with little padding (exactly the "Channel Analytics" title bug: "Cha" clipped to
leave "nnel Analytics" is consistent with ~65-90px of overlap, roughly the icon rail's collapsed
width) will show the overlap. I did **not** reproduce this live — **verify at 1024/1280/1440 px
before Phase 3** rather than assume the exact trigger; the fix (replace `position:fixed` with a
true CSS Grid `grid-template-columns: [rail] [sidebar] [content]` layout, Phase 3's own framing)
resolves the root cause regardless of the precise Marketing-specific trigger.

**Page titles vs nav labels — ✅ confirmed exactly:**

| Page | Nav label (`SideNavLinks/index.js`) | Rendered title |
|---|---|---|
| Marketing | `"Marketing"` (line 132) | `StickyPageTitle title="Channel Analytics"` — `MarketingReport/index.js:2501` |
| Attribution | `"Attribution"` (line 140) | `StickyPageTitle title="Conversion Attribution"` — `ConversionAttribution.js:314` |
| Performance | `"Performance"` (line 177) | `StickyPageTitle title="Core Web Vitals"` — `Performance.js:1424` |

**Conversions' "third sub-nav" — not located in Phase 0.** I searched `Conversions.js`,
`ConversionsOverview.js`, `ConversionCampaigns.js`, `ConversionChannels.js`, `ConversionFunnel.js`,
`ConversionAttribution.js` for a tab-strip/ARIA-tablist pattern and found none — it may be rendered
conditionally (behind a data flag) or named differently than I searched for. **Needs a quick
live-page inspection at the start of Phase 3**, not a guess.

---

## 2. Grid and hierarchy — ✅ root cause of dead space found; overflow mechanism identified

**Dead space under charts, beside Live panel/Devices — ✅ confirmed, one-line root cause.**
`Analytics.css:1504-1526` defines all three Overview content rows:
```css
.sa-overview-main   { display: grid; grid-template-columns: 3fr 2fr; align-items: start; }
.sa-overview-geo    { display: grid; grid-template-columns: 2.2fr 2fr 1.5fr; align-items: start; }
.sa-overview-bottom { display: grid; grid-template-columns: 5fr 4fr; align-items: start; }
```
`align-items: start` is an explicit override of CSS Grid's default (`stretch`) — it tells every
card to size to its *own* content height and top-align, instead of stretching to the row's tallest
sibling. That is exactly "~300px dead space under the events chart beside the taller Live panel"
and "empty block beside Devices": whichever card in a row has less content just stops short, leaving
a visible gap where its card background should have continued. **Fix is a one-line change per row**
(`align-items: stretch`, the default) plus checking each card component allows `height: 100%`
inside a stretched grid cell — low-risk, exactly a "Phase 2 quick win."

**Overflow at ~1100px (Top pages, Form performance) — 🟡 plausible mechanism, not measured live.**
`.sa-overview-bottom`'s `5fr 4fr` split, combined with CSS Grid's default `min-width: auto` on grid
items, means a wide child (a data table that can't shrink below its content's natural width) can
force its track wider than the fr-ratio intends, overflowing the row. The fix pattern is well-known
(`min-width: 0` on the grid item + `overflow-x: auto` on the table's own wrapper — `Forms.js` already
does this in one place, `.sa-table-scroll` at `Forms.js:93`, which is the pattern to extend
everywhere) but I did not render the page at 1100px to confirm which specific table is the culprit.
**Verify live at 1024px before the Phase 2 fix.**

**Six equal KPI cards, no hierarchy — ✅ confirmed.** `Analytics.css:1362-1372`:
```css
.sa-kpi-strip     { display: grid; grid-template-columns: repeat(5, 1fr); }
.sa-kpi-strip--6  { grid-template-columns: repeat(6, 1fr); }
```
Every card gets identical column width regardless of importance — no "hero" metric, no secondary
tier. "Countries: 15" (`index.js:482-487`, `label: "Countries"`) is one of 8 selectable cards with
no distinction from Revenue/Consent rate/Sessions. This is a `KpiCard`/grid-system redesign
question for Phase 1 (define a hero + secondary tier), not a one-line fix — see §Phase roadmap.

**Floating Feedback button covers data — ✅ confirmed, not dev-gated.**
`BugReport.css:331-334`: `position: fixed; bottom: 20px; right: 80px; z-index: 9989` (note: the
code comment at `BugReport.js:266` says *"bottom-left, clear of DevTierSwitcher (bottom-right)"* —
the comment is stale; the actual CSS places it bottom-**right**). No `IS_DEV`/localhost gate exists
in this file (unlike the separately-confirmed `DevTierSwitcher`, which *is* properly gated) — this
bubble is visible to every real customer, at a high z-index, which is exactly why it sits on top of
whatever table/KPI happens to render in that bottom-right region on a short viewport.

**Sticky header + page header height — not measured.** Plausible given a sticky top bar
(`header.css`) stacked above each page's own `StickyPageTitle` row, but I have no px measurement to
confirm "~20% of viewport" specifically. **Measure live during Phase 3**, when compacting the
header into the single row the brief asks for.

---

## 3. Visual language

**Inconsistent bar colors per chart type — ✅ confirmed, root cause is "no semantic color
contract."** Spot-checked: `AnalyticsWorldMap.js:16-19` uses the brand gold
(`rgba(192,159,83,opacity)`) at varying opacity; other charts (devices, outbound, per earlier
screenshots) use ad-hoc literal hues with no shared rule for "what hue does this chart type get."
The `--sa-c-*` tokens exist precisely to solve this but have ~0 real adoption (see §0) — Phase 1
should assign **one fixed token per chart series role** (e.g., "the one bar-chart series color" vs.
"the multi-series legend palette" — the prior session's memory notes `CHANNEL_METRICS` in
`AdSpend.js` is a genuine 3-line-legend case that legitimately needs 3 distinct hues, not a
violation — don't flatten that to one color) and migrate call sites onto it.

**KPI left-border colors are decorative, not semantic — ✅ confirmed with exact mechanism for
both examples you gave.**
- *Consent rate, green border despite being below benchmark:* `index.js:475` —
  `variant={consentPct < 20 ? "warn" : "live"}` — a single hardcoded absolute threshold (20%),
  completely independent of `IndustryBenchmarkNote`'s benchmark comparison rendered just below it
  in the same card (`index.js:478`). A site at, say, 25% (above the 20% floor, but 13.7 points under
  its industry benchmark) gets the "healthy green" border and the "you're below benchmark" note in
  the same card, contradicting each other.
- *Bounce rate falling shown red:* `index.js:447` —
  `variant={bounceRate != null && bounceRate > 60 ? "warn" : "blue"}` is **also** a hardcoded
  absolute threshold, independent of the trend arrow next to it (`trend={trendBounce != null ?
  -trendBounce : undefined}` at line 448 — the sign-flip there is a separate, *correct* workaround
  so the trend arrow's color matches "falling bounce = good," confirmed via `pctChange()`
  at `_shared.js:290-294` and the trend-arrow CSS at `Analytics.css:796-797`). So: the border color
  and the trend arrow currently use **two unrelated rules** — an improving (falling) bounce rate
  that's still numerically above 60% shows a correctly-green "▲" trend arrow sitting inside a
  red/warn-bordered card. This is precisely "decorative, not semantic": the border threshold needs
  to become relative (vs. benchmark, vs. previous period) instead of an absolute magic number, and
  it needs to agree with whatever the trend arrow is already saying. This is exactly the problem
  Phase 1's "status color that can be inverted per metric" `KpiCard` prop is meant to solve.

**Map — ✅ confirmed: using a third-party library's untouched default skin, with no legend at
all.** `AnalyticsWorldMap.js` configures `svgMap` with per-country `color` values, but I found **no
override** anywhere in `src/Components/Charts/WorldMap/Style.css` (the stylesheet this component
reuses) for the library's own land-fill or zoom-button classes — meaning "near-white land" and
"bright white zoom buttons" are the **svgMap CDN library's own default light-theme CSS**
(`svgMap.min.css`, loaded in `index.html:121-124`), never themed for this dark dashboard. There is
genuinely no legend component — only a text caption (`AnalyticsWorldMap.js:101-105`). Whether the
color-opacity scale (`colorForShare()`, lines 16-19: gold at 0.16-0.9 opacity) visually reads as
"darker = more" or inverted **depends on svgMap's internal rendering, which I can't verify without
seeing it rendered** — flagging as 🟡, verify live before deciding whether the fix is "theme the
library's CSS + add a legend" (keep svgMap) or "replace with the ranked-list-by-default" approach
Phase 5 proposes (my recommendation, since it also directly fixes the ~430px-for-8-countries
complaint — a ranked list doesn't need that scroll real estate).

**Small, low-contrast grey-on-dark secondary text — ✅ confirmed with a concrete instance, and
confirmed as a known, partially-finished effort.** `Analytics.css:1198-1202`:
```css
.sa-map__caption { font-size: 0.72rem; color: rgba(var(--sa-text-muted),0.65); }
```
0.72rem ≈ 11.5px at a 16px root — **below the 13-14px minimum** this audit requires, and at 65%
opacity of an already-muted gray. This single instance is representative, not exhaustive: a prior
session's own notes (kept in this repo's memory, not re-verified line-by-line here) found "22 of 38
page files inline `style={{color:"rgba(...)"}}` instead of the token ladder," naming
`AnalyticsSettings.js` (44×), `Audience.js`, `ConversionAttribution.js` (11×), `Bots.js` (10×) as
the worst offenders. Phase 1 should include a systematic font-size *and* color audit (not just the
color-token sweep already half-done), since this map caption shows the two problems compound: an
inline-style color *and* a too-small font-size on the same element.

**Color alone for status — ✅ confirmed in three separate places, a real pattern, not a one-off.**
Beyond the KpiCard borders above:
- `index.js:1164-1167` — form completion rate: `rateColor` (red/amber/green) applied via
  `style={{color: rateColor}}` with no icon, no text label, on the raw percentage number.
- `Forms.js:108-117` — `FormsTable`'s own completion-rate and abandonment-rate columns use the
  identical pattern (separately defined, same three-tier red/amber/green, no icon/text).
- `index.js:1221` — the rage-click `MiniBar` uses a fixed red tint with no accompanying label
  beyond the number itself.

**Dark theme only — confirmed by omission.** No `prefers-color-scheme` media query or light-token
set exists anywhere in `Analytics.css`'s current `:root` block — Phase 7's light theme is starting
from zero, not from a half-finished toggle.

---

## 4. Charts and states — ✅ one root cause explains two of your four chart bugs

**The shared trend-chart component, and its blast radius.** `TrendLineChart.js` is not one page's
chart — it's imported by **`index.js` (Overview), `ReportView.js`, `ReportBuilder.js`, `Forms.js`,
and `SearchConsole.js`**. Any fix here benefits all five call sites at once; any bug here is already
live on all five.

**"Avg/day" divides by active days only — ✅ confirmed, root cause is the backing SQL, not the
chart math itself.** `TrendLineChart.js`: `insights.avg = total / series.length`. `series` is
whatever `daily`-shaped array the caller passes in. Traced the Overview's own feed,
`api/analytics-report.js:232-241`:
```sql
SELECT TO_CHAR(DATE_TRUNC('day', received_at ...), 'YYYY-MM-DD') AS date, ...
FROM analytics_events WHERE ... GROUP BY 1 ORDER BY 1
```
— a plain `GROUP BY` with **no zero-fill join against a full date range** (no
`generate_series(fromDate, toDate, '1 day')`). A day with zero events simply doesn't produce a row.
So `series.length` is "days that had ≥1 event," not "days in the requested range" — exactly your
"9 conversions / 3 active days = 3, should be 9/30 = 0.3" example. **Per the ground rules, I will
not touch this SQL** (no metric/query changes) — the correct fix is presentation-layer: reindex the
series against the full requested date range (inserting explicit zeros for missing days) **in the
frontend**, before computing `avg` or plotting anything. This is a `TrendLineChart.js`-level fix
that benefits all 5 consumers identically.

**Sparse data drawn as a connected line — ✅ same root cause.** The same missing-zero-fill means a
period with 3 non-zero days produces a 3-point `series` array; `TrendLineChart.js`'s line/area path
(`smoothPath`-less direct `M...L...L` SVG path, lines ~19-33) connects those 3 points evenly spaced
across the x-axis as if they were consecutive days, when they're actually scattered across up to 30
calendar days. The same frontend reindex-with-zeros fix (done once, in the shared component) fixes
this and the avg/day bug together — then the chart type can switch from a connected line to bars
(Phase 2/5 ask) without needing any further data change.

**Y-axis ticks skip values — ✅ confirmed in the same file.** `TrendLineChart.js`:
```js
const yTicks = [0, 0.25, 0.5, 0.75, 1].map(f => Math.round(maxVal * f));
```
For a small `maxVal` (e.g. 5), independently rounding each fraction produces non-uniform steps —
e.g. `maxVal=5` → `[0, 1, 3, 4, 5]` (skips 2), matching the spirit of your "5,4,3,1,0" example
exactly (duplicate-prone, uneven steps from naive fractional rounding rather than a proper
"nice tick" algorithm). Needs a real tick-generation algorithm (round to a sensible step size first,
then derive ticks from the step — standard chart-library behavior) in the shared chart wrapper.

**Raw ISO date labels / garbled axis labels — 🟡 plausible, not pinned to a specific line.** I
didn't find an obvious "ISO string piped directly into a label" in `TrendLineChart.js` itself (its
x-axis uses `(series[i].date||"").slice(5)`, which assumes a `"YYYY-MM-DD"` input and would produce
garbage — not a raw ISO *timestamp* — if a consumer ever passes a full timestamp instead of a plain
date string). The exact "09-27T00:00:00.000Z" symptom you saw is more likely in `Performance.js`'s
`BandLineChart` (a separate, bespoke chart for p50/p75/p90 bands — I confirmed its *y*-axis
`fmtY()` already got fixed for locale in an earlier session, but did not trace its *x*-axis label
logic in this pass) or in a Forms/SearchConsole-specific chart. **Needs a direct code read of each
remaining chart's x-axis label logic during Phase 5 implementation** — flagging honestly rather than
guessing which exact line produces it.

**"Loading…" with no skeleton — partially contradicted by what already exists.** `index.js`
already has three *local* skeleton components (`KpiCardSkeleton`, `PanelSkeletonShell`,
`OverviewSkeleton`, lines 744-786) and `_shared.js` exports a reusable `PanelSkeleton`
(line 434) — so Overview itself is **not** the bare-"Loading…" page. The bare-text version you saw
is most likely one of the ~20 *other* Analytics pages that never adopted either skeleton — I did
not individually grep all 38 files for literal `"Loading…"` strings in this pass (my two background
sub-agents assigned to this specific check both failed on an API usage-limit error before
returning results — see note below). **Needs a repo-wide grep (`grep -rn "Loading…" src/Pages/
Analytics/`) as the very first step of Phase 2**, not re-derived here.

**Forms.js "Unique forms: 2" vs. table showing 4 — ❓ investigated, no static explanation found.**
Traced both numbers to their source: the KPI
(`Forms.js:785-786`, `value={(data.forms?.length ?? 0)...}`) and the table
(`Forms.js:807`, `<FormsTable forms={data.forms} .../>`, which maps `forms.map(f => ...)` 1:1 into
rows) **read the identical, unsliced `data.forms` array in the same render** — there is no code
path in this file where those two counts could statically differ. Two explanations survive: (a) the
discrepancy originates server-side (e.g. the forms-report endpoint computes `data.forms` via a
`GROUP BY` that collapses to 2 distinct keys while some *other* representation produces 4 — I did
not read that endpoint's SQL in this pass), or (b) the live screenshot captured a stale/transitional
state (e.g. a date-range or domain change mid-fetch). **This needs a live network-response capture,
not a guess** — I'm flagging it as genuinely unresolved rather than inventing a plausible-sounding
but unverified cause, consistent with how this repo's other audits have handled open questions.

**Element names shown as raw selector/class strings — ✅ confirmed in two places, worse in one than
the other.**
- `index.js:1211-1218` (Overview's "Frustration signals" rage-click table): the "Element" column
  renders `{s.selector}` **verbatim** — whatever raw CSS selector the tracker captured (e.g.
  `button.btn.btn-primary.text-sm`), no text content shown in that column at all (element text, if
  captured, isn't rendered here — only `elementId`/`elementClass` in a separate "ID / Class"
  column). This is the worst instance — matches your "shown as Tailwind class strings" complaint
  exactly, with no human label anywhere in the row.
- `Heatmap.js:305-327` ("Top clicked elements"): already **better** than the above — it has a
  separate `<code>{tag}{#id}{.class}</code>` column *and* a dedicated "Text" column
  (`el.text || "—"`). The raw selector is still shown (so a Tailwind-heavy class list still renders
  verbatim inside the `<code>` block), but at least the human-readable text exists alongside it.
  The fix here is smaller: de-emphasize/relocate the raw selector (tooltip or secondary line) and
  make the readable "Text: '...' on page" combination the primary label, per your example format.

*Note on this section's process:* two Explore sub-agents were dispatched in parallel specifically to
verify the chart-tick/ISO-label bugs and the Forms/element-name bugs with fresh eyes; both failed
before returning results (hit this session's API usage limit). Everything in §4 above was therefore
re-derived directly by me, by hand, after those failures — it is not copied from an agent report.
I'm calling this out so you know the ISO-label and "Loading…" gaps above are real gaps in verification
effort, not findings that were silently dropped.

---

## 5. Data dependencies (per your ground rule — nothing fabricated, nothing hardcoded)

Scanning the brief's Phase 4 Executive Overview spec against what the existing endpoints
(`api/analytics-report.js`, `api/analytics-property-report.js`) already return:

| Needed for Executive Overview | Exists today? | Where |
|---|---|---|
| Measured sessions | ✅ | `data.totals.uniqueSessions` |
| **Estimated** visitors (vs. measured) | ❌ not available | No estimation model exists anywhere in this codebase. Must render `EmptyState` with `needs: visitor-estimation model` — do not invent a multiplier. |
| Leads (unified count) | ✅ (as of Phase 1 item 5 of the prior analytics audit) | `data.conversions` summed, or `data.totals.convertedSessions` for the session-deduped view — see `docs/analytics-audit-plan.md` item 5 and Phase 2 item 1 |
| Lead conversion rate | ✅ | `data.totals.conversionRate` |
| Consent rate vs. benchmark | ✅ | `data.totals.consentRate` + `data.industryBenchmark`, already rendered via `IndustryBenchmarkNote` |
| "Where leads come from" (channel funnel) | ✅ | `data.conversionsByChannel` / `lastTouchByChannelRes` (used elsewhere already) |
| "What they read" | ✅ | `data.topPages` |
| "Where we lose them" (funnel) | 🟡 partial | `ConversionFunnel.js` exists as a page — needs checking whether its data shape generalizes to a compact Overview panel, not re-derived in Phase 0 |
| Headline sentence inputs | ✅ (all of the above) | Pure presentation — generate from already-fetched totals |
| "Needs attention" insights | ✅ existing sources | Alerts (`Alerts.js`/`api/ad-alerts.js` family), Digest, and Marketing's own `InsightCard`-style cards (`MarketingReconciliationPanel.js`, per the earlier analytics audit's notes) |

**The one real, flagged gap: "estimated visits."** Nothing in this codebase computes an estimate
distinct from measured/consented sessions. Per your ground rule, Phase 4 will render this specific
KPI as an `EmptyState` ("needs: visitor-estimation model") rather than inventing a multiplier —
flag this to me explicitly if you have a specific estimation method in mind (e.g. a known
consent-rate-based extrapolation), otherwise it stays empty.

---

## Proposed approach, phase by phase

Mapping your Phase 1-7 structure onto what Phase 0 found, with the corrections above baked in:

**Phase 1 (tokens + shared components):** Extend the *existing* `:root` token block in
`Analytics.css` rather than replacing it — add the 5 semantic colors (good/warn/bad/info/neutral)
as a new layer that maps onto (and reconciles) the already-defined but unused `--sa-c-*` hues, fix
the red mismatch, and add one dedicated "chart series" token separate from `--sa-accent` (so the
brand gold stays reserved for buttons/links, per your ask, instead of also being the map/chart
color it currently is). Build the new shared components (`InsightCard`, `DataTable`, `StatusBadge`,
`EmptyState`, `ErrorState`, `PageHeader`) fresh; **promote** the already-existing
`PanelSkeleton`/`KpiCardSkeleton`/`OverviewSkeleton` out of `index.js` into `_shared.js` rather than
rewriting them; **extend** `KpiCard` in place (it already supports `trend`/`variant`/`sub`/
`children` — add the explicit comparison text, sparkline slot, badge slot, and the per-metric
invertible-status prop your spec asks for). Also build the new **`MetricTabStrip`** component here
(a thin wrapper around `KpiCard`'s value/delta rendering, laid out as selectable tabs instead of a
grid) — it's the KPI half of the GA4-style hero composite from the Decisions section, and Phase 4
pairs it with the Phase 5 chart component.

**Phase 2 (quick wins):** The dead-space fix is a true one-liner (`align-items: stretch` on 3 CSS
rules). The Feedback button move, bar-color unification, and "Unique forms"/avg-day/ISO-label fixes
are per-file but small. I'd sequence Phase 2 as: (1) the `align-items` fix + BugReport relocation
first (lowest risk, highest visible impact), (2) the Forms/element-name/"Loading…" sweep (needs the
live greps and the one backend read flagged above), (3) bar-color + map-legend fixes (needs the
Phase 1 token layer to exist first, so sequence after token work lands even though it's
numbered "Phase 2").

**Phase 3 (navigation):** Replace the `position: fixed` icon-rail/sidebar with a true CSS Grid
(`grid-template-columns`) layout — this is the actual fix for "overlay instead of push," not a
per-page patch. Reuse `SideNav.js`'s existing mobile-drawer logic, just retarget its breakpoint from
769px to 1024px and extend it to cover the icon rail too. Locate the Conversions sub-nav live before
touching it (not found in Phase 0 static search).

**Phase 4 (Overview + view switch):** Data-dependency table above — only "estimated visitors" is a
real gap, handled via `EmptyState` as instructed. The Executive Overview's hero section is the
`MetricTabStrip` + `Chart` composite from the Decisions section — build it once here, since it's
Overview-specific, even though `Chart` itself (Phase 5) is used standalone elsewhere too (tables/
trend panels on other pages that don't need the tab-selector wrapper).

**Phase 5 (charts) — one shared `Chart` component, built from the GA4 reference.** Replaces
`TrendLineChart.js` (already the shared component for 5 consumers: Overview, ReportView,
ReportBuilder, Forms, SearchConsole), `BandLineChart` (`Performance.js`), `AreaChart` (`index.js`),
and `GoogleAnalyticsChart.js`. One component, one `mode` prop (`line`/`bar`/`band`), covering: the
date-range zero-fill reindex (fixes both the avg/day bug and sparse-line-as-connected-line in one
place), a proper tick-generation function (evenly spaced, no skipped values), formatted date-axis
labels grouped at sensible boundaries (not every day, not raw ISO strings), a dashed previous-period
overlay line, dot markers at real data points, a bottom-left legend, tooltips, and aria-labels. This
is the highest-risk, highest-leverage Phase — every consumer needs re-verifying against real data
after the swap, not just a visual diff. Map: keep svgMap, re-theme its land fill/zoom buttons, add a
real legend component, and default Overview's geography panel to the ranked list with svgMap behind
a new toggle built in this phase (see Decisions §2 — no existing toggle to reuse, corrected from my
first draft).

**Phase 6 (rollout):** Mechanical once Phases 1-5 exist; sequence by traffic/complaint priority
(Overview → Conversions/Forms → the rest), matching how the earlier analytics-metrics audit
sequenced its own 12 items.

**Phase 7 (light theme + print):** Starting from zero (no existing light tokens or
`prefers-color-scheme` handling) — straightforward once Phase 1's token layer is real CSS variables
end to end (it already is).

---

## Decisions (resolved 2026-10-27)

1. **Chart consolidation — one shared component, not utilities-only.** All chart rendering
   (`TrendLineChart.js`, `BandLineChart` in `Performance.js`, `AreaChart` in `index.js`,
   `GoogleAnalyticsChart.js`) gets rewritten onto a single shared chart component. It needs a
   `mode` prop (at minimum: `line` for a single metric with a dashed previous-period overlay, `bar`
   for zero-filled sparse series, `band` for the p50/p75/p90 percentile case) so one component's
   axis/tick/date/legend/tooltip code serves every current use, rather than one-off chart files each
   reinventing the same axis logic. This is a bigger diff than the utilities-only option but is what
   you asked for — see the dedicated chart-component spec below, built directly from the GA4
   reference screenshot.
2. **Map — keep svgMap, fix its theming, don't replace it.** Re-theme the land fill and zoom
   buttons to match the dark dashboard, add a real legend component, and verify/fix the color-scale
   direction (currently opacity-based gold over the library's unstyled base — needs a live check,
   see §3 above). The original brief's "ranked list by default, map as the kept option" framing
   still applies: Overview's *default* geography view is the ranked list (also fixes the
   ~430px-for-8-countries height complaint), with svgMap available via a new toggle built in Phase 5.
   **Correction to my first draft of this section:** I initially pointed to `.sa-map__mode-toggle`
   (`Analytics.css:2806-2830`) as an existing map/list toggle to reuse — checked its actual usage
   just now and it isn't that at all. It's used once, in `ConversionsOverview.js:306-321`, as a
   "Rate vs. Volume" *weighting* switch for the same svgMap (two metrics to color the same map by),
   not a map-vs-list view switcher. No such toggle exists yet anywhere in the codebase; Phase 5
   builds one from scratch. Flagging the correction so this wrong claim doesn't get relied on later.
3. **KPI hierarchy — model on Google Analytics' own Reports Snapshot pattern** (your reference
   screenshot). This is a specific, well-defined pattern, not a generic "make a hero card" idea:
   - A row of **clickable metric tabs** (GA shows 4: Active users / Event count / Bounce rate / Key
     events), each displaying its big number and a small delta-with-arrow underneath. Selecting a
     tab drives **one shared chart below it** — there's no separate grid of 6 disconnected KPI
     cards sitting above an unrelated chart; the KPI *is* the chart's input selector.
   - The chart itself: solid line for the current period, **dashed line for the previous period**
     (both visible simultaneously, not a toggle), circular dot markers at real data points, evenly
     spaced y-axis ticks on the right edge, clean formatted x-axis date labels grouped at month
     boundaries ("27 Sept", "04 Oct", "11", "18", "25" — not every single day labeled), and a
     bottom-left legend naming the two lines.
   - **One deliberate deviation from the screenshot, flagging it so it's not silently copied:** GA4's
     own UI colors every delta arrow green-for-up/red-for-down with no per-metric inversion — in
     the screenshot, "Bounce rate ↑8.1%" renders in green even though a rising bounce rate is bad.
     That's the exact decorative-not-semantic problem your original brief asked me to fix
     ("down = good for bounce rate" must invert). I'll copy GA4's *layout and interaction pattern*
     (tabs driving one chart, dashed previous-period line, tick/date formatting) but **keep our own
     correct inversion logic** in the tab's delta color, not GA4's. Flag if you actually want literal
     parity with GA4's behavior here instead — my default is "fix the thing we already know is
     wrong," not "copy it faithfully."
   - This composite (metric-tab-strip + one chart) becomes the hero of Phase 4's Executive
     Overview — it directly satisfies that phase's "4 KPIs" + "Visitors vs Leads daily bars with
     dashed previous-period line" requirements in one coherent widget, rather than two separate,
     disconnected pieces. The existing `KpiCard` component stays in use elsewhere (secondary panels,
     other pages' metric grids where no chart-binding is needed) — this doesn't replace it
     everywhere, just supersedes the flat 6-up grid for the Overview hero specifically.
4. **Estimated visitors — stays an `EmptyState`.** No estimation method specified; nothing
   invented. Revisit if you later have a specific method in mind.
5. **Conversions' third sub-nav** — still not located in static search; I'll find it live at the
   start of Phase 3.

**Screenshots:** none captured yet — Phase 0 is read-only investigation only, no page was rendered.
Before/after screenshots at 1024/1280/1440px start with Phase 2's first real commit, per your ground
rules, saved to `/docs/design-screenshots/`.

---

## Phase 1 progress

### 1. Design tokens — done

Extended `Analytics.css`'s existing `:root` block (not replaced) with: 5 semantic status colors
(`--sa-good/warn/bad/info/neutral`), one chart-series color (`--sa-chart-primary`, separate from
`--sa-accent` so gold stays button/link-only), an 8px spacing scale (`--sa-space-1` through `-8`), a
type scale with a 13px floor (`--sa-font-xs` through `-2xl`), and two new radii (`--sa-radius-sm`,
`--sa-radius-full`, for chips/pills — the existing `--sa-radius`/`-lg` are untouched, panels/cards
keep their current size).

**Reconciled, not just added:** found 3 different "warn/bad" reds simultaneously live
(`.sa-kpi--warn`'s border at `248,113,113`, that same variant's *value text* color at `252,165,55`
— actually amber, a separate mismatch I hadn't caught in Phase 0 — and a third red, `239,68,68`,
used for completion-rate thresholds in `Forms.js`/`index.js`). `--sa-bad` adopts the first
(already the most "tokenized" of the three) as the one canonical value going forward; reconciling
the other two call sites is Phase 6 rollout work, not this commit.

**Purely additive — verified, not just asserted:** diffed the stylesheet (69 lines added, 0
removed, 0 modified) and confirmed brace-balance before/after. Nothing in the existing CSS
consumes these new variables yet, so no page's rendered output changes. **No before/after
screenshots for this commit** — there is nothing to diff visually; screenshots resume once a
component or page actually consumes these tokens.

### 2. EmptyState + ErrorState — done

New `src/Pages/Analytics/components/EmptyState.js` and `ErrorState.js`. Visually based on the
existing `.sa-notice`/`.sa-notice--error` pattern (14.4px text, same padding/radius/border — already
used at 31 call sites across the section) rather than inventing a new look, extended with an icon,
optional title, and an optional action/retry button. `EmptyState` has a dedicated `dependency` prop
for the ground rules' "needs: `<dependency>`" case — Phase 4's visitor-estimation gap renders
through this. `role="status"` (EmptyState, polite) vs. `role="alert"` (ErrorState, assertive) per
the accessibility ask.

**Reconciled a 4th stray red found while building this:** `.sa-notice--error` hardcoded its own
one-off error color (`rgba(220,80,80,X)` / `#f5aeae`) that matched none of the three reds already
reconciled in the tokens commit. `ErrorState` uses `--sa-bad` instead — `.sa-notice--error` itself
is untouched (still used at its existing call sites; retiring those in favor of `ErrorState` is
Phase 6 rollout work).

**No test added, deliberately** — both components are pure conditional JSX with no calculation or
branching logic worth pinning (unlike, e.g., `formatCurrency`/`formatCount` from the metrics audit,
which had real edge cases). Verified via babel syntax check only.

**No before/after screenshots** — neither component is wired into any page yet, so nothing renders
differently. Screenshots start once a real page adopts one of these (Phase 2/6).

### 3. Skeleton — done, promoted + a real latent CSS bug fixed along the way

New `src/Pages/Analytics/components/Skeleton.js`: `SkeletonBlock` (the base shimmer rectangle,
replacing the ad-hoc `<span className="sa-skeleton" style={{width,height}} />` pattern typed out at
each call site), `SkeletonRows` (promoted from `_shared.js`'s old `PanelSkeleton` export — renamed,
see below), `KpiCardSkeleton` and `PanelSkeleton` (promoted from `index.js`'s local
`KpiCardSkeleton`/`PanelSkeletonShell`). `index.js`'s page-specific `OverviewSkeleton` composition
stays in `index.js` (it hardcodes Overview's exact `.sa-overview-main`/`.sa-overview-geo` grid shape
— not generic enough to promote) but now imports the generic pieces instead of defining them
locally, and its raw inline `.sa-skeleton` spans were swapped for `SkeletonBlock`.

**Naming fix, not just a move:** `_shared.js` and `index.js` each had a thing called
`PanelSkeleton`/`PanelSkeletonShell` meaning two *different* amounts of markup (rows-only vs. a full
panel with a title) — confusing if you only saw the import, not the implementation. Renamed the
rows-only one to `SkeletonRows`; `PanelSkeleton` now consistently means "a whole panel." Updated
both real consumers (`Audience.js`, `index.js`) directly rather than keeping a compatibility
re-export — only 2 call sites existed, confirmed via a repo-wide grep before touching anything.

**Found and fixed a real latent bug while building this, unrelated to the promotion itself:**
`Analytics.css` had **two different `@keyframes sa-shimmer` rules** (lines ~1799 and ~6524) animating
in *opposite directions* with different durations (1.5s vs. 1.6s). CSS doesn't merge same-named
`@keyframes` — the later one in source order silently wins for every usage, meaning `.sa-skeleton`'s
own shimmer (the one this component now formalizes) was actually running the *other* rule's timing,
not its own, this whole time. Renamed the second one (`Performance.js`'s thumbnail-loading shimmer,
genuinely different timing, not a true duplicate) to `sa-shimmer-perf-thumb` and repointed its one
call site — both animations now run their own, correct, intended timing.

**Screenshots:** skipped, deliberately, with a reason — not just "didn't bother." Every visual
change in this commit is one of: (a) componentized but pixel-identical (same class names, same
computed widths/heights preserved exactly — `Audience.js`, `OverviewSkeleton`), or (b) a sub-second
loading-flash state that only exists for the duration of an initial data fetch, or (c) an animation
*timing* difference (the shimmer-direction fix) that a static screenshot cannot represent at all. A
screenshot diff here would show nothing, or at best mislead by implying nothing changed when an
animation nuance genuinely did. Verified via babel syntax check + the full `npm test` suite (94/94,
unchanged) instead.

### 4. StatusBadge — done

New `src/Pages/Analytics/components/StatusBadge.js`. Exists specifically to satisfy the "never use
color alone for status" accessibility rule: a text label is always rendered (falls back to the
status word itself if none is passed, so a careless call site can't end up color-only by accident),
and every status but `neutral` gets a default icon too. Added 3 small new icons to `Icons.js`
(`IconCheckCircle`, `IconXCircle`, `IconInfoCircle`, matching the existing icon set's exact style —
`IconAlertTriangle` already existed and covers `warn`). Styled with the Phase 1 semantic tokens
(`--sa-good/warn/bad/info/neutral`) and the new pill radius (`--sa-radius-full`).

**No before/after screenshots** — not wired into any page yet.

### 5. DataTable — done

New `src/Pages/Analytics/components/DataTable.js`. Config-driven (`columns`/`rows`/`getRowKey`),
with built-in loading (via the Phase 1 `SkeletonRows`) and empty (via `EmptyState`) states, so
callers don't hand-roll the "loading vs. empty vs. data" branch every time the way the ~20 existing
`.sa-table` call sites currently do. `scope="col"` on headers (a baseline a11y improvement the
hand-rolled tables generally lack). New `.sa-data-table` CSS class rather than extending the
existing `.sa-table` (used at 20+ call sites at font sizes already below the 13px floor — see Phase
0) — this component gets the type scale right from day one; retrofitting `.sa-table` itself is
Phase 6 rollout work.

**Directly implements a Phase 0 fix:** the scroll wrapper (`min-width: 0` + `overflow-x: auto`,
matching the existing `.sa-table-scroll` pattern already used once in `Forms.js`) is the exact fix
Phase 0 proposed for the "Top pages/Form performance overflow at ~1100px" finding — a wide table
dropped into a CSS Grid cell can't force its column track wider than the grid intends once the cell
itself can shrink and the table scrolls internally instead.

**No before/after screenshots** — not wired into any page yet.

### 6. PageHeader — done, deliberately scoped narrower than it could be

New `src/Pages/Analytics/components/PageHeader.js`. Built for Phase 3's "compact the sticky header
(single row: title, date range, compare toggle, view switch)" requirement — a single flex row with
slots for title/subtitle, an optional view switch (the Phase 4 Executive/Marketing/Analyst
selector), and a `dateRange`/`actions` controls group.

**Scope decision worth flagging:** this is *not* a replacement for `src/Components/Header/Sticky/
index.js` (`StickyPageTitle`) — discovered while building this that `StickyPageTitle` is shared
across the whole app (CMP pages too, not just Analytics), has scroll-driven sticky behavior wired
via a raw `window.addEventListener("scroll", ...)` call **registered on every render with no
cleanup** (a real bug, not touched here — fixing app-wide shared chrome is outside an Analytics
visual redesign's blast radius), and owns the actual date-range picker UI
(`src/Components/Filter/index.js`). Redesigning that component is a bigger, cross-cutting change
than this audit's scope. `PageHeader` is a parallel, Analytics-only layout shell instead — it
accepts an already-built date-range control as a prop rather than reimplementing picker logic.
Wiring real Analytics pages onto `PageHeader` in place of `StickyPageTitle` is Phase 3/6 rollout
work, not this commit.

**No before/after screenshots** — not wired into any page yet.

### 7. ChartCard — done

New `src/Pages/Analytics/components/ChartCard.js`. Handles the loading/error/empty states every
chart needs (reusing the Phase 1 `SkeletonBlock`/`ErrorState`/`EmptyState`), so Phase 5's actual
`Chart` component only has to handle the "there is real data" case. Title row with optional
badge/subtitle, and a bottom legend slot matching the GA4 reference's bottom-left legend convention
(Decisions §3). New `.sa-chart-card` CSS class, visually based on the existing `.sa-chart-section`
(same background/border/radius/shadow) — not a visual redesign, just the new state-aware wrapper.

**No before/after screenshots** — not wired into any page yet.

Not yet committed — see commit message for exact diff once pushed.
