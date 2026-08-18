/**
 * POST /api/ab-test-proxy   body: { testId, variantId, parentOrigin }
 *   → JWT-authenticated. Verifies the caller's org owns testId/variantId and
 *     that parentOrigin is one of ALLOWED_ORIGINS, then mints a short-lived
 *     signed proxy URL: { proxyUrl }.
 *
 * GET  /api/ab-test-proxy?testId=&variantId=&exp=&sig=
 *   → No JWT — this is loaded via a plain <iframe src="..."> navigation,
 *     which can't carry an Authorization header, so the signed query
 *     params ARE the auth. Fetches the test's target page from the real
 *     domain, rewrites it (base tag + strips framing-blocking headers +
 *     injects the editor bridge script), and returns it same-origin so
 *     the visual editor can load it in an iframe and script into it.
 *
 * The bridge script injected into the page only handles element selection
 * and live preview (postMessage to the parent editor window) — it does NOT
 * apply/persist a variant's saved `changes` on load. Saving happens via
 * PUT /api/ab-test-variants; applying a variant's changes on a site's real
 * traffic is a separate, not-yet-built runtime phase (api/a.js).
 *
 * Env: AB_PROXY_SECRET (HMAC signing key — required; POST/GET both fail
 * closed with a 500 if unset, never falls back to a guessable default).
 */

import crypto from "crypto";
import pkg from "pg";
const { Pool } = pkg;
import { parse } from "node-html-parser";

let pool;
function getPool() {
    if (!pool) {
        pool = new Pool({
            connectionString: process.env.POSTGRES_URL,
            ssl: { rejectUnauthorized: false },
            max: 3,
        });
    }
    return pool;
}

const ALLOWED_ORIGINS = [
    "https://www.intastellarconsents.com",
    "https://www.consentsmanagement.com",
    "https://analytics.consentsmanagement.com",
    "https://consentsplatform.com",
    "http://localhost:8080",
    "http://localhost:3000",
];

// How long a minted editor URL stays valid. Long enough that the iframe can
// reload a few times during one editing session; short enough that a leaked
// URL (browser history, a screenshot) doesn't stay usable indefinitely.
const SIG_TTL_SECONDS = 15 * 60;

function setCors(req, res) {
    const origin = req.headers.origin || "";
    if (ALLOWED_ORIGINS.includes(origin)) res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Authorization,Organisation,Content-Type");
}

function validateJwt(authHeader) {
    const match = (authHeader || "").match(/^Bearer\s+(.+)$/i);
    if (!match) return null;
    try {
        const decoded = Buffer.from(match[1], "base64").toString("utf8");
        const parts = decoded.split(".");
        if (parts.length !== 3) return null;
        const payload = JSON.parse(Buffer.from(parts[1], "base64").toString("utf8"));
        const now = Math.floor(Date.now() / 1000);
        if (payload.iss !== "Intastellar Account") return null;
        if ((payload.nbf && payload.nbf > now) || (payload.exp && payload.exp < now)) return null;
        return payload;
    } catch { return null; }
}

function signPayload(str) {
    const secret = process.env.AB_PROXY_SECRET;
    if (!secret) return null;
    return crypto.createHmac("sha256", secret).update(str).digest("hex");
}

function verifySig(str, sig) {
    const expected = signPayload(str);
    if (!expected || !sig) return false;
    const a = Buffer.from(expected, "hex");
    const b = Buffer.from(String(sig), "hex");
    if (a.length !== b.length) return false;
    try { return crypto.timingSafeEqual(a, b); } catch { return false; }
}

async function ensureTables(db) {
    // Same tables api/ab-tests.js creates — see that file for the reasoning
    // on why this is duplicated rather than shared/imported.
    await db.query(`
        CREATE TABLE IF NOT EXISTS ab_tests (
            id               BIGSERIAL    PRIMARY KEY,
            organisation_id  INTEGER      NOT NULL,
            domain           TEXT         NOT NULL,
            name             VARCHAR(120) NOT NULL,
            target_path      TEXT         NOT NULL DEFAULT '/',
            status           VARCHAR(16)  NOT NULL DEFAULT 'draft',
            created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
            updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
        )
    `).catch(() => {});
    await db.query(`
        CREATE TABLE IF NOT EXISTS ab_test_variants (
            id               BIGSERIAL    PRIMARY KEY,
            test_id          BIGINT       NOT NULL REFERENCES ab_tests(id) ON DELETE CASCADE,
            variant_key      VARCHAR(64)  NOT NULL,
            label            VARCHAR(120),
            is_control       BOOLEAN      NOT NULL DEFAULT false,
            changes          JSONB        NOT NULL DEFAULT '[]',
            created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
            updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
            UNIQUE (test_id, variant_key)
        )
    `).catch(() => {});
}

