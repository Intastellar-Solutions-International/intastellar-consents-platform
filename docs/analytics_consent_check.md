# Analytics consent check

The analytics tracking embed (`api/a.js`, served via `GET /api/a`, ingest via `POST /api/a`) gates "full" tracking on a single boolean, checked via `hasStat()` (`api/a.js`). It does not distinguish "Accept All" from a granular analytics-only opt-in — both satisfy the same check, since Accept All presumably sets the stat-consent field to true along with the other categories. Even without stat consent, a "minimal" pageview (path + device type, no session id) still fires; only the enriched/session-linked "full" event requires stat consent.

**Why this matters:** The consent-banner widget that actually writes consent state (and its DOM/trigger interface, see [cmp_banner_interface.md](cmp_banner_interface.md)) is **not part of this repo** — only consumed/documented here.

## Known field-name typo in the banner's own data (found 2026-07-27)

The banner exposes its live state as `window.intaCookieConsents.consents`, and also persists it into the `IntastellarConsentSolution` cookie (`__inta1.`-encoded JSON matching the same shape). Its actual key for the statistics category is **`staticsticCookies`** (letters transposed — the banner's own typo), not `statisticCookies`. `a.js` originally checked `c.statisticCookies===true` everywhere, which never matched the real key — so `hasStat()` always returned `false` in production regardless of what the visitor actually selected, and no "full"/session-linked event ever fired. This is almost certainly the actual root cause of the earlier-reported "statistics: 0" dashboard issue (see below) — not a missing-script/ad-blocker problem as first suspected before this typo was found.

Fixed in `hasStat()` to check `staticsticCookies` first, falling back to the correctly-spelled `statisticCookies` in case the banner corrects its typo upstream later:
```js
function hasStat(c){return !!(c&&(c.staticsticCookies===true||c.statisticCookies===true));}
```
All three send paths (`sendMinimal`, `sendFull`, `track`) now route through `hasStat()` instead of duplicating the field check inline.

## Two independent data sources, not reconciled with each other

- The **CMP "Live View"** (`src/components/LiveView/index.js`) reads from an external backend at `apis.intastellarsolutions.com/analytics/gdpr/livedata` (`src/API/api.js:31-38`) — logs the banner click itself, instantly, regardless of whether any tracking script ever runs.
- The **Analytics dashboard's "statistics"/"Consent rate" KPI** (`src/Pages/Analytics/index.js:386-452`, backed by `api/analytics-report.js`) counts rows in `analytics_events` (`consent_stat` boolean column) — populated only when the embedded `api/a.js` script actually executes in a visitor's browser and successfully POSTs.

**How to apply:** If "statistics: 0" on the Analytics dashboard seems to contradict the Live View showing accepted consent, this is very likely NOT a reporting bug — the write/read path (`api/a.js` → `analytics_events` → `api/analytics-report.js`) was verified internally consistent (correct boolean coercion, correct `WHERE consent_stat = true` filter, matching site_id/date filters). The real cause is almost always that the `api/a.js` embed script isn't installed/firing on the page in question (or is ad-blocked), so no full-consent event ever reaches `/api/a` for that visit — check `/api/a` POST logs / network tab before assuming a code bug in the reporting pipeline. Also note: `src/Pages/Analytics/index.js:388` has a stale UI label ("statisticCookies or allCookies accepted") that doesn't correspond to any real `allCookies` field or logic — cosmetic text debt only.

## Mid-session consent upgrade (updated 2026-07-27)

Originally, if a visitor loaded the page without prior consent, `a.js` sent a minimal event and then polled the consent cookie every 500ms for up to 30s (60 ticks) looking for the upgrade to "full". If the visitor took longer than 30s to interact with the banner, the full/session-linked event would never fire for that pageview — only on the visitor's *next* page load would `hasStat()` see a resolved cookie. This looked like tracking only "fully working after a reload."

Fixed by hooking the banner's own trigger functions directly (see [cmp_banner_interface.md](cmp_banner_interface.md)): `a.js` wraps `window.IntaAcceptAll` and `window.IntaSaveSettings` (`hookConsentTrigger()`/`onBannerAction()` in `api/a.js`) so that the instant the visitor accepts/saves, the script re-checks consent and fires the full upgrade event immediately — independent of the poll timer, so it still works even after the 30s poll window has lapsed. The cookie-based polling loop remains as a fallback for cases where those exact global function names aren't present or load-order races before the banner defines them.

`getConsents()` also now prefers reading `window.intaCookieConsents.consents` directly (the banner's already-parsed live object) before falling back to decoding the `IntastellarConsentSolution` cookie — this avoids the cookie encode/decode round trip entirely when the global is available, making the trigger-hook upgrade path faster and more reliable.
