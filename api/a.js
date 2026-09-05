import { getPool } from "./_db.js";
/**
 * GET  /api/a  → serves the Intastellar First-Party Analytics embed script
 * POST /api/a  → ingest endpoint receiving pageview events from embedded sites
 *
 * This single endpoint is embedded on customer websites. It must:
 *  - Use CORS wildcard (third-party origin)
 *  - Never store IP addresses (country derived from Vercel headers, raw IP discarded)
 *  - Only accept events whose site_id is registered and active
 */
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

// ── Bot / crawler detection ──────────────────────────────────────────────────
// UA-based detection only catches bots that self-identify (which is virtually
// all legitimate search engines, AI crawlers, and social-preview fetchers —
// they need to for robots.txt compliance / allowlisting). It won't catch a
// scraper that deliberately spoofs a normal browser UA; that's a fundamentally
// different problem (fingerprinting/rate-limiting), out of scope here.
// Order matters — more specific patterns (e.g. "Applebot-Extended") must come
// before substrings they contain (e.g. "Applebot").
const BOT_PATTERNS = [
    // AI crawlers / LLM data collectors — checked first since several share
    // substrings with the search-engine bots below (Applebot-Extended vs Applebot).
    { re: /GPTBot/i,             name: "GPTBot",             category: "ai_crawler" },
    { re: /ChatGPT-User/i,       name: "ChatGPT-User",       category: "ai_crawler" },
    { re: /OAI-SearchBot/i,      name: "OAI-SearchBot",      category: "ai_crawler" },
    { re: /ClaudeBot/i,          name: "ClaudeBot",          category: "ai_crawler" },
    { re: /Claude-Web/i,         name: "Claude-Web",         category: "ai_crawler" },
    { re: /anthropic-ai/i,       name: "anthropic-ai",       category: "ai_crawler" },
    { re: /PerplexityBot/i,      name: "PerplexityBot",      category: "ai_crawler" },
    { re: /Perplexity-User/i,    name: "Perplexity-User",    category: "ai_crawler" },
    { re: /Google-Extended/i,    name: "Google-Extended",    category: "ai_crawler" },
    { re: /Applebot-Extended/i,  name: "Applebot-Extended",  category: "ai_crawler" },
    { re: /CCBot/i,              name: "CCBot",              category: "ai_crawler" },
    { re: /Bytespider/i,         name: "Bytespider",         category: "ai_crawler" },
    { re: /Amazonbot/i,          name: "Amazonbot",          category: "ai_crawler" },
    { re: /cohere-ai/i,          name: "cohere-ai",          category: "ai_crawler" },
    { re: /Diffbot/i,            name: "Diffbot",            category: "ai_crawler" },
    { re: /meta-externalagent/i, name: "Meta-ExternalAgent", category: "ai_crawler" },
    { re: /ImagesiftBot/i,       name: "ImagesiftBot",       category: "ai_crawler" },
    { re: /Timpibot/i,           name: "Timpibot",           category: "ai_crawler" },
    { re: /YouBot/i,             name: "YouBot",             category: "ai_crawler" },
    { re: /omgili/i,             name: "omgilibot",          category: "ai_crawler" },
    { re: /ev-crawler/i,         name: "ev-crawler (Headline)", category: "ai_crawler" },
    { re: /DuckAssistBot/i,      name: "DuckAssistBot",      category: "ai_crawler" },
    { re: /quillbot/i,           name: "QuillBot",           category: "ai_crawler" },

    // Search engines
    // Google runs several distinct crawlers beyond the main web crawler — most
    // share the "Googlebot" substring (so the more specific ones must be
    // checked first), but a few (AdsBot, Mediapartners/AdSense, APIs-Google,
    // Storebot) don't contain "Googlebot" or even "bot" consistently and would
    // otherwise fall through to "other" — or be missed entirely.
    { re: /Googlebot-Image/i,      name: "Googlebot-Image",       category: "search_engine" },
    { re: /Googlebot-Video/i,      name: "Googlebot-Video",       category: "search_engine" },
    { re: /Googlebot-News/i,       name: "Googlebot-News",        category: "search_engine" },
    { re: /AdsBot-Google-Mobile/i, name: "AdsBot-Google-Mobile",  category: "search_engine" },
    { re: /AdsBot-Google/i,        name: "AdsBot-Google",         category: "search_engine" },
    { re: /Mediapartners-Google/i, name: "Mediapartners-Google (AdSense)", category: "search_engine" },
    { re: /APIs-Google/i,          name: "APIs-Google",           category: "search_engine" },
    { re: /Storebot-Google/i,      name: "Storebot-Google",       category: "search_engine" },
    { re: /FeedFetcher-Google/i,   name: "FeedFetcher-Google",    category: "search_engine" },
    { re: /Google-InspectionTool/i,name: "Google-InspectionTool", category: "search_engine" },
    { re: /Google-Read-Aloud/i,    name: "Google-Read-Aloud",     category: "search_engine" },
    { re: /Google-Site-Verification/i, name: "Google-Site-Verification", category: "search_engine" },
    { re: /Googlebot/i,          name: "Googlebot",          category: "search_engine" },
    { re: /bingbot/i,            name: "Bingbot",             category: "search_engine" },
    { re: /Slurp/,               name: "Yahoo Slurp",        category: "search_engine" },
    { re: /DuckDuckBot/i,        name: "DuckDuckBot",        category: "search_engine" },
    { re: /Baiduspider/i,        name: "Baiduspider",        category: "search_engine" },
    { re: /YandexBot/i,          name: "YandexBot",          category: "search_engine" },
    { re: /Applebot/i,           name: "Applebot",           category: "search_engine" },
    { re: /SeznamBot/i,          name: "SeznamBot",          category: "search_engine" },
    { re: /Sogou/i,              name: "Sogou Spider",        category: "search_engine" },

    // Social-share link preview fetchers
    { re: /facebookexternalhit/i, name: "Facebook",          category: "social_preview" },
    { re: /Twitterbot/i,          name: "Twitterbot",        category: "social_preview" },
    { re: /LinkedInBot/i,         name: "LinkedInBot",       category: "social_preview" },
    { re: /WhatsApp/i,            name: "WhatsApp",          category: "social_preview" },
    { re: /TelegramBot/i,         name: "TelegramBot",       category: "social_preview" },
    { re: /Slackbot/i,            name: "Slackbot",          category: "social_preview" },
    { re: /Discordbot/i,          name: "Discordbot",        category: "social_preview" },
    { re: /redditbot/i,           name: "redditbot",         category: "social_preview" },
    { re: /SkypeUriPreview/i,     name: "Skype",             category: "social_preview" },
    { re: /Pinterest/i,           name: "Pinterest",         category: "social_preview" },

    // SEO / backlink crawlers
    { re: /AhrefsSiteAudit/i,    name: "AhrefsSiteAudit",    category: "seo_tool" },
    { re: /AhrefsBot/i,          name: "AhrefsBot",          category: "seo_tool" },
    { re: /SemrushBot/i,         name: "SemrushBot",         category: "seo_tool" },
    { re: /MJ12bot/i,            name: "MJ12bot",            category: "seo_tool" },
    { re: /DotBot/i,             name: "DotBot",             category: "seo_tool" },
    { re: /BLEXBot/i,            name: "BLEXBot",            category: "seo_tool" },
    { re: /DataForSeoBot/i,      name: "DataForSeoBot",      category: "seo_tool" },

    // Data aggregators / company registries — crawlers that harvest business
    // sites to power a company-data API (analytics/developer use cases),
    // rather than for search ranking, ad relevance, or AI training.
    { re: /DatapublicaBot/i,     name: "DatapublicaBot",     category: "data_aggregator" },
    { re: /LeadBot/i,            name: "LeadBot",            category: "data_aggregator" },
    { re: /ArgoWebsiteCrawler/i, name: "ArgoWebsiteCrawler", category: "data_aggregator" },

    // Uptime / synthetic monitors
    { re: /UptimeRobot/i,        name: "UptimeRobot",        category: "uptime_monitor" },
    { re: /Pingdom/i,            name: "Pingdom",            category: "uptime_monitor" },
    { re: /StatusCake/i,         name: "StatusCake",         category: "uptime_monitor" },
    { re: /Site24x7/i,           name: "Site24x7",           category: "uptime_monitor" },
];

function detectBot(ua) {
    if (!ua) return null;
    for (const p of BOT_PATTERNS) if (p.re.test(ua)) return { name: p.name, category: p.category };
    // Generic fallback for anything unlisted that still self-identifies as automated.
    if (/bot|spider|crawler|crawling/i.test(ua)) return { name: ua.slice(0, 60), category: "other" };
    return null;
}

// Local/dev-machine traffic and known Google infrastructure renderers.
// Checked against the hostname the embed actually ran on (`pageHostSanitized`,
// i.e. location.hostname — never includes a port), not the site's registered
// domain, so this catches "example.com" being previewed at localhost:3000
// during development without needing any site-level configuration.
//
// Google infrastructure hosts are dropped here rather than in detectBot()
// because they don't carry a bot-identifying UA — GTM's MSR uses a normal
// desktop Chrome UA so UA-based detection can't distinguish them.
const GOOGLE_INFRA_HOSTS = new Set([
    // GTM Mobile Site Renderer — used by GTM server-side preview and Tag
    // Assistant to pre-render pages for debugging. Not a real visitor.
    "gtm-msr.appspot.com",
]);
function isDevOrLocalHost(host) {
    if (!host) return false;
    if (host === "localhost" || host === "0.0.0.0" || host === "::1") return true;
    if (host.endsWith(".local")) return true;
    if (/^127\./.test(host)) return true;          // loopback
    if (/^10\./.test(host)) return true;            // private LAN
    if (/^192\.168\./.test(host)) return true;      // private LAN
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return true; // private LAN
    if (GOOGLE_INFRA_HOSTS.has(host)) return true;
    return false;
}

