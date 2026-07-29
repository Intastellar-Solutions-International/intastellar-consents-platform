/**
 * Shared ad-platform fetch utilities.
 * Not exposed as a Vercel route (underscore prefix).
 *
 * fetchPlatformData(conn, from, to)        → aggregate { clicks, impressions, spend, currency, sessions }
 * fetchPlatformDataDaily(conn, from, to)   → { [YYYY-MM-DD]: { clicks, impressions, spend, currency } }
 * tryRefreshToken(db, conn)                → conn (possibly with updated access_token)
 * fetchGoogleAdsUtmSources(conn)           → string[] of literal utm_source values found in this
 *                                            Google Ads account's tracking templates/custom params
 * fetchMicrosoftAdsAccounts(accessToken)    → [{id, name, currency}] via the SOAP Customer Management
 *                                            Service (v13) — untested against a live account, see the
 *                                            function's own doc comment
 */

export async function tryRefreshToken(db, conn) {
    if (!conn.token_expires_at) return conn;
    const expiresAt = new Date(conn.token_expires_at).getTime();
    if (Date.now() < expiresAt - 60_000) return conn;
    if (!conn.refresh_token) return conn;

    let refreshUrl, clientId, clientSecret;
    switch (conn.platform) {
        case "google_ads":
        case "google_analytics":
            refreshUrl    = "https://oauth2.googleapis.com/token";
            clientId      = process.env.GOOGLE_CLIENT_ID;
            clientSecret  = process.env.GOOGLE_CLIENT_SECRET;
            break;
        case "linkedin_ads":
            refreshUrl    = "https://www.linkedin.com/oauth/v2/accessToken";
            clientId      = process.env.LINKEDIN_CLIENT_ID;
            clientSecret  = process.env.LINKEDIN_CLIENT_SECRET;
            break;
        case "microsoft_ads":
            refreshUrl    = "https://login.microsoftonline.com/common/oauth2/v2.0/token";
            clientId      = process.env.MICROSOFT_ADS_CLIENT_ID;
            clientSecret  = process.env.MICROSOFT_ADS_CLIENT_SECRET;
            break;
        case "meta_ads": {
            const resp = await fetch(
                `https://graph.facebook.com/v18.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${process.env.META_ADS_CLIENT_ID}&client_secret=${process.env.META_ADS_CLIENT_SECRET}&fb_exchange_token=${conn.access_token}`
            ).catch(() => null);
            if (!resp?.ok) return conn;
            const data = await resp.json().catch(() => null);
            if (!data?.access_token) return conn;
            const newExpiry = data.expires_in ? new Date(Date.now() + data.expires_in * 1000).toISOString() : null;
            await db.query(
                `UPDATE ad_platform_connections SET access_token=$1, token_expires_at=$2, updated_at=NOW()
                 WHERE organisation_id=$3 AND domain=$4 AND platform=$5`,
                [data.access_token, newExpiry, conn.organisation_id, conn.domain, conn.platform]
            );
            return { ...conn, access_token: data.access_token, token_expires_at: newExpiry };
        }
        default:
            return conn;
    }

    if (!clientId || !clientSecret) return conn;
    try {
        const body = new URLSearchParams({
            client_id: clientId, client_secret: clientSecret,
            grant_type: "refresh_token", refresh_token: conn.refresh_token,
        });
        const resp = await fetch(refreshUrl, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: body.toString(),
        });
        if (!resp.ok) return conn;
        const data = await resp.json();
        if (!data.access_token) return conn;
        const newExpiry = data.expires_in ? new Date(Date.now() + data.expires_in * 1000).toISOString() : null;
        await db.query(
            `UPDATE ad_platform_connections
             SET access_token=$1, refresh_token=COALESCE($2, refresh_token), token_expires_at=$3, updated_at=NOW()
             WHERE organisation_id=$4 AND domain=$5 AND platform=$6`,
            [data.access_token, data.refresh_token || null, newExpiry,
             conn.organisation_id, conn.domain, conn.platform]
        );
        return { ...conn, access_token: data.access_token, token_expires_at: newExpiry };
    } catch { return conn; }
}

// ── Aggregate fetch (single call, any date range) ─────────────────────────────

