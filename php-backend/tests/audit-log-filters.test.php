<?php
// Audit log filters: server-side, so they apply to every record, not just the loaded page.
load_functions("$ROOT/analytics/gdpr/getDomainStatistics.php", ['likeContains', 'consentChoiceSql', 'auditFilterSql']);

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
