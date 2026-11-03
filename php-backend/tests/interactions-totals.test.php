<?php
// Item 4 — the Home KPI counts come from one aggregate query per period.
load_functions("$ROOT/analytics/gdpr/getInteractions.php", ['consentTotalsSql']);

test('KPI totals are counted in SQL, not by fetching every row', function () {
    $sql = consentTotalsSql(" AND domain IN ('a.com')", "'Denmark','Germany'");
    if (stripos($sql, 'SELECT *') !== false) throw new RuntimeException('still selects whole rows');
    foreach (['accepted', 'declined', 'marketing', 'functional', 'statics', 'eu_accepted', 'non_eu_accepted'] as $col) {
        if (strpos($sql, "AS $col") === false) throw new RuntimeException("missing $col");
    }
});

test('KPI totals keep the per-KPI conditions the separate queries used', function () {
    $sql = preg_replace('/\s+/', ' ', consentTotalsSql('', "'Denmark'"));
    foreach ([
        "SUM(`type` = 'all' AND `value` = '1'), 0) AS accepted",
        "SUM(`type` = 'all' AND `value` = 'declined'), 0) AS declined",
        "SUM(`type` = 'marketing' AND `value` = '1'), 0) AS marketing",
        "country IN ('Denmark')), 0) AS eu_accepted",
        "country NOT IN ('Denmark')), 0) AS non_eu_accepted",
    ] as $needle) {
        if (strpos($sql, $needle) === false) throw new RuntimeException("missing: $needle");
    }
});

test('KPI totals apply the caller\'s filters (domain, dates, bot filter)', function () {
    $cond = " AND is_suspected_bot = 0 AND domain IN ('a.com')";
    if (substr(consentTotalsSql($cond, "''"), -strlen($cond)) !== $cond) throw new RuntimeException('condition not appended');
});