async function fetchGoogleAds(conn, fromDate, toDate) {
    if (!conn.account_id) throw new Error("No Google Ads customer ID linked.");
    const customerId = conn.account_id.replace(/\D/g, "");
    const devToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN || "";

    const headers = {
        Authorization: `Bearer ${conn.access_token}`,
        "developer-token": devToken,
        "Content-Type": "application/json",
    };
    if (conn.login_customer_id) headers["login-customer-id"] = String(conn.login_customer_id).replace(/\D/g, "");

    const post = (query) => fetch(
        `https://googleads.googleapis.com/v25/customers/${customerId}/googleAds:search`,
        { method: "POST", headers, body: JSON.stringify({ query }) }
    );

    let currency = conn.account_currency || null;
    if (!currency) {
        const r = await post("SELECT customer.currency_code FROM customer LIMIT 1").catch(() => null);
        if (r?.ok) {
            const d = await r.json().catch(() => ({}));
            currency = d?.results?.[0]?.customer?.currencyCode || null;
        }
    }

    const resp = await post(`
        SELECT metrics.clicks, metrics.cost_micros, metrics.impressions
        FROM campaign
        WHERE segments.date BETWEEN '${fromDate}' AND '${toDate}'
          AND campaign.status != 'REMOVED'
    `);

    if (!resp.ok) {
        const raw = await resp.text().catch(() => "");
        let err = {};
        try { err = JSON.parse(raw); } catch {}
        const msg = err?.error?.message || `Google Ads API error (${resp.status}): ${raw.slice(0, 200)}`;
        throw new Error(msg);
    }
    const data = await resp.json();
    let clicks = 0, spendMicros = 0, impressions = 0;
    for (const row of (data.results || [])) {
        clicks      += Number(row.metrics?.clicks || 0);
        spendMicros += Number(row.metrics?.costMicros ?? row.metrics?.cost_micros ?? 0);
        impressions += Number(row.metrics?.impressions || 0);
    }
    return { clicks, spend: +(spendMicros / 1_000_000).toFixed(2), currency: currency || "EUR", impressions };
}

// ── Google Ads UTM-source discovery (campaign tracking templates) ────────────
// Google Ads has no "utm_source" field — utm parameters live embedded as raw
// strings in a campaign's (or the whole account's) tracking template, final
// URL suffix, or custom-parameter list. This fetches those raw strings and
// extracts literal utm_source values, for use ALONGSIDE (never instead of)
// the hardcoded google_ads match pattern in the reconciliation UI — some
// campaigns may still use conventional naming even when others don't.
// Accounts that only use ValueTrack placeholders (e.g. {campaignid}) yield
// nothing; that's an honest dead end, not a bug — those aren't fixed values
// to match on, they resolve differently per click.
function extractUtmSources(text) {
    if (!text) return [];
    const out = [];
    const re = /utm_source=([^&{}]+)/gi;
    let m;
    while ((m = re.exec(text))) {
        try {
            const v = decodeURIComponent(m[1]).trim().toLowerCase();
            if (v) out.push(v);
        } catch { /* malformed encoding — skip this match */ }
    }
    return out;
}

function collectUtmSourcesFrom(resource, into) {
    if (!resource) return;
    extractUtmSources(resource.trackingUrlTemplate).forEach(s => into.add(s));
    extractUtmSources(resource.finalUrlSuffix).forEach(s => into.add(s));
    for (const p of (resource.urlCustomParameters || [])) {
        const key = String(p?.key || "").toLowerCase();
        const value = p?.value;
        if (key === "utm_source" && value && !/[{}]/.test(value)) {
            into.add(String(value).trim().toLowerCase());
        }
    }
}

