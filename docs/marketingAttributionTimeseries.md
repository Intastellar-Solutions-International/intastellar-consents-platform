# `marketingAttributionTimeseries` — backend contract

Companion to the existing `marketingAttribution` endpoint. Returns the same
attribution rows **grouped by day** so the marketing dashboard can render a
Line chart of consents-over-time per channel (current vs comparison period).

The frontend treats this endpoint as **optional**: if it returns 404, a
non-JSON body, or no `timeseries` array, the Line chart is hidden silently
and the rest of the dashboard continues to work. This lets you ship the
frontend before the backend is wired up.

## Request

```
GET {PrimaryHost}/analytics/gdpr/marketingAttributionTimeseries
Authorization:   <jwt>
Organisation:    <org-id>
Domains:         <same header the other gdpr endpoints accept>
FromDate:        YYYY-MM-DD
ToDate:          YYYY-MM-DD
CompareRange:    ""                (empty when comparison is off)
                 | "<integer days>"
                 | "Same period last year"
PreviousPeriod:  YYYY-MM-DD        (required when CompareRange is set)
PreviousPeriod2: YYYY-MM-DD        (required when CompareRange is set)
X-Compare-Start: YYYY-MM-DD        (mirror of PreviousPeriod)
X-Compare-End:   YYYY-MM-DD        (mirror of PreviousPeriod2)
X-Compare-Range: <same as CompareRange>
```

Headers match `marketingAttribution` 1:1 so the existing auth/domain/date
middleware can be reused.

## Response

```json
{
  "timeseries": [
    {
      "date": "2026-04-15",
      "utm_source": "google",
      "utm_medium": "cpc",
      "utm_campaign": "spring_sale",
      "referrer_host": "google.com",
      "consents": 42,
      "accept_all": 27,
      "essential_only": 9,
      "granular": 6
    }
  ],
  "compareTimeseries": [
    {
      "date": "2026-03-15",
      "utm_source": "google",
      "utm_medium": "cpc",
      "utm_campaign": "spring_sale",
      "referrer_host": "google.com",
      "consents": 38,
      "accept_all": 24,
      "essential_only": 8,
      "granular": 6
    }
  ]
}
```

Rules:

- `date` must be a local-calendar `YYYY-MM-DD` (the same timezone the rest of
  the analytics stack uses). The frontend does **not** apply timezone math —
  whatever string you return is what the X-axis shows.
- `compareTimeseries` is only expected when `CompareRange` is a non-empty
  value. When comparison is off, omit the key (or return `[]`).
- The grouping tuple **must match** what `marketingAttribution` returns for
  the same window — `(utm_source, utm_medium, utm_campaign, referrer_host)`.
  The frontend derives the "channel" client-side from that tuple via
  `deriveMarketingChannel(...)` in `MarketingReport/index.js`, so any grouping
  the primary endpoint already supports will just work here.
- Empty days are allowed to be omitted; the frontend tolerates gaps.
- Numeric counts default to `0` if missing.

## SQL sketch (MySQL)

Adapts the same underlying query that powers `marketingAttribution`, just
replacing the `GROUP BY` with a per-day variant:

```sql
SELECT
    DATE(uct.consentsGiving)                 AS date,
    COALESCE(uct.utm_source, '—')            AS utm_source,
    COALESCE(uct.utm_medium, '—')            AS utm_medium,
    COALESCE(uct.utm_campaign, '—')          AS utm_campaign,
    COALESCE(uct.referrer_host, '—')         AS referrer_host,
    COUNT(*)                                 AS consents,
    SUM(CASE WHEN uct.choice_kind = 'accept_all'     THEN 1 ELSE 0 END) AS accept_all,
    SUM(CASE WHEN uct.choice_kind = 'essential_only' THEN 1 ELSE 0 END) AS essential_only,
    SUM(CASE WHEN uct.choice_kind = 'granular'       THEN 1 ELSE 0 END) AS granular
FROM user_consents_tracking uct
WHERE uct.domain IN (:domains)
  AND uct.consentsGiving >= :from
  AND uct.consentsGiving <  :toExclusive
GROUP BY
    DATE(uct.consentsGiving),
    utm_source, utm_medium, utm_campaign, referrer_host
ORDER BY
    date ASC;
```

Run the same query against the `PreviousPeriod` / `PreviousPeriod2` window
(when present) for `compareTimeseries`.

## Why this shape

- **One endpoint per window, not per channel.** Channels are derived from the
  UTM tuple client-side (heuristics around organic vs paid, Meta placements,
  legacy adwords labels, etc.). Returning raw tuples keeps the backend
  ignorant of those heuristics and means adding a new channel rule later
  doesn't require a migration.
- **Payload stays small.** A tenant with ~50 distinct attribution tuples over
  90 days sends ~4 500 rows ≈ 150 KB gzipped. Well under any real budget.
- **Graceful degrade.** If the endpoint is absent, the existing dashboard
  keeps working. The frontend never hard-fails on this call.