function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function errorPageHtml(message, url) {
    return `<!doctype html><html><body style="font-family:sans-serif;padding:40px;color:#666">
<p>${escapeHtml(message)}</p><p style="font-size:12px;color:#999">${escapeHtml(url)}</p>
</body></html>`;
}

// The script injected into the proxied page. Runs inside the iframe, in the
// context of the TARGET site's own page — only handles element selection +
// live preview + a hover highlight; never persists anything itself (Save
// happens from the parent editor via PUT /api/ab-test-variants).
function buildBridgeScript(trustedParentOrigin) {
    // trustedParentOrigin is server-validated against ALLOWED_ORIGINS before
    // this function is ever called (see the GET handler) — JSON.stringify
    // here is just safe interpolation into the script text, not the
    // validation step itself.
    const originLiteral = JSON.stringify(trustedParentOrigin);
    return `(function(){
'use strict';
var TRUSTED_ORIGIN=${originLiteral};
var selectMode=false;
var highlightEl=null;

function ensureHighlight(){
  if(highlightEl)return highlightEl;
  highlightEl=document.createElement('div');
  highlightEl.style.cssText='position:absolute;pointer-events:none;z-index:2147483647;background:rgba(99,179,237,0.25);outline:2px solid #6eb3e0;display:none;';
  document.documentElement.appendChild(highlightEl);
  return highlightEl;
}

function selectorFor(el){
  if(!el||el===document.documentElement)return 'html';
  if(el.id)return '#'+CSS.escape(el.id);
  var parts=[];
  var node=el;
  while(node&&node.nodeType===1&&node!==document.body&&parts.length<6){
    var tag=node.tagName.toLowerCase();
    var parent=node.parentElement;
    if(!parent){parts.unshift(tag);break;}
    var siblings=Array.prototype.filter.call(parent.children,function(c){return c.tagName===node.tagName;});
    var seg=tag;
    if(siblings.length>1){seg+=':nth-of-type('+(siblings.indexOf(node)+1)+')';}
    parts.unshift(seg);
    if(node.id){parts[0]='#'+CSS.escape(node.id);break;}
    node=parent;
  }
  return parts.join(' > ');
}

function highlight(el){
  var h=ensureHighlight();
  if(!el){h.style.display='none';return;}
  var r=el.getBoundingClientRect();
  h.style.display='block';
  h.style.top=(r.top+window.scrollY)+'px';
  h.style.left=(r.left+window.scrollX)+'px';
  h.style.width=r.width+'px';
  h.style.height=r.height+'px';
}

// Kept in sync with STYLE_PROPERTIES in PageExperimentEditor.js — this is
// the curated set of properties the style panel can adjust, so only these
// (not the ~300 getComputedStyle() returns) get computed and sent per click.
var STYLE_PROPS=['color','background-color','font-size','font-weight','font-family','line-height','text-align','padding','margin','width','height','border-radius','border','display','opacity','visibility'];
function computedStylesFor(el){
  var cs=window.getComputedStyle(el);
  var out={};
  for(var i=0;i<STYLE_PROPS.length;i++){out[STYLE_PROPS[i]]=cs.getPropertyValue(STYLE_PROPS[i]);}
  return out;
}

document.addEventListener('mouseover',function(e){
  if(!selectMode)return;
  highlight(e.target);
},true);

document.addEventListener('click',function(e){
  if(!selectMode)return;
  e.preventDefault();
  e.stopPropagation();
  var el=e.target;
  var attrs={};
  for(var i=0;i<el.attributes.length;i++){attrs[el.attributes[i].name]=el.attributes[i].value;}
  parent.postMessage({
    type:'ab-editor:select',
    selector:selectorFor(el),
    tagName:el.tagName.toLowerCase(),
    currentText:(el.textContent||'').trim().slice(0,500),
    currentAttributes:attrs,
    currentStyles:computedStylesFor(el)
  },TRUSTED_ORIGIN);
},true);

function applyChange(change){
  if(!change||!change.selector)return;
  var els;
  try{els=document.querySelectorAll(change.selector);}catch(err){return;}
  els.forEach(function(el){
    switch(change.type){
      case 'text': el.textContent=change.value||''; break;
      case 'html': el.innerHTML=change.value||''; break;
      case 'style':
        if(change.property)el.style.setProperty(change.property,change.value||'');
        break;
      case 'attribute':
        if(change.property)el.setAttribute(change.property,change.value||'');
        break;
      case 'class':
        if(change.value)el.classList.add(change.value);
        break;
      case 'remove': el.remove(); break;
    }
  });
}

window.addEventListener('message',function(e){
  if(e.origin!==TRUSTED_ORIGIN)return;
  var msg=e.data;
  if(!msg||typeof msg!=='object')return;
  if(msg.type==='ab-editor:enter-select-mode'){selectMode=true;}
  else if(msg.type==='ab-editor:exit-select-mode'){selectMode=false;highlight(null);}
  else if(msg.type==='ab-editor:apply-preview'&&msg.change){applyChange(msg.change);}
  else if(msg.type==='ab-editor:apply-all'&&Array.isArray(msg.changes)){msg.changes.forEach(applyChange);}
});

parent.postMessage({type:'ab-editor:ready'},TRUSTED_ORIGIN);
})();`;
}

