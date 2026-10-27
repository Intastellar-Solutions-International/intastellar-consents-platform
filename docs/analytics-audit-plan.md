# Analytics Dashboard Audit — Phase 0 Plan (read-only)

Site under audit: **asasoftware.aero** (`site_id = E3CweNqknYJrz7NK`, `organisation_id = 1`),
window **2026-09-27 → 2026-10-27**.

**Methodology:** full read of the tracker (`api/a.js`), ingestion, every dashboard tab's backing
API, and the schema, cross-checked against **live read-only SQL queries against the production
Postgres DB** (credentials already present in this checkout's `.env.local` as `POSTGRES_URL` — no
new access was requested or granted; I only ran `SELECT`s, nothing was written or deleted). This
resolves two of the "needs live data" gaps noted mid-investigation and overturns one hypothesis
(item 8) with hard evidence. No application code was changed — this document and the queries used
to write it are the only output of Phase 0.

Legend: ✅ confirmed (code + live data) · 🟢 confirmed (code only, data consistent) · 🟡 partially
confirmed / genuinely open question · ❌ refuted

---

## 1. Iframe inflation — ✅ confirmed, with exact numbers

**Where:** tracker `EMBED_SCRIPT` in `api/a.js:506-1137`; ingestion `api/a.js:1965-2400`.

**Code:** no iframe/embedded-context detection exists anywhere — no `window !== window.top`, no
`frameElement`, no parent-origin check. `sendMinimal`/`sendFull` (`api/a.js:1078-1110`) fire
identically whether the script runs top-level or inside a hidden/preloaded iframe. `getHost()`
(`:712`) reports `location.hostname`, so a booking widget served from `book.asasoftware.aero`
reports full pageviews under that host, indistinguishable from a real visit.

**Live data (30-day window):**
| page_host | events |
|---|---|
| `book.asasoftware.aero` | **6,927** |
| `www.asasoftware.aero` | 2,455 |
| `asasoftware.aero` | 222 |
| (13 other subdomains) | ≤51 each |
| **Total** | **9,838** (7,154 minimal + 2,684 full) |

6,927 / 9,838 = **70.4%** — matches the brief's "~70% (6,925 of ~9,800)" almost exactly. All
3,360 pageviews for `/request-free-trial` are logged under `page_host = book.asasoftware.aero`
(zero under `www.asasoftware.aero`), confirming the widget is what's firing them, not real
visitors landing on that path. `form_started` for `free-trial-request-form` = **8** — an exact
match for the brief's "8 form starts."

Not caught by the foreign-domain gate (item 4) because `book.asasoftware.aero` is a *subdomain* of
`asasoftware.aero`; `isForeignDomain` (`api/a.js:2039-2044`, `normHost.endsWith("."+normSite)`)
returns `false` for it, so it's treated as same-site traffic, not foreign.

**Fix approach:**
- Add `window.top !== window.self` to the embed script (wrapped in `try/catch`, defaulting to
  `true` on a cross-origin throw, since a cross-origin iframe can't read `top.location` but *can*
  still observe `self !== top`). Send as `emb:1` on every event.