export async function fetchGoogleAdsUtmSources(conn) {
    if (!conn.account_id) throw new Error("No Google Ads customer ID linked.");
    const customerId = conn.account_id.replace(/\D/g, "");
    const devToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN || "";

    const headers = {
        Authorization: `Bearer ${conn.access_token}`,
        "developer-token": devToken,
        "Content-Type": "application/json",
    };
    if (conn.login_customer_id) headers["login-customer-id"] = String(conn.login_customer_id).replace(/\D/g, "");

    const post = (query) => fetch(
        `https://googleads.googleapis.com/v25/customers/${customerId}/googleAds:search`,
        { method: "POST", headers, body: JSON.stringify({ query }) }
    );

    const found = new Set();

    // Account-level fallback — a shared tracking template/suffix, if set,
    // applies to every campaign that doesn't override it.
    const acctResp = await post(
        "SELECT customer.tracking_url_template, customer.final_url_suffix FROM customer LIMIT 1"
    ).catch(() => null);
    if (acctResp?.ok) {
        const d = await acctResp.json().catch(() => ({}));
        collectUtmSourcesFrom(d?.results?.[0]?.customer, found);
    }

    // Campaign-level — overrides the account-level template per-campaign
    // when a campaign sets its own.
    const campResp = await post(`
        SELECT campaign.id, campaign.tracking_url_template, campaign.final_url_suffix, campaign.url_custom_parameters
        FROM campaign
        WHERE campaign.status != 'REMOVED'
    `);
    if (!campResp.ok) {
        const raw = await campResp.text().catch(() => "");
        let err = {};
        try { err = JSON.parse(raw); } catch {}
        throw new Error(err?.error?.message || `Google Ads API error (${campResp.status}): ${raw.slice(0, 200)}`);
    }
    const campData = await campResp.json();
    for (const row of (campData.results || [])) {
        collectUtmSourcesFrom(row.campaign, found);
    }

    return Array.from(found);
}

// ── Microsoft Advertising: Customer Management Service (SOAP) ────────────────
// Unlike every other platform here, Microsoft Advertising has no REST
// endpoint for account discovery — only the SOAP-based Customer Management
// Service (v13). No XML parsing library is added for this (matches the rest
// of this file's dependency-light style, e.g. fetchGoogleAdsUtmSources'
// regex-based parsing above); responses are picked apart with targeted
// regexes for the documented v13 response shape instead. This has NOT been
// verified against a live account — Microsoft's SOAP APIs are notoriously
// strict about exact envelope/namespace formatting, so the first real call
// against a connected account may need a debugging pass. Errors are
// deliberately surfaced with the raw fault text (never silently swallowed to
// an empty array) so that pass has something to go on.
const MS_ADS_SOAP_NS = "https://bingads.microsoft.com/Customer/v13";
const MS_ADS_ENDPOINT = "https://clientcenter.api.bingads.microsoft.com/Api/CustomerManagement/v13/CustomerManagementService.svc";

