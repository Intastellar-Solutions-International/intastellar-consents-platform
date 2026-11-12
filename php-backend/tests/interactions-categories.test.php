<?php
// Category counts, the workspace domain filter and the per-type breakdown.
load_functions("$ROOT/analytics/gdpr/getInteractions.php", [
    'consentTotalsSql', 'hourlyCategoryColumns', 'splitDomainList', 'sqlInList', 'typeCountsSql',
]);

function category_db(array $rows): PDO
{
    $db = new PDO('sqlite::memory:');
    $db->exec("CREATE TABLE cookiebanner_tracking_settings (`type` TEXT, `value` TEXT, country TEXT, domain TEXT)");
    $ins = $db->prepare("INSERT INTO cookiebanner_tracking_settings VALUES (?, ?, ?, ?)");
    foreach ($rows as $r) $ins->execute($r);
    return $db;
}

test('hourly categories count accept-all, like the headline KPIs', function () {
    $db = category_db([
        ['all', '1', 'Denmark', 'a.com'],
        ['all', '1', 'Denmark', 'a.com'],
        ['all', 'declined', 'Denmark', 'a.com'],
        ['marketing', '1', 'Denmark', 'a.com'],
        ['statics', '1', 'Denmark', 'a.com'],
    ]);
    $hourly = $db->query("SELECT " . hourlyCategoryColumns() . " FROM cookiebanner_tracking_settings")->fetch(PDO::FETCH_ASSOC);
    $totals = $db->query(consentTotalsSql('', "'Denmark'"))->fetch(PDO::FETCH_ASSOC);

    eq((int) $hourly['marketing'], 3);
    eq((int) $hourly['functional'], 2);
    eq((int) $hourly['statics'], 3);
    foreach (['accepted', 'declined', 'marketing', 'functional', 'statics'] as $col) {
        eq((int) $hourly[$col], (int) $totals[$col], "$col differs from headline");
    }
});

test('workspace domains: every row, comma lists split, blanks and repeats dropped', function () {
    eq(splitDomainList(['a.com', 'b.com, c.com', ' ', 'a.com', 'c.com,']), ['a.com', 'b.com', 'c.com']);
    eq(splitDomainList([]), []);
});

test('workspace IN list quotes and escapes each domain, null when empty', function () {
    eq(sqlInList(['a.com', 'b.com'], 'addslashes'), "'a.com','b.com'");
    eq(sqlInList(["x'.com"], 'addslashes'), "'x\\'.com'");
    eq(sqlInList([], 'addslashes'), null);
});

test('workspace filter keeps only the workspace domains', function () {
    $db = category_db([
        ['all', '1', 'Denmark', 'a.com'],
        ['all', '1', 'Denmark', 'b.com'],
        ['all', '1', 'Denmark', 'other.com'],
    ]);
    $in = sqlInList(splitDomainList(['a.com,b.com']), fn ($d) => str_replace("'", "''", $d));
    $n = $db->query("SELECT COUNT(*) FROM cookiebanner_tracking_settings WHERE `type` != '' AND cookiebanner_tracking_settings.domain IN ($in)")->fetchColumn();
    eq((int) $n, 2);
});

test('workspace view adds to the WHERE and date clauses instead of replacing them', function () {
    $src = file_get_contents($GLOBALS['ROOT'] . '/analytics/gdpr/getInteractions.php');
    foreach (['$whereClause = " AND', '$andClause = " AND domain IN'] as $bad) {
        if (strpos($src, $bad) !== false) throw new RuntimeException("found: $bad");
    }
});

test('type counts group by type and value and add up to the total', function () {
    $db = category_db([
        ['all', '1', 'Denmark', 'a.com'],
        ['all', '1', 'Denmark', 'a.com'],
        ['all', 'declined', 'Denmark', 'a.com'],
        ['marketing', '1', 'Denmark', 'a.com'],
        ['all', '1', 'Denmark', 'b.com'],
    ]);
    $rows = $db->query(typeCountsSql("WHERE `type` != '' AND domain IN ('a.com')"))->fetchAll(PDO::FETCH_ASSOC);
    eq(array_map(fn ($r) => [$r['type'], $r['value'], (int) $r['num']], $rows), [
        ['all', '1', 2],
        ['all', 'declined', 1],
        ['marketing', '1', 1],
    ]);
    eq(array_sum(array_column($rows, 'num')), 4);
});
