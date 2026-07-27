# CMP banner interface

The cookie consent banner widget that customers embed alongside the analytics script (`api/a.js`, see [analytics_consent_check.md](analytics_consent_check.md)) is **not part of this repository** — it's a separate external script. It writes the `IntastellarConsentSolution` cookie that `api/a.js` reads to gate tracking.

That banner script exposes the following DOM hooks and globals, useful for automation/testing/debugging consent flows:

## Checkbox selectors (category toggles in the banner UI)

```js
const FunctionalCheckbox = document.querySelector("#functional");
const StaticsCheckBox = document.querySelector("#statics");   // note: "statics", not "statistics" — matches the banner's actual element id
const MarketingCheckBox = document.querySelector("#marketing");
```

## Global trigger functions

- `IntaAcceptAll()` — accepts all cookie categories at once (equivalent to clicking "Accept All"; sets all three categories to true).
- `IntaSaveSettings()` — saves whatever the current checkbox states are (granular save, for a user who selected only some categories).

## Live consent object — `window.intaCookieConsents`

Also persisted into the `IntastellarConsentSolution` cookie (`__inta1.`-encoded, same shape):

```js
{
    consents: {
        staticsticCookies: false,   // NOTE: banner's own typo — "staticstic", not "statistic" — see analytics_consent_check.md
        functionalCookies: false,
        advertisementCookies: false,
    },
    time: new Date().toGMTString(),
    uid: Math.random().toString(16).slice(2),
    domain: window?.INTA?.settings?.rootDomain || window.location.host,
    sharingDomains: [],
    tcString: null,
}
```

The `staticsticCookies` typo caused a real production bug in `api/a.js` — don't "correct" it back to `statisticCookies` when reading the banner's actual data, that field genuinely doesn't exist there. See [analytics_consent_check.md](analytics_consent_check.md).

## Why this matters

The banner's source isn't in this codebase, so this interface can't be rediscovered by reading the repo — it has to be remembered or re-derived by inspecting the live embed script on a customer site.

As of the `api/a.js` update on 2026-07-27, the analytics embed script wraps (`hookConsentTrigger`) both `IntaAcceptAll` and `IntaSaveSettings` on `window` so it can react to consent the instant the visitor accepts/saves, rather than relying solely on polling the cookie (see [analytics_consent_check.md](analytics_consent_check.md)).

## How to apply

Use these selectors/functions when writing browser automation (e.g. Claude-in-Chrome scripts, QA scripts, or manual console testing) to simulate a visitor accepting all cookies vs. only specific categories, e.g. to test whether `analytics_events.consent_stat` gets set correctly end-to-end. Relevant when debugging discrepancies between the CMP Live View and the Analytics dashboard consent counts.
