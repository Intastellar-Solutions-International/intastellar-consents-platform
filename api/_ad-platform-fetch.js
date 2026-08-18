/**
 * Shared ad-platform fetch utilities.
 * Not exposed as a Vercel route (underscore prefix).
 *
 * fetchPlatformData(conn, from, to)        → aggregate { clicks, impressions, spend, currency, sessions }
 * fetchPlatformDataDaily(conn, from, to)   → { [YYYY-MM-DD]: { clicks, impressions, spend, currency } }
 * tryRefreshToken(db, conn)                → conn (possibly with updated access_token)
 * fetchGoogleAdsUtmSources(conn)           → string[] of literal utm_source values found in this
 *                                            Google Ads account's tracking templates/custom params
 * fetchGoogleAdsCampaigns(conn, from, to)   → [{id, name, status, channelType, clicks, impressions,
 *                                            spend, currency}] per-campaign, live (not cached)
 * fetchMetaAdsCampaigns(conn, from, to)     → [{id, name, status, channelType, clicks, impressions,
 *                                            spend, currency}] per-campaign, live (not cached);
 *                                            status/channelType are always null (no Meta equivalent
 *                                            surfaced by the insights endpoint at this level)
 * fetchMicrosoftAdsAccounts(accessToken)    → [{id, name, currency}] via the SOAP Customer Management
 *                                            Service (v13) — untested against a live account, see the
 *                                            function's own doc comment
 * fetchMicrosoftAdsCampaigns(conn, from, to) → [{id, name, status, channelType, clicks, impressions,
 *                                            spend, currency}] via the SOAP Reporting Service (v13) —
 *                                            untested against a live account, see the function's own
 *                                            doc comment
 */

import zlib from "zlib";

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

