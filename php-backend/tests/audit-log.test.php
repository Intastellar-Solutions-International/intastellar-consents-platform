<?php
// Item 1 — audit log ordering and consent timestamps.
load_functions("$ROOT/analytics/gdpr/getDomainStatistics.php", ['consentRowsOrderSql']);
load_functions("$ROOT/consents/collect.php", ['normalizeConsentTimestamp']);

test('audit log sorts by timestamp newest first by default', function () {
    eq(consentRowsOrderSql('desc'), 'ORDER BY ucs.consents_timestamp DESC, ucs.uid DESC');
    eq(consentRowsOrderSql(''), 'ORDER BY ucs.consents_timestamp DESC, ucs.uid DESC');
    eq(consentRowsOrderSql(null), 'ORDER BY ucs.consents_timestamp DESC, ucs.uid DESC');
});

test('audit log direction applies to the timestamp, not only the uid', function () {
    eq(consentRowsOrderSql(' ASC '), 'ORDER BY ucs.consents_timestamp ASC, ucs.uid ASC');
    // Anything unexpected falls back to DESC — never interpolated into SQL.
    eq(consentRowsOrderSql("asc; DROP TABLE x"), 'ORDER BY ucs.consents_timestamp DESC, ucs.uid DESC');
});

test('audit log no longer groups records that share a timestamp', function () {
    if (stripos(consentRowsOrderSql('desc'), 'GROUP BY') !== false) throw new RuntimeException('GROUP BY still present');
});

test('consent timestamps are stored in 24-hour UTC', function () {
    date_default_timezone_set('Europe/Copenhagen'); // collect.php sets this
    eq(normalizeConsentTimestamp('2026-11-03T14:30:05.123Z'), '2026-11-03 14:30:05', 'afternoon kept as 14:30, not 02:30');
    eq(normalizeConsentTimestamp('2026-07-01T23:59:59Z'), '2026-07-01 23:59:59', 'summer time does not shift UTC');
    eq(normalizeConsentTimestamp('2026-11-03T00:15:00.000Z'), '2026-11-03 00:15:00');
});

test('a missing or unparsable timestamp falls back to now, never 1970', function () {
    foreach ([null, '', 'garbage'] as $raw) {
        $out = normalizeConsentTimestamp($raw);
        if (abs(strtotime($out . ' UTC') - time()) > 5) throw new RuntimeException("got $out for " . var_export($raw, true));
    }
});
