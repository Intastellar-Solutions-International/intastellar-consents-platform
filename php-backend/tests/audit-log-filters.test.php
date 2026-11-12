<?php
// Audit log filters: server-side, so they apply to every record, not just the loaded page.
load_functions("$ROOT/analytics/gdpr/getDomainStatistics.php", ['likeContains', 'consentChoiceSql', 'auditFilterSql', 'summarizeAuditGroups']);

$esc = function ($v) { return addslashes($v); };

test('audit filters: nothing set adds no condition', function () use ($esc) {
    eq(auditFilterSql([], $esc), '');
    eq(auditFilterSql(['country' => '', 'method' => '', 'choice' => ''], $esc), '');
});

test('audit filters: values outside the expected shape are ignored, never interpolated', function () use ($esc) {
    eq(auditFilterSql(['country' => "DK' OR 1=1"], $esc), '');
    eq(auditFilterSql(['method' => "x'; DROP TABLE t"], $esc), '');
    eq(auditFilterSql(['framework' => 'GDPR%'], $esc), '');
    eq(auditFilterSql(['choice' => 'marketing:maybe'], $esc), '');
    eq(auditFilterSql(['language' => "en'--"], $esc), '');
});

test('audit filters: country, method and framework', function () use ($esc) {
    eq(auditFilterSql(['country' => 'dk'], $esc), " AND ucs.country_code = 'DK'");
    eq(auditFilterSql(['method' => 'banner_reject_all'], $esc), " AND ucs.consent_method = 'banner_reject_all'");
    eq(auditFilterSql(['framework' => 'none'], $esc), " AND (ucs.regulation_applied IS NULL OR ucs.regulation_applied = '')");
    eq(auditFilterSql(['framework' => 'gdpr'], $esc), " AND ucs.regulation_applied LIKE '%GDPR%'");
    $cpa = auditFilterSql(['framework' => 'CPA'], $esc);
    if (strpos($cpa, "NOT LIKE '%CCPA%'") === false) throw new RuntimeException($cpa);
});

test('audit filters: partial UID and page search treat % and _ literally', function () use ($esc) {
    eq(auditFilterSql(['uidSearch' => 'ab_1'], $esc), " AND ucs.uid LIKE '%ab\\\\_1%'");
    eq(auditFilterSql(['page' => "/it's"], $esc), " AND ucs.url LIKE '%/it\\'s%'");
});

test('audit filters: a declined choice needs the category present and not accepted', function () use ($esc) {
    $sql = auditFilterSql(['choice' => 'marketing:declined'], $esc);
    if (strpos($sql, 'CASE WHEN JSON_VALID(ucs.consent)') === false) throw new RuntimeException($sql);
    if (strpos($sql, 'AND NOT (') === false) throw new RuntimeException($sql);
    if (strpos($sql, '{"type":"marketing","checked":"checked"}') === false) throw new RuntimeException($sql);
    $accepted = auditFilterSql(['choice' => 'statics:accepted'], $esc);
    if (strpos($accepted, 'NOT') !== false) throw new RuntimeException($accepted);
});

test('audit summary: totals, method counts, top five countries and days', function () {
    $s = summarizeAuditGroups([
        ['m' => 'banner_accept_all', 'c' => 'US', 'd' => '2026-11-02', 'n' => '4'],
        ['m' => 'banner_reject_all', 'c' => 'DK', 'd' => '2026-11-01', 'n' => '2'],
        ['m' => '', 'c' => 'DE', 'd' => '2026-11-02', 'n' => '1'],
        ['m' => 'banner_accept_all', 'c' => 'DK', 'd' => '2026-11-02', 'n' => '3'],
        ['m' => 'banner_granular', 'c' => '-', 'd' => '2026-11-03', 'n' => '1'],
        ['m' => 'banner_granular', 'c' => 'SE', 'd' => '2026-11-03', 'n' => '1'],
        ['m' => 'banner_granular', 'c' => 'NO', 'd' => '2026-11-03', 'n' => '1'],
        ['m' => 'banner_granular', 'c' => 'FI', 'd' => '2026-11-03', 'n' => '1'],
    ]);
    eq($s['total'], 14);
    eq((array) $s['methods'], ['banner_accept_all' => 7, 'banner_reject_all' => 2, '' => 1, 'banner_granular' => 4]);
    eq($s['countries'], [['code' => 'DK', 'n' => 5], ['code' => 'US', 'n' => 4], ['code' => 'DE', 'n' => 1], ['code' => 'FI', 'n' => 1], ['code' => 'NO', 'n' => 1]]);
    eq($s['otherCountries'], 2, 'SE plus the record without a country');
    eq(array_keys((array) $s['daily']), ['2026-11-01', '2026-11-02', '2026-11-03']);
});