async function msAdsSoapCall(action, bodyXml, accessToken) {
    const devToken = process.env.MICROSOFT_ADS_DEVELOPER_TOKEN || "";
    const envelope = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:i="http://www.w3.org/2001/XMLSchema-instance">
  <soap:Header>
    <AuthenticationToken xmlns="${MS_ADS_SOAP_NS}">${accessToken}</AuthenticationToken>
    <DeveloperToken xmlns="${MS_ADS_SOAP_NS}">${devToken}</DeveloperToken>
  </soap:Header>
  <soap:Body>${bodyXml}</soap:Body>
</soap:Envelope>`;

    const resp = await fetch(MS_ADS_ENDPOINT, {
        method: "POST",
        headers: {
            "Content-Type": "text/xml; charset=utf-8",
            SOAPAction: `"${MS_ADS_SOAP_NS}/ICustomerManagementService/${action}"`,
        },
        body: envelope,
    });
    const text = await resp.text();
    if (!resp.ok) {
        const faultMsg = /<faultstring>([^<]*)<\/faultstring>/i.exec(text)?.[1]
            || /<(?:\w+:)?Message>([^<]*)<\/(?:\w+:)?Message>/i.exec(text)?.[1]
            || `Microsoft Ads API error (${resp.status}): ${text.slice(0, 300)}`;
        throw new Error(faultMsg);
    }
    return text;
}

function xmlTag(xml, tag) {
    const m = new RegExp(`<(?:\\w+:)?${tag}(?:\\s[^>]*)?>([^<]*)<\\/(?:\\w+:)?${tag}>`, "i").exec(xml);
    return m ? m[1] : null;
}

export async function fetchMicrosoftAdsAccounts(accessToken) {
    // 1. Resolve the authenticated user's UserId (required by SearchAccounts below)
    const userXml = await msAdsSoapCall(
        "GetUser",
        `<GetUserRequest xmlns="${MS_ADS_SOAP_NS}"><UserId i:nil="true"/></GetUserRequest>`,
        accessToken
    );
    const userId = xmlTag(userXml, "Id");
    if (!userId) throw new Error(`Could not resolve Microsoft Advertising user from GetUser response: ${userXml.slice(0, 300)}`);

    // 2. Every account this user has access to
    const searchXml = await msAdsSoapCall(
        "SearchAccounts",
        `<SearchAccountsRequest xmlns="${MS_ADS_SOAP_NS}">
            <PageInfo><Index>0</Index><Size>1000</Size></PageInfo>
            <Predicates>
                <Predicate><Field>UserId</Field><Operator>Equals</Operator><Value>${userId}</Value></Predicate>
            </Predicates>
        </SearchAccountsRequest>`,
        accessToken
    );

    const accounts = [];
    const accountBlocks = searchXml.match(/<AdvertiserAccount[^>]*>[\s\S]*?<\/AdvertiserAccount>/gi) || [];
    for (const block of accountBlocks) {
        const id = xmlTag(block, "Id");
        if (!id) continue;
        const name = xmlTag(block, "Name");
        const number = xmlTag(block, "AccountNumber") || xmlTag(block, "Number");
        const currency = xmlTag(block, "CurrencyCode");
        accounts.push({
            id,
            name: name || (number ? `Account ${number}` : `Account ${id}`),
            currency: currency || null,
        });
    }
    if (accounts.length === 0) {
        // Zero accounts on an otherwise-successful call is more likely a
        // parsing mismatch than a genuinely account-less user — log the raw
        // shape so a live debugging pass has something concrete to work from.
        console.warn("[fetchMicrosoftAdsAccounts] SearchAccounts returned no parseable AdvertiserAccount blocks:", searchXml.slice(0, 500));
    }
    return accounts;
}

async function fetchMetaAds(conn, fromDate, toDate) {
    const accountId = String(conn.account_id || "").replace(/^act_/, "");
    if (!accountId) throw new Error("No Meta Ad Account linked.");
    const params = new URLSearchParams({
        fields: "clicks,spend,impressions,account_currency",
        time_range: JSON.stringify({ since: fromDate, until: toDate }),
        level: "account",
        access_token: conn.access_token,
    });
    const resp = await fetch(`https://graph.facebook.com/v18.0/act_${accountId}/insights?${params}`);
    if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err?.error?.message || `Meta API error (${resp.status})`);
    }
    const data = await resp.json();
    const row = data.data?.[0];
    if (!row) return { clicks: 0, spend: 0, currency: "USD", impressions: 0 };
    return {
        clicks: Number(row.clicks || 0),
        spend: Number(row.spend || 0),
        currency: row.account_currency || "USD",
        impressions: Number(row.impressions || 0),
    };
}

async function fetchLinkedInAds(conn, fromDate, toDate) {
    if (!conn.account_id) throw new Error("No LinkedIn Ads account linked.");
    const [fy, fm, fd] = fromDate.split("-").map(Number);
    const [ty, tm, td] = toDate.split("-").map(Number);
    const params = new URLSearchParams({
        q: "analytics",
        "dateRange.start.year": fy, "dateRange.start.month": fm, "dateRange.start.day": fd,
        "dateRange.end.year": ty,   "dateRange.end.month": tm,   "dateRange.end.day": td,
        pivot: "ACCOUNT",
        timeGranularity: "ALL",
        fields: "clicks,costInUsd,impressions",
    });
    params.append("accounts", `urn:li:sponsoredAccount:${conn.account_id}`);
    const resp = await fetch(`https://api.linkedin.com/rest/adAnalytics?${params}`, {
        headers: { Authorization: `Bearer ${conn.access_token}`, "LinkedIn-Version": "202406" },
    });
    if (!resp.ok) {
        const raw = await resp.text().catch(() => "");
        let err = {};
        try { err = JSON.parse(raw); } catch {}
        throw new Error(err?.message || `LinkedIn API error (${resp.status}): ${raw.slice(0, 200)}`);
    }
    const data = await resp.json();
    const row = data.elements?.[0];
    if (!row) return { clicks: 0, spend: 0, currency: "USD", impressions: 0 };
    return {
        clicks: Number(row.clicks || 0),
        spend: Number(row.costInUsd || 0),
        currency: "USD",
        impressions: Number(row.impressions || 0),
    };
}

