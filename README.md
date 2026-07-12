# Intastellar Consents | CMP

This is the dashboard for our Consent Management Platform, where we can keep track of our [Intastellar Cookie Consents](https://www.intastellar-consents.com)

| Type        | Url                                                                                              | Description                         | Branch      |
| ----------- | ------------------------------------------------------------------------------------------------ | ----------------------------------- | ----------- |
| Development | [https://consents.inta.dev](https://consents.inta.dev)                                           | This url is for development purpose | development |
| This url is for testing purpose     | qa-test     |
| Production  | [https://www.intastellarconsents.com](https://www.intastellarconsents.com)                       | This url is for production purpose  | deployment  |

---

## Cookie Banner Integration — Public API Endpoints

These endpoints are called by the **cookie banner script** (separate repo) at runtime. All are public (no auth required) and hosted on `https://www.intastellarconsents.com`.

---

### 1. Jurisdiction Config

```
GET /api/jurisdiction-config-public?org={organisationId}
```

Returns the active jurisdiction mode and per-framework settings for the organisation. Call this at banner initialisation to know which regulations to apply and what banner type to show.

**Response:**
```json
{
  "mode": "auto",
  "frameworks": {
    "GDPR":  { "enabled": true,  "bannerType": "opt-in"  },
    "LGPD":  { "enabled": true,  "bannerType": "auto"    },
    "CCPA":  { "enabled": true,  "bannerType": "opt-out" },
    "PDPA":  { "enabled": true,  "bannerType": "auto"    },
    "POPIA": { "enabled": true,  "bannerType": "auto"    }
  }
}
```

**`mode` values:**
- `"auto"` — no saved config, or the org has not enabled managed mode. The banner should auto-detect the visitor's country and apply all matching regulations. This is the default for sites without a CMP account (omit `?org=` entirely).
- `"managed"` — the org has configured which regulations apply. Only show a banner for frameworks where `enabled === true`. Use `bannerType` for that framework to decide opt-in / opt-out / notice-only behaviour.

**`bannerType` values:**
- `"opt-in"` — visitor must actively accept before non-essential cookies are set (GDPR default)
- `"opt-out"` — cookies are set by default; visitor can opt out (CCPA default)
- `"notice-only"` — display a notice only, no consent action required
- `"auto"` — use the regulation's natural default (banner decides based on detected framework)

**Notes:**
- Response is cached for 5 minutes (`Cache-Control: public, s-maxage=300`).
- If the database is unreachable the endpoint fails open and returns `mode: "auto"` so the banner keeps working.
- If `?org=` is omitted the response is always `mode: "auto"` — suitable for small sites embedding the banner without a CMP account.

---

---

### 2. Cookie Categories, Cookies & Vendors

```
GET /api/cookie-banner?domain={domain}
```

Public, no auth required. Returns all cookies and vendors detected in the most recent scan for a domain, grouped into the four standard consent categories. This is the primary endpoint the banner calls on init to know what to declare and what to block.

**Query params:**
- `domain` — hostname of the site, e.g. `example.com` or `www.example.com`

**Response:**
```json
{
  "domain": "example.com",
  "scanned_at": "2026-07-10T03:00:00Z",
  "categories": {
    "necessary": {
      "cookies": [{ "name": "cc_cookie", "domain": ".example.com", "session": false, "httpOnly": false, "secure": true, "sameSite": "Lax", "bannerCategory": "necessary" }],
      "vendors": []
    },
    "analytics": {
      "cookies": [{ "name": "_ga", "domain": ".example.com", "session": false, "expires": 1234567890, "bannerCategory": "analytics" }],
      "vendors": [{ "service": "Google Analytics", "host": "analytics.google.com", "bannerCategory": "analytics", "dataRegion": "us", "dataCountry": "US", "resourceType": "script" }]
    },
    "marketing": {
      "cookies": [],
      "vendors": [{ "service": "Facebook / Meta Pixel", "host": "connect.facebook.net", "bannerCategory": "marketing", "dataRegion": "us", "dataCountry": "US", "resourceType": "script" }]
    },
    "functional": {
      "cookies": [],
      "vendors": []
    }
  }
}
```

**Categories:**
- `necessary` — first-party cookies and CMP infrastructure. Never blocked.
- `analytics` — analytics platforms (Google Analytics, Hotjar, Mixpanel, etc.)
- `marketing` — advertising pixels, social trackers, fingerprinting (Meta Pixel, LinkedIn, TikTok, etc.)
- `functional` — chat widgets, CDN/font services, unclassified third-parties

**What the banner should do with this:**
- Render the cookie declaration UI from the `categories` object (show cookie names, vendors, purposes per category)
- Block script requests to any vendor `host` under `analytics`, `marketing`, `functional` until the visitor consents to that category
- Block cookies listed under those categories until consent is granted
- `necessary` cookies and vendors are always allowed — never prompt or block them

**Notes:**
- CORS is wildcard (`*`) — safe to call from any website
- Response is cached for 1 hour at the CDN edge (`s-maxage=3600`), with a 24-hour `stale-while-revalidate` window so banners never block on a cold cache miss
- Returns `404` if no completed scan exists for the domain — banner should fall back to showing categories with empty lists (no blocking, basic notice only)
- Run a scan from the Intastellar dashboard to populate data for a domain

---

### TODO — Additional endpoints to implement in the banner repo

The following behaviours already exist in the CMP dashboard but the banner script needs to call them:

| # | What | Endpoint to call | When |
|---|------|-----------------|------|
| 1 | **Jurisdiction config** | `GET /api/jurisdiction-config-public?org=` | On banner init — built, see above |
| 2 | **Cookie categories, cookies & vendors** | `GET /api/cookie-banner?domain=` | On banner init — built, see above |
| 3 | **Record consent** | Existing PHP endpoint on `apis.intastellarsolutions.com` | When visitor accepts / rejects — already wired |
| 4 | **Respect managed mode** | Use `mode` + `frameworks` from endpoint #1 | Instead of always auto-applying LGPD, CCPA, POPIA, PDPA |
| 5 | **Per-framework banner type** | Use `bannerType` per framework from endpoint #1 | Show opt-in vs opt-out vs notice-only per regulation |
| 6 | **Script/cookie blocking** | Use `categories` from endpoint #2 | Block vendors + cookies by category until consent given |
