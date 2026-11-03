<?php
// Item 2 — suspected-bot flag (collect.php) and the dashboard filter.
load_functions("$ROOT/consents/collect.php", ['suspectedBotReason']);
load_functions("$ROOT/analytics/gdpr/getInteractions.php", ['botFilterSql']);

test('a normal visitor is not flagged', function () {
    eq(suspectedBotReason(false, false, 0), '');
    eq(suspectedBotReason(false, false, 4), '', 'up to 5 decisions a minute is still a person');
});

test('datacenter IPs are flagged', function () {
    eq(suspectedBotReason(true, false, 0), 'datacenter_ip');
});

test('accept and reject from one visitor within a second is flagged', function () {
    eq(suspectedBotReason(false, true, 0), 'conflicting_decisions');
});

test('more than 5 separate decisions a minute is flagged', function () {
    eq(suspectedBotReason(false, false, 5), 'high_rate', 'the 6th decision within 60s');
    eq(suspectedBotReason(false, false, 60), 'high_rate');
});

test('the most specific reason wins when several apply', function () {
    eq(suspectedBotReason(true, true, 60), 'datacenter_ip');
    eq(suspectedBotReason(false, true, 60), 'conflicting_decisions');
});

test('dashboards exclude suspected bots unless explicitly asked not to', function () {
    eq(botFilterSql(null), ' AND is_suspected_bot = 0', 'no header (older clients) → excluded');
    eq(botFilterSql('1'), ' AND is_suspected_bot = 0');
    eq(botFilterSql('0'), '', 'toggle off → bots included');
    eq(botFilterSql(' 0 '), '');
    eq(botFilterSql('yes'), ' AND is_suspected_bot = 0');
    eq(botFilterSql('1', 'ucs.is_suspected_bot'), ' AND ucs.is_suspected_bot = 0');
});

test('getDomainStatistics uses the same filter rule', function () {
    // Both endpoint files define botFilterSql(); they must not drift apart.
    $root = $GLOBALS['ROOT'];
    $extract = function ($file) {
        $src = file_get_contents($file);
        preg_match('/function botFilterSql\(.*?\n\}/s', $src, $m);
        return $m[0] ?? '';
    };
    eq($extract("$root/analytics/gdpr/getDomainStatistics.php"), $extract("$root/analytics/gdpr/getInteractions.php"));
});

test('without the migration the bot columns are skipped, not queried', function () {
    // Any failure to confirm the columns (missing table/column, a mysqli
    // exception, no connection) must read as "not ready", so endpoints fall
    // back to their pre-flag queries instead of returning 500.
    load_functions($GLOBALS['ROOT'] . "/analytics/gdpr/getInteractions.php", ['botColumnsReady']);
    eq(botColumnsReady(new stdClass()), false);
});