async function fetchGoogleAnalytics(conn, fromDate, toDate) {
    if (!conn.account_id) throw new Error("No GA4 property linked.");
    const resp = await fetch(
        `https://analyticsdata.googleapis.com/v1beta/properties/${conn.account_id}:runReport`,
        {
            method: "POST",
            headers: { Authorization: `Bearer ${conn.access_token}`, "Content-Type": "application/json" },
            body: JSON.stringify({
                dateRanges: [{ startDate: fromDate, endDate: toDate }],
                metrics: [{ name: "sessions" }],
            }),
        }
    );
    if (!resp.ok) {
        const raw = await resp.text().catch(() => "");
        let err = {};
        try { err = JSON.parse(raw); } catch {}
        throw new Error(err?.error?.message || `GA4 API error (${resp.status}): ${raw.slice(0, 200)}`);
    }
    const data = await resp.json();
    const sessions = Number(data.rows?.[0]?.metricValues?.[0]?.value || 0);
    return { clicks: sessions, sessions, spend: 0, currency: null, impressions: 0 };
}

export async function fetchPlatformData(conn, fromDate, toDate) {
    switch (conn.platform) {
        case "google_ads":       return fetchGoogleAds(conn, fromDate, toDate);
        case "meta_ads":         return fetchMetaAds(conn, fromDate, toDate);
        case "linkedin_ads":     return fetchLinkedInAds(conn, fromDate, toDate);
        case "google_analytics": return fetchGoogleAnalytics(conn, fromDate, toDate);
        case "microsoft_ads":
            throw new Error("Microsoft Ads automatic import is not yet available.");
        default:
            throw new Error(`Unsupported platform: ${conn.platform}`);
    }
}

// ── Daily granularity fetch (one API call, returns per-day map) ───────────────

async function fetchGoogleAdsDaily(conn, fromDate, toDate) {
    const customerId = conn.account_id.replace(/\D/g, "");
    const devToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN || "";
    const headers = {
        Authorization: `Bearer ${conn.access_token}`,
        "developer-token": devToken,
        "Content-Type": "application/json",
    };
    if (conn.login_customer_id) headers["login-customer-id"] = String(conn.login_customer_id).replace(/\D/g, "");

    const query = `
        SELECT segments.date, metrics.clicks, metrics.cost_micros, metrics.impressions
        FROM campaign
        WHERE segments.date BETWEEN '${fromDate}' AND '${toDate}'
          AND campaign.status != 'REMOVED'
    `;
    const resp = await fetch(
        `https://googleads.googleapis.com/v25/customers/${customerId}/googleAds:search`,
        { method: "POST", headers, body: JSON.stringify({ query }) }
    );
    if (!resp.ok) {
        const raw = await resp.text().catch(() => "");
        let err = {};
        try { err = JSON.parse(raw); } catch {}
        throw new Error(err?.error?.message || `Google Ads API error (${resp.status}): ${raw.slice(0, 200)}`);
    }
    const data = await resp.json();
    const byDay = {};
    for (const row of (data.results || [])) {
        const date = row.segments?.date;
        if (!date) continue;
        if (!byDay[date]) byDay[date] = { clicks: 0, impressions: 0, spendMicros: 0 };
        byDay[date].clicks      += Number(row.metrics?.clicks || 0);
        byDay[date].spendMicros += Number(row.metrics?.costMicros ?? row.metrics?.cost_micros ?? 0);
        byDay[date].impressions += Number(row.metrics?.impressions || 0);
    }
    const currency = conn.account_currency || "EUR";
    const result = {};
    for (const [date, v] of Object.entries(byDay)) {
        result[date] = {
            clicks: v.clicks,
            impressions: v.impressions,
            spend: +(v.spendMicros / 1_000_000).toFixed(4),
            currency,
        };
    }
    return result;
}