- Add `is_embedded BOOLEAN DEFAULT false` to `analytics_events` and `analytics_custom_events`
  (additive migration, never backfilled — old rows stay `false`/unknown by definition, which is
  correct: we can't retroactively know).
- Exclude `is_embedded = true` from pageview/session/bounce/time-on-page aggregates by default,
  behind a query flag (e.g. `?includeEmbedded=1`) so before/after is directly comparable in the UI.
- A genuine "visitor opened the widget" interaction should still count — only the preload noise is
  excluded.

**Tests:** unit test for the detection snippet (top-level / same-origin iframe / cross-origin
iframe-throws cases); query test asserting `is_embedded` rows are excluded by default and included
under the flag.

---

### Status: implemented, not yet deployed (2026-10-27)

Shipped in this commit:
- `api/a.js`: `is_embedded BOOLEAN NOT NULL DEFAULT false` added to `analytics_events` and
  `analytics_custom_events` (additive migration, never backfilled — every existing row stays
  `false`, which is correct: we can't know retroactively). Tracker now computes
  `isEmbedded()`/`window.top!==window.self` once per pageload and sends it as `emb` on every
  `sendMinimal`/`sendFull`/`track()` payload; the ingest handler stores it on both pageview inserts
  and the custom-event insert.
- `api/analytics-report.js`: every `analytics_events`-based query (totals, daily trend, top pages,
  countries/devices/browsers/OS/screens/languages/timezones, referrers, consent breakdown, engaged
  users, lead quality, per-page bounce/exit/time-on-page, new-vs-returning) now excludes
  `is_embedded = true` rows by default; `?includeEmbedded=1` opts back in. Deliberately **not**
  applied to the Hosts breakdown (kept as the one table that still shows raw per-host volume for
  diagnosing exactly this kind of issue) or to any `analytics_custom_events` query (conversions are
  item 5's scope — a genuine interaction inside the widget should still count).
- `api/analytics-live.js`: the same default exclusion applied to the Live View's totals, per-minute
  trend, top pages, and recent-activity feed (the exact panel the brief's "fire in the same second
  repeatedly" symptom describes); Hosts and the tracker-mismatch diagnostic left unfiltered for the
  same reason as above.
- Tests: `test/tracker-embedded.test.mjs` (extracts and runs the real `isEmbedded()` source from
  `api/a.js` in a mocked `vm` context — top-level / same-origin iframe / cross-origin-throws cases)
  and `test/analytics-report-embed-filter.test.mjs` (the `embeddedClause()` toggle). `npm test`
  passes (5/5).

**Test infrastructure note:** this environment's active local Node is **v16.20.2**, which predates
the built-in `node:test` runner (Node 18+) — no `.nvmrc`/`engines` field pins this project to 16,
so it's likely just this machine's stale nvm default rather than a real constraint, but changing it
is a bigger call than this commit should make alone. Used a ~30-line dependency-free `test/`
harness instead (plain `node:assert`, zero new packages) so testing isn't blocked either way — swap
it for `node:test`/Jest/Vitest later without rewriting the test files themselves. Still open
question 6 from above; flagging the concrete reason now that I've hit it.

**Before/after numbers — honest status, not yet available.** Per the ground rules, `is_embedded` is
never backfilled onto existing rows, and the fix is query-time/ingestion-time only — so there is
currently **zero** difference in any number until (a) this deploys and (b) real traffic flows
through the updated tracker, which alone can set `emb:1` on a new event. The **before** figure
stays what Phase 0 already measured live: `book.asasoftware.aero` = 6,927 of 9,838 events (70.4%)
over the audit's 30-day window. I did not run the schema migration or deploy against production
myself — `ensureTables()` applies it automatically and idempotently on the first request after
deploy, the same way every other column in this schema has been added. Once deployed, re-running
the same read-only queries after a day or two of traffic (same method as Phase 0) will give a real
**after** number; I'll record it here then rather than estimate it now.

---

## 2. Self-referrals — ✅ confirmed, with exact numbers

**Where:** referrer/channel classification duplicated in `api/analytics-report.js:121-137`,
`api/analytics-report-detail.js:118-122`, `api/analytics-property-report.js:309-310`,
`api/analytics-user-flow.js:239-277`, `api/_scheduled-report.js:93`. None compare `referrer_host`
against the site's own domain/subdomains.

**Live data — top referrer_host, 30-day window:**
| referrer_host | count |
|---|---|
| `www.asasoftware.aero` | **4,395** |
| `asasoftware.aero` | **1,172** |
| `new.asasoftware.aero` | **1,134** |
| `www.google.com` | 400 |
| `de.search.yahoo.com` | 278 |

The top 3 referrers — exactly the ones named in the brief — are all the site's own domains,
**6,701 events** currently misclassified as `"referral"` instead of direct/internal navigation.

A related mechanism already exists for a different purpose: the embed script fetches
`approvedDomains` from `api/analytics-site-config.js` (sourced from `analytics_foreign_domains`)
to stop *outbound-click* events firing for the operator's own other domains
(`api/a.js:783-798`). That list is the right shape to reuse here but isn't consulted by any
referrer/channel query today.

**Fix approach:** one shared `isSelfReferral(referrerHost, siteDomain, approvedDomains)`
SQL expression/CTE (own domain + `www.` + registered subdomains + approved cross-site domains),
reused everywhere referrer/channel bucketing happens. Self-referral traffic folds into `"direct"`,
never dropped from `analytics_events`.

**Tests:** one test per query file — a session whose only referrer is the site's own domain (with
and without `www.`) classifies as direct, not referral.

---

### Status: implemented, live (2026-10-27)

Shipped: a new shared `api/_self-referral.js` (`selfReferralClause()` + `getApprovedDomains()` /
`getApprovedDomainsForSites()`), reused by all 5 locations named above —
`api/analytics-report.js` (channel segmentation + referrers table + last-touch-by-channel),
`api/analytics-report-detail.js` (same two patterns), `api/_scheduled-report.js` (the weekly/
monthly emailed referrers table), `api/analytics-user-flow.js` (first-touch `channel_label`,
4 occurrences), and `api/analytics-property-report.js` (the multi-site portfolio rollup — combines
every site's own domain + every site's approved domains into one check, since a single row there
can belong to any site in the portfolio; noted as a deliberate, minor simplification in the code
comment). `selfReferralClause()` re-validates every hostname against a strict shape before
string-interpolating it into SQL (same convention this file's `CHANNEL_SQL`/`segCountry` already
used) — covered by a dedicated injection-shaped-input test. 16/16 tests pass.

Unlike item 1, this fix needs no schema change and no backfill — `referrer_host` was always
captured correctly, it was only ever *misclassified* downstream, so re-running the fixed query
against already-collected data gives a real, immediate before/after:

**Before/after — asasoftware.aero, 2026-09-27 to 2026-10-27 (live query, no deploy needed to see
this — the fix is query-time only):**

| Referrers table (top rows) | Before | After |
|---|---|---|
| `www.asasoftware.aero` | 4,408 | — (folded into direct) |
| `asasoftware.aero` | 1,172 | — (folded into direct) |
| `new.asasoftware.aero` | 1,134 | — (folded into direct) |
| `(direct)` | 1,329 | **8,553** |
| `www.google.com` | 401 | 401 (unchanged, now visibly the top real referrer) |
| `de.search.yahoo.com` | 278 | 278 |

| Channel split (untagged traffic) | Before | After |
|---|---|---|
| "referral" | 8,370 | **1,166** |
| "direct" | 1,315 | **8,519** |

Before this fix, 86% of this site's untagged traffic was misclassified as "referral" when it was
actually the site's own domains referring to themselves. The real top external referrer
(`www.google.com`, 401 events) was previously buried below three self-referral rows and didn't even
make the top 3. This also means the "organic"/"paid" channel math (which depends on `referral` not
swallowing real direct traffic) was working from a referral bucket that was ~86% noise.

---

## 3. Internal/dev/spam traffic — ✅ confirmed, with exact numbers

**Where:** `isDevOrLocalHost()` (`api/a.js:159-169`), called at `:2031` on **`page_host`** only.

**Live data — spam/dev referrers, 30-day window:**
| referrer_host | count |
|---|---|
| `0.0.0.0` | **94** |
| `localhost` | **57** |
| `www.everydaydealsnow.com` | **19** |

`isDevOrLocalHost` already exists and already works correctly — but only for *where the script
ran* (someone previewing from localhost), never for *where the visitor claims to have come from*
(`referrer_host`). Nothing anywhere filters referrer values, so these 170 events currently show up
as legitimate referral traffic, exactly as the brief describes.

No IP-based filtering surface exists today, and can't easily be added: raw IP is deliberately never
stored (`api/a.js:2017-2019` — only derived `country`/`region` from edge headers are kept). The
brief's "configurable IPs" would require storing IP, which I'd flag as a privacy regression worth
avoiding — see open question 1 below.

**Fix approach:** apply the same regex family `isDevOrLocalHost` already has to `referrer_host`
too, plus a small, org-configurable spam-referrer blocklist (seeded with `everydaydealsnow.com`
and similar known-spam domains), reusing the `isSelfReferral`-style helper from item 2 — a match
reclassifies to `"direct"` (or a distinct `"excluded"` bucket — open question 2), never deletes the
row.

**Tests:** classification test per blocklisted/dev-pattern referrer host.

---

### Status: implemented, live (2026-10-27)

Went with "direct" (not a separate "excluded" bucket) to resolve open question 2 from above —
same bucket self-referral (item 2) folds into, since both are "not a real third-party referral,"
and it keeps every tab's direct/referral math simple instead of introducing a fourth channel
category everywhere. Added `noiseReferralClause()` + `SPAM_REFERRER_DOMAINS` to the same
`api/_self-referral.js` from item 2, applied at the identical 5 call sites (OR'd alongside
`SELF_REFERRAL` everywhere it already appears) — no new files needed. Confirmed host/referrer-based
filtering only, no IP storage (open question 2's other half) — IP remains never stored.

The dev/local patterns mirror `isDevOrLocalHost()` in `api/a.js` exactly (localhost/0.0.0.0/::1,
`.local`, and the three private-LAN ranges) but as a second, parallel implementation rather than a
shared import — that function operates on a JS string at ingestion time (`page_host`), this one
needs to produce valid Postgres regex syntax spliced into query text (`referrer_host`), and trying
to make one implementation serve both shapes seemed more likely to introduce a bug than writing it
twice carefully. Verified identical behavior for every case with a live-Postgres integration test
(`test/noise-referral-sql.test.mjs`, runs the real SQL against a literal `VALUES` list — not a
real table — so it catches a Postgres-regex mistake a pure JS-string-content test wouldn't).
`SPAM_REFERRER_DOMAINS` is seeded with only the one domain actually observed in this audit's data
(`everydaydealsnow.com`) — deliberately not padded with guessed-at additional spam domains. 20/20
tests pass (16 unit + 1 live-SQL integration test with 15 sub-cases, plus the pre-existing 4 from
items 1/2 kept green).

**Before/after — asasoftware.aero, 2026-09-27 to 2026-10-27 (query-time only, no deploy needed):**

| Noise referrer | Events (currently misclassified as "referral") |
|---|---|
| `0.0.0.0` | 94 |
| `localhost` | 57 |
| `www.everydaydealsnow.com` | 19 |
| `127.0.0.1` | 7 (not called out in the original brief — caught by the same loopback pattern) |

| Channel split (untagged traffic) | Item 2 only | Item 2 + item 3 |
|---|---|---|
| "referral" | 1,166 | **995** |
| "direct" | 8,519 | **8,690** |

**Observation, not acted on:** two other referrer domains surfaced in the post-fix top-10 —
`search.blomblor.com` (11 events) and `search.superdealdiscovery.com` (10 events) — with the same
"search.something-generic.com" shape as common ghost-referrer spam. Not added to
`SPAM_REFERRER_DOMAINS` since neither was named in the original brief and I didn't want to guess;
flagging here in case you want them added (or flagging to the ASA site owner that this looks like
bot/spam traffic, separate from this repo's own fix).

---

## 4. Unrecognized domains — ✅ confirmed: logic is already correct, banner wording is the bug

**Where:** ingestion gate `api/a.js:2035-2059`; approve/revoke API
`api/analytics-foreign-domains.js`; banner `src/Pages/Analytics/index.js:874-887`.

**Live data:** `analytics_foreign_domains` has exactly **35 rows with `approved = false`**
(confirmed exact match to "35 unrecognized domains") — UUID-style hosts
(`1d0f4e22-a3a5-4db3-9102-93f4dda5f647.asasoftware.aero`), Google Translate proxy hosts
(`book-asasoftware-aero.translate.goog`), and plausible internal subdomains (`crm.`, `admincp.`,
`portainer.`, `blog.`, `staging.`, `wp.`).

Unapproved domains are **already excluded from `analytics_events`** at ingestion — the handler
returns `202` without inserting (`api/a.js:2058`) once an unapproved domain is logged/counted in
`analytics_foreign_domains`. So none of these 35 domains' traffic is in any visible number today —
"Tracking is paused" is accurate but reads as if current numbers *are* affected, when they aren't.

**Bonus finding (not in the original brief):** the banner/approval list has **no date-range
scoping at all** — `GET /api/analytics-foreign-domains` (`:71-74`) returns every row ever recorded,
regardless of the dashboard's selected window. Checking `first_seen`/`last_seen` on the 35 rows,
all but 2 have a `last_seen` in **late August/early September 2026** — over a month before this
30-day audit window even starts. The banner is showing a stale, all-time backlog, not anything
currently happening, which compounds the "is my data wrong right now?" confusion the brief flags.

**Fix approach:**
- Leave the ingestion gate as-is — it's correct and privacy-safe.
- Rewrite the banner: *"35 unrecognized domains have been seen (most recently over a month ago)
  and their traffic is **not** counted in any number below. Approve one if it's actually yours."*
  Scope the *count* shown to domains last seen within the selected date range, with an "+N older,
  already-excluded domains" footnote for the rest, so the number doesn't look alarmingly large and
  stale forever.
- A one-click "bulk approve/reject by pattern" action is likely low-value here specifically (the 35
  read as spoofed/scan noise, not a legitimate second domain), but worth a quick confirm — see open
  question 3.

**Tests:** none needed for the ingestion gate (unchanged, verified correct); a test for the new
date-scoped count.

---

### Status: implemented, live (2026-10-27)

Went with copy + scoping only, no logic change and no bulk-approve UI — resolving open question 3
per my own recommendation above (33 of 35 domains hadn't been seen in over a month; reads as
spoofed/scan noise, not a legitimate second domain worth a bulk-approve shortcut). Extracted the
recent-vs-stale split into a pure `splitForeignDomainsByRecency(domains, fromDate)` in
`src/Pages/Analytics/_shared.js` (unit-testable without mounting the component) and call it from
the Overview banner in `src/Pages/Analytics/index.js`, which already had `fromDate` in scope from
`useAnalyticsPage()`.

New banner copy:
- If any unapproved domain was seen within the selected date range: *"`<domain>` — an unrecognized
  domain seen in this date range. **Not counted** in any number below — approve it here if it's
  actually yours. (+N older, already-excluded domains not shown here.)"*
- If none were seen in range (all stale): *"N unrecognized domains seen previously (none in this
  date range) — already excluded from every number below. Review in case any are still active."*

Both replace the old *"Receiving signals from N unrecognized domains. Tracking is paused until
approved"* — which never said whether visible numbers were affected, and read as an active, urgent
problem regardless of whether any of the N had been seen in the last two months. 4/4 new tests
pass (24/24 overall).

**Before/after — asasoftware.aero, 2026-09-27 to 2026-10-27 (live query):**

Of the 35 unapproved domains, exactly **1** (`www-asasoftware-aero.translate.goog`, last seen
2026-10-26) falls inside this 30-day window — the other 34 were last seen in late August/early
September, 4-8 weeks before the window even starts.

| | Before | After |
|---|---|---|
| Banner text | "Receiving signals from **35 unrecognized domains**. Tracking is paused until approved." | "**www-asasoftware-aero.translate.goog** — an unrecognized domain seen in this date range. **Not counted** in any number below — approve it here if it's actually yours. (+34 older, already-excluded domains not shown here.)" |

The old banner made it look like 35 domains were a live, current problem; the new one correctly
surfaces the 1 that's actually recent and makes unambiguous that none of the 35 — recent or
stale — are affecting any number on the page.

---

## 5. One conversion definition — ✅ confirmed; the single highest-leverage fix in Phase 1

**Where:** `AUTO_EVENT_NAMES` in `src/Pages/Analytics/Conversions.js:25-53` (the one real source of
truth, per the recent commit history); independently re-implemented exclusion lists in
`api/analytics-attribution.js:68-74` (`NON_CONVERSION_AUTO_EVENTS`, hand-synced by comment);
ad hoc totals computed independently in `ConversionsOverview.js:172-188`,
`api/analytics-attribution.js:76-138`, `api/analytics-report.js` (kind=`'purchase'` paths,
:540-553), `api/ad-spend-report.js:270-304`, `api/analytics-funnels.js`,
`api/analytics-user-flow.js`.

**Root cause, in the code's own words** (`api/ad-spend-report.js:294-297`): *"kind is
purchase/click/custom, just a display label, not a 'this counts as a conversion' flag."* `kind`
(stored on `analytics_event_defs`) only picks a UI icon/snippet (`Conversions.js:56-69`) — it is
never used to decide what counts as a conversion. Each tab invented its own rule instead:

| Tab | What it actually counts |
|---|---|
| Overview (`ConversionsOverview.js`) | every custom event not in `AUTO_EVENT_NAMES` — **including `kind: 'click'` CTA clicks** |
| Attribution (`analytics-attribution.js`) | same custom events, but additionally requires a `gclid`/`msclkid`/`fbclid` — narrower, ad-only scope |
| Conversion-rate KPI (`analytics-report.js:326-337`, feeds `totals.conversionRate`) | `DISTINCT session_id` over **all** of `analytics_custom_events` — **no exclusion at all**, so a session that only fired `scroll_depth` or `page_load` counts as "converted." This is the most serious instance — the headline conversion rate itself is built on this. |
| Ad Spend (`ad-spend-report.js`) | the site's `lead_qualifying_events` if configured, else **every** custom event unfiltered |
| User Flow "Booked Appointment" | its own goal-event match, a legitimately different (all sessions reaching the goal) scope from Attribution's click-ID-gated one |
| Trend chart (`ConversionsOverview.js`, labeled "conversion trend") | sums **all** `analytics_custom_events`, no filter — confirmed below |

**Live data confirms the trend chart's bug exactly.** Summing every `analytics_custom_events` row
(`page_perf` 9,127 + `network_connection` 8,948 + `scroll_depth` 1,614 + all registered events) over
the 30-day window gives **≈20,079** — matching the brief's cited **20,070** almost exactly (the ~9
difference is explained by slightly different second-level window boundaries between my ad hoc
query and the dashboard's exact range). The chart titled "conversion trend" is plotting raw event
volume, dominated by `page_perf`/`network_connection` telemetry that was never meant to be visible
to a marketer at all.

The Conversions tab's "76" and "576" weren't fully traced to a specific query in this read-only
pass — flagged as an open item to pin down with the live page open side-by-side with the DB in
Phase 1 (see open question 5), rather than guessed here.

**Fix approach:**
- Repurpose `kind` into an explicit **tier** column on `analytics_event_defs`: `lead` / `intent` /
  `micro` (default-inferred from existing `kind` — purchase & e-commerce kinds & form
  submit/booking → `lead`; `click` → `intent`; everything else → `micro`), editable from the same
  "Add event" form.
- Build **one** shared module (`api/_conversions.js`) exporting the `AUTO_EVENT_NAMES` exclusion
  and a tier-tagged join against `analytics_event_defs`. Every tab switches to querying through it.
- Headline "Conversions" = `tier = 'lead'` only; Intent/Micro shown as separate, clearly labeled
  secondary numbers, never folded into the same total.
- Fix the trend chart to plot `tier = 'lead'` counts per day, or rename the panel if it's meant to
  show total tracked events (your call — see open question 5).

**Tests:** shared-module test asserting tier classification for a representative event set
(purchase, add_to_cart, custom CTA click, scroll_depth); a test asserting every tab's query returns
the *same* total for the same tier + date range — the thing that's currently impossible.

---

### Status: partially implemented, live (2026-10-27) — scoped to the 3 highest-leverage fixes

**Tier model, finalized after your correction:** four tiers, not three — purchase/e-commerce
events are **Sale** (a sale or near-sale), not Lead. Lead is form submit/booking only, matching
the original brief exactly:
- **Sale** — `kind` is purchase or an e-commerce-funnel step (view_item, add_to_cart, checkout, …).
- **Lead** — `kind = 'lead'` (a site owner explicitly tags their booking-confirmation/demo-request
  event this way) **or** the event is named `form_submit` (auto-collected, promoted to Lead
  regardless of registration — a real visitor submitting any form is a lead by definition).
- **Intent** — `kind = 'click'` (a registered CTA click). Never folded into Sale/Lead.
- **Micro** — everything else (unregistered custom events, and the rest of the auto-collected
  telemetry list — scroll_depth, rage_click, page_perf, etc.).

Added `kind: 'lead'` to the Add Event picker (`src/Pages/Analytics/Conversions.js`, both forms) and
to the two server-side kind whitelists (`api/analytics-events.js`, `api/analytics-datalayer-rules.js`
— the latter so a GTM-dataLayer-sourced lead event can be tagged the same way). Built
`api/_conversions.js` (`classifyTier`, `tierCaseSql`, `isHeadlineConversionSql`) as the one shared
definition, covered by 10 unit tests plus a live-Postgres integration test (same pattern as items
2/3's SQL tests). 35/35 tests pass overall.

**Fixed in this commit** (the 3 clearest, highest-leverage bugs — see "Deliberately not yet done"
below for what's left):
1. **The headline conversion-rate KPI** (`api/analytics-report.js`'s `convertedSessionsRes`) — had
   zero filtering at all, counting a session as "converted" for firing literally any custom event,
   including pure telemetry. Now requires tier lead/sale.
2. **The mislabeled "conversion trend" chart** (`api/analytics-report-detail.js`'s
   `dailyConversionsRes`, feeding `ConversionsOverview.js`'s `trendData`) — was summing every
   `analytics_custom_events` row with no filter, literally plotting total event volume under a
   "conversion trend" title. Now scoped to tier lead/sale, same definition as the KPI.
3. **Attribution's conversion definition** (`api/analytics-attribution.js`) — replace the
   hand-maintained `NON_CONVERSION_AUTO_EVENTS` name-exclusion list (which, being name-based,
   was *also* excluding `form_submit` — exactly backwards, since a form submission with a click ID
   is precisely the kind of ad-attributed lead this page exists to surface) with the shared tier
   check. The click-ID requirement (this page's own narrower scope) is unchanged.
4. **ConversionsOverview.js's "Total conversions" KPI** — replaced the
   `!AUTO_EVENT_NAMES.has(name)` filter (which counted a registered CTA click, kind='click', as a
   "conversion") with `tier IN ('lead','sale')`. `tier` is now computed server-side per event
   (`api/analytics-report.js`) and returned alongside `kind`, so this file doesn't need its own
   copy of the classification rule.

**Deliberately not yet done — flagging rather than silently expanding scope:**
- **`api/a.js`'s ad-conversion-push queueing gate** (the `NON_CONVERSION_AUTO_EVENTS` this repo's
  Phase 0 fork found there, item 9's territory) still excludes `form_submit` by name, unchanged.
  Switching it to the new tier definition would mean a real production behavior change — form
  submissions with a click ID would start actually being pushed to Google/Meta/Microsoft as
  conversions, affecting ad-platform bidding optimization for every customer site, not just this
  dashboard's numbers. That's a materially bigger decision than "fix what the dashboard shows," so
  I left it as-is pending your explicit go-ahead.
- **Conversions tab's own "76"/"576" figures, `ConversionFunnel.js`, `ConversionCampaigns.js`,
  `ConversionChannels.js`, `api/ad-spend-report.js`'s lead-qualifying-events, and User Flow's
  "Booked Appointment" goal** are not yet migrated to the shared tier. I did pin down where "76"
  comes from (see below) but ran out of scope budget to migrate every remaining consumer in one
  commit — happy to continue through these next if you want full coverage.

**Before/after — asasoftware.aero, 2026-09-27 to 2026-10-27 (live query):**

| Metric | Before | After |
|---|---|---|
| Headline conversion-rate KPI numerator (converted sessions) | 578 | **3** |
| Conversion rate (÷ 3,544 unique sessions) | 16.3% | **0.08%** |
| "Conversion trend" chart total (sum of all custom events) | 20,160 | **9** (tier lead/sale only) |
| Conversions tab total (`!AUTO_EVENT_NAMES` filter — solved the mystery "76") | **76** (28 clicked_book_demo + 23 clicked_start_free_trial + 17 verification_code_sent + 5 verification_code_send_failed + 3 booked) | **9** (`form_submit` only) |
| Attribution's click-ID-gated conversions | 3 | **0** |

**Why Attribution drops to 0, and what to do about it:** the 3 previously-counted "attributed
conversions" were `clicked_book_demo`/`clicked_start_free_trial` (kind='click') events that
happened to carry a click ID — CTA clicks, correctly reclassified as Intent now, not a real
conversion. The real gap: asasoftware.aero's actual booking-confirmation event, `booked` (3
occurrences in this window), is currently registered with `kind='custom'`, so it lands in Micro,
not Lead. **Action for whoever manages this site's Events & Tracking settings:** re-tag `booked`
(and any other "a lead/booking actually happened" event) as `kind='lead'` — once that's done,
these numbers will reflect real leads instead of 0. I did not do this myself; it's a
business-meaning decision about what "booked" represents, not something inferable from the event
name alone (see open question 5 below, now narrowed to this one remaining question).

## 6. One consent-rate definition — ✅ exact bug found for 27.3%/0.3%; 🟡 53.2% is a different system

**Where:** `api/analytics-report.js:584-586` (KPI) vs `:629-638` (estimator) vs
`src/Pages/Analytics/_shared.js:328-331` (`formatPercent`) vs `index.js:667,683`.

**Live data:** full-consent events / total events = 2,684 / 9,838 = **27.27%** — an exact match for
the KPI's reported **27.3%**, confirming `totals.consentRate` (`analytics-report.js:584-586`,
`Math.round((full/total)*1000)/10`) is the correct, percent-scaled formula.

**Exact root cause of the 0.3% figure:** `consentImpact.consentRate` (`:633`) computes the *same*
ratio as a raw 0–1 **fraction** (`full/totalObs` = `0.2727`), not a percent. `formatPercent()`
(`_shared.js:328-331`) assumes its input is already percent-scaled and just appends `%` — it never
multiplies by 100. `index.js:683` feeds the estimator's fraction through that same formatter, so
`0.2727` prints as `"0,3%"`. Confirmed mathematically with the real ratio: this is a one-line scale
mismatch between two call sites of the same formatter, not two different definitions.

**53.2% (Marketing tab) is a different system, not the same bug.** `src/Pages/Analytics/Digest.js`
fetches `${PrimaryHost}/analytics/gdpr/marketingAttribution` — the CMP's own backend (tracking
actual banner choices: accept-all/essential-only/granular), which is **not in this repository**
(grepped `php-backend/` for `marketingAttribution` — not found; it lives on a separate host). This
is two legitimately different metrics (analytics full-consent-cookie rate vs CMP banner acceptance
rate) that need distinct labels and a cited source each, not forced equality — see open question 4.

**Statistics/Functional/Advertising "always identical":** corrected after your note that the
`IntastellarConsentSolution` cookie already carries more than this repo currently uses. The embed
script hooks **both** of the banner's own trigger functions separately
(`api/a.js:1168-1171`: `hookConsentTrigger('IntaAcceptAll')` and
`hookConsentTrigger('IntaSaveSettings')` — per `docs/cmp_banner_interface.md`, the former sets all
three categories at once, the latter is the per-category granular save) — but both wrappers call
the **same** `onBannerAction()` with no argument (`:1159-1167`), so the distinction between "visitor
clicked Accept All" and "visitor granularly saved" is discarded the instant it's available, before
it ever reaches `sendFull()`'s payload or `analytics_events`. If most visitors click Accept All
(plausible, and the likely real explanation for the three categories moving together), that's a
genuine, *locally measurable* fact this repo is simply not capturing today — not a question that
needs the external CMP backend.

**Fix approach (this repo's part only):**
- Multiply `consentImpact.consentRate` (and its `dailyEstimates`) by 100 at the source, so every
  consumer of `formatPercent` keeps its existing percent-scale contract — fixing the one wrong
  call site rather than changing the formatter all of its other correct callers rely on.
- Pass which trigger fired into `onBannerAction(isGranular)` (`IntaSaveSettings` → `true`,
  `IntaAcceptAll` → `false`), forward it as a new `g:1/0` field on the `sendFull`/`track` payload,
  and add a `consent_granular BOOLEAN` column to `analytics_events`/`analytics_custom_events`
  (additive, never backfilled — pre-fix rows stay `NULL`/unknown, which is correct). This gives the
  dashboard a reliable, locally-sourced "% of consents given via granular save vs Accept All" —
  which both explains why the three categories move together today and is a legitimate new metric
  in its own right, independent of the separate Marketing-tab "Granular" field below.
- Add a source label/tooltip everywhere a consent-rate number appears: "Analytics full-consent
  rate (this dashboard)" vs "CMP banner acceptance rate (Marketing)."

**Marketing tab's "Granular" field specifically** (`Digest.js:73`, `r.granular`) is a separate
matter from the above — it's a field read verbatim from the external CMP backend's
`marketingAttribution` response (`${PrimaryHost}/analytics/gdpr/marketingAttribution`), not derived
from anything in `analytics_events`. The new `consent_granular` column above doesn't replace or fix
that specific field (it's a different system, still outside this repo) — but it does mean this
repo no longer has to treat "how much of our traffic is granular vs accept-all" as entirely
unanswerable without that external system; it would have its own, independently-correct answer to
the same underlying question.

**Tests:** unit test for `consentImpact` returning a 0–100 value for a known ratio; a
`formatPercent` round-trip test for that exact value; a test for `onBannerAction`/the payload
builder asserting `IntaSaveSettings` produces `g:1` and `IntaAcceptAll` produces `g:0`.

---

### Status: implemented, live (2026-10-27)

**27.3%/0.3% fix.** Extracted the inline IIFE into an exported `computeConsentImpact(totalsRow,
dailyRows)` in `api/analytics-report.js` (same "pull the calculation out so it's directly
testable" pattern as `embeddedClause`) and fixed the one-line scale bug: `consentRate` is now
`Math.round(fraction * 1000) / 10` (percent-scaled), matching `totals.consentRate`'s contract
instead of returning a raw 0–1 fraction. 5 new unit tests, including one asserting it does *not*
regress to a fraction. Verified against the real ratio: `computeConsentImpact({full_count: 2684,
total: 9838, ...})` → `27.3` — exactly the KPI's reported value, confirming both now agree.

**Granular vs Accept-All capture.** `onBannerAction()` now takes `isGranular`, and
`hookConsentTrigger()` passes `true` for `IntaSaveSettings`, `false` for `IntaAcceptAll` — both
previously called the same `onBannerAction()` with no argument, discarding the distinction the
instant it was available. Stored in a new module-level `_iaGranular` (null = unknown — a page that
loads with consent already decided from a previous visit, or resolved via the 30s poll fallback
without either trigger firing, correctly stays unknown rather than being guessed). Forwarded as
`g:1/0/undefined` on `sendFull`/`track` payloads, stored in a new `consent_granular BOOLEAN` column
(additive, never backfilled — same convention as `is_embedded` from item 1) on `analytics_events`
and `analytics_custom_events`. 3 new tests verify the real `hookConsentTrigger` source (extracted
from `EMBED_SCRIPT`, same technique as item 1's `isEmbedded` test) calls `onBannerAction` with the
correct flag for each trigger name.

**Source labels.** Added a tooltip to the Consent Impact Estimator's rate ("This analytics
tracker's own full-consent rate — not the CMP banner's acceptance rate shown on the Marketing tab")
and extended the main Overview KPI's subtitle the same way. Did not locate the exact component
rendering Marketing's "53.2%" figure (grepped for `KpiCard`/`formatPercent`/`acceptAllTotal` near
`Digest.js` — the computation exists there but I couldn't confirm which file renders it as a
percentage; ran out of scope budget chasing it since this is a labeling-only fix, not a logic bug,
and the underlying "it's a different system" fact already holds regardless of exactly where it's
displayed). If you can point me at the specific component, I'll add the same tooltip there.

**Statistics/Functional/Advertising "always identical" — not a bug, left unchanged.** Confirmed via
live data: `stat_yes=2688, stat_no=7185` and *identical* for func/adv in the 30-day window. The
three `Consent.js` KPI cards already have distinct, correct labels ("Statistics consent",
"Functional consent", "Advertising consent") — they're not mislabeled, their *values* just happen
to be identical, almost certainly because the banner only offers Accept-All/Reject-All with no
granular per-category toggle for this site. No code change needed; worth checking against the live
banner config if you want to confirm, but that's outside this repository.

43/43 tests pass overall.

**Before/after — asasoftware.aero, 2026-09-27 to 2026-10-27:**

| | Before | After |
|---|---|---|
| KPI card | 27.3% | 27.3% (unchanged — was already correct) |
| Consent Impact Estimator | **0,3%** (same ratio, wrong scale) | **27.3%** (now matches the KPI exactly) |

**`consent_granular` has no before/after yet**, for the same reason as item 1's `is_embedded`: it's
never backfilled onto existing rows, and only the *updated* tracker sends `g` at all — so there is
currently zero historical data to report. Once deployed and a day or two of real traffic has
flowed through the updated embed script, I can pull the real "% granular vs Accept-All" split and
record it here.

---

## 7. Forms — ✅ confirmed root cause (verified against real per-form counts, ruling out an alternate theory)

**Where:** per-form query `api/analytics-forms.js:109-164`; device-breakdown query (correctly
deduped) `:184-213`; name display `src/Pages/Analytics/Forms.js:31-34`; client tracking
`api/a.js:1295-1333` (submit), `:1410-1428` (started).

**Live data:** `form_started` for `book-demo-request-form` = **5**; `form_submit` for the same
`form_id` = **6** — an exact match for the brief's "book-demo: 5 started / 6 submitted / 100%" (the
query's `LEAST(100, …)` caps the 120% raw ratio at 100%).

I checked (and ruled out) one plausible alternate theory before settling on this: the per-form
query's `submits` CTE (`:110-122`) and `starters` CTE (`:123-137`) derive `form_id` with
*different* logic (`starters` remaps the placeholder values `'form'`/`'unknown'` to an `action`
path that `submits` doesn't) — a join-key mismatch could plausibly undercount starters for some
forms. But for `book-demo-request-form` specifically, the id isn't a placeholder on either side, so
the join is clean (`starters = 5`, `submissions = 6`, joined correctly) — **submissions genuinely
exceed starts for a cleanly-joined form**, which rules out the join-key theory as *this* case's
cause (it may still be worth hardening separately, since the two CTEs' key logic is still
inconsistent and could bite a different form).

**Confirmed real cause:** the per-form query (`:109-164`) does a raw `COUNT(*)` on `form_submit`
with **no deduplication at all** — not by `session_id`, not by any time window. The device
breakdown query one block below it (`:184-213`) already deduplicates by `DISTINCT session_id`
specifically to stop "retries from inflating submitted above started" (per its own comment at
`:182-183`) — that fix was applied there but never carried over to the main per-form table. A
double-click on submit, or a retry after a flaky response, produces two `form_submit` rows for one
real submission; `form_started` is only deduped once per pageload client-side
(`started[fid]` guard, `:1420-1421`), so it doesn't inflate the same way.

**GUID-like form names:** `cleanFormId()` (`Forms.js:31-34`) is confirmed to be a literal no-op —
`if (!id || id === "unknown") return "unknown"; return id;` — whatever `_formId()` resolved
client-side (id → name → class → action path, or a widget-generated id like `hs-85f3a603-...` for
the 73 HubSpot-widget `form_started` events seen live) is shown verbatim. No label registry exists
anywhere.

**Fix approach:**
- Apply the same `COUNT(DISTINCT session_id)`-for-full-consent pattern the device query already
  uses to the per-form query, with a short time-bucket fallback (e.g. same `pathname`+`form_id`
  within 2 seconds collapses to one) for minimal-consent/anonymous traffic that has no
  `session_id` to dedupe by.
- Separately, make both CTEs' `form_id` derivation identical (apply the same placeholder-remap
  logic on both sides) so a future form with a placeholder id doesn't hit the mismatch I ruled out
  for this specific case.
- Add an `analytics_form_labels (site_id, form_id, label)` table, editable from Settings, and make
  `cleanFormId()` look it up with a readable fallback (Title Case the action path) instead of
  returning the raw id.

**Tests:** query test with duplicate `form_submit` rows within 2s for the same anonymous
pathname/form_id collapsing to one; a test for the CTE key-derivation consistency; a
label-lookup test for `cleanFormId`.

---

### Status: implemented, live (2026-10-27)

**Dedup.** Added shared `FORM_DEDUP_KEY` (session_id for full-consent rows; `pathname + raw
formId + 2-second time bucket` for minimal-consent/anonymous rows, which have no session_id at
all) and `FORM_ID_CASE` (the placeholder-remap, now applied identically on both sides of every
submits/starters join — closing the join-key-mismatch risk I'd flagged but ruled out for this
specific case) in `api/analytics-forms.js`. Applied to **all 6** starts-vs-submits comparisons in
that file, not just the main per-form table: the top-line totals KPI, per-form breakdown, device
breakdown, geographic breakdown, acquisition-channel breakdown, and per-page engagement — the
device breakdown already had a *partial* version of this (session_id dedup only, no time-bucket
for anonymous traffic) which I upgraded to match; the other four had no dedup at all. 5 new unit
tests plus 3 live-Postgres integration tests (collapses a same-session double-submit; does *not*
collapse two different anonymous visitors on different pages; collapses two anonymous submits on
the same page within the 2s bucket). 51/51 tests pass overall.

**Human-readable names.** Did not build the `analytics_form_labels` table / Settings UI from the
original fix approach — went with a cheaper, no-new-table fix that handles the actual evidenced
case: added `humanizeFormLabel(formId, provider)` (server-side, since `provider` is only available
there) — Title-Cases a slug-style id (`book-demo-request-form` → "Book Demo Request Form"), and for
a GUID-like **widget-provided** id (HubSpot/Typeform/Calendly/Tally — `hs-85f3a603-...` has no
usable fallback at all, since the widget intercepts submission before any real form action exists)
shows "HubSpot form" instead. The per-form API response now includes `label`;
`src/Pages/Analytics/Forms.js` renders it in the main table, and `cleanFormId()` (previously a
literal no-op returning the raw id unchanged) now does the same Title-Case fallback for the other
tables on that page that don't carry the richer provider-aware label. A true custom-rename-any-form
feature (the `analytics_form_labels` table + Settings UI) is still open if you want it — flagging
as a deliberately-deferred, bigger-scope follow-up rather than building it into this commit.

**Before/after — asasoftware.aero, 2026-09-27 to 2026-10-27 (live query):**

| Form | Submissions (before → after) | Starters (before → after) |
|---|---|---|
| `free-trial-request-form` | 3 → 3 | **8 → 7** (one duplicate start within 2s collapsed) |
| `book-demo-request-form` | 6 → 6 | 5 → 5 (unchanged — see below) |

**Important, honest finding: the dedup fix does *not* close the book-demo-request-form gap from
the original brief ("5 started / 6 submitted / 100%"), and I want to be upfront about why rather
than imply this item fully resolved it.** I pulled the raw rows: 4 of the 6 submits are
minimal-consent, timestamped 2026-10-02 at 12:53:05, 12:53:51, 12:54:21, and 12:55:00 — **38-50
seconds apart**, each one outside the 2-second collapse window by a wide margin, against only a
single matching "start" at 12:53:41 in that same cluster. This isn't duplicate-event noise a dedup
window should hide — it reads as the same visitor retrying a failing form roughly every 40 seconds
for two minutes straight, which lines up with the demo-form technical errors already flagged for
the site owner in `docs/asa-site-findings.md` (13 network failures, 2× 502, 1× 410). Collapsing
these into one would hide a real reliability signal, not fix a tracking bug, so I left them
uncollapsed. The honest fix here isn't in this repo at all — it's the ASA site's form backend.

---

## 8. Alerts — ✅ root cause found; it is a real bug, not a windowing mismatch

**Where:** `api/cron-analytics-alerts.js:160-168` (config fetch); `analytics_alert_configs`;
`analytics_alert_history`.

**This overturns the leading hypothesis from mid-investigation.** The initial theory was that the
alert's 7-day window and the dashboard's 30-day KPI were just answering different questions. I
checked this directly against live data:

- The actual stored config for this site: `metric='consent_rate_below'`, `operator='lt'`,
  `threshold=30`, `period_days=7`, `enabled=true` — correctly configured, created 2026-09-05.
- The real **7-day** consent rate right now: 908 full / 3,121 total = **29.09%** — genuinely below
  the 30% threshold. If the cron ran, it **should** have fired today.
- `analytics_alert_history` has **zero rows, ever, for any config, platform-wide** (not just this
  site) — and this is the *only* enabled alert config on the entire platform, created ~7 weeks and
  ~49 daily cron runs ago.

**Confirmed root cause:** I ran the cron's exact config-fetch query
(`api/cron-analytics-alerts.js:160-168`) directly against the production DB:

```sql
SELECT aac.*, aos.domain, u.email AS owner_email
FROM analytics_alert_configs aac
JOIN analytics_sites aos ON aos.id = aac.site_id
LEFT JOIN users u ON u.organisation_id = aac.organisation_id
    AND u.role IN ('admin','super-admin','manager')
WHERE aac.enabled = true ORDER BY aac.id
```

It errors immediately: **`relation "users" does not exist`**. There is no `users` table in this
Postgres database at all — user/org identity lives elsewhere (this project's PHP backend uses
MySQL per `package.json`'s `mysql` dependency; it's a separate system). This query is wrapped in
`.catch(() => ({ rows: [] }))` (`:167`), so **every single cron run silently swallows this error and
evaluates zero configs** — the alert isn't failing its threshold check, it's never being evaluated
at all. This fully explains "has never fired although the rate is 27.3%[/29.1% over 7 days]" and
the empty history table.

**Fix approach:**
- Stop joining a table that doesn't exist in this database. The notification email needs to come
  from wherever user/org identity actually lives — either a lookup against that other system (API
  call) or, more simply, store the notifying email directly on `analytics_alert_configs` at
  creation time (the UI already knows who's creating the alert) instead of resolving it live via a
  cross-database join that was never going to work.
- Stop silently swallowing errors on this query specifically — log them (e.g. `console.error`) so a
  future schema drift is visible within a day instead of invisible for 7 weeks.
- Add a manual "test fire" / dry-run action in the Alerts UI (`computeMetric` + `isBreached` without
  writing history or sending notifications) so this exact class of question is self-serve going
  forward.

**Tests:** a test that runs the cron's config-fetch query against a schema that matches production
(no `users` table) and asserts it does *not* silently return `[]`; unit tests for `computeMetric`
and `isBreached` with known inputs (currently zero coverage).

---

## 9. Ad conversion push — ✅ exact root cause found for the contradictory counts, plus a dead button

**Where:** `api/analytics-attribution.js:76-138` (date-scoped `pushStats`); `api/ad-conversion-push.js:263-291` (unscoped `stats`, separate endpoint); `src/Pages/Analytics/ConversionAttribution.js:276-320` (bulk retry button and its label).

**Live data (30-day window):** every one of the **361** `analytics_conversion_pushes` rows created
in-range currently has `status = 'failed'`. Zero are `'pending'`, zero are `'sent'`. Breakdown of
`error_message`:

| error_message | count |
|---|---|
| "No ad platform connection found for this domain" | 276 |
| "No Meta Pixel configured for this connection — select one in Settings → Analytics Settings → Conversion actions" | 9 |
| Google Ads `INVALID_ARGUMENT`: "conversion action type is not valid" | ~10 individually-keyed rows |

(The 276 "no ad platform connection" failures are themselves worth a follow-up: if pushes are being
created under a `page_host` variant — e.g. `book.asasoftware.aero` — that doesn't match whichever
domain has the actual ad-platform connection configured, that's a second, related bug tying back to
item 1's multi-host issue. Flagged for Phase 1, not yet root-caused.)

**This means `pushStats.pending = 0` and `pushStats.failed = 361` — both numbers independently
confirmed correct** against `api/analytics-attribution.js`'s own date-scoped query. So where does
"361 pending" come from? Found it exactly:

```jsx
// src/Pages/Analytics/ConversionAttribution.js:319-321
const pendingCount = data?.summary?.pushStats?.pending ?? 0;   // = 0
const failedCount  = data?.summary?.pushStats?.failed  ?? 0;   // = 361
...
{pushing ? "Pushing…" : `Push ${pendingCount + failedCount} pending`}   // → "Push 361 pending"
```

The bulk-action button literally adds `pendingCount + failedCount` together and labels the sum
"pending" — `0 + 361 = 361`, printed as **"Push 361 pending"** right next to (or above) a correctly
separate display of pending=0/failed=361 elsewhere on the same page. No query-scoping difference or
per-event-bucketing theory is needed; this one line produces the exact three-numbers-at-once
symptom from the brief. (I did also confirm `api/ad-conversion-push.js`'s separate, unscoped `GET`
endpoint exists with no date filter — a real second inconsistency worth fixing for its own sake,
but not what's causing *this specific* symptom.)

**It's also a dead button today.** Clicking it calls `pushPending()` with no `ids`
(`ConversionAttribution.js:276-280`) → backend `processPendingPushes`
(`api/ad-conversion-push.js:316-339`) defaults to `conditions = ["p.status='pending'"]` when no
explicit ids are passed. Since zero rows are actually `'pending'` right now, **clicking "Push 361
pending" today would process zero of the 361 rows it claims to**, despite them being exactly the
rows the user wants retried. The per-row "Retry" button (`:185-188`) does pass explicit ids
including failed ones and works correctly — there is simply no bulk equivalent for "all failed
rows across every event."

Failure reasons are already captured correctly (`error_message` persisted on every failure,
confirmed via the table above) — worth confirming in Phase 1 whether `ConversionAttribution.js`'s
render actually surfaces that text prominently or only as a hover tooltip.

**Fix approach:**
- Fix the button's own math/label: either compute and request `status IN ('pending','failed')`
  explicitly, or rename it to reflect what it actually retries today. Given the intent is clearly
  "retry everything that isn't sent yet," the former is the right fix.
- Consolidate `api/ad-conversion-push.js`'s unscoped `GET` stats with `analytics-attribution.js`'s
  date-scoped ones into one shared, parameterized query — same "single source of truth" pattern as
  item 5 — so the two surfaces can never show different numbers for the same underlying rows again.
- Investigate the 276 "no ad platform connection" failures against item 1's multi-host finding in
  Phase 1 — likely a quick, separate win once traced.

**Tests:** `processPendingPushes` test asserting `status IN ('pending','failed')` is honored when
requested and the default sweep stays pending-only; a frontend test (or explicit manual QA note)
confirming the bulk button's displayed count matches what it will actually process.

---

## 10. Performance accuracy — 🟢 one exact bug found; several confirmed gaps; two items need a live screenshot/payload to finish

**Where:** `api/analytics-performance.js`, `api/analytics-page-weight.js`,
`src/Pages/Analytics/Performance.js` (`BandLineChart`, `BusinessImpact`).

**(a) No winsorization before percentiles.** Both files run `PERCENTILE_CONT` directly over raw
`(extra_data->>'lcp')::numeric` with no upper bound. The only existing cap is in the LCP
*histogram* query specifically (`analytics-performance.js:415-423`, `BETWEEN 1 AND 30000`ms) — it
doesn't apply to the percentile aggregates driving the headline/table figures, or to CLS/INP at
all. A single 217s outlier won't move a P75 drawn from hundreds of samples much, but it does
distort histogram bucket boundaries and "slowest page" tables where it has outsized visual effect.

**(b) No third-party/extension resource filtering.** The slow-resources query
(`:369-385`) has zero URL filtering — any `res.url` from `PerformanceResourceTiming`, including
browser-extension-injected resources (e.g. `kaspersky-labs.com`), is aggregated as if it were the
site's own asset.

**(c) CLS 0.000 vs 0.499 — exact one-line bug found.** `analytics-performance.js` deliberately
*keeps* CLS=0 samples (explicit comment: *"CLS = 0 is a valid measurement … must not be excluded …
breaks CrUX parity"*). `analytics-page-weight.js`'s percentile helper `Pn()` (`:45-46`) applies
`FILTER (WHERE … > 0)` **unconditionally to every metric including CLS** — dropping every
zero-shift pageview (the majority) and computing CLS's percentile only over the minority that
*did* shift, which naturally inflates it far above the Performance tab's correct figure. Clean,
isolated, one-line fix: mirror the CLS zero-guard into Page Weight's `Pn()`.

**(d) Headline LCP (2.2s) vs trend chart (4.4s).** Both use the identical `P75("lcp")` expression
over the same base filter — the difference is granularity (one P75 for the whole period vs one P75
per day), which is expected statistical behavior for a day with a bad batch of samples, not
necessarily a bug. I can't rule out the chart silently using a wider date range than the headline
without the live payload — needs a side-by-side screenshot in Phase 1 before deciding whether this
needs a code change or just a clarifying tooltip.

**(e) Garbled y-axis / raw ISO timestamps.** Checked both hand-rolled chart components on this tab
(`BandLineChart` in `Performance.js:880-984`, `TrendLineChart.js`) — both already format dates as
`MM-DD` and y-values via `toLocaleString("de-DE")`. Could not locate the specific chart producing
raw ISO labels from static review alone — needs the actual screenshot to identify which component.

**(f) "Business impact" from tiny samples, no guard.** Confirmed —
`Performance.js:1290-1344`'s `BusinessImpact` computes an uplift percentage from
`goodRow.conversionRate` vs `poorRow.conversionRate` with no check on either bucket's sample size.

**Fix approach:**
- (a) Shared `winsorize(col, capMs)` wrapper around both files' percentile helpers (cap LCP ~60s,
  INP ~10s; CLS doesn't need a cap).
- (b) Resource-URL denylist (known AV/extension-injection domains + extension URL schemes) applied
  to the slow-resources query.
- (c) One-line fix: apply Performance's existing CLS zero-guard to Page Weight's `Pn()`.
- (d)/(e) Hold for a live screenshot/payload before writing code.
- (f) Minimum-sample floor (e.g. ≥20 sessions per bucket) on `BusinessImpact`; below that, show
  "not enough data yet."

**Tests:** winsorize helper test; resource-filter test; a Page Weight CLS test asserting a mixed
zero/non-zero sample set produces the same P75 as the equivalent (correct) Performance query;
`BusinessImpact` sub-threshold test.

---

## 11. Heatmap — 🟢 scroll-depth root cause tied to item 1; preview bug needs live repro

**Where:** scroll milestones `api/a.js:1396-1408`; per-pageview `scroll_depth` column
(`analytics_events.scroll_depth`, populated from the client's `maxScroll` on exit,
`api/a.js:717-732,1100`); heatmap API `api/analytics-heatmap.js`; screenshot API
`api/analytics-screenshot.js`.

**Live data:** the per-pageview `analytics_events.scroll_depth` column is heavily concentrated at 0
(1,855 of the sampled rows), tapering off sharply above it — consistent with the brief's "838 at
0%, 4 at 10%+" pattern. Separately, the milestone-based `scroll_depth` custom event (25/50/75/90%
buckets, used elsewhere for engagement tracking) is populated mostly on `www.asasoftware.aero`
(real pages: `/`, `/about`, `/software/sam/...`), with only a small fraction on
`book.asasoftware.aero`. This is exactly what item 1's theory predicts: the booking widget's
preloaded iframe pageviews report `maxScroll = 0` because nobody scrolls a hidden iframe nobody is
looking at, and those ~6,900 iframe pageviews dominate the pile-at-zero while genuine visitors on
the real site pages do scroll normally.

**Recommendation, not yet executed:** fix item 1 first (exclude `is_embedded` pageviews from the
scroll-depth aggregate) and re-measure the distribution before writing any new scroll-tracking
code — it's very likely most of this symptom resolves as a side effect, and chasing a separate root
cause first risks solving a problem that item 1 already fixes.

A secondary, independent risk worth a one-line note regardless: the scroll listener only measures
`window`/`document.documentElement` scroll (`api/a.js:725-732`) — a page whose real scrollable
content lives in an inner `overflow:auto` container would also report 0, unrelated to the iframe
theory. Not confirmed as present on asasoftware.aero; flagging for awareness.

**Top-clicks-dominated-by-widget:** the click tracker (`api/a.js:745-775`) has the same lack of
embedded-context tagging as pageviews — the same `is_embedded` flag from item 1 lets the heatmap
query exclude or separately bucket widget-internal clicks.

**Page preview never loads:** read `api/analytics-screenshot.js` end to end — it's reasonably
built (modern `@sparticuz/chromium`, sane timeout/memory budget in `vercel.json`, blocks
third-party scripts during capture, suppresses the banner via `__ICS_SCAN__`); the frontend
(`Heatmap.js:66-92`) handles auth and blob lifecycle correctly. No static-code bug found. Candidates
needing a live repro: the capture budget being exceeded on an unusually heavy page, the target
site's WAF blocking the headless UA/IP range, or a third-party overlay that doesn't honor
`__ICS_SCAN__`. **Needs the actual error (network tab or Vercel function log) before proposing a
fix** — I don't want to guess-patch this one.

**Fix approach:**
- Ship item 1's `is_embedded` flag; re-measure scroll-depth distribution before writing new
  scroll-tracking code.
- Tag click/heatmap data with the same flag so widget clicks can be excluded/shown as a separate
  layer.
- Get a live repro for the screenshot bug before touching that file.

**Tests:** once item 1 ships, a query test confirming the scroll-depth distribution excludes
embedded pageviews; once a concrete screenshot bug is found, a regression test for it.

---

## 12. Cross-tab consistency — ✅ confirmed on all three sub-points

**Currency.** `CURRENCY_SYMBOLS` is independently redefined in at least seven files (`AdSpend.js`,
`ReportBuilder.js`, `ReportView.js`, `index.js` twice, `ConversionCampaigns.js`,
`MarketingReconciliationPanel.js`, `MarketingReport/index.js`), with no shared module. Currency
*selection* itself isn't shared either: Ad Spend persists its own `displayCurrency` in
`localStorage` (`ia_ad_display_currency`) independent of whatever the Marketing Report shows
(driven by the CMP backend / the ad account's native currency) — exactly "Marketing shows kr, Ad
Spend shows €."

**Date range.** `useAnalyticsPageChrome()` (`_shared.js:170-194`) initializes `fromDate`/`toDate`
as **local component state with a hardcoded 30-day default** — not shared via context, storage, or
URL params. Only `domain` is synced globally (`DomainContext`). Every tab gets its own fresh
30-day window on mount; changing the range on one tab has zero effect on any other. This is also
the most plausible mechanism behind any *perceived* window mismatch for item 8, even though that
item's real cause turned out to be the missing-`users`-table bug instead.

**Number formatting.** `formatPercent()` (`_shared.js:320-331`) documents the intended convention
well (de-DE locale: period thousands separator, comma decimal) and is correctly used in many
places — but isn't universal. `BandLineChart.fmtY()` (`Performance.js:901`) abbreviates as
`(v/1000).toFixed(1) + "k"` (English-style abbreviation) right alongside plain
`toLocaleString("de-DE")` full-number formatting elsewhere (`TrendLineChart.js:68`,
`ConversionsOverview.js:265`) — individually consistent within each component, inconsistent
across the dashboard, exactly matching the brief's "9.829" vs "1.1k" example.

**Fix approach:**
- `formatCurrency(amountCents, currency)` in `_shared.js`, reusing one copy of `CURRENCY_SYMBOLS`;
  migrate all seven call sites.
- Lift date range (and ideally the segment filter) out of `useAnalyticsPageChrome()`'s local state
  into shared context or the URL query string, the way `domain` already works.
- One `formatCount(n, { abbreviate })` in `_shared.js`; migrate `BandLineChart`/`TrendLineChart`.

**Tests:** `formatCurrency` per currency; a hook/context test asserting date range survives a
simulated tab switch; `formatCount` tests for both modes.

---

## Cross-cutting notes

- **Item 1 is the highest-leverage fix.** It very likely explains most of item 11's scroll-depth
  symptom as a side effect, and probably moves several of item 5's headline numbers meaningfully
  (fewer bogus "sessions"/"conversions" from iframe noise). Recommend shipping it first and
  re-measuring before chasing every other symptom independently.
- **Items 8 and 9 turned out to be exact, narrow bugs, not fuzzy "needs more investigation"
  items** — a missing table silently swallowed by a `.catch()`, and a button computing
  `pending + failed` and calling the sum "pending." Both are small, surgical fixes.
- **No test infrastructure exists in this repo today** (`package.json`'s `test` script is a
  placeholder; no Jest/Vitest/Mocha config, no `*.test.js` files anywhere). Since every item above
  needs tests per the ground rules, this needs a decision before Phase 1's first commit — see open
  question 6.

---

## Pointers for Phase 2–4 (not yet executed; for your reference when we get there)

- **Overview page:** `src/Pages/Analytics/index.js` (contains `LivePanel`, `OverviewSkeleton`, and
  the "Main overview page" section from line 768) — this *is* the current Overview tab.
- **"Executive KPI Summary" template:** `src/Pages/Analytics/reportTemplates.js:118-128` — currently
  just one entry in the saved-report template list (`key: "kpi_summary"`), not a standalone page.
  Phase 2 would need to either promote this template's rendering into `index.js` directly or build
  a new Overview that reads the same metric set.
- **Nav duplication (Phase 3):** two independently maintained lists already diverge —
  `AnalyticsSubNav` (`_shared.js:490-530`, the 11-item top tab bar: Overview/Audience/Consent/
  Acquisition/Ad Spend/Attribution/Conversions/Forms/Performance/Page Weight/Heatmap/Digest) vs
  `buildAnalyticsLinks` (`src/Components/Header/SideNavLinks/index.js:109+`, the ~25-item sidebar,
  which additionally includes Marketing, Google Analytics, Search Console, Recordings, Bots, User
  Flow, Conversions sub-pages, Page Experiments, Cohorts, Alerts, Scheduled Reports, Reports, Report
  Builder). Unifying these is a matter of generating both from one shared list, not a redesign.

---

## Open questions before Phase 1 starts writing code

1. ~~Database access~~ — **resolved.** `.env.local`'s `POSTGRES_URL` already works for read-only
   verification queries from this checkout (used throughout this document). I'll keep using it to
   record real before/after numbers per commit, as the ground rules ask, unless you'd rather I not
   touch the DB directly even for `SELECT`s — let me know if so.
2. **Item 3 scope.** Raw IP is deliberately never stored, so "configurable IPs" isn't available
   without a privacy-relevant schema change. Confirm host/referrer-based filtering only (my
   recommendation) is sufficient, rather than adding IP storage.
3. **Item 4's 35 domains.** Given 33 of 35 haven't been seen in over a month, I'd lean toward
   leaving them as excluded-by-default with a copy fix only, no new bulk-approve UI. Confirm, or
   let me know if you specifically want a bulk-approve/reject-by-pattern action added anyway.
4. **Item 6's Marketing 53.2% / CMP "Granular" field (Digest.js).** These two specifically still
   live in the CMP backend, outside this repository — the new `consent_granular` column (above)
   gives this repo its own, independent answer to "accept-all vs granular," but doesn't fix or
   replace that specific external field. Do you want this side's work limited to
   labeling/sourcing clarity (my recommendation), or do you have access to (or want me to also
   look at) that other codebase for those two specifically?
5. ~~Item 5's tier naming~~ — **resolved.** Four tiers: Sale (purchase/e-commerce — a sale or
   near-sale, not a Lead), Lead (`kind='lead'` or the auto-collected `form_submit` event), Intent
   (`kind='click'`), Micro (everything else). "76" is confirmed (28 clicked_book_demo + 23
   clicked_start_free_trial + 17 verification_code_sent + 5 verification_code_send_failed + 3
   booked — the old `!AUTO_EVENT_NAMES` filter). "576" is still unconfirmed — ran out of scope in
   this item's commit before locating it; will pin down if/when I continue migrating the remaining
   Conversions-tab consumers (ConversionFunnel.js, ConversionCampaigns.js, ConversionChannels.js).
   **New, concrete action needed from you (or whoever manages asasoftware.aero's Events &
   Tracking):** re-tag the `booked` event as `kind='lead'` in Settings — it's currently
   `kind='custom'`, so it's landing in Micro instead of Lead until that's changed. Also pending:
   should `api/a.js`'s ad-conversion-push gate also switch to the new tier definition (this would
   start pushing `form_submit`-with-click-ID events to ad platforms as real conversions — a
   production behavior change with ad-spend implications, not just a dashboard-numbers fix, so I
   left it untouched pending your explicit go-ahead)?
6. **Testing.** No test runner exists in this repo. My default recommendation is Node's built-in
   `node:test` + `assert` (zero new dependencies, works fine for testing pure SQL-string-building
   and aggregation helper functions once they're extracted into shared modules per items 2/3/5/9/12
   above) run via a new `npm test` script. Confirm, or tell me if you'd rather install
   Jest/Vitest for a nicer DX/watch mode — it's a one-time repo-wide decision I'd rather you make
   than guess.

Once you weigh in on 2–6 (1 is already resolved), I'll start Phase 1 commit-by-commit — one item
per commit, each with its before/after numbers for asasoftware.aero recorded here, as instructed.