function rewriteHtml(html, targetUrl, trustedParentOrigin) {
    // node-html-parser, not linkedom — linkedom's CJS build pulls in a
    // css-select version that's ESM-only, and Vercel bundles api/*.js as
    // CommonJS (no "type":"module" in package.json), so require()-ing it
    // crashed every invocation with ERR_REQUIRE_ESM. node-html-parser's
    // main entry and its own css-select dependency are both genuinely
    // dual CJS/ESM (a real "exports" map, not just an ESM file with a
    // misleading .js extension), so it doesn't hit that failure mode.
    const root = parse(html);
    let htmlEl = root.querySelector("html");
    if (!htmlEl) throw new Error("No <html> element in response");

    let head = root.querySelector("head");
    if (!head) {
        htmlEl.insertAdjacentHTML("afterbegin", "<head></head>");
        head = root.querySelector("head");
    }

    // Strip any existing <base> so ours takes precedence, then inject one so
    // relative asset/link URLs resolve against the real site — this proxy
    // only rewrites the top-level document, not every asset it references.
    head.querySelectorAll("base").forEach(b => b.remove());
    const u = new URL(targetUrl);
    const baseHref = `${u.origin}${u.pathname.replace(/[^/]*$/, "")}`;
    head.insertAdjacentHTML("afterbegin", `<base href="${baseHref.replace(/"/g, "&quot;")}">`);

    // Hide the CMP banner (<intastellarconsents>) while editing — it has no
    // purpose in the editor (there's no real visitor to consent here) and
    // otherwise sits on top of the page, in the way of clicking elements.
    // A <style> rule, not a DOM removal, so it's robust regardless of when
    // the banner's own script registers/renders the custom element.
    head.insertAdjacentHTML("beforeend", "<style>intastellarconsents{display:none!important;}</style>");
    // Remove the noScroll class from the HTML element
    htmlEl.classList.remove("noScroll");

    const bodyEl = root.querySelector("body") || htmlEl;
    bodyEl.insertAdjacentHTML("beforeend", `<script>${buildBridgeScript(trustedParentOrigin)}</script>`);

    return root.toString();
}

