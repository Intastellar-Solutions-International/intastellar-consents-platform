-- Suspected-bot flag for consent records (item 2).
--
-- Run ONCE, in order, BEFORE uploading the updated collect.php,
-- getInteractions.php and getDomainStatistics.php — those reference the new
-- columns and would fail with "Unknown column" until they exist.
--
-- Nothing is deleted or changed except the new is_suspected_bot / bot_reason
-- columns. To undo the backfill:  UPDATE <table> SET is_suspected_bot = 0, bot_reason = NULL;
-- Rules are documented on suspectedBotReason() in consents/collect.php.

-- ── 1. Schema ────────────────────────────────────────────────────────────────

ALTER TABLE user_consents_tracking
    ADD COLUMN is_suspected_bot TINYINT(1) NOT NULL DEFAULT 0,
    ADD COLUMN bot_reason VARCHAR(32) NULL,
    -- collect.php looks up a visitor's recent decisions on every request.
    ADD INDEX idx_uct_uid_domain_ts (uid, domain, consents_timestamp);

ALTER TABLE cookiebanner_tracking_settings
    ADD COLUMN is_suspected_bot TINYINT(1) NOT NULL DEFAULT 0,
    ADD COLUMN bot_reason VARCHAR(32) NULL;

-- ── 2. Backfill the last 90 days ─────────────────────────────────────────────
-- Historical rows carry no hosting/datacenter information (collect.php only
-- starts storing that now), so only the two behavioural rules can be applied.
-- Widen the 90-day window if dashboards need older periods cleaned; the
-- self-joins get slower with more rows.

-- 2a. The same visitor stored a different consent within ±1 second.
UPDATE user_consents_tracking a
JOIN user_consents_tracking b
  ON  b.uid = a.uid
  AND b.domain = a.domain
  AND b.consents_timestamp BETWEEN a.consents_timestamp - INTERVAL 1 SECOND
                               AND a.consents_timestamp + INTERVAL 1 SECOND
  AND b.consent <> a.consent
SET a.is_suspected_bot = 1,
    a.bot_reason = 'conflicting_decisions'
WHERE a.uid IS NOT NULL AND a.uid <> ''
  AND a.consents_timestamp >= NOW() - INTERVAL 90 DAY;

-- 2b. More than 5 separate decisions (distinct timestamps — one decision is
-- stored as several identical rows) by one visitor within 60 seconds.
-- The DISTINCT/GROUP BY derived tables are materialised, which is what lets
-- MySQL update the same table it reads from here.
UPDATE user_consents_tracking a
JOIN (
    SELECT x.uid, x.domain, x.consents_timestamp
    FROM (SELECT DISTINCT uid, domain, consents_timestamp FROM user_consents_tracking
          WHERE uid IS NOT NULL AND uid <> '' AND consents_timestamp >= NOW() - INTERVAL 90 DAY) x
    JOIN (SELECT DISTINCT uid, domain, consents_timestamp FROM user_consents_tracking
          WHERE uid IS NOT NULL AND uid <> '' AND consents_timestamp >= NOW() - INTERVAL 91 DAY) y
      ON  y.uid = x.uid
      AND y.domain = x.domain
      AND y.consents_timestamp >  x.consents_timestamp - INTERVAL 60 SECOND
      AND y.consents_timestamp <= x.consents_timestamp
    GROUP BY x.uid, x.domain, x.consents_timestamp
    HAVING COUNT(*) > 5
) hot
  ON  hot.uid = a.uid
  AND hot.domain = a.domain
  AND hot.consents_timestamp = a.consents_timestamp
SET a.is_suspected_bot = 1,
    a.bot_reason = COALESCE(a.bot_reason, 'high_rate');

-- 2c. Carry the flag over to the dashboard totals table. It has no uid, so
-- rows are matched on domain + timestamp + country (collect.php writes both
-- tables from the same request with the same values). A real visitor on the
-- same domain, in the same country, in the same second as a flagged one
-- would be flagged too — rare, and only affects totals, never records.
UPDATE cookiebanner_tracking_settings s
JOIN (
    SELECT DISTINCT domain, consents_timestamp, country_code, bot_reason
    FROM user_consents_tracking
    WHERE is_suspected_bot = 1
) f
  ON  f.domain = s.domain
  AND f.consents_timestamp = s.consentsGiving
  AND f.country_code = s.countryCode
SET s.is_suspected_bot = 1,
    s.bot_reason = f.bot_reason;

-- ── 3. Check ─────────────────────────────────────────────────────────────────
SELECT 'user_consents_tracking' AS tbl, bot_reason, COUNT(*) AS rows_flagged
FROM user_consents_tracking WHERE is_suspected_bot = 1 GROUP BY bot_reason
UNION ALL
SELECT 'cookiebanner_tracking_settings', bot_reason, COUNT(*)
FROM cookiebanner_tracking_settings WHERE is_suspected_bot = 1 GROUP BY bot_reason;
