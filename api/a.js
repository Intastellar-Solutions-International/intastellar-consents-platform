/**
 * GET  /api/a  → serves the Intastellar First-Party Analytics embed script
 * POST /api/a  → ingest endpoint receiving pageview events from embedded sites
 *
 * This single endpoint is embedded on customer websites. It must:
 *  - Use CORS wildcard (third-party origin)
 *  - Never store IP addresses (country derived from Vercel headers, raw IP discarded)
 *  - Only accept events whose site_id is registered and active
 */

import pkg from "pg";
const { Pool } = pkg;

let pool;
function getPool() {
    if (!pool) {
        pool = new Pool({
            connectionString: process.env.POSTGRES_URL,
            ssl: { rejectUnauthorized: false },
            max: 5,
        });
    }
    return pool;
}

// ── GDPR-safe UA parsing ──────────────────────────────────────────────────────
// We only categorise, never store the raw UA string.
function parseUA(ua = "") {
    let browser = "other";
    if (/Edg\//.test(ua))                              browser = "Edge";
    else if (/OPR\/|Opera/.test(ua))                   browser = "Opera";
    else if (/Chrome\//.test(ua) && !/Chromium/.test(ua)) browser = "Chrome";
    else if (/Firefox\//.test(ua))                     browser = "Firefox";
    else if (/Safari\//.test(ua) && !/Chrome/.test(ua)) browser = "Safari";

    let os = "other";
    if (/Windows/.test(ua))                            os = "Windows";
    else if (/iPhone/.test(ua))                        os = "iOS";
    else if (/iPad/.test(ua))                          os = "iPadOS";
    else if (/Android/.test(ua))                       os = "Android";
    else if (/Mac OS X/.test(ua))                      os = "macOS";
    else if (/Linux/.test(ua))                         os = "Linux";

    return { browser, os };
}

// ── Tables (auto-created / migrated on first use) ────────────────────────────
async function ensureTables(db) {
    await db.query(`
        CREATE TABLE IF NOT EXISTS analytics_sites (
            id              VARCHAR(32)  PRIMARY KEY,
            organisation_id INTEGER      NOT NULL,
            domain          VARCHAR(255) NOT NULL,
            active          BOOLEAN      NOT NULL DEFAULT true,
            created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
            UNIQUE (organisation_id, domain)
        );
        CREATE TABLE IF NOT EXISTS analytics_events (
            id              BIGSERIAL    PRIMARY KEY,
            site_id         VARCHAR(32)  NOT NULL,
            organisation_id INTEGER      NOT NULL,
            -- NULL for minimal (no-consent) events — avoids cross-request linking
            session_id      VARCHAR(64),
            received_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
            -- "minimal" = path only, consent choices; "full" = enriched with UTMs/session/device
            consent_level   VARCHAR(8)   NOT NULL DEFAULT 'minimal',
            -- consent state at the time of the event
            consent_stat    BOOLEAN,
            consent_func    BOOLEAN,
            consent_adv     BOOLEAN,
            url             TEXT         NOT NULL,
            pathname        TEXT         NOT NULL,
            title           VARCHAR(500),
            referrer_host   VARCHAR(255),
            utm_source      VARCHAR(255),
            utm_medium      VARCHAR(255),
            utm_campaign    VARCHAR(255),
            utm_content     VARCHAR(255),
            country_code    CHAR(2),
            region          VARCHAR(64),
            device_type     VARCHAR(8),
            screen_width    SMALLINT,
            screen_height   SMALLINT,
            browser_family  VARCHAR(32),
            os_family       VARCHAR(32),
            duration_sec    SMALLINT
        );
        CREATE INDEX IF NOT EXISTS idx_ae_site       ON analytics_events (site_id);
        CREATE INDEX IF NOT EXISTS idx_ae_org        ON analytics_events (organisation_id);
        CREATE INDEX IF NOT EXISTS idx_ae_received   ON analytics_events (received_at);
        CREATE INDEX IF NOT EXISTS idx_ae_session    ON analytics_events (session_id);
        CREATE INDEX IF NOT EXISTS idx_ae_level      ON analytics_events (consent_level);
        -- Custom conversion events (purchase / click / custom), fired via
        -- window.intaAnalytics.track(name, opts) rather than automatically.
        -- Same two-tier consent model as pageviews: minimal events never
        -- carry a session_id, so they can't be linked across requests.
        CREATE TABLE IF NOT EXISTS analytics_custom_events (
            id              BIGSERIAL    PRIMARY KEY,
            site_id         VARCHAR(32)  NOT NULL,
            organisation_id INTEGER      NOT NULL,
            session_id      VARCHAR(64),
            received_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
            consent_level   VARCHAR(8)   NOT NULL DEFAULT 'minimal',
            consent_stat    BOOLEAN,
            consent_func    BOOLEAN,
            consent_adv     BOOLEAN,
            name            VARCHAR(64)  NOT NULL,
            value_cents     BIGINT,
            currency        VARCHAR(3),
            pathname        TEXT,
            country_code    CHAR(2),
            device_type     VARCHAR(8)
        );
        CREATE INDEX IF NOT EXISTS idx_ace_site     ON analytics_custom_events (site_id);
        CREATE INDEX IF NOT EXISTS idx_ace_name     ON analytics_custom_events (name);
        CREATE INDEX IF NOT EXISTS idx_ace_received ON analytics_custom_events (received_at);
    `);
    // Add columns to existing tables that pre-date this schema version
    await db.query(`
        ALTER TABLE analytics_events ADD COLUMN IF NOT EXISTS consent_level  VARCHAR(8)  NOT NULL DEFAULT 'minimal';
        ALTER TABLE analytics_events ADD COLUMN IF NOT EXISTS consent_stat   BOOLEAN;
        ALTER TABLE analytics_events ADD COLUMN IF NOT EXISTS consent_func   BOOLEAN;
        ALTER TABLE analytics_events ADD COLUMN IF NOT EXISTS consent_adv    BOOLEAN;
        ALTER TABLE analytics_events ALTER COLUMN session_id DROP NOT NULL;
    `).catch(() => {});
}

// ── The embed script (served as application/javascript on GET) ────────────────
// The site key is baked into the script at serve time via ?s=SITEKEY — avoids
// the document.currentScript=null problem that affects all async/defer scripts.
// Snippet format: <script src=".../api/a?s=SITEKEY" async defer></script>
const EMBED_SCRIPT = `(function(){
'use strict';
var CK='IntastellarConsentSolution';
// document.currentScript is null for async/defer scripts (per spec).
// Walk all script tags as a fallback so GTM-injected or deferred embeds still work.
var el=document.currentScript;
if(!el)try{el=document.querySelector('script[data-site]');}catch(e){}
if(!el)try{
  var _ss=document.querySelectorAll('script');
  for(var _i=_ss.length-1;_i>=0;_i--){if((_ss[_i].src||'').indexOf('analytics.consentsmanagement.com')!==-1){el=_ss[_i];break;}}
}catch(e){}
var SITE=el&&el.getAttribute('data-site');
console.log('[Intastellar Analytics] el:',el,'SITE:',SITE);
if(!SITE){console.warn('[Intastellar Analytics] No data-site attribute found — script will not fire.');return;}
var EP=(el&&el.getAttribute('data-endpoint'))||'https://analytics.consentsmanagement.com/api/a';

function gc(n){var m=document.cookie.match(new RegExp('(?:^|;\\\\s*)'+n+'=([^;]*)'));return m?decodeURIComponent(m[1]):null;}

function decode(raw){
  try{
    var p=raw.split('.');
    if(p.length<3||p[0]!=='__inta1')return null;
    var base=parseInt(p[1],10);
    if(!base||base<2)return null;
    var enc=p[2].slice(1);
    var s='';
    for(var i=0;i<enc.length;i+=2)s+=String.fromCharCode(parseInt(enc.slice(i,i+2),base));
    return JSON.parse(s);
  }catch(e){return null;}
}

function getConsents(){
  try{
    if(window.intaCookieConsents&&window.intaCookieConsents.consents)return window.intaCookieConsents.consents;
  }catch(e){return null;}
  var raw=gc(CK);
  if(!raw)return null;
  var obj=decode(raw);
  return(obj&&obj.consents)||null;
}

// The banner writes the stat-consent key as "staticsticCookies" (its own typo,
// not ours) — check that spelling primarily, with the correctly-spelled one as
// a fallback in case the banner fixes it upstream later.
function hasStat(c){return !!(c&&(c.staticsticCookies===true||c.statisticCookies===true));}

function getSid(){
  try{
    var k='_ia_s',v=sessionStorage.getItem(k);
    if(!v){v=Math.random().toString(36).slice(2,10)+Date.now().toString(36);sessionStorage.setItem(k,v);}
    return v;
  }catch(e){return Math.random().toString(36).slice(2,10);}
}

function utmp(p){try{return new URLSearchParams(location.search).get(p)||'';}catch(e){return '';}}
function devType(){var w=screen.width;return w<768?'m':w<1024?'t':'d';}

var t0=Date.now(),fullFired=false,exitSent=false;

function send(payload,beacon){
  var b=new Blob([payload],{type:'application/json'});
  if(beacon&&navigator.sendBeacon){navigator.sendBeacon(EP,b);}
  else{fetch(EP,{method:'POST',body:payload,headers:{'Content-Type':'application/json'},keepalive:true}).catch(function(e){});}
}

function sendMinimal(c){
  send(JSON.stringify({
    s:SITE,cl:'minimal',
    u:location.pathname,
    dt:devType(),
    cs:hasStat(c)?1:0,
    cf:c&&c.functionalCookies?1:0,
    ca:c&&c.advertisementCookies?1:0
  }),false);
}

function sendFull(c,final){
  fullFired=true;
  send(JSON.stringify({
    s:SITE,cl:'full',sid:getSid(),
    u:location.href,r:document.referrer||'',
    ti:(document.title||'').slice(0,200),
    us:utmp('utm_source'),um:utmp('utm_medium'),
    uc:utmp('utm_campaign'),uk:utmp('utm_content'),
    dt:devType(),sw:screen.width,sh:screen.height,
    dur:Math.round((Date.now()-t0)/1000),
    cs:hasStat(c)?1:0,
    cf:c&&c.functionalCookies?1:0,
    ca:c&&c.advertisementCookies?1:0,
    final:final?1:0
  }),final||false);
}

document.addEventListener('visibilitychange',function(){
  if(document.visibilityState==='hidden'&&fullFired&&!exitSent){
    exitSent=true;
    var c=getConsents();
    if(hasStat(c))sendFull(c,true);
  }
});
window.addEventListener('pagehide',function(){
  if(fullFired&&!exitSent){
    exitSent=true;
    var c=getConsents();
    if(hasStat(c))sendFull(c,true);
  }
});

var iv=null;

// React to the banner's own accept/save actions instead of only polling the
// cookie — the poll gives up after 30s, so a slow visitor would otherwise
// only get upgraded to "full" on their next page load.
function onBannerAction(){
  var c2=getConsents();
  if(hasStat(c2)&&!fullFired){
    if(iv){clearInterval(iv);iv=null;}
    sendFull(c2,false);
  }
}
function hookConsentTrigger(name){
  var fn=window[name];
  if(typeof fn!=='function'||fn.__intaHooked)return;
  var wrapped=function(){
    var r=fn.apply(this,arguments);
    onBannerAction();
    setTimeout(onBannerAction,300); // safety re-check in case the cookie write is deferred
    return r;
  };
  wrapped.__intaHooked=true;
  window[name]=wrapped;

  console.log("[Intastellar Consents Analytics] Hooked consent trigger:", name);
}
function tryHooks(){
  hookConsentTrigger('IntaAcceptAll');
  hookConsentTrigger('IntaSaveSettings');
}

// Fire on load
var c=getConsents();
tryHooks();
if(hasStat(c)){
  sendFull(c,false);
}else{
  sendMinimal(c);
  // Poll fallback: covers cases where the banner script loads after this one
  // (tryHooks() retries each tick) or exposes different trigger names.
  var n=0;
  iv=setInterval(function(){
    tryHooks();
    var c2=getConsents();
    if(hasStat(c2)){clearInterval(iv);iv=null;sendFull(c2,false);}
    else if(++n>60){clearInterval(iv);iv=null;}
  },500);
}

// ── Custom conversion events ────────────────────────────────────────────────
// window.intaAnalytics.track('purchase', { value: 49.99, currency: 'EUR' })
// Fires a minimal (unlinked) record always; upgrades to a session-linked
// record only when the visitor has accepted statisticCookies.
function track(name,opts){
  if(!name||typeof name!=='string')return;
  opts=opts||{};
  var c=getConsents();
  var full=hasStat(c);
  send(JSON.stringify({
    s:SITE,t:'ev',n:String(name).slice(0,64),
    cl:full?'full':'minimal',
    sid:full?getSid():undefined,
    v:(typeof opts.value==='number'&&isFinite(opts.value))?opts.value:undefined,
    cur:opts.currency?String(opts.currency).slice(0,3):undefined,
    u:location.pathname,dt:devType(),
    cs:full?1:0,
    cf:c&&c.functionalCookies?1:0,
    ca:c&&c.advertisementCookies?1:0
  }),false);
}
window.intaAnalytics={track:track};
})();`;

// ─────────────────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") return res.status(204).end();

    // ── GET: serve the embed script ───────────────────────────────────────────
    if (req.method === "GET") {
        res.setHeader("Content-Type", "application/javascript; charset=utf-8");
        res.setHeader("Cache-Control", "public, max-age=3600, stale-while-revalidate=86400");
        return res.status(200).end(EMBED_SCRIPT);
    }

    // ── POST: ingest a pageview event ─────────────────────────────────────────
    if (req.method !== "POST") return res.status(405).end();

    let body;
    try {
        body = typeof req.body === "object" && req.body !== null
            ? req.body
            : JSON.parse(req.body || "{}");
    } catch {
        return res.status(400).end();
    }

    const { s: siteId, t: eventType, cl: consentLevel, sid, u: rawUrl, r: referrer, ti: title,
            us, um, uc, uk, dt, sw, sh, dur, cs, cf, ca, n: eventName, v: eventValue, cur: eventCurrency } = body;

    if (!siteId || typeof siteId !== "string" || !rawUrl) {
        return res.status(400).end();
    }

    const isMinimal = consentLevel !== "full";
    const isCustomEvent = eventType === "ev";

    const db = getPool();

    // Ensure tables exist and schema is up to date
    await ensureTables(db).catch(() => {});

    // Validate site ID — reject unknown or inactive sites
    const { rows: sites } = await db.query(
        `SELECT organisation_id FROM analytics_sites WHERE id = $1 AND active = true LIMIT 1`,
        [siteId]
    ).catch(() => ({ rows: [] }));

    if (!sites.length) return res.status(403).end();
    const orgId = sites[0].organisation_id;

    // Country/region from Vercel edge headers — IP is never stored
    const country = (req.headers["x-vercel-ip-country"]  || "").slice(0, 2)  || null;
    const region  = (req.headers["x-vercel-ip-country-region"] || "").slice(0, 64) || null;

    const deviceType = dt === "m" ? "mobile" : dt === "t" ? "tablet" : "desktop";

    // ── Custom conversion event (purchase / click / custom) ───────────────────
    // `u` here is always a bare pathname (track() sends location.pathname
    // regardless of consent tier), unlike pageviews where full events send
    // the complete href — so this never goes through the URL parser below.
    if (isCustomEvent) {
        if (!eventName || typeof eventName !== "string") return res.status(400).end();

        const evPathname = ("/" + String(rawUrl).replace(/^\//, "")).slice(0, 2000);
        const valueCents = typeof eventValue === "number" && isFinite(eventValue)
            ? Math.round(eventValue * 100)
            : null;

        await db.query(
            `INSERT INTO analytics_custom_events
             (site_id, organisation_id, session_id, consent_level, consent_stat, consent_func, consent_adv,
              name, value_cents, currency, pathname, country_code, device_type)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
            [
                siteId, orgId, isMinimal ? null : (sid ? String(sid).slice(0, 64) : null),
                isMinimal ? "minimal" : "full",
                cs === 1 || cs === true, cf === 1 || cf === true, ca === 1 || ca === true,
                String(eventName).slice(0, 64), valueCents,
                eventCurrency ? String(eventCurrency).slice(0, 3).toUpperCase() : null,
                evPathname, country, deviceType,
            ]
        ).catch(() => {});

        return res.status(202).end();
    }

    // For minimal pageviews the URL is just a pathname; for full pageviews it's the full href.
    // Parse carefully — prepend a placeholder origin if needed.
    let pathname, urlColumn;
    if (isMinimal) {
        // rawUrl is already a pathname (e.g. /pricing)
        pathname  = ("/" + String(rawUrl).replace(/^\//, "")).slice(0, 2000);
        urlColumn = pathname;
    } else {
        let parsedUrl;
        try { parsedUrl = new URL(rawUrl); }
        catch { return res.status(400).end(); }
        pathname  = parsedUrl.pathname.slice(0, 2000);
        urlColumn = (parsedUrl.pathname + parsedUrl.search).slice(0, 2000);
    }

    if (isMinimal) {
        // Minimal: no session, no UTMs, no referrer, no screen/browser — just path + consent state
        await db.query(
            `INSERT INTO analytics_events
             (site_id, organisation_id, consent_level, consent_stat, consent_func, consent_adv,
              url, pathname, country_code, region, device_type)
             VALUES ($1,$2,'minimal',$3,$4,$5,$6,$7,$8,$9,$10)`,
            [
                siteId, orgId,
                cs === 1 || cs === true, cf === 1 || cf === true, ca === 1 || ca === true,
                urlColumn, pathname,
                country, region, deviceType,
            ]
        ).catch(() => {});
    } else {
        // Full: enriched event (sid required)
        if (!sid) return res.status(400).end();

        const { browser, os } = parseUA(req.headers["user-agent"]);

        let referrerHost = null;
        try { if (referrer) referrerHost = new URL(referrer).hostname.slice(0, 255); }
        catch {}

        await db.query(
            `INSERT INTO analytics_events
             (site_id, organisation_id, session_id, consent_level,
              consent_stat, consent_func, consent_adv,
              url, pathname, title, referrer_host,
              utm_source, utm_medium, utm_campaign, utm_content,
              country_code, region, device_type, screen_width, screen_height,
              browser_family, os_family, duration_sec)
             VALUES ($1,$2,$3,'full',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)`,
            [
                siteId, orgId, String(sid).slice(0, 64),           // $1 $2 $3
                cs === 1 || cs === true,                            // $4 consent_stat
                cf === 1 || cf === true,                            // $5 consent_func
                ca === 1 || ca === true,                            // $6 consent_adv
                urlColumn, pathname,                                // $7 $8
                (title || "").slice(0, 500),                        // $9
                referrerHost,                                       // $10
                (us || "").slice(0, 255), (um || "").slice(0, 255), // $11 $12
                (uc || "").slice(0, 255), (uk || "").slice(0, 255), // $13 $14
                country, region,                                    // $15 $16
                deviceType,                                         // $17
                Number(sw) || null, Number(sh) || null,             // $18 $19
                browser, os,                                        // $20 $21
                Math.min(Number(dur) || 0, 86400),                  // $22 duration_sec
            ]
        ).catch(() => {});
    }

    return res.status(202).end();
}