async function fetchMetaAdsDaily(conn, fromDate, toDate) {
    const accountId = String(conn.account_id || "").replace(/^act_/, "");
    const params = new URLSearchParams({
        fields: "clicks,spend,impressions,account_currency,date_start",
        time_range: JSON.stringify({ since: fromDate, until: toDate }),
        level: "account",
        time_increment: "1",
        access_token: conn.access_token,
    });
    const resp = await fetch(`https://graph.facebook.com/v18.0/act_${accountId}/insights?${params}`);
    if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err?.error?.message || `Meta API error (${resp.status})`);
    }
    const data = await resp.json();
    const result = {};
    for (const row of (data.data || [])) {
        const date = row.date_start;
        if (!date) continue;
        result[date] = {
            clicks: Number(row.clicks || 0),
            spend: Number(row.spend || 0),
            currency: row.account_currency || "USD",
            impressions: Number(row.impressions || 0),
        };
    }
    return result;
}

async function fetchLinkedInAdsDaily(conn, fromDate, toDate) {
    const [fy, fm, fd] = fromDate.split("-").map(Number);
    const [ty, tm, td] = toDate.split("-").map(Number);
    const params = new URLSearchParams({
        q: "analytics",
        "dateRange.start.year": fy, "dateRange.start.month": fm, "dateRange.start.day": fd,
        "dateRange.end.year": ty,   "dateRange.end.month": tm,   "dateRange.end.day": td,
        pivot: "ACCOUNT",
        timeGranularity: "DAILY",
        fields: "clicks,costInUsd,impressions,dateRange",
    });
    params.append("accounts", `urn:li:sponsoredAccount:${conn.account_id}`);
    const resp = await fetch(`https://api.linkedin.com/rest/adAnalytics?${params}`, {
        headers: { Authorization: `Bearer ${conn.access_token}`, "LinkedIn-Version": "202406" },
    });
    if (!resp.ok) {
        const raw = await resp.text().catch(() => "");
        let err = {};
        try { err = JSON.parse(raw); } catch {}
        throw new Error(err?.message || `LinkedIn API error (${resp.status}): ${raw.slice(0, 200)}`);
    }
    const data = await resp.json();
    const result = {};
    for (const el of (data.elements || [])) {
        const s = el.dateRange?.start;
        if (!s) continue;
        const date = `${s.year}-${String(s.month).padStart(2, "0")}-${String(s.day).padStart(2, "0")}`;
        result[date] = {
            clicks: Number(el.clicks || 0),
            spend: Number(el.costInUsd || 0),
            currency: "USD",
            impressions: Number(el.impressions || 0),
        };
    }
    return result;
}

async function fetchGoogleAnalyticsDaily(conn, fromDate, toDate) {
    const resp = await fetch(
        `https://analyticsdata.googleapis.com/v1beta/properties/${conn.account_id}:runReport`,
        {
            method: "POST",
            headers: { Authorization: `Bearer ${conn.access_token}`, "Content-Type": "application/json" },
            body: JSON.stringify({
                dateRanges: [{ startDate: fromDate, endDate: toDate }],
                dimensions: [{ name: "date" }],
                metrics: [{ name: "sessions" }],
            }),
        }
    );
    if (!resp.ok) {
        const raw = await resp.text().catch(() => "");
        let err = {};
        try { err = JSON.parse(raw); } catch {}
        throw new Error(err?.error?.message || `GA4 API error (${resp.status}): ${raw.slice(0, 200)}`);
    }
    const data = await resp.json();
    const result = {};
    for (const row of (data.rows || [])) {
        const raw = row.dimensionValues?.[0]?.value;
        if (!raw || raw.length !== 8) continue;
        const date = `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
        result[date] = {
            clicks: Number(row.metricValues?.[0]?.value || 0),
            spend: 0,
            currency: null,
            impressions: 0,
        };
    }
    return result;
}

// Returns { [YYYY-MM-DD]: { clicks, impressions, spend, currency } }
export async function fetchPlatformDataDaily(conn, fromDate, toDate) {
    switch (conn.platform) {
        case "google_ads":       return fetchGoogleAdsDaily(conn, fromDate, toDate);
        case "meta_ads":         return fetchMetaAdsDaily(conn, fromDate, toDate);
        case "linkedin_ads":     return fetchLinkedInAdsDaily(conn, fromDate, toDate);
        case "google_analytics": return fetchGoogleAnalyticsDaily(conn, fromDate, toDate);
        default:
            return {};
    }
}