// Full href or bare pathname, depending on event type — bot-checking happens
// before we know which branch a request will take, so this needs to handle both.
function extractPathnameLoose(rawUrl) {
    const str = String(rawUrl || "");
    if (/^https?:\/\//i.test(str)) {
        try { return new URL(str).pathname.slice(0, 2000); } catch {}
    }
    return ("/" + str.replace(/^\//, "")).slice(0, 2000);
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
            viewport_width  SMALLINT,
            viewport_height SMALLINT,
            browser_family  VARCHAR(32),
            os_family       VARCHAR(32),
            language        VARCHAR(20),
            timezone        VARCHAR(60),
            duration_sec    SMALLINT,
            scroll_depth    SMALLINT
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
            transaction_id  VARCHAR(64),
            pathname        TEXT,
            country_code    CHAR(2),
            device_type     VARCHAR(8),
            -- 'manual' = window.intaAnalytics.track() called directly by site code;
            -- 'datalayer' = auto-forwarded from window.dataLayer by a configured rule.
            source          VARCHAR(10)  NOT NULL DEFAULT 'manual'
        );
        CREATE INDEX IF NOT EXISTS idx_ace_site     ON analytics_custom_events (site_id);
        CREATE INDEX IF NOT EXISTS idx_ace_name     ON analytics_custom_events (name);
        CREATE INDEX IF NOT EXISTS idx_ace_received ON analytics_custom_events (received_at);
        -- Click coordinates for heatmaps. Full-consent-only (session_id always set).
        -- 'source' distinguishes the lightweight native click listener from clicks
        -- derived from an rrweb recording, once session recording is active.
        CREATE TABLE IF NOT EXISTS analytics_clicks (
            id              BIGSERIAL    PRIMARY KEY,
            site_id         VARCHAR(32)  NOT NULL,
            organisation_id INTEGER      NOT NULL,
            session_id      VARCHAR(64)  NOT NULL,
            received_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
            pathname        TEXT         NOT NULL,
            device_type     VARCHAR(8),
            viewport_width  SMALLINT,
            page_height     INTEGER,
            x_pct           NUMERIC(5,2),
            y_pct           NUMERIC(5,2),
            target_tag      VARCHAR(20),
            target_id       VARCHAR(150),
            target_class    VARCHAR(300),
            target_text     VARCHAR(80),
            source          VARCHAR(8)   NOT NULL DEFAULT 'native'
        );
        CREATE INDEX IF NOT EXISTS idx_acl_site_path ON analytics_clicks (site_id, pathname);
        CREATE INDEX IF NOT EXISTS idx_acl_received  ON analytics_clicks (received_at);
        -- Bot/crawler traffic, logged separately rather than flagged inline on
        -- analytics_events — keeps every existing report/live/heatmap query
        -- automatically bot-free with no changes, since bots never reach those
        -- inserts at all (see the detectBot() check early in the POST handler).
        -- The raw user_agent is kept here (unlike analytics_events, which never
        -- stores it) since a bot isn't a data subject in the GDPR sense, and it
        -- helps refine BOT_PATTERNS later for anything landing in "other".
        CREATE TABLE IF NOT EXISTS analytics_bot_visits (
            id              BIGSERIAL    PRIMARY KEY,
            site_id         VARCHAR(32)  NOT NULL,
            organisation_id INTEGER      NOT NULL,
            received_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
            bot_name        VARCHAR(64)  NOT NULL,
            bot_category    VARCHAR(24)  NOT NULL,
            pathname        TEXT         NOT NULL,
            country_code    CHAR(2),
            user_agent      VARCHAR(500)
        );
        CREATE INDEX IF NOT EXISTS idx_abv_site     ON analytics_bot_visits (site_id);
        CREATE INDEX IF NOT EXISTS idx_abv_name     ON analytics_bot_visits (bot_name);
        CREATE INDEX IF NOT EXISTS idx_abv_received ON analytics_bot_visits (received_at);
    `);
    // Add columns to existing tables that pre-date this schema version
    await db.query(`
        ALTER TABLE analytics_events ADD COLUMN IF NOT EXISTS consent_level    VARCHAR(8)  NOT NULL DEFAULT 'minimal';
        ALTER TABLE analytics_events ADD COLUMN IF NOT EXISTS consent_stat     BOOLEAN;
        ALTER TABLE analytics_events ADD COLUMN IF NOT EXISTS consent_func     BOOLEAN;
        ALTER TABLE analytics_events ADD COLUMN IF NOT EXISTS consent_adv      BOOLEAN;
        ALTER TABLE analytics_events ADD COLUMN IF NOT EXISTS viewport_width   SMALLINT;
        ALTER TABLE analytics_events ADD COLUMN IF NOT EXISTS viewport_height  SMALLINT;
        ALTER TABLE analytics_events ADD COLUMN IF NOT EXISTS language         VARCHAR(20);
        ALTER TABLE analytics_events ADD COLUMN IF NOT EXISTS timezone         VARCHAR(60);
        ALTER TABLE analytics_events ADD COLUMN IF NOT EXISTS scroll_depth     SMALLINT;
        ALTER TABLE analytics_events ALTER COLUMN session_id DROP NOT NULL;
        ALTER TABLE analytics_events ADD COLUMN IF NOT EXISTS is_new_visitor BOOLEAN;
        ALTER TABLE analytics_clicks ADD COLUMN IF NOT EXISTS target_text      VARCHAR(80);
        -- Client-generated per-pageload id. The embed sends a full event twice
        -- (once on load, once on exit with duration/scroll_depth filled in) —
        -- without this, that was landing as two separate rows per real
        -- pageview, inflating event counts and showing duplicate-looking
        -- entries in the Live View feed for a single visitor.
        ALTER TABLE analytics_events ADD COLUMN IF NOT EXISTS pageview_id      VARCHAR(40);
        -- Hostname the embed actually ran on (location.hostname), as opposed to
        -- referrer_host (where the visitor came from) or analytics_sites.domain
        -- (the domain the site key was registered under). Lets a booking
        -- widget/white-label host embedded under the same site key show up as
        -- distinct traffic instead of being silently folded into the parent site.
        ALTER TABLE analytics_events ADD COLUMN IF NOT EXISTS page_host        VARCHAR(255);
        ALTER TABLE analytics_custom_events ADD COLUMN IF NOT EXISTS transaction_id VARCHAR(64);
        ALTER TABLE analytics_custom_events ADD COLUMN IF NOT EXISTS source         VARCHAR(10) NOT NULL DEFAULT 'manual';
        ALTER TABLE analytics_events        ADD COLUMN IF NOT EXISTS gclid          VARCHAR(512);
        ALTER TABLE analytics_events        ADD COLUMN IF NOT EXISTS msclkid        VARCHAR(512);
        ALTER TABLE analytics_events        ADD COLUMN IF NOT EXISTS fbclid         VARCHAR(512);
        ALTER TABLE analytics_custom_events ADD COLUMN IF NOT EXISTS gclid          VARCHAR(512);
        ALTER TABLE analytics_custom_events ADD COLUMN IF NOT EXISTS msclkid        VARCHAR(512);
        ALTER TABLE analytics_custom_events ADD COLUMN IF NOT EXISTS fbclid         VARCHAR(512);
        ALTER TABLE analytics_custom_events ADD COLUMN IF NOT EXISTS utm_campaign   VARCHAR(512);
        ALTER TABLE analytics_custom_events ADD COLUMN IF NOT EXISTS utm_content    VARCHAR(512);
        ALTER TABLE analytics_custom_events ADD COLUMN IF NOT EXISTS utm_source     VARCHAR(255);
        ALTER TABLE analytics_custom_events ADD COLUMN IF NOT EXISTS utm_medium     VARCHAR(255);
        ALTER TABLE analytics_conversion_pushes ADD COLUMN IF NOT EXISTS utm_campaign VARCHAR(512);
        ALTER TABLE analytics_conversion_pushes ADD COLUMN IF NOT EXISTS utm_content  VARCHAR(512);
        ALTER TABLE analytics_events ADD COLUMN IF NOT EXISTS page_interests TEXT[];
        ALTER TABLE analytics_events ADD COLUMN IF NOT EXISTS browser_topics JSONB;
    `).catch(() => {});
    await db.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_ae_pageview_id ON analytics_events (pageview_id);
    `).catch(() => {});
    // Per-site behavior-analytics configuration (heatmaps default on/cheap,
    // recording defaults off/expensive — see api/analytics-site-config.js).
    await db.query(`
        ALTER TABLE analytics_sites ADD COLUMN IF NOT EXISTS heatmaps_enabled          BOOLEAN  NOT NULL DEFAULT true;
        ALTER TABLE analytics_sites ADD COLUMN IF NOT EXISTS recording_enabled         BOOLEAN  NOT NULL DEFAULT false;
        ALTER TABLE analytics_sites ADD COLUMN IF NOT EXISTS recording_sample_rate     SMALLINT NOT NULL DEFAULT 20;
        ALTER TABLE analytics_sites ADD COLUMN IF NOT EXISTS recording_retention_days  SMALLINT NOT NULL DEFAULT 30;
        ALTER TABLE analytics_sites ADD COLUMN IF NOT EXISTS heatmap_retention_days    SMALLINT NOT NULL DEFAULT 90;
        ALTER TABLE analytics_sites ADD COLUMN IF NOT EXISTS recording_block_selectors TEXT[]   NOT NULL DEFAULT '{}';
        ALTER TABLE analytics_sites ADD COLUMN IF NOT EXISTS recording_mask_selectors  TEXT[]   NOT NULL DEFAULT '{}';
        ALTER TABLE analytics_sites ADD COLUMN IF NOT EXISTS datalayer_enabled         BOOLEAN  NOT NULL DEFAULT false;
        ALTER TABLE analytics_sites ADD COLUMN IF NOT EXISTS lead_quality_enabled      BOOLEAN  NOT NULL DEFAULT false;
        ALTER TABLE analytics_sites ADD COLUMN IF NOT EXISTS lead_require_engaged      BOOLEAN  NOT NULL DEFAULT true;
        ALTER TABLE analytics_sites ADD COLUMN IF NOT EXISTS lead_qualifying_pages     TEXT[]   NOT NULL DEFAULT '{}';
        ALTER TABLE analytics_sites ADD COLUMN IF NOT EXISTS lead_qualifying_events    TEXT[]   NOT NULL DEFAULT '{}';
    `).catch(() => {});
    // Ad platform conversion push log — created on first custom event with click IDs.
    // 'pending' rows are picked up by /api/ad-conversion-push and sent to the
    // relevant ad platform. Status then becomes 'sent' or 'failed'.
    await db.query(`
        CREATE TABLE IF NOT EXISTS analytics_conversion_pushes (
            id                BIGSERIAL    PRIMARY KEY,
            organisation_id   INTEGER      NOT NULL,
            site_id           VARCHAR(32)  NOT NULL,
            custom_event_id   BIGINT,
            platform          VARCHAR(32)  NOT NULL,
            click_id          VARCHAR(512),
            event_name        VARCHAR(64),
            value_usd         NUMERIC(12,4),
            currency          VARCHAR(3),
            conversion_time   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
            status            VARCHAR(16)  NOT NULL DEFAULT 'pending',
            error_message     TEXT,
            platform_response JSONB,
            pushed_at         TIMESTAMPTZ,
            created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_acp_org_status ON analytics_conversion_pushes (organisation_id, status);
        CREATE INDEX IF NOT EXISTS idx_acp_created    ON analytics_conversion_pushes (created_at);
    `).catch(() => {});
    // dataLayer -> intaAnalytics.track() mapping rules. Deliberately only three
    // fixed, typed extraction slots (value/currency/transaction_id) rather than
    // a generic field mapper — a rule can only ever point at *where* those three
    // safe values live in a pushed object, never introduce a new field name, so
    // a misconfigured path can't accidentally exfiltrate something like an email
    // address sitting elsewhere in the same dataLayer push.
    await db.query(`
        CREATE TABLE IF NOT EXISTS analytics_datalayer_rules (
            id                 BIGSERIAL    PRIMARY KEY,
            site_id            VARCHAR(32)  NOT NULL,
            organisation_id    INTEGER      NOT NULL,
            datalayer_event    VARCHAR(64)  NOT NULL,
            maps_to_name       VARCHAR(64)  NOT NULL,
            kind               VARCHAR(16)  NOT NULL DEFAULT 'custom',
            value_path         VARCHAR(120),
            currency_path      VARCHAR(120),
            transaction_id_path VARCHAR(120),
            enabled            BOOLEAN      NOT NULL DEFAULT true,
            created_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
            UNIQUE (site_id, datalayer_event)
        );
        CREATE INDEX IF NOT EXISTS idx_adr_site ON analytics_datalayer_rules (site_id);
    `).catch(() => {});
    // Page Experiments — ab_tests/ab_test_variants are owned/migrated by
    // api/ab-tests.js; re-declared here defensively (same duplication
    // convention api/ab-test-proxy.js already uses) so the exposure-record
    // JOIN below never hits a missing-table error, even though in practice
    // a test can't be "running" without that file having migrated first.
    // ab_test_assignments itself IS owned here — this is its only writer.
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
        );
        ALTER TABLE ab_tests ADD COLUMN IF NOT EXISTS ends_at TIMESTAMPTZ;
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
        );
        CREATE TABLE IF NOT EXISTS ab_test_assignments (
            id          BIGSERIAL   PRIMARY KEY,
            test_id     BIGINT      NOT NULL REFERENCES ab_tests(id) ON DELETE CASCADE,
            variant_id  BIGINT      NOT NULL REFERENCES ab_test_variants(id) ON DELETE CASCADE,
            domain      TEXT        NOT NULL,
            session_id  VARCHAR(64) NOT NULL,
            assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_aba_test     ON ab_test_assignments (test_id);
        CREATE INDEX IF NOT EXISTS idx_aba_variant  ON ab_test_assignments (variant_id);
        CREATE INDEX IF NOT EXISTS idx_aba_assigned ON ab_test_assignments (assigned_at);
        -- Hostname the exposure actually happened on — same purpose as
        -- analytics_events.page_host: a url_split variant redirecting to a
        -- subdomain doesn't need its own analytics_sites/site key, since one
        -- site key can already cover multiple real hostnames as long as
        -- each row is tagged with which one it came from.
        ALTER TABLE ab_test_assignments ADD COLUMN IF NOT EXISTS page_host TEXT;
        ALTER TABLE analytics_custom_events ADD COLUMN IF NOT EXISTS page_host VARCHAR(255);
        ALTER TABLE analytics_clicks ADD COLUMN IF NOT EXISTS page_host VARCHAR(255);
        ALTER TABLE analytics_bot_visits ADD COLUMN IF NOT EXISTS page_host VARCHAR(255);
        ALTER TABLE analytics_custom_events ADD COLUMN IF NOT EXISTS products JSONB;
        -- Free-form key/value data passed as track(name, { data: {...} }) —
        -- e.g. { reason: 'invalid_phone_format' } on a
        -- 'verification_code_send_failed' event. Unlike 'products' (a fixed
        -- e-commerce shape), this is arbitrary per-event context a site wants
        -- to inspect later; both client (track()) and server (this endpoint)
        -- shallow-sanitize it the same way products already are — capped key
        -- count/length and value length, no unbounded nesting — before it
        -- ever reaches this column.
        ALTER TABLE analytics_custom_events ADD COLUMN IF NOT EXISTS extra_data JSONB;
        ALTER TABLE analytics_custom_events ADD COLUMN IF NOT EXISTS browser_family VARCHAR(32);
        CREATE TABLE IF NOT EXISTS analytics_foreign_domains (
            id              BIGSERIAL    PRIMARY KEY,
            site_id         VARCHAR(32)  NOT NULL,
            organisation_id INTEGER      NOT NULL,
            domain          VARCHAR(255) NOT NULL,
            first_seen      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
            last_seen       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
            hit_count       INTEGER      NOT NULL DEFAULT 1,
            approved        BOOLEAN      NOT NULL DEFAULT false,
            UNIQUE (site_id, domain)
        );
        CREATE INDEX IF NOT EXISTS idx_afd_site ON analytics_foreign_domains (site_id);
    `).catch(() => {});
}

// ── The embed script (served as application/javascript on GET) ────────────────
// Site key is read from the data-site attribute at runtime.
// Snippet format: <script src=".../api/a" data-site="SITEKEY" async defer></script>
const EMBED_SCRIPT = `(function(){
'use strict';
// Our own cookie-compliance scanner runs headless Chrome with a normal
// desktop UA (see api/_scan-core.js) so target sites see it like a real
// visitor — UA-based bot detection on the server can't tell it apart from
// one. It sets this flag on the page before any other script runs specifically
// so first-party scripts can recognise it, so bail out here before doing
// anything at all: scan runs should never appear in the dashboard as traffic.
try{if(window.__ICS_SCAN__)return;}catch(e){}
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
// Fallback: <script src=".../api/a?id=SITEKEY"> — no data-site attribute needed.
if(!SITE){try{var _m=(el&&el.src||'').match(/[?&]id=([^&]*)/);if(_m)SITE=decodeURIComponent(_m[1]||'');}catch(e){}}
if(!SITE){
  try{console.warn('[Intastellar Analytics] No data-site attribute found — tracking disabled. Add data-site="<your-site-key>" to the script tag.');}catch(e){}
  return;
}
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
  // Cookie is the authoritative persistent record — check it first.
  var raw=gc(CK);
  if(raw){var obj=decode(raw);if(obj&&obj.consents)return obj.consents;}
  // window.intaCookieConsents IS the consents object directly (no .consents wrapper).
  // Used as a fallback for the brief window between accept-click and cookie write.
  try{
    if(window.intaCookieConsents&&typeof window.intaCookieConsents==='object')return window.intaCookieConsents;
  }catch(e){}
  return null;
}

// Banner stores boolean true (Accept All) or the string "checked" (individual saves).
function ok(v){return v===true||v==='checked';}
// "staticsticCookies" is the banner's own typo — check both spellings.
function hasStat(c){return !!(c&&(ok(c.staticsticCookies)||ok(c.statisticCookies)));}
function hasFun(c) {return !!(c&&ok(c.functionalCookies));}
function hasAdv(c) {return !!(c&&ok(c.advertisementCookies));}

// Registrable parent domain for the current host, so the session cookie can
// be scoped with Domain=<root> and shared across subdomains (e.g. a booking
// portal on book.example.com and the main site on www.example.com, or a
// url_split test on the apex redirecting to a variant subdomain) instead of
// resetting per-origin the way sessionStorage does. Not a full public-
// suffix-list implementation — just the common two-label ccTLD cases where
// the naive "last two labels" guess would be wrong (co.uk, com.au, ...).
// Anything unlisted falls back to the last two labels, which is correct for
// the overwhelming majority of real hostnames.
var TWO_LABEL_TLDS=['co.uk','org.uk','me.uk','gov.uk','ac.uk','co.nz','org.nz','com.au','net.au','org.au','co.jp','co.in','co.za'];
function rootDomain(){
  try{
    var h=(location.hostname||'').toLowerCase();
    if(!h||h==='localhost'||/^(\\d{1,3}\\.){3}\\d{1,3}$/.test(h))return null; // IP/localhost — no cross-subdomain concept, no Domain attribute
    var parts=h.split('.');
    // A single-label host (no dot — an internal hostname with no real TLD)
    // has no "domain" to scope to; a bare two-label host (e.g.
    // "asasoftware.aero") DOES — setting Domain=<itself> here is what makes
    // the resulting cookie a domain cookie subdomains can read too, per RFC
    // 6265, rather than the host-only cookie an omitted Domain attribute
    // produces. Skipping this for the two-label case (as this used to do)
    // silently broke subdomain sharing whenever the *apex* set the cookie
    // first, even though the reverse direction (a subdomain setting it)
    // already worked via the parts.length>2 branch below.
    if(parts.length<2)return null;
    var lastTwo=parts.slice(-2).join('.');
    if(parts.length>2&&TWO_LABEL_TLDS.indexOf(lastTwo)!==-1)return parts.slice(-3).join('.');
    return lastTwo;
  }catch(e){return null;}
}

function getSid(){
  try{
    var existing=gc('_ia_s');
    if(existing)return existing;
    var v=Math.random().toString(36).slice(2,10)+Date.now().toString(36);
    // No Max-Age/Expires — a *session* cookie (cleared when the browser
    // itself closes, not per-tab like sessionStorage was), so this widens
    // *scope* (shared across tabs and, with Domain set, across subdomains)
    // without changing what "one session" means for conversion-rate math.
    var base='_ia_s='+encodeURIComponent(v)+';path=/;SameSite=Lax'+(location.protocol==='https:'?';Secure':'');
    var domain=rootDomain();
    if(domain){
      document.cookie=base+';domain='+domain;
      // A Domain attribute the browser rejects for this host (e.g. our
      // two-label-TLD list missed one) fails the write silently rather than
      // erroring — verify it landed before trusting it, falling back to a
      // same-origin cookie so session continuity degrades gracefully
      // instead of vanishing outright.
      if(document.cookie.indexOf('_ia_s=')===-1)document.cookie=base;
    }else{
      document.cookie=base;
    }
    return v;
  }catch(e){return Math.random().toString(36).slice(2,10);}
}
// Persistent visitor cookie (_ia_v) — survives browser close unlike _ia_s.
// Max-Age 2 years. Absence = first-ever visit (new visitor). Returns 1 if
// just created (new), 0 if already existed (returning).
function getVid(){
  try{
    if(gc('_ia_v'))return 0;
    var v=Math.random().toString(36).slice(2,10)+Date.now().toString(36);
    var b='_ia_v='+encodeURIComponent(v)+';path=/;Max-Age=63072000;SameSite=Lax'+(location.protocol==='https:'?';Secure':'');
    var d=rootDomain();
    if(d){document.cookie=b+';domain='+d;if(document.cookie.indexOf('_ia_v=')===-1)document.cookie=b;}
    else document.cookie=b;
    return 1;
  }catch(e){return 0;}
}
var _iaNew=getVid();

// Ad click IDs + UTM params captured on landing and persisted for 90 days so
// they survive across sessions and are still available when a conversion fires
// later in the same journey. UTM campaign/content often carry numeric platform
// IDs (e.g. {campaignid}/{adgroupid} ValueTrack or {{campaign.id}} in Meta),
// allowing server-side resolution to campaign/ad names. Only sent with
// full-consent events.
function getClickIds(){
  try{
    var p=new URLSearchParams(location.search);
    var g=p.get('gclid')||'',ms=p.get('msclkid')||'',fb=p.get('fbclid')||'';
    var uc=p.get('utm_campaign')||'',uk=p.get('utm_content')||'';
    var us=p.get('utm_source')||'',um=p.get('utm_medium')||'';
    if(g||ms||fb||uc||uk||us||um){
      var val=encodeURIComponent(JSON.stringify({g:g,ms:ms,fb:fb,uc:uc,uk:uk,us:us,um:um}));
      var base='_ia_cid='+val+';path=/;Max-Age=7776000;SameSite=Lax'+(location.protocol==='https:'?';Secure':'');
      var d=rootDomain();
      if(d){document.cookie=base+';domain='+d;if(document.cookie.indexOf('_ia_cid=')===-1)document.cookie=base;}
      else document.cookie=base;
    }
    var stored=gc('_ia_cid');
    if(stored){try{return JSON.parse(decodeURIComponent(stored));}catch(e){}}
    return {};
  }catch(e){return {};}
}
var _iaCid=getClickIds();

function utmp(p){try{return new URLSearchParams(location.search).get(p)||'';}catch(e){return '';}}
// The hostname the script is actually running on — distinct from the site's
// registered domain. A site key embedded on a booking subdomain/white-label
// host (e.g. a booking widget on a different domain than the main site)
// still reports under the same site_id, so this is what lets that cross-site
// traffic be told apart from the primary domain in the dashboard.
function getHost(){try{return (location.hostname||'').slice(0,255);}catch(e){return '';}}
function devType(){var w=screen.width;return w<768?'m':w<1024?'t':'d';}
function getLang(){try{return(navigator.language||'').slice(0,20);}catch(e){return '';}}
function getTz(){try{return Intl.DateTimeFormat().resolvedOptions().timeZone||'';}catch(e){return '';}}

var t0=Date.now(),fullFired=false,exitSent=false,maxScroll=0;
// One id per page load, sent on both the entry and exit full-event calls so
// the server can upsert a single row per pageview instead of inserting twice.
var pvid=Math.random().toString(36).slice(2,10)+Date.now().toString(36);
// Referrer override for SPA virtual navigations — empty on real page loads.
var _spaRef='';

// Track max scroll depth as a percentage
(function(){
  function onScroll(){
    var h=document.documentElement;
    var pct=Math.round(((h.scrollTop||document.body.scrollTop)/(h.scrollHeight-h.clientHeight||1))*100);
    if(pct>maxScroll)maxScroll=Math.min(100,pct);
  }
  try{window.addEventListener('scroll',onScroll,{passive:true});}catch(e){}
})();

// ── Click tracking for heatmaps (full-consent only) ────────────────────────
// Started once full consent is confirmed (see sendFull()). Buffers clicks and
// flushes in small batches so the heatmap read side can bucket them cheaply
// with SQL rather than re-parsing anything at render time.
var clickBuf=[],clickTrackingStarted=false,clickFlushIv=null;

function pageHeight(){
  var h=document.documentElement,b=document.body;
  return Math.max(h&&h.scrollHeight||0,b&&b.scrollHeight||0,h&&h.clientHeight||0,1);
}

function sendClicks(){
  if(!clickBuf.length)return;
  var batch=clickBuf.splice(0,clickBuf.length);
  send(JSON.stringify({s:SITE,t:'ck',sid:getSid(),u:location.pathname,h:getHost(),dt:devType(),ph:pageHeight(),ck:batch}));
}

function onClick(e){
  try{
    var t=e.target;
    if(!t||t.nodeType!==1)return;
    var w=document.documentElement.clientWidth||window.innerWidth||1;
    var ph=pageHeight();
    var scrollY=window.pageYOffset||document.documentElement.scrollTop||0;
    var x=Math.min(100,Math.max(0,(e.clientX/w)*100));
    var y=Math.min(100,Math.max(0,((e.clientY+scrollY)/ph)*100));
    var tag=(t.tagName||'').toLowerCase().slice(0,20);
    var id=(t.id||'').slice(0,150);
    var cls=(typeof t.className==='string'?t.className:'').slice(0,300);
    var txt='';
    try{txt=(t.innerText||t.textContent||'').replace(/\\s+/g,' ').trim().slice(0,80);}catch(e2){}
    clickBuf.push([Math.round(x*100)/100,Math.round(y*100)/100,w,tag,id,cls,txt]);
    if(clickBuf.length>=25)sendClicks();
  }catch(err){}
}

function startClickTracking(){
  if(clickTrackingStarted)return;
  clickTrackingStarted=true;
  try{document.addEventListener('click',onClick,{capture:true,passive:true});}catch(e){}
  clickFlushIv=setInterval(sendClicks,5000);
}

// ── Session recording bootstrap (rrweb, lazy-loaded) + dataLayer bridge ─────
// One site-config fetch drives both features. Recording is kept entirely out
// of this hand-minified embed — only fetched/run for sites with recording
// enabled AND a visitor sampled into the per-session roll, so the vast
// majority of pageviews never pay rrweb's download/runtime cost.
var siteFeaturesBootstrapped=false;
// Approved cross-site domains (fetched from site config at boot). Clicks to
// these are NOT counted as outbound_click — they belong to the same operator.
var _ownDomains=[];
(function(){
  try{
    var xhr=new XMLHttpRequest();
    xhr.open('GET','https://analytics.consentsmanagement.com/api/analytics-site-config?site='+encodeURIComponent(SITE),true);
    xhr.onload=function(){
      try{
        var cfg=JSON.parse(xhr.responseText);
        if(cfg&&Array.isArray(cfg.approvedDomains))_ownDomains=cfg.approvedDomains;
      }catch(e){}
    };
    xhr.send();
  }catch(e){}
})();

// Dot-path walk into a dataLayer push, capped at 4 segments — never returns
// nested objects/arrays, only whatever primitive sits at that exact path.
function getPath(obj,path,maxDepth){
  if(!path)return undefined;
  var parts=String(path).split('.').slice(0,maxDepth||4);
  var cur=obj;
  for(var i=0;i<parts.length;i++){
    if(cur==null||typeof cur!=='object')return undefined;
    cur=cur[parts[i]];
  }
  return cur;
}
function safeNum(v){return (typeof v==='number'&&isFinite(v))?v:undefined;}
function safeStr(v,max){return (typeof v==='string')?v.slice(0,max):undefined;}

var dlRules=null;
// Only three fixed, typed extraction slots — a rule can only ever point at
// *where* value/currency/transaction_id live in a pushed object, never
// introduce a new field name, so a misconfigured path can't exfiltrate
// something else (e.g. an email) sitting elsewhere in the same push.
function handleDataLayerEntry(entry){
  if(!entry||typeof entry!=='object'||!entry.event||!dlRules)return;
  for(var i=0;i<dlRules.length;i++){
    var r=dlRules[i];
    if(r.datalayerEvent!==entry.event)continue;
    track(r.mapsToName,{
      value:safeNum(getPath(entry,r.valuePath)),
      currency:safeStr(getPath(entry,r.currencyPath),10),
      transactionId:safeStr(getPath(entry,r.transactionIdPath),64),
      _source:'datalayer'
    });
  }
}
function installDataLayerListener(rules){
  dlRules=rules;
  try{
    window.dataLayer=window.dataLayer||[];
    var dl=window.dataLayer;
    // Entries pushed before we got here (e.g. GTM initialised first) still count.
    for(var j=0;j<dl.length;j++){try{handleDataLayerEntry(dl[j]);}catch(e){}}
    var origPush=dl.push.bind(dl);
    dl.push=function(){
      for(var k=0;k<arguments.length;k++){try{handleDataLayerEntry(arguments[k]);}catch(e){}}
      return origPush.apply(dl,arguments);
    };
  }catch(e){}
}

function bootstrapSiteFeatures(){
  if(siteFeaturesBootstrapped)return;
  siteFeaturesBootstrapped=true;
  try{
    var xhr=new XMLHttpRequest();
    xhr.open('GET','https://analytics.consentsmanagement.com/api/analytics-site-config?site='+encodeURIComponent(SITE),true);
    xhr.onload=function(){
      if(xhr.status<200||xhr.status>=300)return;
      var cfg;
      try{cfg=JSON.parse(xhr.responseText);}catch(e){return;}
      if(!cfg)return;

      if(Array.isArray(cfg.approvedDomains))_ownDomains=cfg.approvedDomains;

      if(cfg.datalayerEnabled&&cfg.datalayerRules&&cfg.datalayerRules.length){
        installDataLayerListener(cfg.datalayerRules);
      }

      if(!cfg.recordingEnabled)return;

      var rk='_ia_rec',roll;
      try{roll=sessionStorage.getItem(rk);}catch(e){roll=null;}
      if(roll===null){
        roll=(Math.random()*100<Number(cfg.sampleRate||0))?'1':'0';
        try{sessionStorage.setItem(rk,roll);}catch(e){}
      }
      if(roll!=='1')return;

      window.__intaRecCfg={
        s:SITE,sid:getSid(),
        ep:'https://analytics.consentsmanagement.com/api/analytics-recording-ingest',
        block:cfg.blockSelectors||[],mask:cfg.maskSelectors||[]
      };
      var s=document.createElement('script');
      s.src='https://analytics.consentsmanagement.com/r.js';
      s.async=true;
      document.head.appendChild(s);
    };
    xhr.send();
  }catch(e){}
}

// ── Page Experiments (visual A/B tests) ─────────────────────────────────────
// Unlike bootstrapSiteFeatures() above (only ever called for full-consent
// visitors, since recording/dataLayer are consent-sensitive features), both
// variant APPLICATION and the exposure record run for every visitor
// regardless of consent tier — assignment data is needed for valid test
// results even from visitors who declined statistics cookies. See
// applyPageExperiment()'s call site near the bottom of this file.

// Same generic fallback heuristic detectBot() uses server-side (self-
// identifying crawlers only — Googlebot, Bingbot, etc. all match this).
// Not exhaustive, and deliberately not: this only needs to stop an indexed
// crawl from seeing a randomly-bucketed variant, not defeat sophisticated
// scraping — the exposure record is already bot-free for free server-side
// via the real detectBot() check.
function looksLikeBot(){
  try{return /bot|spider|crawler|crawling/i.test(navigator.userAgent||'');}catch(e){return false;}
}

function fnv1a(str){
  var h=0x811c9dc5;
  for(var i=0;i<str.length;i++){h^=str.charCodeAt(i);h=Math.imul(h,0x01000193);}
  return h>>>0;
}
function pickVariant(testId,sid,variants){
  var pct=(fnv1a(testId+':'+sid)%10000)/10000,cum=0;
  for(var i=0;i<variants.length;i++){cum+=variants[i].weight;if(pct<cum)return variants[i];}
  return variants[variants.length-1];
}

// Persisted per-test variant decision — computed once, on this session's
// first pageload for a given test, then reused on every later evaluation
// instead of re-deriving it from pickVariant() again. pickVariant() is
// already a deterministic hash of (testId, sid), so on a truly static test
// this wouldn't change anything — but a mid-test edit to traffic_split or
// the variant list changes the hash's *outcome* (different weights/variant
// count shift where the cumulative-weight walk lands), which would
// otherwise flip an already-bucketed visitor to a different variant
// partway through. Domain-scoped the same way as the session cookie (see
// rootDomain()) so the decision is readable from either side of a
// url_split redirect, not just the domain that made it.
function abDecisionCookieName(testId){return '_ia_abv_'+testId;}
function getAbDecision(testId){
  try{return gc(abDecisionCookieName(testId))||null;}catch(e){return null;}
}
function setAbDecision(testId,variantId){
  try{
    var base=abDecisionCookieName(testId)+'='+encodeURIComponent(variantId)+';path=/;SameSite=Lax'+(location.protocol==='https:'?';Secure':'');
    var domain=rootDomain();
    if(domain){
      document.cookie=base+';domain='+domain;
      if(document.cookie.indexOf(abDecisionCookieName(testId)+'=')===-1)document.cookie=base;
    }else{
      document.cookie=base;
    }
  }catch(e){}
}

// Kept in sync with applyChange() in api/ab-test-proxy.js's bridge script —
// same change shape, same behavior, applied here to the live page instead
// of inside the editor's preview iframe.
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

function applyPageExperiment(){
  if(looksLikeBot())return;
  try{
    var xhr=new XMLHttpRequest();
    xhr.open('GET','https://analytics.consentsmanagement.com/api/ab-test-active?site='+encodeURIComponent(SITE)+'&path='+encodeURIComponent(location.pathname)+'&host='+encodeURIComponent(getHost()),true);
    xhr.onload=function(){
      if(xhr.status<200||xhr.status>=300)return;
      var data;
      try{data=JSON.parse(xhr.responseText);}catch(e){return;}
      var test=data&&data.test;
      if(!test||!test.variants||!test.variants.length)return;

      // Reuse a saved decision for this test/session if one exists —
      // otherwise pick fresh and save it. See abDecisionCookieName()'s doc
      // comment above for why this isn't just pickVariant() every time.
      var savedId=getAbDecision(test.id);
      var variant=savedId&&test.variants.filter(function(v){return String(v.id)===String(savedId);})[0];
      if(!variant){
        variant=pickVariant(String(test.id),getSid(),test.variants);
        setAbDecision(test.id,variant.id);
      }

      if(test.testType==='url_split'){
        // URL split: redirect to the variant's page once. Control stays
        // put. Skip the redirect if we're already on the variant's own
        // destination host — without this, a script that also runs on the
        // redirect-target domain re-evaluates this same test on every
        // pageload and bounces every deeper click back to the variant root.
        //
        // IMPORTANT: also skip the ab exposure event when already on target.
        // The redirect fires send() on the source domain before redirecting,
        // so the variant assignment is already recorded there. Firing send()
        // again on the target domain creates a second ab_test_assignments row
        // for the same session, which doubles the "Visitors" count for the
        // variant vs. the control (control sessions are only ever counted once,
        // on the source domain). Skipping the event here keeps counts correct.
        if(!variant.isControl&&variant.redirectUrl){
          var alreadyOnTarget=(function(){
            try{return new URL(variant.redirectUrl).host===location.host;}catch(e){return false;}
          })();
          if(alreadyOnTarget)return; // already counted from source domain
          // Sending exposure before redirect so the record lands even if the
          // browser cuts the network request short during navigation.
          send(JSON.stringify({s:SITE,t:'ab',tid:test.id,vid:variant.id,sid:getSid(),u:location.pathname,h:getHost()}));
          try{location.replace(variant.redirectUrl);}catch(e){}
        } else {
          // Control — count the exposure on the source domain.
          send(JSON.stringify({s:SITE,t:'ab',tid:test.id,vid:variant.id,sid:getSid(),u:location.pathname,h:getHost()}));
        }
        return;
      }

      // Non-url-split: count exposure unconditionally (assignment/exposure data
      // is needed even when the visitor declined statistics cookies).
      send(JSON.stringify({s:SITE,t:'ab',tid:test.id,vid:variant.id,sid:getSid(),u:location.pathname,h:getHost()}));

      var applyChanges=function(){
        var changes=variant.changes||[];
        for(var i=0;i<changes.length;i++)applyChange(changes[i]);
      };
      if(document.readyState==='loading'){
        document.addEventListener('DOMContentLoaded',applyChanges);
      }else{
        applyChanges();
      }
    };
    xhr.send();
  }catch(e){}
}

function send(payload){
  // fetch+keepalive survives page unload much like sendBeacon, but without
  // sendBeacon's spec-mandated credentialed CORS mode — a credentialed
  // request's response can never use a wildcard Access-Control-Allow-Origin,
  // and this endpoint has no use for cookies anyway (site_id in the payload
  // is the real trust boundary), so credentials:'omit' avoids that mismatch
  // entirely rather than loosening CORS to accommodate it.
  try{
    if(window.fetch){
      fetch(EP,{method:'POST',headers:{'Content-Type':'application/json'},body:payload,keepalive:true,credentials:'omit'}).catch(function(err){try{console.warn('[Intastellar Analytics] Failed to send event:',err&&err.message||err);}catch(e){}});
      return;
    }
  }catch(e){}
  // Fallback for browsers without fetch.
  try{
    var xhr=new XMLHttpRequest();
    xhr.open('POST',EP,true);
    xhr.setRequestHeader('Content-Type','application/json');
    xhr.send(payload);
  }catch(e){}
}

var _bt=[],_btFetched=false;

function fetchBrowserTopics(c){
  if(_btFetched||!hasFun(c))return;
  _btFetched=true;
  try{
    if('browsingTopics' in document){
      document.browsingTopics({skipObservation:false}).then(function(topics){
        _bt=(topics||[]).slice(0,5).map(function(t){return t.topic;}).filter(function(n){return typeof n==='number'&&n>0;});
      }).catch(function(){});
    }
  }catch(ex){}
}

function sendMinimal(c){
  var pl={s:SITE,cl:'minimal',u:location.pathname,h:getHost(),dt:devType(),cs:hasStat(c)?1:0,cf:hasFun(c)?1:0,ca:hasAdv(c)?1:0};
  send(JSON.stringify(pl));
}

function sendFull(c,final){
  fullFired=true;
  startClickTracking();
  if(!final)bootstrapSiteFeatures();
  fetchBrowserTopics(c);
  var pl={
    s:SITE,cl:'full',sid:getSid(),pv:pvid,
    u:location.href,r:_spaRef||document.referrer||'',
    h:getHost(),
    ti:(document.title||'').slice(0,200),
    us:utmp('utm_source'),um:utmp('utm_medium'),
    uc:utmp('utm_campaign'),uk:utmp('utm_content'),
    dt:devType(),
    sw:screen.width,sh:screen.height,
    vw:window.innerWidth,vh:window.innerHeight,
    lang:getLang(),tz:getTz(),
    dur:Math.round((Date.now()-t0)/1000),
    sd:final?maxScroll:undefined,
    cs:hasStat(c)?1:0,
    cf:hasFun(c)?1:0,
    ca:hasAdv(c)?1:0,
    final:final?1:0,
    nv:_iaNew,
    gc:_iaCid.g||undefined,mc:_iaCid.ms||undefined,fc:_iaCid.fb||undefined
  };
  if(_bt.length&&hasFun(c))pl.bt=_bt;
  send(JSON.stringify(pl));
}

document.addEventListener('visibilitychange',function(){
  // "hidden" fires on any backgrounding (tab switch, mobile app-switch,
  // screen lock) — not necessarily the end of the visit. Treating it as
  // final locked duration_sec/scroll_depth in at whatever they were the
  // moment the visitor first glanced away, even if they came right back and
  // kept reading — systematically undercounting time-on-page. Flush
  // defensively here instead (a backgrounded mobile tab can be killed by the
  // OS without ever firing pagehide) without marking exitSent: the
  // pageview_id upsert lets a later beacon keep extending the same row's
  // duration_sec if the visitor returns. Only pagehide — genuine
  // navigation-away/unload — is treated as the definitive end of the visit.
  if(document.visibilityState==='hidden'&&fullFired&&!exitSent){
    sendClicks();
    var c=getConsents();
    if(hasStat(c))sendFull(c,false);
  }
});
window.addEventListener('pagehide',function(){
  if(fullFired&&!exitSent){
    exitSent=true;
    if(clickFlushIv){clearInterval(clickFlushIv);clickFlushIv=null;}
    sendClicks();
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
  }else if(!hasStat(c2)&&fullFired){
    // Defensive: hard-stop and discard any in-progress recording immediately
    // if consent is downgraded mid-session, regardless of whether the banner
    // itself is known to support live downgrade without a page reload.
    try{window.__intaRecStop&&window.__intaRecStop();}catch(e){}
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
}
function tryHooks(){
  hookConsentTrigger('IntaAcceptAll');    // banner's actual Accept All function
  hookConsentTrigger('IntaSaveSettings'); // banner's actual Save Settings function
}

var c=getConsents();
tryHooks();
applyPageExperiment(); // Runs (and reports exposure) regardless of consent tier — see its own doc comment above.
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
// window.intaAnalytics.track('purchase', { value: 49.99, currency: 'EUR',
//   products: [{ id: 'SKU-1', name: 'Blue T-Shirt', price: 29.99, quantity: 2, category: 'Apparel' }] })
// window.intaAnalytics.track('verification_code_send_failed', { data: { reason: 'invalid_phone_format' } })
// Fires a minimal (unlinked) record always; upgrades to a session-linked
// record only when the visitor has accepted statisticCookies. \`data\` is a
// free-form flat object shown back in the dashboard next to the event —
// shallow-sanitized here (and again server-side) rather than sent as-is.
function track(name,opts){
  if(!name||typeof name!=='string')return;
  opts=opts||{};
  var c=getConsents();
  var full=hasStat(c);
  var prods=undefined;
  if(Array.isArray(opts.products)&&opts.products.length){
    prods=opts.products.slice(0,50).map(function(p){
      var o={};
      if(p.id)o.id=String(p.id).slice(0,64);
      if(p.name)o.name=String(p.name).slice(0,100);
      if(typeof p.price==='number'&&isFinite(p.price))o.price=p.price;
      if(typeof p.quantity==='number'&&isFinite(p.quantity))o.qty=Math.round(p.quantity);
      if(p.category)o.cat=String(p.category).slice(0,64);
      if(p.variant)o.var=String(p.variant).slice(0,64);
      return o;
    });
  }
  var extra=undefined;
  if(opts.data&&typeof opts.data==='object'&&!Array.isArray(opts.data)){
    var ed={},keys=Object.keys(opts.data).slice(0,20);
    for(var i=0;i<keys.length;i++){
      var k=String(keys[i]).slice(0,40),val=opts.data[keys[i]];
      if(val==null)continue;
      if(typeof val==='string')ed[k]=val.slice(0,500);
      else if(typeof val==='number'&&isFinite(val))ed[k]=val;
      else if(typeof val==='boolean')ed[k]=val;
      else if(Array.isArray(val))ed[k]=val.slice(0,50); // arrays stored as-is (e.g. form fields)
      else{try{ed[k]=JSON.stringify(val).slice(0,500);}catch(e){}}
    }
    if(Object.keys(ed).length)extra=ed;
  }
  send(JSON.stringify({
    s:SITE,t:'ev',n:String(name).slice(0,64),
    cl:full?'full':'minimal',
    sid:full?getSid():undefined,
    v:(typeof opts.value==='number'&&isFinite(opts.value))?opts.value:undefined,
    cur:opts.currency?String(opts.currency).slice(0,3):undefined,
    txn:opts.transactionId?String(opts.transactionId).slice(0,64):undefined,
    pr:prods,
    ed:extra,
    src:opts._source==='datalayer'?'datalayer':'manual',
    u:location.pathname,h:getHost(),dt:devType(),
    cs:full?1:0,
    cf:hasFun(c)?1:0,
    ca:hasAdv(c)?1:0,
    gc:full?(_iaCid.g||undefined):undefined,
    mc:full?(_iaCid.ms||undefined):undefined,
    fc:full?(_iaCid.fb||undefined):undefined,
    uc:full?(_iaCid.uc||undefined):undefined,
    uk:full?(_iaCid.uk||undefined):undefined,
    us:full?(_iaCid.us||undefined):undefined,
    um:full?(_iaCid.um||undefined):undefined
  }));
}
window.intaAnalytics={track:track};

// ── SPA / virtual-page navigation ────────────────────────────────────────
// Patches history.pushState/replaceState and listens to popstate so React,
// Next.js, Vue Router and other SPA frameworks get a real pageview tracked
// on each client-side route change without a full page reload.
// Pathname+search is the change key — hash-only changes are ignored.
var _spaLastPath=location.pathname+location.search;
(function(){
  function onNav(){
    var newPath=location.pathname+location.search;
    if(newPath===_spaLastPath)return;
    _spaRef=location.protocol+'//'+location.host+_spaLastPath;
    _spaLastPath=newPath;
    if(fullFired&&!exitSent){
      exitSent=true;
      sendClicks();
      var cf=getConsents();
      if(hasStat(cf))sendFull(cf,true);
    }
    t0=Date.now();
    pvid=Math.random().toString(36).slice(2,10)+Date.now().toString(36);
    maxScroll=0;fullFired=false;exitSent=false;
    clickBuf.splice(0,clickBuf.length);
    var cn=getConsents();
    if(hasStat(cn)){sendFull(cn,false);}else{sendMinimal(cn);}
    applyPageExperiment();
  }
  try{
    var op=history.pushState,or=history.replaceState;
    history.pushState=function(){op.apply(this,arguments);setTimeout(onNav,0);};
    history.replaceState=function(){or.apply(this,arguments);setTimeout(onNav,0);};
    window.addEventListener('popstate',function(){setTimeout(onNav,0);});
  }catch(e){}
})();

// ── Shared form identifier ───────────────────────────────────────────────
// All form tracking events must use this function so formIds are consistent
// across form_submit, form_started, form_field_focus, form_error, and form_step.
// Inconsistent formIds cause JOIN failures in analytics queries (empty completion
// rate and abandonment columns in the dashboard).
function _formId(form){
  var f=(form.getAttribute('data-analytics-id')||form.id||form.name||'').slice(0,64);
  if(f)return f;
  var cls=(form.className||'').trim().split(/\\s+/)[0].slice(0,63);
  if(cls)return '.'+cls;
  var a=(form.action||'').replace(/^https?:\\/\\/[^\\/]+/,'').split('?')[0].slice(0,100);
  return a||'form';
}

// ── Automatic form tracking ───────────────────────────────────────────────
// Fires a form_submit event on every <form> submit. Never captures field
// values — only names and types — so no PII enters the pipeline.
// Password, hidden, credit-card pattern names are skipped automatically.
(function(){
  var SKIP_TYPES={password:1,hidden:1,file:1,submit:1,button:1,reset:1,image:1};
  var SKIP_NAMES=/card|cvv|cvc|ccv|ssn|tax|iban|bic|pin|secret|token|auth/i;
  document.addEventListener('submit',function(e){
    try{
      var form=e.target;
      if(!form||form.tagName!=='FORM')return;
      var fid=_formId(form);
      var faction=(form.action||'').replace(/^https?:\\/\\/[^\\/]+/,'').slice(0,100);
      var fields=[],els=form.elements;
      for(var i=0;i<els.length&&fields.length<20;i++){
        var el=els[i];
        if(!el.name)continue;
        var tp=(el.type||'text').toLowerCase();
        if(SKIP_TYPES[tp]||SKIP_NAMES.test(el.name))continue;
        fields.push({name:el.name.slice(0,40),type:tp});
      }
      track('form_submit',{data:{
        formId:fid,
        action:faction,
        fields:fields,
        fieldCount:els.length
      }});
    }catch(err){}
  },true);
})();

// ── Outbound links, file downloads, phone & email clicks ─────────────────
// Subdomains of the current root domain are treated as internal navigation —
// shop.example.com clicked from www.example.com is NOT outbound. Approved
// cross-site domains (set in Analytics Settings → Cross-site tracking) are
// also excluded because those are operator-owned properties.
// rootDomain() uses the last two hostname parts as a lightweight eTLD+1
// approximation (correct for .com/.net/.org/etc; imperfect for .co.uk but
// close enough without a full PSL library in a <5 KB embed).
(function(){
  function rootDomain(h){var p=(h||'').split('.');return p.slice(-2).join('.');}
  var myRoot=rootDomain(location.hostname);
  var FILE_EXT=/\\.(?:pdf|zip|docx?|xlsx?|pptx?|csv|txt|rtf|mp3|mp4|mov|avi|webm|dmg|pkg|exe|apk|ipa)(\\?|#|$)/i;
  document.addEventListener('click',function(e){
    try{
      var a=e.target;
      while(a&&a.tagName!=='A')a=a.parentElement;
      if(!a||!a.href)return;
      var href=String(a.href);
      var proto=(href.split(':')[0]||'').toLowerCase();
      if(proto==='tel'){
        track('phone_click',{data:{number:href.slice(4).split('?')[0].slice(0,40)}});
        return;
      }
      if(proto==='mailto'){
        track('email_click',{data:{address:href.slice(7).split('?')[0].slice(0,100)}});
        return;
      }
      if(proto!=='http'&&proto!=='https')return;
      var host='';try{host=new URL(href).hostname;}catch(e2){}
      if(!host)return;
      // Same host or same root domain (subdomain) → internal
      if(host===location.hostname||rootDomain(host)===myRoot)return;
      // Approved cross-site property → not outbound
      if(_ownDomains.length){
        var hRoot=rootDomain(host);
        for(var oi=0;oi<_ownDomains.length;oi++){if(rootDomain(_ownDomains[oi])===hRoot)return;}
      }
      if(FILE_EXT.test(href)){
        track('file_download',{data:{
          file:href.split('/').pop().split('?')[0].slice(0,100),
          host:host,
          url:href.slice(0,200)
        }});
      }else{
        track('outbound_click',{data:{
          url:href.slice(0,200),
          host:host,
          text:(a.innerText||a.textContent||'').replace(/\\s+/g,' ').trim().slice(0,80)
        }});
      }
    }catch(err){}
  },true);
})();

// ── Scroll depth milestones ───────────────────────────────────────────────
// Fires discrete events at 25 / 50 / 75 / 90 % — once per page lifecycle.
(function(){
  var M=[25,50,75,90],hit={};
  function check(){
    var h=document.documentElement;
    var pct=Math.round(((h.scrollTop||document.body.scrollTop)/Math.max(1,h.scrollHeight-h.clientHeight))*100);
    for(var i=0;i<M.length;i++){
      if(!hit[M[i]]&&pct>=M[i]){hit[M[i]]=1;track('scroll_depth',{data:{depth:M[i],page:location.pathname}});}
    }
  }
  try{window.addEventListener('scroll',check,{passive:true});}catch(e){}
})();

// ── Form started ──────────────────────────────────────────────────────────
// Fires once per form when the user first focuses any input inside it.
// Combined with form_submit gives a completion / abandon rate.
(function(){
  var started={};
  document.addEventListener('focusin',function(e){
    try{
      var el=e.target,form=el&&el.form;
      if(!form)return;
      var fid=_formId(form);
      if(started[fid])return;
      started[fid]=1;
      track('form_started',{data:{
        formId:fid,
        action:(form.action||'').replace(/^https?:\\/\\/[^\\/]+/,'').slice(0,100)
      }});
    }catch(err){}
  },true);
})();

// ── Form field focus & validation errors ─────────────────────────────────
// form_field_focus: fires when focus moves to a different field within a
// started form. The server-side session join uses this to find where users
// stopped — the last form_field_focus before a session ends without a
// form_submit is the abandonment point. Only fires on field *changes* to
// avoid noise from clicking the same field repeatedly.
// form_error: fires when HTML5 validation rejects a field on submit attempt.
// Both events skip password/PII fields by the same rules as form_submit.
(function(){
  var SKIP_TYPES={password:1,hidden:1,file:1,submit:1,button:1,reset:1,image:1};
  var SKIP_NAMES=/card|cvv|cvc|ccv|ssn|tax|iban|bic|pin|secret|token|auth/i;
  var lastFocused={};
  document.addEventListener('focusin',function(e){
    try{
      var el=e.target,form=el&&el.form;
      if(!form||!el.name)return;
      var tp=(el.type||'text').toLowerCase();
      if(SKIP_TYPES[tp]||SKIP_NAMES.test(el.name))return;
      var fid=_formId(form);
      var fname=el.name.slice(0,40);
      if(lastFocused[fid]===fname)return;
      lastFocused[fid]=fname;
      track('form_field_focus',{data:{formId:fid,field:fname,fieldType:tp}});
    }catch(err){}
  },true);
  document.addEventListener('invalid',function(e){
    try{
      var el=e.target,form=el&&el.form;
      if(!form||!el.name)return;
      var tp=(el.type||'text').toLowerCase();
      if(SKIP_TYPES[tp]||SKIP_NAMES.test(el.name))return;
      var fid=_formId(form);
      track('form_error',{data:{
        formId:fid,
        formClass:(form.className||'').slice(0,80),
        field:el.name.slice(0,40),
        fieldType:tp,
        errorType:'validation',
        message:(el.validationMessage||'').slice(0,120)
      }});
    }catch(err){}
  },true);
})();

// ── Form network / server error tracking ─────────────────────────────────
// Patches fetch and XHR to detect failures that happen after a form submit.
// Only fires form_error when a request fails within 15 s of a known submit.
(function(){
  var WIN=15000;
  var Q={};// fid -> {t, action, cls}
  function _fid(form){return _formId(form);}
  document.addEventListener('submit',function(e){
    try{
      var form=e.target;
      if(!form||form.tagName!=='FORM')return;
      var fid=_fid(form);
      var action=(form.action||'').replace(/^https?:\\/\\/[^\\/]+/,'').split('?')[0].slice(0,100);
      Q[fid]={t:Date.now(),action:action,cls:(form.className||'').slice(0,80)};
    }catch(err){}
  },true);
  function findFid(url){
    // Never attribute analytics-endpoint failures to a form — avoids cascade.
    if(!url||url.indexOf(EP)!==-1)return null;
    var path=(url||'').replace(/^https?:\\/\\/[^\\/]+/,'').split('?')[0];
    var now=Date.now(),best=null;
    for(var fid in Q){
      var s=Q[fid];
      if(now-s.t>WIN){delete Q[fid];continue;}
      // Only match when the request URL starts with the form's action path.
      if(s.action&&path.indexOf(s.action)===0){best=fid;break;}
    }
    return best;
  }
  function fireErr(fid,cls,status,msg){
    if(!fid)return;
    track('form_error',{data:{
      formId:fid,
      formClass:cls||'',
      errorType:status>=400?'server':'network',
      status:status||0,
      message:(msg||'').slice(0,120)
    }});
  }
  if(window.fetch){
    // .bind(window) so the native fetch always gets the right |this| regardless
    // of how our wrapper is invoked (strict-mode bare call sets this=undefined).
    var _fetch=window.fetch.bind(window);
    window.fetch=function(input,init){
      var url=input&&(typeof input==='string'?input:(input.url||''));
      return _fetch(input,init).then(function(resp){
        if(!resp.ok){var fid=findFid(url);if(fid)fireErr(fid,(Q[fid]||{}).cls||'',resp.status,'HTTP '+resp.status);}
        return resp;
      },function(err){
        var fid=findFid(url);
        if(fid)fireErr(fid,(Q[fid]||{}).cls||'',0,(err&&err.message)||'Network failure');
        throw err;
      });
    };
  }
  if(window.XMLHttpRequest){
    var _open=XMLHttpRequest.prototype.open;
    var _send=XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open=function(m,url){
      this._aUrl=url;return _open.apply(this,arguments);
    };
    XMLHttpRequest.prototype.send=function(){
      var xhr=this;
      xhr.addEventListener('load',function(){
        if(xhr.status>=400){var fid=findFid(xhr._aUrl);if(fid)fireErr(fid,(Q[fid]||{}).cls||'',xhr.status,'HTTP '+xhr.status);}
      });
      xhr.addEventListener('error',function(){
        var fid=findFid(xhr._aUrl);if(fid)fireErr(fid,(Q[fid]||{}).cls||'',0,'Network failure');
      });
      return _send.apply(xhr,arguments);
    };
  }
})();

// ── Multi-step form tracking ──────────────────────────────────────────────
// Fires form_step when a user advances to the next step of a multi-step form.
// Two detection paths run in parallel:
//   1. Click-based: Next/Continue button clicks inside a <form>. Works
//      automatically without any markup changes.
//   2. Attribute-based: MutationObserver watches for data-analytics-step
//      elements becoming visible (hidden attr / style / class changes).
//      Add data-analytics-step="1", data-analytics-step="2", etc. to each
//      step container to get the step number in the analytics data.
(function(){
  var NEXT_RE=/^(next|continue|weiter|siguiente|suivant|volgende|successivo|nästa|næste|seuraava|forward|proceed|avanti|prossimo)/i;
  function _sfid(form){return _formId(form);}
  function fireStep(form,step,label){
    try{
      track('form_step',{data:{
        formId:_sfid(form),
        formClass:(form.className||'').slice(0,80),
        step:String(step||'?').slice(0,20),
        stepLabel:(label||'').slice(0,40)
      }});
    }catch(err){}
  }
  document.addEventListener('click',function(e){
    try{
      var el=e.target;
      var btn=(el.tagName==='BUTTON'||el.getAttribute('type')==='button')
        ?el:el.closest('button,[role="button"]');
      if(!btn)return;
      var form=btn.closest('form');
      if(!form)return;
      var txt=(btn.textContent||btn.getAttribute('value')||btn.getAttribute('aria-label')||'').trim();
      if(!NEXT_RE.test(txt))return;
      var stepEls=form.querySelectorAll('[data-analytics-step]'),step=null;
      for(var i=0;i<stepEls.length;i++){
        if(stepEls[i].offsetParent!==null){step=stepEls[i].getAttribute('data-analytics-step');break;}
      }
      fireStep(form,step,txt);
    }catch(err){}
  },true);
  if(window.MutationObserver){
    try{
      new MutationObserver(function(muts){
        muts.forEach(function(m){
          try{
            var el=m.target;
            var step=el.getAttribute&&el.getAttribute('data-analytics-step');
            if(!step||el.offsetParent===null)return;
            var form=el.closest&&el.closest('form');
            if(form)fireStep(form,step,'');
          }catch(err){}
        });
      }).observe(document.body||document.documentElement,{
        attributes:true,attributeFilter:['hidden','style','class'],subtree:true
      });
    }catch(e){}
  }
})();

// ── Video interactions ────────────────────────────────────────────────────
// Attaches play / pause / 50% / complete events to all <video> elements,
// including those added dynamically by React / SPA frameworks.
(function(){
  function attach(v){
    if(v._iaV)return;v._iaV=1;
    var src=(v.currentSrc||v.src||'').split('/').pop().split('?')[0].slice(0,80)||'video';
    var f={};
    v.addEventListener('play',function(){if(!f.p){f.p=1;track('video_play',{data:{src:src,duration:Math.round(v.duration)||0}});}});
    v.addEventListener('pause',function(){if(!v.ended)track('video_pause',{data:{src:src,at:Math.round(v.currentTime)||0}});});
    v.addEventListener('ended',function(){if(!f.e){f.e=1;track('video_complete',{data:{src:src,duration:Math.round(v.duration)||0}});}});
    v.addEventListener('timeupdate',function(){if(!f.h&&v.duration&&(v.currentTime/v.duration)>=0.5){f.h=1;track('video_50pct',{data:{src:src}});}});
  }
  try{
    var vs=document.querySelectorAll('video');
    for(var i=0;i<vs.length;i++)attach(vs[i]);
    if(window.MutationObserver){
      new MutationObserver(function(muts){
        muts.forEach(function(m){
          m.addedNodes.forEach(function(n){
            if(!n||n.nodeType!==1)return;
            if(n.tagName==='VIDEO')attach(n);
            if(n.querySelectorAll){var vv=n.querySelectorAll('video');for(var j=0;j<vv.length;j++)attach(vv[j]);}
          });
        });
      }).observe(document.body||document.documentElement,{childList:true,subtree:true});
    }
  }catch(e){}
})();

// ── Content copy ─────────────────────────────────────────────────────────
(function(){
  var lastCopy=0;
  document.addEventListener('copy',function(){
    try{
      var now=Date.now();if(now-lastCopy<1000)return;lastCopy=now; // debounce
      var len=0;try{len=(window.getSelection()||'').toString().length;}catch(e){}
      track('content_copy',{data:{length:len,page:location.pathname}});
    }catch(err){}
  });
})();

// ── Print ────────────────────────────────────────────────────────────────
(function(){
  var printed=false;
  try{window.addEventListener('beforeprint',function(){
    if(!printed){printed=true;track('page_print',{data:{page:location.pathname,title:(document.title||'').slice(0,100)}});}
  });}catch(e){}
})();

// ── Embedded form providers (HubSpot, Typeform, Calendly, Tally) ─────────
// Third-party widgets embed as cross-origin iframes, so the submit listener
// above never fires for them. They all signal submission via postMessage.
(function(){
  var started={};
  window.addEventListener('message',function(e){
    try{
      var d=e.data;
      if(!d||typeof d!=='object')return;

      // ── HubSpot ──────────────────────────────────────────────────────────
      // https://legacydocs.hubspot.com/docs/methods/forms/advanced_form_options
      // onFormSubmitted fires only after server-side success — prefer it over
      // onFormSubmit (which fires before the server validates the submission).
      if(d.type==='hsFormCallback'){
        var hsFid='hs-'+String(d.id||'form').slice(0,64);
        if(d.eventName==='onFormReady'){
          if(!started[hsFid]){
            started[hsFid]=1;
            track('form_started',{data:{formId:hsFid,provider:'hubspot'}});
          }
        }else if(d.eventName==='onFormSubmitted'){
          track('form_submit',{data:{
            formId:hsFid,
            provider:'hubspot',
            fieldCount:Array.isArray(d.data)?d.data.length:0
          }});
        }
        return;
      }

      // ── Typeform ──────────────────────────────────────────────────────────
      if(d.type==='form-submit'&&d.formId){
        track('form_submit',{data:{
          formId:'tf-'+String(d.formId).slice(0,64),
          provider:'typeform',
          responseId:String(d.response_id||'').slice(0,64)
        }});
        return;
      }
      if(d.type==='form-first-type'&&d.formId){
        var tfFid='tf-'+String(d.formId).slice(0,64);
        if(!started[tfFid]){
          started[tfFid]=1;
          track('form_started',{data:{formId:tfFid,provider:'typeform'}});
        }
        return;
      }

      // ── Calendly ──────────────────────────────────────────────────────────
      if(d.event==='calendly.event_scheduled'){
        track('form_submit',{data:{formId:'calendly',provider:'calendly'}});
        return;
      }
      if(d.event==='calendly.event_type_viewed'){
        if(!started['calendly']){
          started['calendly']=1;
          track('form_started',{data:{formId:'calendly',provider:'calendly'}});
        }
        return;
      }

      // ── Tally ─────────────────────────────────────────────────────────────
      if(d.isTally&&d.formId){
        var tFid='tally-'+String(d.formId).slice(0,64);
        if(d.event==='Tally.FormSubmitted'){
          track('form_submit',{data:{
            formId:tFid,
            provider:'tally',
            fieldCount:Array.isArray(d.fields)?d.fields.length:0
          }});
        }else if(d.event==='Tally.FormLoaded'){
          if(!started[tFid]){
            started[tFid]=1;
            track('form_started',{data:{formId:tFid,provider:'tally'}});
          }
        }
        return;
      }
    }catch(err){}
  });
})();

// ── Rage clicks ───────────────────────────────────────────────────────────
// 3+ clicks within 500ms in the same 30px area = user frustration signal.
(function(){
  var log=[],WIN=500,MIN=3,RADIUS=30;
  document.addEventListener('click',function(e){
    try{
      var now=Date.now(),x=e.clientX,y=e.clientY;
      log.push({t:now,x:x,y:y});
      while(log.length&&log[0].t<now-WIN)log.shift();
      if(log.length<MIN)return;
      var f=log[0];
      if(log.every(function(c){return Math.abs(c.x-f.x)<RADIUS&&Math.abs(c.y-f.y)<RADIUS;})){
        log=[];
        var t=e.target;
        var tTag=(t.tagName||'').toLowerCase().slice(0,20);
        var tId=(t.id||'').slice(0,80);
        var tCls=(typeof t.className==='string'?t.className:'').replace(/\\s+/g,' ').trim().slice(0,150);
        var sel=(tId?'#'+tId:tTag).slice(0,80);
        track('rage_click',{data:{selector:sel,page:location.pathname,id:tId||undefined,cls:tCls||undefined,tag:tTag||undefined}});
      }
    }catch(err){}
  },true);
})();

// ── Web Vitals / performance metrics ─────────────────────────────────────
// Fires a single page_perf event when the page is unloaded, hidden, or just
// before a SPA navigation. Captures LCP, CLS, INP, FCP, TTFB, load time,
// the LCP element descriptor, the top layout-shift culprit elements, top
// slow resources (>200 ms), and long tasks.
(function(){
  try{
    var _lcp=null,_lcpEl=null,_cls=0,_inp=0,_fired=false,_longTasks=[],_clsSrc={};
    try{new PerformanceObserver(function(l){
      var e=l.getEntries();if(e.length){
        var last=e[e.length-1];_lcp=last.startTime;
        var el=last.element;
        if(el){
          var s=el.currentSrc||el.src||el.getAttribute('data-src')||null;
          if(s){try{var pu=new URL(s);s=(pu.host!==location.host?pu.host:'')+pu.pathname.slice(0,120);}catch(x){s=String(s).slice(0,120);}}
          _lcpEl={tag:el.tagName.toLowerCase(),id:el.id||null,cls:(el.className||'').trim().split(' ')[0]||null,src:s};
        }
      }
    }).observe({type:'largest-contentful-paint',buffered:true});}catch(e){}
    // Attributes each shift's score to its largest-impact source element (the
    // sources[] item with the bigger before/after rect) rather than splitting
    // credit across every source — matches how field tools like web-vitals'
    // attribution build report a single "culprit" per shift.
    try{new PerformanceObserver(function(l){
      l.getEntries().forEach(function(e){
        if(e.hadRecentInput)return;
        _cls+=e.value;
        try{
          var srcs=e.sources||[],best=null,bestArea=-1;
          for(var si=0;si<srcs.length;si++){
            var node=srcs[si].node;
            if(!node||node.nodeType!==1)continue;
            var pr=srcs[si].previousRect||{},cr=srcs[si].currentRect||{};
            var area=Math.max((pr.width||0)*(pr.height||0),(cr.width||0)*(cr.height||0));
            if(area>bestArea){bestArea=area;best=node;}
          }
          if(best){
            var tag=best.tagName.toLowerCase();
            var id=best.id||null;
            var cls0=(best.className&&typeof best.className==='string'?best.className:'').trim().split(' ')[0]||null;
            var key=tag+'#'+(id||'')+'.'+(cls0||'');
            var b=_clsSrc[key];
            if(!b)b=_clsSrc[key]={tag:tag,id:id,cls:cls0,val:0,n:0};
            b.val+=e.value;b.n++;
          }
        }catch(x){}
      });
    }).observe({type:'layout-shift',buffered:true});}catch(e){}
    try{new PerformanceObserver(function(l){l.getEntries().forEach(function(e){if(e.duration>_inp)_inp=e.duration;});}).observe({type:'event',durationThreshold:16,buffered:true});}catch(e){}
    var _usedLoaf=false;
    try{new PerformanceObserver(function(l){
      l.getEntries().forEach(function(frame){
        if(frame.duration<=50)return;
        _usedLoaf=true;
        var scripts=frame.scripts||[];
        if(!scripts.length){
          _longTasks.push({dur:Math.round(frame.duration),st:Math.round(frame.startTime),src:null,fn:null,inv:null});
        }else{
          for(var k=0;k<scripts.length;k++){
            var sc=scripts[k];
            var surl=null;
            if(sc.sourceURL){try{surl=new URL(sc.sourceURL).pathname.slice(0,120);}catch(x){surl=String(sc.sourceURL).slice(0,120);}}
            _longTasks.push({dur:Math.round(frame.duration),st:Math.round(frame.startTime),src:surl,fn:sc.sourceFunctionName?String(sc.sourceFunctionName).slice(0,80):null,inv:sc.invokerType||null});
          }
        }
      });
    }).observe({type:'long-animation-frame',buffered:true});}catch(e){}
    try{new PerformanceObserver(function(l){
      if(_usedLoaf)return;
      l.getEntries().forEach(function(e){
        var s=null,ct=null;
        try{var a=e.attribution&&e.attribution[0];if(a){ct=a.containerType||null;s=a.containerSrc||a.containerName||null;if(s){try{s=new URL(s).pathname.slice(0,120);}catch(x){s=String(s).slice(0,120);}}}}catch(x){}
        _longTasks.push({dur:Math.round(e.duration),st:Math.round(e.startTime),src:s,ct:ct});
      });
    }).observe({type:'longtask',buffered:true});}catch(e){}
    /* Network Connection Type */
    var connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    var effectiveType = connection ? connection.effectiveType : null;
    var rtt = connection ? connection.rtt : null;
    var downlink = connection ? connection.downlink : null;
    var saveData = connection ? connection.saveData : null;
    var type = connection ? connection.type : null;
    track('network_connection',{data:{effectiveType:effectiveType,rtt:rtt,downlink:downlink,saveData:saveData,type:type}});
    function _fire(){
      if(_fired)return;_fired=true;
      try{
        var nav=(performance.getEntriesByType&&performance.getEntriesByType('navigation')[0])||{};
        var fcp=null;
        try{var fe=performance.getEntriesByName('first-contentful-paint');if(fe&&fe.length)fcp=Math.round(fe[0].startTime);}catch(e){}
        var ttfb=nav.responseStart>0?Math.round(nav.responseStart):null;
        var load=nav.loadEventEnd>0?Math.round(nav.loadEventEnd):null;
        var lcp=_lcp!=null?Math.round(_lcp):null;
        var cls=Math.round(_cls*1000)/1000;
        var inp=_inp>0?Math.round(_inp):null;
        if(!ttfb&&!lcp&&!load)return;
        var r='good';
        if((lcp!=null&&lcp>=4000)||(cls>=0.25)||(inp!=null&&inp>=500))r='poor';
        else if((lcp!=null&&lcp>=2500)||(cls>=0.1)||(inp!=null&&inp>=200))r='needs-improvement';
        var slowRes=[],pageWeight=0,byType=null,topRes=[];
        try{
          var res=performance.getEntriesByType('resource'),slow=[],bySize=[],types={};
          // Main HTML document itself isn't in getEntriesByType('resource') —
          // fold its transfer size into the total + 'doc' bucket separately so
          // page weight isn't silently missing the (often largest) first byte.
          var docSize=nav.transferSize||nav.encodedBodySize||0;
          if(docSize>0){pageWeight+=docSize;types.doc=(types.doc||0)+docSize;}
          for(var i=0;i<res.length;i++){
            var re=res[i];
            var ru=re.name;
            try{var pu=new URL(re.name);ru=(pu.host!==location.host?pu.host:'')+pu.pathname.slice(0,100);}catch(x){}
            var rt=re.initiatorType;
            // 'css'-initiated entries aren't only background-images — an
            // @font-face src also reports initiatorType 'css' in every major
            // engine, not 'font', so without this it fell through to the
            // 'css' fallback label ("BG image") for every font loaded via
            // @font-face instead of a <link rel=preload as=font>. Same
            // extension check as the 'link' branch, just applied to both.
            if(rt==='link'||rt==='css'){if(/\\.(jpe?g|png|gif|webp|avif|svg|ico)(\\?|#|$)/i.test(re.name))rt='img';else if(/\\.(woff2?|ttf|otf|eot)(\\?|#|$)/i.test(re.name))rt='font';}
            var sz=re.transferSize||0;
            // transferSize is 0 for opaque cross-origin responses without
            // Timing-Allow-Origin — real bytes were transferred, we just can't
            // see how many, so they'd silently vanish from both the total and
            // the treemap rather than skew either one with a wrong number.
            if(sz>0){
              pageWeight+=sz;
              // Small fixed taxonomy (not raw initiatorType) so the rollup
              // stays a short, bounded list regardless of how many distinct
              // resource kinds a page happens to load.
              var bk=rt==='script'?'script':(rt==='css'||rt==='link')?'css':(rt==='img'||rt==='source')?'img':rt==='font'?'font':(rt==='fetch'||rt==='xmlhttprequest'||rt==='beacon')?'xhr':(rt==='video'||rt==='audio')?'media':'other';
              types[bk]=(types[bk]||0)+sz;
              bySize.push({url:ru,dur:Math.round(re.duration),size:sz,type:rt});
            }
            if(re.duration>200){slow.push({url:ru,dur:Math.round(re.duration),size:sz,type:rt});}
          }
          slow.sort(function(a,b){return b.dur-a.dur;});
          slowRes=slow.slice(0,8);
          bySize.sort(function(a,b){return b.size-a.size;});
          topRes=bySize.slice(0,20);
          // Sent as an array of [type,bytes] pairs, not a plain object — the
          // track() sanitizer below only preserves arrays (and arrays of
          // objects, like slowRes/topRes) as real nested JSON. A bare object
          // value falls through to its JSON.stringify(...).slice(0,500)
          // fallback and lands in Postgres as a truncated *string*, not a
          // queryable object — same trap lcpEl/net are already in, which is
          // why nothing queries into those by sub-key today.
          var bt=[];
          for(var bkey in types){if(types[bkey]>0)bt.push([bkey,types[bkey]]);}
          if(bt.length)byType=bt;
        }catch(e){}
        var clsSources=[];
        try{
          var csKeys=Object.keys(_clsSrc),csArr=[];
          for(var ck=0;ck<csKeys.length;ck++)csArr.push(_clsSrc[csKeys[ck]]);
          csArr.sort(function(a,b){return b.val-a.val;});
          clsSources=csArr.slice(0,5).map(function(x){return {tag:x.tag,id:x.id,cls:x.cls,val:Math.round(x.val*1000)/1000,n:x.n};});
        }catch(e){}
        var lt=_longTasks.slice(0,10);
        var tbt=0,_tbtSeen={};
        for(var j=0;j<_longTasks.length;j++){var lt_j=_longTasks[j];if(lt_j.dur>50&&lt_j.st!=null&&!_tbtSeen[lt_j.st]&&(fcp==null||lt_j.st>=fcp)&&(load==null||lt_j.st<=load)){tbt+=lt_j.dur-50;_tbtSeen[lt_j.st]=1;}}
        var netInfo=null;
        if(connection){
          var nt=effectiveType||null;
          if(!nt&&rtt!=null&&downlink!=null){
            nt=rtt>2000||downlink<0.05?'slow-2g':rtt>1400||downlink<0.15?'2g':rtt>400||downlink<1?'3g':'4g';
          }
          if(nt){netInfo={type:nt,rtt:rtt!=null?Math.round(rtt):null,dl:downlink,save:saveData||false};}
        }
        // net is wrapped in a single-element array, not sent as a bare object —
        // the track() sanitizer only preserves arrays (and arrays of objects)
        // as real nested JSON; a bare object falls through to its
        // JSON.stringify(...) fallback and lands in Postgres as an
        // unqueryable string, same trap byType avoided above (see comment
        // there) and clsSources/slowRes/longTasks are already clear of.
        track('page_perf',{data:{lcp:lcp,cls:cls,inp:inp,fcp:fcp,ttfb:ttfb,load:load,tbt:tbt>0?Math.round(tbt):null,rating:r,lcpEl:_lcpEl||undefined,slowRes:slowRes.length?slowRes:undefined,longTasks:lt.length?lt:undefined,net:netInfo?[netInfo]:undefined,pageWeight:pageWeight>0?pageWeight:undefined,byType:byType||undefined,topRes:topRes.length?topRes:undefined,clsSources:clsSources.length?clsSources:undefined}});
      }catch(e){}
    }
    var _op=history.pushState,_or=history.replaceState;
    history.pushState=function(){_fire();_op.apply(this,arguments);};
    history.replaceState=function(){_fire();_or.apply(this,arguments);};
    window.addEventListener('popstate',_fire);
    document.addEventListener('visibilitychange',function(){if(document.visibilityState==='hidden')_fire();});
    window.addEventListener('pagehide',_fire);
  }catch(e){}
})();
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
        res.setHeader("Cache-Control", "public, s-maxage=86400, stale-while-revalidate=604800, max-age=3600");
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

    const { s: siteId, t: eventType, cl: consentLevel, sid, pv: pageviewId, u: rawUrl, r: referrer, h: pageHost, ti: title,
            us, um, uc, uk, dt, sw, sh, vw, vh, lang, tz, sd, ph, ck,
            dur, cs, cf, ca, n: eventName, v: eventValue, cur: eventCurrency,
            txn: eventTransactionId, pr: rawProducts, ed: rawExtraData, src: eventSource, tid: abTestId, vid: abVariantId, nv,
            gc: gclid, mc: msclkid, fc: fbclid,
            bt: rawBrowserTopics } = body;

    // Browser topics — Chrome Topics API integers. Cross-site signal, so only
    // stored when functional consent is present (hasFun check mirrors embed script).
    const browserTopics = (() => {
        const funcConsent = cf === 1 || cf === true;
        if (!funcConsent || !Array.isArray(rawBrowserTopics) || !rawBrowserTopics.length) return null;
        const ids = rawBrowserTopics.slice(0, 5).filter(n => Number.isInteger(n) && n > 0 && n <= 9999);
        return ids.length ? JSON.stringify(ids) : null;
    })();

    if (!siteId || typeof siteId !== "string" || !rawUrl) {
        return res.status(400).end();
    }

    const isMinimal = consentLevel !== "full";
    const isCustomEvent = eventType === "ev";
    const isClickBatch = eventType === "ck";
    const isAbExposure = eventType === "ab";

    const db = getPool();

    // Ensure tables exist and schema is up to date
    await ensureTables(db).catch(() => {});

    // Validate site ID — reject unknown or inactive sites
    const { rows: sites } = await db.query(
        `SELECT organisation_id, domain FROM analytics_sites WHERE id = $1 AND active = true LIMIT 1`,
        [siteId]
    ).catch(() => ({ rows: [] }));

    if (!sites.length) return res.status(403).end();
    const orgId = sites[0].organisation_id;
    const siteDomain = sites[0].domain;

    // Country/region from Vercel edge headers — IP is never stored
    const country = (req.headers["x-vercel-ip-country"]  || "").slice(0, 2)  || null;
    const region  = (req.headers["x-vercel-ip-country-region"] || "").slice(0, 64) || null;

    const deviceType = dt === "m" ? "mobile" : dt === "t" ? "tablet" : "desktop";
    const pageHostSanitized = pageHost ? String(pageHost).slice(0, 255).toLowerCase() || null : null;

    // ── Local/dev traffic — dropped entirely, not even logged. Unlike bots
    // (which are real traffic worth counting somewhere, just not as a "visit")
    // a request from localhost/a LAN dev server/a .local hostname is someone's
    // own machine previewing the site, not a visitor — there's no analytics
    // value in keeping a record of it. Checked before the bot lookup since
    // it's the cheaper check and conceptually more fundamental (this traffic
    // isn't a "visit" at all, automated or not).
    if (isDevOrLocalHost(pageHostSanitized)) {
        return res.status(202).end();
    }

    // ── Foreign-domain gate ───────────────────────────────────────────────────
    // If the script is embedded on a domain other than the one the site key was
    // registered under, record the signal but don't track it — unless the owner
    // has explicitly approved that domain for cross-site tracking.
    const normalizeDomain = d => (d || "").replace(/^www\./, "").toLowerCase();
    const isForeignDomain = pageHostSanitized &&
        normalizeDomain(pageHostSanitized) !== normalizeDomain(siteDomain);

    if (isForeignDomain) {
        const { rows: fdRows } = await db.query(
            `INSERT INTO analytics_foreign_domains
                 (site_id, organisation_id, domain, last_seen, hit_count)
             VALUES ($1, $2, $3, NOW(), 1)
             ON CONFLICT (site_id, domain) DO UPDATE SET
                 last_seen = NOW(),
                 hit_count = analytics_foreign_domains.hit_count + 1
             RETURNING approved`,
            [siteId, orgId, pageHostSanitized]
        ).catch(() => ({ rows: [] }));

        if (!fdRows[0]?.approved) return res.status(202).end();
    }

    // ── Bot / crawler traffic — logged separately, never counted as a real
    // visit. Checked before any of the branches below (minimal pageviews fire
    // unconditionally pre-consent, so this has to run before that path too,
    // not just for full/enriched events).
    const bot = detectBot(req.headers["user-agent"]);
    if (bot) {
        await db.query(
            `INSERT INTO analytics_bot_visits
             (site_id, organisation_id, bot_name, bot_category, pathname, country_code, user_agent, page_host)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
            [
                siteId, orgId, bot.name, bot.category,
                extractPathnameLoose(rawUrl), country,
                String(req.headers["user-agent"] || "").slice(0, 500),
                pageHostSanitized,
            ]
        ).catch(() => {});
        return res.status(202).end();
    }

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

        const cleanGclid      = gclid ? String(gclid).slice(0, 512)   : null;
        const cleanMsclkid    = msclkid ? String(msclkid).slice(0, 512) : null;
        const cleanFbclid     = fbclid  ? String(fbclid).slice(0, 512)  : null;
        const cleanUtmCampaign = uc ? String(uc).slice(0, 512) : null;
        const cleanUtmContent  = uk ? String(uk).slice(0, 512) : null;
        const cleanUtmSource   = us ? String(us).slice(0, 255) : null;
        const cleanUtmMedium   = um ? String(um).slice(0, 255) : null;

        let products = null;
        if (Array.isArray(rawProducts) && rawProducts.length) {
            products = JSON.stringify(
                rawProducts.slice(0, 50).map(p => {
                    const item = {};
                    if (p.id)   item.id   = String(p.id).slice(0, 64);
                    if (p.name) item.name = String(p.name).slice(0, 100);
                    if (typeof p.price === "number" && isFinite(p.price)) item.price = p.price;
                    if (typeof p.qty   === "number" && isFinite(p.qty))   item.qty   = Math.round(p.qty);
                    if (p.cat)  item.cat  = String(p.cat).slice(0, 64);
                    if (p.var)  item.var  = String(p.var).slice(0, 64);
                    return item;
                })
            );
        }

        // Same shallow-sanitize treatment as products above — re-applied here
        // (not trusted from the client-side track() sanitize alone) since the
        // ingest endpoint accepts raw POST bodies from anywhere, not just the
        // embed script.
        let extraData = null;
        if (rawExtraData && typeof rawExtraData === "object" && !Array.isArray(rawExtraData)) {
            const clean = {};
            for (const rawKey of Object.keys(rawExtraData).slice(0, 20)) {
                const key = String(rawKey).slice(0, 40);
                const val = rawExtraData[rawKey];
                if (val == null) continue;
                if (typeof val === "string") clean[key] = val.slice(0, 500);
                else if (typeof val === "number" && isFinite(val)) clean[key] = val;
                else if (typeof val === "boolean") clean[key] = val;
                // Preserve arrays and objects as native values so they land in JSONB as
                // proper nested structures (not as stringified JSON strings).
                else if (Array.isArray(val)) {
                    try { const s = JSON.stringify(val); if (s.length <= 4000) clean[key] = val; } catch { /* skip */ }
                } else if (typeof val === "object") {
                    try { const s = JSON.stringify(val); if (s.length <= 2000) clean[key] = val; } catch { /* skip */ }
                }
            }
            if (Object.keys(clean).length) extraData = JSON.stringify(clean);
        }

        const { browser: eventBrowserFamily } = parseUA(req.headers["user-agent"] || "");

        const { rows: evRows } = await db.query(
            `INSERT INTO analytics_custom_events
             (site_id, organisation_id, session_id, consent_level, consent_stat, consent_func, consent_adv,
              name, value_cents, currency, transaction_id, pathname, page_host, country_code, device_type, source,
              gclid, msclkid, fbclid, utm_campaign, utm_content, utm_source, utm_medium, products, extra_data,
              browser_family)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26)
             RETURNING id`,
            [
                siteId, orgId, isMinimal ? null : (sid ? String(sid).slice(0, 64) : null),
                isMinimal ? "minimal" : "full",
                cs === 1 || cs === true, cf === 1 || cf === true, ca === 1 || ca === true,
                String(eventName).slice(0, 64), valueCents,
                eventCurrency ? String(eventCurrency).slice(0, 3).toUpperCase() : null,
                eventTransactionId ? String(eventTransactionId).slice(0, 64) : null,
                evPathname, pageHostSanitized, country, deviceType,
                eventSource === "datalayer" ? "datalayer" : "manual",
                cleanGclid, cleanMsclkid, cleanFbclid,
                cleanUtmCampaign, cleanUtmContent, cleanUtmSource, cleanUtmMedium,
                products, extraData,
                eventBrowserFamily || null,
            ]
        ).catch(() => ({ rows: [] }));

        // Queue push records for any ad platform whose click ID arrived with this event.
        // Processed asynchronously by /api/ad-conversion-push.
        const evId = evRows[0]?.id ?? null;
        if (!isMinimal && evId && (cleanGclid || cleanMsclkid || cleanFbclid)) {
            const valueUsd = valueCents != null
                ? (valueCents / 100).toFixed(4)
                : null;
            const cur = eventCurrency
                ? String(eventCurrency).slice(0, 3).toUpperCase()
                : null;
            const pushRows = [];
            if (cleanGclid)   pushRows.push(["google_ads",      cleanGclid]);
            if (cleanMsclkid) pushRows.push(["microsoft_ads",   cleanMsclkid]);
            if (cleanFbclid)  pushRows.push(["meta_ads",        cleanFbclid]);
            for (const [platform, clickId] of pushRows) {
                await db.query(
                    `INSERT INTO analytics_conversion_pushes
                     (organisation_id, site_id, custom_event_id, platform, click_id, event_name,
                      value_usd, currency, utm_campaign, utm_content)
                     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
                    [orgId, siteId, evId, platform, clickId, String(eventName).slice(0, 64),
                     valueUsd, cur, cleanUtmCampaign, cleanUtmContent]
                ).catch(() => {});
            }
        }

        return res.status(202).end();
    }

    // ── Click batch (heatmap data) ────────────────────────────────────────────
    // Full-consent-only — always session-linked, unlike pageviews/custom events
    // which have a minimal (unlinked) variant. `u` is a bare pathname like
    // custom events. Coordinates arrive as compact arrays to match this file's
    // key-shortened wire format: [x_pct, y_pct, viewport_width, tag, id, class, text].
    if (isClickBatch) {
        if (!sid || !Array.isArray(ck) || !ck.length) return res.status(400).end();

        const ckPathname = ("/" + String(rawUrl).replace(/^\//, "")).slice(0, 2000);
        const sessionId  = String(sid).slice(0, 64);
        const pageH      = Number(ph) || null;

        const values = [];
        const params = [];
        let i = 1;
        for (const row of ck.slice(0, 25)) {
            if (!Array.isArray(row) || row.length < 6) continue;
            const [x, y, w, tag, tId, cls, text] = row;
            values.push(`($${i++},$${i++},$${i++},$${i++},$${i++},$${i++},$${i++},$${i++},$${i++},$${i++},$${i++},$${i++},$${i++},$${i++})`);
            params.push(
                siteId, orgId, sessionId,
                ckPathname, pageHostSanitized, deviceType,
                Number(w) || null, pageH,
                (typeof x === "number" && isFinite(x) && x >= 0 && x <= 100) ? x : null,
                (typeof y === "number" && isFinite(y) && y >= 0 && y <= 100) ? y : null,
                String(tag || "").slice(0, 20)  || null,
                String(tId || "").slice(0, 150) || null,
                String(cls || "").slice(0, 300) || null,
                String(text || "").slice(0, 80) || null,
            );
        }

        if (values.length) {
            await db.query(
                `INSERT INTO analytics_clicks
                 (site_id, organisation_id, session_id, pathname, page_host, device_type,
                  viewport_width, page_height, x_pct, y_pct, target_tag, target_id, target_class, target_text)
                 VALUES ${values.join(",")}`,
                params
            ).catch(() => {});
        }

        return res.status(202).end();
    }

    // ── Page Experiment exposure ──────────────────────────────────────────────
    // Sent by the client unconditionally, regardless of consent tier (see
    // applyPageExperiment() in the embed script below) — assignment data is
    // needed for valid test results even from visitors who declined
    // statistics cookies. Bot traffic is already excluded above, before any
    // eventType branch runs. Re-validates the test/variant/domain/status
    // triple server-side rather than trusting the client's earlier GET
    // /api/ab-test-active response, closing the race where a test gets paused
    // between that fetch and this beacon.
    if (isAbExposure) {
        const testIdNum = parseInt(abTestId, 10);
        const variantIdNum = parseInt(abVariantId, 10);
        if (!testIdNum || !variantIdNum || !sid) return res.status(400).end();

        const { rows: matches } = await db.query(
            `SELECT t.id FROM ab_tests t
             JOIN ab_test_variants v ON v.test_id = t.id
             WHERE t.id = $1 AND v.id = $2 AND t.domain = $3 AND t.status = 'running'
               AND (t.ends_at IS NULL OR t.ends_at > NOW())
             LIMIT 1`,
            [testIdNum, variantIdNum, siteDomain]
        ).catch(() => ({ rows: [] }));

        if (matches.length) {
            await db.query(
                `INSERT INTO ab_test_assignments (test_id, variant_id, domain, session_id, page_host)
                 VALUES ($1,$2,$3,$4,$5)`,
                [testIdNum, variantIdNum, siteDomain, String(sid).slice(0, 64), pageHostSanitized]
            ).catch(() => {});
        }

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
              url, pathname, page_host, country_code, region, device_type)
             VALUES ($1,$2,'minimal',$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
            [
                siteId, orgId,
                cs === 1 || cs === true, cf === 1 || cf === true, ca === 1 || ca === true,
                urlColumn, pathname, pageHostSanitized,
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

        // A full pageview is sent twice per page load (once on entry, once on
        // exit with duration/scroll_depth filled in) — upserting on the
        // client-generated pageview_id keeps that to one row instead of two.
        // A NULL pageview_id (only possible from a still-cached pre-upgrade
        // embed script) never conflicts with anything, so this degrades to a
        // plain insert for that transition window rather than erroring.
        await db.query(
            `INSERT INTO analytics_events
             (site_id, organisation_id, session_id, consent_level,
              consent_stat, consent_func, consent_adv,
              url, pathname, page_host, title, referrer_host,
              utm_source, utm_medium, utm_campaign, utm_content,
              country_code, region, device_type,
              screen_width, screen_height, viewport_width, viewport_height,
              browser_family, os_family, language, timezone,
              duration_sec, scroll_depth, pageview_id, is_new_visitor,
              gclid, msclkid, fbclid,
              browser_topics)
             VALUES ($1,$2,$3,'full',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34)
             ON CONFLICT (pageview_id) DO UPDATE SET
               duration_sec   = EXCLUDED.duration_sec,
               scroll_depth   = COALESCE(EXCLUDED.scroll_depth,   analytics_events.scroll_depth),
               browser_topics = COALESCE(EXCLUDED.browser_topics, analytics_events.browser_topics)`,
            [
                siteId, orgId, String(sid).slice(0, 64),           // $1 $2 $3
                cs === 1 || cs === true,                            // $4 consent_stat
                cf === 1 || cf === true,                            // $5 consent_func
                ca === 1 || ca === true,                            // $6 consent_adv
                urlColumn, pathname, pageHostSanitized,             // $7 $8 $9
                (title || "").slice(0, 500),                        // $10
                referrerHost,                                       // $11
                (us || "").slice(0, 255), (um || "").slice(0, 255), // $12 $13
                (uc || "").slice(0, 255), (uk || "").slice(0, 255), // $14 $15
                country, region,                                    // $16 $17
                deviceType,                                         // $18
                Number(sw) || null, Number(sh) || null,             // $19 $20 screen
                Number(vw) || null, Number(vh) || null,             // $21 $22 viewport
                browser, os,                                        // $23 $24
                (lang || "").slice(0, 20) || null,                  // $25 language
                (tz   || "").slice(0, 60) || null,                  // $26 timezone
                Math.min(Number(dur) || 0, 86400),                  // $27 duration_sec
                (sd != null && sd >= 0 && sd <= 100) ? Number(sd) : null, // $28 scroll_depth
                pageviewId ? String(pageviewId).slice(0, 40) : null,      // $29 pageview_id
                nv === 1 ? true : nv === 0 ? false : null,                // $30 is_new_visitor
                gclid   ? String(gclid).slice(0, 512)   : null,           // $31 gclid
                msclkid ? String(msclkid).slice(0, 512) : null,           // $32 msclkid
                fbclid  ? String(fbclid).slice(0, 512)  : null,           // $33 fbclid
                browserTopics,                                             // $34 browser_topics JSONB
            ]
        ).catch(() => {});
    }

    return res.status(202).end();
}