export default async function handler(req, res) {
    setCors(req, res);
    if (req.method === "OPTIONS") return res.status(204).end();

    const db = getPool();
    await ensureTables(db);

    // ── POST: mint a short-lived signed proxy URL (JWT-authenticated) ─────────
    if (req.method === "POST") {
        const jwt = validateJwt(req.headers.authorization);
        if (!jwt) return res.status(401).json({ error: "Unauthorized" });

        const orgId = parseInt(req.headers.organisation || "", 10);
        if (!orgId) return res.status(400).json({ error: "Organisation header required" });

        if (!process.env.AB_PROXY_SECRET) {
            return res.status(500).json({ error: "Proxy signing is not configured (AB_PROXY_SECRET missing)" });
        }

        let body;
        try {
            body = typeof req.body === "object" && req.body !== null ? req.body : JSON.parse(req.body || "{}");
        } catch {
            return res.status(400).json({ error: "Invalid body" });
        }

        const testId = parseInt(body.testId, 10);
        const variantId = parseInt(body.variantId, 10);
        const parentOrigin = String(body.parentOrigin || "");

        if (!testId || !variantId) return res.status(400).json({ error: "testId and variantId are required" });
        if (!ALLOWED_ORIGINS.includes(parentOrigin)) return res.status(400).json({ error: "parentOrigin is not an allowed origin" });

        const { rows } = await db.query(
            `SELECT v.id FROM ab_test_variants v
             JOIN ab_tests t ON t.id = v.test_id
             WHERE v.id = $1 AND v.test_id = $2 AND t.organisation_id = $3 LIMIT 1`,
            [variantId, testId, orgId]
        ).catch(() => ({ rows: [] }));
        if (!rows.length) return res.status(404).json({ error: "Test/variant not found" });

        const exp = Math.floor(Date.now() / 1000) + SIG_TTL_SECONDS;
        const signedStr = `${testId}:${variantId}:${exp}:${parentOrigin}`;
        const sig = signPayload(signedStr);

        const qs = new URLSearchParams({
            testId: String(testId), variantId: String(variantId),
            exp: String(exp), origin: parentOrigin, sig,
        }).toString();

        return res.status(200).json({ proxyUrl: `/api/ab-test-proxy?${qs}` });
    }

    // ── GET: serve the rewritten page (auth is the signed query params) ───────
    if (req.method === "GET") {
        const testId = parseInt(req.query.testId || "", 10);
        const variantId = parseInt(req.query.variantId || "", 10);
        const exp = parseInt(req.query.exp || "", 10);
        const origin = String(req.query.origin || "");
        const sig = String(req.query.sig || "");

        if (!process.env.AB_PROXY_SECRET) return res.status(500).send("Proxy signing is not configured.");
        if (!testId || !variantId || !exp || !origin || !sig) return res.status(400).send("Missing proxy parameters.");
        if (Math.floor(Date.now() / 1000) > exp) return res.status(401).send("This editor link has expired — reopen the test to continue editing.");
        if (!ALLOWED_ORIGINS.includes(origin)) return res.status(401).send("Invalid proxy parameters.");
        if (!verifySig(`${testId}:${variantId}:${exp}:${origin}`, sig)) return res.status(401).send("Invalid proxy signature.");

        const { rows } = await db.query(
            `SELECT t.domain, t.target_path FROM ab_tests t
             JOIN ab_test_variants v ON v.test_id = t.id
             WHERE t.id = $1 AND v.id = $2 LIMIT 1`,
            [testId, variantId]
        ).catch(() => ({ rows: [] }));
        if (!rows.length) return res.status(404).send("Test not found.");

        const { domain, target_path: targetPath } = rows[0];
        const targetUrl = `https://${domain}${targetPath}`;

        let upstream;
        try {
            upstream = await fetch(targetUrl, {
                headers: { "User-Agent": "Mozilla/5.0 (compatible; IntastellarPageExperiments/1.0; +https://www.intastellarconsents.com)" },
                redirect: "follow",
            });
        } catch {
            res.setHeader("Content-Type", "text/html; charset=utf-8");
            return res.status(200).send(errorPageHtml("Couldn't reach this page — it may be down or blocking automated requests.", targetUrl));
        }

        const contentType = upstream.headers.get("content-type") || "";
        if (!upstream.ok || !contentType.includes("text/html")) {
            res.setHeader("Content-Type", "text/html; charset=utf-8");
            return res.status(200).send(errorPageHtml(
                `This page returned ${upstream.status}${!contentType.includes("text/html") ? " (not HTML)" : ""} and can't be edited here.`,
                targetUrl
            ));
        }

        const html = await upstream.text();
        let rewritten;
        try {
            rewritten = rewriteHtml(html, targetUrl, origin);
        } catch {
            res.setHeader("Content-Type", "text/html; charset=utf-8");
            return res.status(200).send(errorPageHtml("Couldn't prepare this page for editing (unexpected markup).", targetUrl));
        }

        res.setHeader("Content-Type", "text/html; charset=utf-8");
        // Deliberately not forwarding X-Frame-Options / Content-Security-Policy
        // from the upstream response — stripping them is the entire point of
        // this proxy, since most sites send them specifically to prevent
        // being framed by anyone, including us.
        return res.status(200).send(rewritten);
    }

    return res.status(405).end();
}
