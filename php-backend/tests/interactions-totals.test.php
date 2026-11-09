<?php
// Item 4 — the Home KPI counts come from one aggregate query per period.
load_functions("$ROOT/analytics/gdpr/getInteractions.php", ['consentTotalsSql', 'countryTotalsSql']);

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
        "SUM(`type` IN ('marketing', 'all') AND `value` = '1'), 0) AS marketing",
        "(country IN ('Denmark') OR country LIKE 'EU')), 0) AS eu_accepted",
        "country NOT IN ('Denmark') AND country NOT LIKE 'EU' AND country != ''), 0) AS non_eu_accepted",
    ] as $needle) {
        if (strpos($sql, $needle) === false) throw new RuntimeException("missing: $needle");
    }
});

test('KPI totals apply the caller\'s filters (domain, dates, bot filter)', function () {
    $cond = " AND is_suspected_bot = 0 AND domain IN ('a.com')";
    if (substr(consentTotalsSql($cond, "''"), -strlen($cond)) !== $cond) throw new RuntimeException('condition not appended');
});

test('EU and non-EU accepted counts only rows their visitor counts include', function () {
    $db = new PDO('sqlite::memory:');
    $db->exec("CREATE TABLE cookiebanner_tracking_settings (`type` TEXT, `value` TEXT, country TEXT)");
    $ins = $db->prepare("INSERT INTO cookiebanner_tracking_settings VALUES ('all', '1', ?)");
    foreach (['Denmark', 'EU', 'United States', ''] as $country) $ins->execute([$country]);

    $row = $db->query(consentTotalsSql('', "'Denmark'"))->fetch(PDO::FETCH_ASSOC);
    eq((int) $row['eu_accepted'], 2);      // Denmark, EU
    eq((int) $row['non_eu_accepted'], 1);  // United States; blank is neither
});

function consent_db(array $rows): PDO
{
    $db = new PDO('sqlite::memory:');
    $db->exec("CREATE TABLE cookiebanner_tracking_settings (`type` TEXT, `value` TEXT, country TEXT)");
    $ins = $db->prepare("INSERT INTO cookiebanner_tracking_settings VALUES (?, ?, ?)");
    foreach ($rows as $r) $ins->execute($r);
    return $db;
}

test('accept-all counts towards every category; custom choices are their own state', function () {
    $db = consent_db([['all', '1', 'Denmark'], ['all', '1', 'Denmark'], ['all', 'declined', 'Denmark'], ['marketing', '1', 'Denmark']]);
    $row = $db->query(consentTotalsSql('', "'Denmark'"))->fetch(PDO::FETCH_ASSOC);
    eq((int) $row['marketing'], 3);
    eq((int) $row['functional'], 2);
    eq((int) $row['partial'], 1);
    eq((int) $row['accepted'] + (int) $row['declined'] + (int) $row['partial'], 4);
});

test('country totals add up to the headline, with blank countries as Unknown', function () {
    $db = consent_db([['all', '1', 'Denmark'], ['all', 'declined', 'Denmark'], ['marketing', '1', 'Norway'], ['all', '1', ''], ['all', '1', null]]);
    $rows = $db->query(countryTotalsSql("WHERE `type` != ''"))->fetchAll(PDO::FETCH_ASSOC);
    eq(array_sum(array_column($rows, 'total')), 5);
    $byCountry = array_column($rows, 'total', 'country');
    ksort($byCountry);
    eq($byCountry, ['Denmark' => 2, 'Norway' => 1, 'Unknown' => 2]);
});
