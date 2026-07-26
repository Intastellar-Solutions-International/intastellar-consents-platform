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
// Two-tier firing:
//   MINIMAL (always, no consent needed): path only, consent choices, device type.
//     No session ID — requests cannot be linked across page views.
//     Legal basis: legitimate interest (consent record-keeping, aggregate counts).
//   FULL (statisticCookies === true): enriched with session ID, UTMs, referrer,
//     screen, browser/OS, duration.
// If the user accepts mid-session the full event fires at that point (upgrade).
const EMBED_SCRIPT = `(function(){
'use strict';
var CK='IntastellarConsentSolution';
var el=document.currentScript||document.querySelector('script[data-site]');
var SITE=el&&el.getAttribute('data-site');
if(!SITE)return;
var EP=(el&&el.getAttribute('data-endpoint'))||'https://app.intastellarconsents.com/api/a';

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
  var raw=gc(CK);
  if(!raw)return null;
  var obj=decode(raw);
  return(obj&&obj.consents)||null;
}

function hasStat(c){return !!(c&&c.statisticCookies===true);}

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
  else{fetch(EP,{method:'POST',body:payload,headers:{'Content-Type':'application/json'},keepalive:true}).catch(function(){});}
}

function sendMinimal(c){
  send(JSON.stringify({
    s:SITE,cl:'minimal',
    u:location.pathname,
    dt:devType(),
    cs:c&&c.statisticCookies?1:0,
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
    cs:c&&c.statisticCookies?1:0,
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

// Fire on load
var c=getConsents();
if(hasStat(c)){
  sendFull(c,false);
}else{
  sendMinimal(c);
  // Poll: if consent is given mid-session, send the full upgrade event
  var n=0,iv=setInterval(function(){
    var c2=getConsents();
    if(hasStat(c2)){clearInterval(iv);sendFull(c2,false);}
    else if(++n>60){clearInterval(iv);}
  },500);
}
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

    const { s: siteId, sid, u: rawUrl, r: referrer, ti: title,
            us, um, uc, uk, dt, sw, sh, dur } = body;

    if (!siteId || typeof siteId !== "string" || !sid || !rawUrl) {
        return res.status(400).end();
    }

    // Basic URL validation
    let parsedUrl;
    try { parsedUrl = new URL(rawUrl); }
    catch { return res.status(400).end(); }

    const db = getPool();

    // Ensure tables exist (idempotent — runs fast after first time)
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

    const { browser, os } = parseUA(req.headers["user-agent"]);

    const deviceType = dt === "m" ? "mobile" : dt === "t" ? "tablet" : "desktop";

    // Referrer: only store the hostname, never the full URL (path may contain PII)
    let referrerHost = null;
    try { if (referrer) referrerHost = new URL(referrer).hostname.slice(0, 255); }
    catch {}

    await db.query(
        `INSERT INTO analytics_events
         (site_id, organisation_id, session_id, url, pathname, title,
          referrer_host, utm_source, utm_medium, utm_campaign, utm_content,
          country_code, region, device_type, screen_width, screen_height,
          browser_family, os_family, duration_sec)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,
        [
            siteId, orgId, String(sid).slice(0, 64),
            (parsedUrl.pathname + parsedUrl.search).slice(0, 2000),
            parsedUrl.pathname.slice(0, 2000),
            (title || "").slice(0, 500),
            referrerHost,
            (us || "").slice(0, 255), (um || "").slice(0, 255),
            (uc || "").slice(0, 255), (uk || "").slice(0, 255),
            country, region,
            deviceType,
            Number(sw) || null, Number(sh) || null,
            browser, os,
            Math.min(Number(dur) || 0, 86400),
        ]
    ).catch(() => {});

    return res.status(202).end();
}