// ── Google Ads per-campaign performance (real campaign names, not UTM guesses) ─
// Unlike fetchGoogleAds/fetchGoogleAdsDaily (account-wide totals) this groups
// by campaign.id so callers get actual campaign names + metrics straight from
// the platform, for the "campaign data from ad channels" panel — a strictly
// more trustworthy source than matching utm_campaign strings from consent/
// analytics rows, since it can't be broken by inconsistent UTM tagging.
export async function fetchGoogleAdsCampaigns(conn, fromDate, toDate) {
    if (!conn.account_id) throw new Error("No Google Ads customer ID linked.");
    const customerId = conn.account_id.replace(/\D/g, "");
    const devToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN || "";
    const headers = {
        Authorization: `Bearer ${conn.access_token}`,
        "developer-token": devToken,
        "Content-Type": "application/json",
    };
    if (conn.login_customer_id) headers["login-customer-id"] = String(conn.login_customer_id).replace(/\D/g, "");

    const resp = await fetch(
        `https://googleads.googleapis.com/v25/customers/${customerId}/googleAds:search`,
        {
            method: "POST",
            headers,
            body: JSON.stringify({
                query: `
                    SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type,
                           metrics.clicks, metrics.cost_micros, metrics.impressions
                    FROM campaign
                    WHERE segments.date BETWEEN '${fromDate}' AND '${toDate}'
                      AND campaign.status != 'REMOVED'
                `,
            }),
        }
    );
    if (!resp.ok) {
        const raw = await resp.text().catch(() => "");
        let err = {};
        try { err = JSON.parse(raw); } catch {}
        throw new Error(err?.error?.message || `Google Ads API error (${resp.status}): ${raw.slice(0, 200)}`);
    }
    const data = await resp.json();
    const byCampaign = new Map();
    for (const row of (data.results || [])) {
        const id = row.campaign?.id;
        if (id == null) continue;
        const key = String(id);
        if (!byCampaign.has(key)) {
            byCampaign.set(key, {
                id: key,
                name: row.campaign?.name || `Campaign ${key}`,
                status: row.campaign?.status || null,
                channelType: row.campaign?.advertisingChannelType ?? row.campaign?.advertising_channel_type ?? null,
                clicks: 0,
                impressions: 0,
                spendMicros: 0,
            });
        }
        const c = byCampaign.get(key);
        c.clicks      += Number(row.metrics?.clicks || 0);
        c.spendMicros += Number(row.metrics?.costMicros ?? row.metrics?.cost_micros ?? 0);
        c.impressions += Number(row.metrics?.impressions || 0);
    }

    const currency = conn.account_currency || "EUR";
    return Array.from(byCampaign.values())
        .map(c => ({
            id: c.id,
            name: c.name,
            status: c.status,
            channelType: c.channelType,
            clicks: c.clicks,
            impressions: c.impressions,
            spend: +(c.spendMicros / 1_000_000).toFixed(2),
            currency,
        }))
        .sort((a, b) => b.spend - a.spend);
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
// WCF serializes array/complex-type request elements (e.g. Predicate,
// Paging) into this companion namespace, distinct from MS_ADS_SOAP_NS which
// covers the top-level request type itself and its scalar fields.
const MS_ADS_ENTITIES_NS = "https://bingads.microsoft.com/Customer/v13/Entities";
const MS_ADS_ENDPOINT = "https://clientcenter.api.bingads.microsoft.com/Api/CustomerManagement/v13/CustomerManagementService.svc";

async function msAdsSoapCall(action, bodyXml, accessToken) {
    const devToken = process.env.MICROSOFT_ADS_DEVELOPER_TOKEN || "";
    // SOAP 1.1, text/xml. WCF's ContractFilter routes on the <Action> SOAP
    // header element (in the service's own v13 namespace), and expects the
    // short operation name there ("GetUser"), not a fully-qualified action
    // URI — omitting this header, or using the long URI form, produces a
    // "ContractFilter mismatch at the EndpointDispatcher" fault even though
    // the transport-level request itself is accepted. The SOAPAction HTTP
    // header takes the same short name.
    const envelope = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:i="http://www.w3.org/2001/XMLSchema-instance">
  <soap:Header>
    <Action mustUnderstand="1" xmlns="${MS_ADS_SOAP_NS}">${action}</Action>
    <ApplicationToken i:nil="true" xmlns="${MS_ADS_SOAP_NS}"/>
    <AuthenticationToken xmlns="${MS_ADS_SOAP_NS}">${accessToken}</AuthenticationToken>
    <DeveloperToken xmlns="${MS_ADS_SOAP_NS}">${devToken}</DeveloperToken>
  </soap:Header>
  <soap:Body>${bodyXml}</soap:Body>
</soap:Envelope>`;

    const resp = await fetch(MS_ADS_ENDPOINT, {
        method: "POST",
        headers: {
            "Content-Type": "text/xml; charset=utf-8",
            SOAPAction: `"${action}"`,
        },
        body: envelope,
    });
    const text = await resp.text();
    // WCF SOAP faults commonly come back as HTTP 200 with a <s:Fault> body,
    // not just non-2xx — check for a fault envelope even on an "ok" response.
    const faultMatch = /<(?:\w+:)?Reason>[\s\S]*?<(?:\w+:)?Text[^>]*>([^<]*)<|<faultstring>([^<]*)<\/faultstring>/i.exec(text);
    if (!resp.ok || faultMatch) {
        const faultMsg = faultMatch?.[1] || faultMatch?.[2]
            || /<(?:\w+:)?Message>([^<]*)<\/(?:\w+:)?Message>/i.exec(text)?.[1]
            || `Microsoft Ads API error (${resp.status}): ${text.slice(0, 300)}`;
        // The top-level Reason/faultstring is often a generic wrapper (e.g.
        // "Invalid client data. Check the SOAP fault details for more
        // information.") — the actionable error code/message lives in the
        // fault's <detail> block (ApiFaultDetail/AdApiFaultDetail ->
        // OperationError/BatchError entries), so surface that too.
        const detailBlock = /<(?:\w+:)?[Dd]etail[^>]*>([\s\S]*?)<\/(?:\w+:)?[Dd]etail>/i.exec(text)?.[1];
        const codeMsgPairs = detailBlock
            ? [...detailBlock.matchAll(/<(?:\w+:)?Code>([^<]*)<\/(?:\w+:)?Code>\s*<(?:\w+:)?Message>([^<]*)<\/(?:\w+:)?Message>/gi)]
                .map((m) => `${m[1]}: ${m[2]}`)
            : [];
        const detailInfo = codeMsgPairs.length > 0
            ? codeMsgPairs.join("; ")
            : detailBlock?.slice(0, 500);
        throw new Error(detailInfo ? `${faultMsg} | Detail: ${detailInfo}` : faultMsg);
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
    // Predicates must come before PageInfo (WCF deserializes positionally,
    // matching the order in SearchAccountsRequest's data contract), and both
    // their contents live in the Entities namespace, not the default one.
    const searchXml = await msAdsSoapCall(
        "SearchAccounts",
        `<SearchAccountsRequest xmlns="${MS_ADS_SOAP_NS}">
            <Predicates xmlns:e="${MS_ADS_ENTITIES_NS}">
                <e:Predicate><e:Field>UserId</e:Field><e:Operator>Equals</e:Operator><e:Value>${userId}</e:Value></e:Predicate>
            </Predicates>
            <PageInfo xmlns:e="${MS_ADS_ENTITIES_NS}">
                <e:Index>0</e:Index>
                <e:Size>1000</e:Size>
            </PageInfo>
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

// ── Microsoft Advertising: Reporting Service (SOAP, async report flow) ───────
// Unlike Google/Meta, Bing Ads has no synchronous "run this query, get JSON
// back" endpoint for performance metrics — campaign spend/clicks/impressions
// only come out of the Reporting Service's async report flow: submit a
// report request, poll until it's ready, then download a ZIP containing a
// CSV. All three steps, plus the ZIP/CSV parsing, are implemented here by
// hand (no zip or XML library — same dependency-light style as the rest of
// this file). This has NOT been verified against a live account (none is
// connected as of writing) — the request/response shapes follow Microsoft's
// documented v13 schema as closely as possible, but exact element order,
// namespace placement, and required SOAP headers for this service have a
// real chance of needing a debugging pass on the first live call, same as
// fetchMicrosoftAdsAccounts above. Errors are surfaced with raw response
// text (never silently swallowed) so that pass has something to go on.
const MS_ADS_REPORTING_NS = "https://bingads.microsoft.com/Reporting/v13";
const MS_ADS_REPORTING_ENTITIES_NS = "https://bingads.microsoft.com/Reporting/v13/Entities";
const MS_ADS_ARRAYS_NS = "http://schemas.microsoft.com/2003/10/Serialization/Arrays";
const MS_ADS_REPORTING_ENDPOINT = "https://reporting.api.bingads.microsoft.com/Api/Advertiser/Reporting/v13/ReportingService.svc";

async function msAdsReportingSoapCall(action, bodyXml, accessToken, accountId) {
    const devToken = process.env.MICROSOFT_ADS_DEVELOPER_TOKEN || "";
    const envelope = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:i="http://www.w3.org/2001/XMLSchema-instance">
  <soap:Header>
    <Action mustUnderstand="1" xmlns="${MS_ADS_REPORTING_NS}">${action}</Action>
    <ApplicationToken i:nil="true" xmlns="${MS_ADS_REPORTING_NS}"/>
    <AuthenticationToken xmlns="${MS_ADS_REPORTING_NS}">${accessToken}</AuthenticationToken>
    <CustomerAccountId xmlns="${MS_ADS_REPORTING_NS}">${accountId}</CustomerAccountId>
    <DeveloperToken xmlns="${MS_ADS_REPORTING_NS}">${devToken}</DeveloperToken>
  </soap:Header>
  <soap:Body>${bodyXml}</soap:Body>
</soap:Envelope>`;

    const resp = await fetch(MS_ADS_REPORTING_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "text/xml; charset=utf-8", SOAPAction: `"${action}"` },
        body: envelope,
    });
    const text = await resp.text();
    const faultMatch = /<(?:\w+:)?Reason>[\s\S]*?<(?:\w+:)?Text[^>]*>([^<]*)<|<faultstring>([^<]*)<\/faultstring>/i.exec(text);
    if (!resp.ok || faultMatch) {
        const faultMsg = faultMatch?.[1] || faultMatch?.[2]
            || /<(?:\w+:)?Message>([^<]*)<\/(?:\w+:)?Message>/i.exec(text)?.[1]
            || `Microsoft Ads Reporting API error (${resp.status}): ${text.slice(0, 300)}`;
        const detailBlock = /<(?:\w+:)?[Dd]etail[^>]*>([\s\S]*?)<\/(?:\w+:)?[Dd]etail>/i.exec(text)?.[1];
        const codeMsgPairs = detailBlock
            ? [...detailBlock.matchAll(/<(?:\w+:)?Code>([^<]*)<\/(?:\w+:)?Code>\s*<(?:\w+:)?Message>([^<]*)<\/(?:\w+:)?Message>/gi)]
                .map((m) => `${m[1]}: ${m[2]}`)
            : [];
        const detailInfo = codeMsgPairs.length > 0 ? codeMsgPairs.join("; ") : detailBlock?.slice(0, 500);
        throw new Error(detailInfo ? `${faultMsg} | Detail: ${detailInfo}` : faultMsg);
    }
    return text;
}

function msAdsXmlTag(xml, tag) {
    const m = new RegExp(`<(?:\\w+:)?${tag}(?:\\s[^>]*)?>([^<]*)<\\/(?:\\w+:)?${tag}>`, "i").exec(xml);
    return m ? m[1] : null;
}

function toBingDateParts(isoDate) {
    const [year, month, day] = isoDate.split("-").map(Number);
    return { day, month, year };
}

// Minimal hand-rolled ZIP reader — Bing report downloads are a ZIP containing
// exactly one CSV entry, so this reads the End Of Central Directory record
// (searched from the end, since a comment field can precede it) to locate
// the central directory, follows its first entry to the entry's local file
// header, and inflates (or passes through, if stored uncompressed) just
// that one entry. Not a general-purpose unzip — deliberately narrow to what
// a single-file report archive needs.
function readUInt16LE(buf, o) { return buf[o] | (buf[o + 1] << 8); }
function readUInt32LE(buf, o) { return (buf[o] | (buf[o + 1] << 8) | (buf[o + 2] << 16) | (buf[o + 3] << 24)) >>> 0; }

function unzipFirstEntry(buf) {
    const EOCD_SIG = 0x06054b50;
    let eocdOffset = -1;
    const searchStart = Math.max(0, buf.length - 22 - 65536);
    for (let i = buf.length - 22; i >= searchStart; i--) {
        if (readUInt32LE(buf, i) === EOCD_SIG) { eocdOffset = i; break; }
    }
    if (eocdOffset === -1) throw new Error("Report download is not a valid ZIP (no End Of Central Directory record found)");
    const cdOffset = readUInt32LE(buf, eocdOffset + 16);

    const CD_SIG = 0x02014b50;
    if (readUInt32LE(buf, cdOffset) !== CD_SIG) throw new Error("Malformed ZIP central directory in report download");
    const compMethod = readUInt16LE(buf, cdOffset + 10);
    const compSize    = readUInt32LE(buf, cdOffset + 20);
    const lfhOffset   = readUInt32LE(buf, cdOffset + 42);

    const LFH_SIG = 0x04034b50;
    if (readUInt32LE(buf, lfhOffset) !== LFH_SIG) throw new Error("Malformed ZIP local file header in report download");
    const lfhNameLen  = readUInt16LE(buf, lfhOffset + 26);
    const lfhExtraLen = readUInt16LE(buf, lfhOffset + 28);
    const dataStart = lfhOffset + 30 + lfhNameLen + lfhExtraLen;
    const compressed = buf.slice(dataStart, dataStart + compSize);

    if (compMethod === 0) return compressed;
    if (compMethod === 8) return zlib.inflateRawSync(compressed);
    throw new Error(`Unsupported ZIP compression method in report download: ${compMethod}`);
}

// Bing's CSV reports include a couple of preamble/footer lines around the
// actual data by default (report title, date-range line, blank lines) —
// rather than depending on exact line positions, this finds the header row
// by content (the first line starting with a quoted "CampaignId") and reads
// until a blank line or EOF. Handles the common case of no embedded commas/
// quotes needing escaping in campaign names; a campaign name containing a
// comma would need full CSV-quote-aware parsing, which this simple split
// does not do.
function parseSimpleCsv(text) {
    const lines = text.split(/\r?\n/);
    // Matched by presence, not position — the requested Columns order isn't
    // guaranteed to be the order the report actually comes back in.
    const headerIdx = lines.findIndex(l => /(^|,)"?CampaignId"?(,|$)/i.test(l.trim()));
    if (headerIdx === -1) return [];
    const headers = lines[headerIdx].split(",").map(h => h.replace(/^"|"$/g, "").trim());
    const rows = [];
    for (let i = headerIdx + 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) break;
        const cells = line.split(",").map(c => c.replace(/^"|"$/g, "").trim());
        const row = {};
        headers.forEach((h, idx) => { row[h] = cells[idx]; });
        rows.push(row);
    }
    return rows;
}

export async function fetchMicrosoftAdsCampaigns(conn, fromDate, toDate) {
    if (!conn.account_id) throw new Error("No Microsoft Advertising account linked.");
    const { day: sd, month: sm, year: sy } = toBingDateParts(fromDate);
    const { day: ed, month: em, year: ey } = toBingDateParts(toDate);

    const submitBody = `
        <SubmitGenerateReportRequest xmlns="${MS_ADS_REPORTING_NS}">
            <ReportRequest i:type="CampaignPerformanceReportRequest">
                <Format>Csv</Format>
                <ReportName>ConversionsCampaignPerformance</ReportName>
                <ReturnOnlyCompleteData>false</ReturnOnlyCompleteData>
                <Aggregation>Summary</Aggregation>
                <Columns xmlns:e="${MS_ADS_REPORTING_ENTITIES_NS}">
                    <e:CampaignPerformanceReportColumn>CampaignId</e:CampaignPerformanceReportColumn>
                    <e:CampaignPerformanceReportColumn>CampaignName</e:CampaignPerformanceReportColumn>
                    <e:CampaignPerformanceReportColumn>CampaignStatus</e:CampaignPerformanceReportColumn>
                    <e:CampaignPerformanceReportColumn>CampaignType</e:CampaignPerformanceReportColumn>
                    <e:CampaignPerformanceReportColumn>Impressions</e:CampaignPerformanceReportColumn>
                    <e:CampaignPerformanceReportColumn>Clicks</e:CampaignPerformanceReportColumn>
                    <e:CampaignPerformanceReportColumn>Spend</e:CampaignPerformanceReportColumn>
                </Columns>
                <Scope xmlns:e="${MS_ADS_REPORTING_ENTITIES_NS}">
                    <e:AccountIds xmlns:a="${MS_ADS_ARRAYS_NS}"><a:long>${conn.account_id}</a:long></e:AccountIds>
                </Scope>
                <Time xmlns:e="${MS_ADS_REPORTING_ENTITIES_NS}">
                    <e:CustomDateRangeStart><e:Day>${sd}</e:Day><e:Month>${sm}</e:Month><e:Year>${sy}</e:Year></e:CustomDateRangeStart>
                    <e:CustomDateRangeEnd><e:Day>${ed}</e:Day><e:Month>${em}</e:Month><e:Year>${ey}</e:Year></e:CustomDateRangeEnd>
                    <e:ReportTimeZone>GreenwichMeanTimeDublinEdinburghLisbonLondon</e:ReportTimeZone>
                </Time>
            </ReportRequest>
        </SubmitGenerateReportRequest>`;

    const submitXml = await msAdsReportingSoapCall("SubmitGenerateReport", submitBody, conn.access_token, conn.account_id);
    const reportRequestId = msAdsXmlTag(submitXml, "ReportRequestId");
    if (!reportRequestId) throw new Error(`Could not read ReportRequestId from SubmitGenerateReport response: ${submitXml.slice(0, 300)}`);

    const pollBody = `<PollGenerateReportRequest xmlns="${MS_ADS_REPORTING_NS}"><ReportRequestId>${reportRequestId}</ReportRequestId></PollGenerateReportRequest>`;

    // Reports typically finish in a few seconds but there's no push
    // notification here, only polling — cap total wait so a slow/stuck
    // report fails the request instead of hanging it indefinitely.
    let downloadUrl = null;
    const maxAttempts = 10;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        await new Promise(r => setTimeout(r, attempt === 0 ? 1500 : 3000));
        const pollXml = await msAdsReportingSoapCall("PollGenerateReport", pollBody, conn.access_token, conn.account_id);
        const status = msAdsXmlTag(pollXml, "Status");
        if (status === "Success") {
            downloadUrl = msAdsXmlTag(pollXml, "ReportDownloadUrl");
            break;
        }
        if (status === "Error") {
            throw new Error(`Microsoft Ads report generation failed: ${pollXml.slice(0, 300)}`);
        }
        // status === "Pending" (or unrecognized) — keep polling
    }
    if (!downloadUrl) throw new Error("Microsoft Ads report did not complete within the polling window.");

    const zipResp = await fetch(downloadUrl);
    if (!zipResp.ok) throw new Error(`Could not download Microsoft Ads report (${zipResp.status}).`);
    const zipBuf = Buffer.from(await zipResp.arrayBuffer());
    const csvBuf = unzipFirstEntry(zipBuf);
    const rows = parseSimpleCsv(csvBuf.toString("utf8"));

    const currency = conn.account_currency || "USD";
    return rows
        .filter(r => r.CampaignId)
        .map(r => ({
            id: r.CampaignId,
            name: r.CampaignName || `Campaign ${r.CampaignId}`,
            status: r.CampaignStatus || null,
            channelType: r.CampaignType || null,
            clicks: Number(r.Clicks || 0),
            impressions: Number(r.Impressions || 0),
            spend: Number(String(r.Spend || "0").replace(/[^0-9.-]/g, "")) || 0,
            currency,
        }))
        .sort((a, b) => b.spend - a.spend);
}

export async function fetchMetaAdsCampaigns(conn, fromDate, toDate) {
    const accountId = String(conn.account_id || "").replace(/^act_/, "");
    if (!accountId) throw new Error("No Meta Ad Account linked.");
    // level: "campaign" with no time_increment returns one row per campaign
    // already aggregated over the whole time_range, unlike Google Ads' query
    // above which returns one row per campaign per day and needs summing.
    const params = new URLSearchParams({
        fields: "campaign_id,campaign_name,clicks,spend,impressions,account_currency",
        time_range: JSON.stringify({ since: fromDate, until: toDate }),
        level: "campaign",
        limit: "500",
        access_token: conn.access_token,
    });
    const resp = await fetch(`https://graph.facebook.com/v18.0/act_${accountId}/insights?${params}`);
    if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err?.error?.message || `Meta API error (${resp.status})`);
    }
    const data = await resp.json();
    const fallbackCurrency = conn.account_currency || "USD";
    return (data.data || [])
        .filter(row => row.campaign_id)
        .map(row => ({
            id: row.campaign_id,
            name: row.campaign_name || `Campaign ${row.campaign_id}`,
            status: null,
            channelType: null,
            clicks: Number(row.clicks || 0),
            impressions: Number(row.impressions || 0),
            spend: Number(row.spend || 0),
            currency: row.account_currency || fallbackCurrency,
        }))
        .sort((a, b) => b.spend - a.spend);
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

// Account-level totals via the same per-campaign report, summed — avoids
// standing up a second (AccountPerformanceReportRequest) report shape for
// an aggregate that the campaign-level report already contains.
async function fetchMicrosoftAds(conn, fromDate, toDate) {
    const campaigns = await fetchMicrosoftAdsCampaigns(conn, fromDate, toDate);
    const totals = campaigns.reduce((acc, c) => ({
        clicks: acc.clicks + c.clicks,
        impressions: acc.impressions + c.impressions,
        spend: acc.spend + c.spend,
    }), { clicks: 0, impressions: 0, spend: 0 });
    return { ...totals, spend: +totals.spend.toFixed(2), currency: conn.account_currency || "USD" };
}

export async function fetchPlatformData(conn, fromDate, toDate) {
    switch (conn.platform) {
        case "google_ads":       return fetchGoogleAds(conn, fromDate, toDate);
        case "meta_ads":         return fetchMetaAds(conn, fromDate, toDate);
        case "linkedin_ads":     return fetchLinkedInAds(conn, fromDate, toDate);
        case "google_analytics": return fetchGoogleAnalytics(conn, fromDate, toDate);
        case "microsoft_ads":    return fetchMicrosoftAds(conn, fromDate, toDate);
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

// Same Reporting Service flow as fetchMicrosoftAdsCampaigns, with
// Aggregation: Daily and a TimePeriod column instead of Summary — one row
// per campaign per day, summed here into an account-level daily total to
// match every other platform's fetchPlatformDataDaily shape. Same
// live-account caveat as fetchMicrosoftAdsCampaigns above.
async function fetchMicrosoftAdsDaily(conn, fromDate, toDate) {
    if (!conn.account_id) throw new Error("No Microsoft Advertising account linked.");
    const { day: sd, month: sm, year: sy } = toBingDateParts(fromDate);
    const { day: ed, month: em, year: ey } = toBingDateParts(toDate);

    const submitBody = `
        <SubmitGenerateReportRequest xmlns="${MS_ADS_REPORTING_NS}">
            <ReportRequest i:type="CampaignPerformanceReportRequest">
                <Format>Csv</Format>
                <ReportName>ConversionsCampaignPerformanceDaily</ReportName>
                <ReturnOnlyCompleteData>false</ReturnOnlyCompleteData>
                <Aggregation>Daily</Aggregation>
                <Columns xmlns:e="${MS_ADS_REPORTING_ENTITIES_NS}">
                    <e:CampaignPerformanceReportColumn>CampaignId</e:CampaignPerformanceReportColumn>
                    <e:CampaignPerformanceReportColumn>TimePeriod</e:CampaignPerformanceReportColumn>
                    <e:CampaignPerformanceReportColumn>Impressions</e:CampaignPerformanceReportColumn>
                    <e:CampaignPerformanceReportColumn>Clicks</e:CampaignPerformanceReportColumn>
                    <e:CampaignPerformanceReportColumn>Spend</e:CampaignPerformanceReportColumn>
                </Columns>
                <Scope xmlns:e="${MS_ADS_REPORTING_ENTITIES_NS}">
                    <e:AccountIds xmlns:a="${MS_ADS_ARRAYS_NS}"><a:long>${conn.account_id}</a:long></e:AccountIds>
                </Scope>
                <Time xmlns:e="${MS_ADS_REPORTING_ENTITIES_NS}">
                    <e:CustomDateRangeStart><e:Day>${sd}</e:Day><e:Month>${sm}</e:Month><e:Year>${sy}</e:Year></e:CustomDateRangeStart>
                    <e:CustomDateRangeEnd><e:Day>${ed}</e:Day><e:Month>${em}</e:Month><e:Year>${ey}</e:Year></e:CustomDateRangeEnd>
                    <e:ReportTimeZone>GreenwichMeanTimeDublinEdinburghLisbonLondon</e:ReportTimeZone>
                </Time>
            </ReportRequest>
        </SubmitGenerateReportRequest>`;

    const submitXml = await msAdsReportingSoapCall("SubmitGenerateReport", submitBody, conn.access_token, conn.account_id);
    const reportRequestId = msAdsXmlTag(submitXml, "ReportRequestId");
    if (!reportRequestId) throw new Error(`Could not read ReportRequestId from SubmitGenerateReport response: ${submitXml.slice(0, 300)}`);

    const pollBody = `<PollGenerateReportRequest xmlns="${MS_ADS_REPORTING_NS}"><ReportRequestId>${reportRequestId}</ReportRequestId></PollGenerateReportRequest>`;
    let downloadUrl = null;
    for (let attempt = 0; attempt < 10; attempt++) {
        await new Promise(r => setTimeout(r, attempt === 0 ? 1500 : 3000));
        const pollXml = await msAdsReportingSoapCall("PollGenerateReport", pollBody, conn.access_token, conn.account_id);
        const status = msAdsXmlTag(pollXml, "Status");
        if (status === "Success") { downloadUrl = msAdsXmlTag(pollXml, "ReportDownloadUrl"); break; }
        if (status === "Error") throw new Error(`Microsoft Ads report generation failed: ${pollXml.slice(0, 300)}`);
    }
    if (!downloadUrl) throw new Error("Microsoft Ads report did not complete within the polling window.");

    const zipResp = await fetch(downloadUrl);
    if (!zipResp.ok) throw new Error(`Could not download Microsoft Ads report (${zipResp.status}).`);
    const csvBuf = unzipFirstEntry(Buffer.from(await zipResp.arrayBuffer()));
    const rows = parseSimpleCsv(csvBuf.toString("utf8"));
    const currency = conn.account_currency || "USD";

    const result = {};
    for (const r of rows) {
        // TimePeriod comes back as MM/DD/YYYY per Bing's documented Csv format.
        const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(r.TimePeriod || "").trim());
        if (!m) continue;
        const date = `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
        if (!result[date]) result[date] = { clicks: 0, impressions: 0, spend: 0, currency };
        result[date].clicks      += Number(r.Clicks || 0);
        result[date].impressions += Number(r.Impressions || 0);
        result[date].spend       += Number(String(r.Spend || "0").replace(/[^0-9.-]/g, "")) || 0;
    }
    for (const date of Object.keys(result)) {
        result[date].spend = +result[date].spend.toFixed(2);
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
        case "microsoft_ads":    return fetchMicrosoftAdsDaily(conn, fromDate, toDate);
        default:
            return {};
    }
}
