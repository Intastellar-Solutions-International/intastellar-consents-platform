<?php
// Home trend — acceptance per day, against the same rows the Accepted KPI uses.
load_functions("$ROOT/analytics/gdpr/getInteractions.php", ['dailyAcceptanceSql', 'addDailyAcceptance']);

test('daily acceptance counts accepted rows against all rows of that day', function () {
    $db = new PDO('sqlite::memory:');
    $db->exec("CREATE TABLE cookiebanner_tracking_settings (`type` TEXT, `value` TEXT, consentsGiving TEXT, domain TEXT)");
    $ins = $db->prepare("INSERT INTO cookiebanner_tracking_settings VALUES (?, ?, ?, ?)");
    foreach ([
        ['all', '1', '2026-11-01 09:00:00', 'a.com'],
        ['all', 'declined', '2026-11-01 10:00:00', 'a.com'],
        ['marketing', '1', '2026-11-01 11:00:00', 'a.com'],
        ['all', '1', '2026-11-02 09:00:00', 'a.com'],
        ['all', '1', '2026-11-02 09:00:00', 'b.com'],
    ] as $r) $ins->execute($r);

    $rows = $db->query(dailyAcceptanceSql("WHERE `type` != '' AND domain = 'a.com'") . " ORDER BY d")->fetchAll(PDO::FETCH_ASSOC);
    eq(array_map(fn ($r) => [$r['d'], (int) $r['accepted'], (int) $r['total']], $rows), [
        ['2026-11-01', 1, 3],
        ['2026-11-02', 1, 1],
    ]);
});

test('daily rates join dailyNum by day, and the previous rate by its aligned day', function () {
    $out = addDailyAcceptance(
        [
            ['date' => '2026-11-01', 'num' => 3, 'previousPeriod' => ['date' => '2026-10-01', 'num' => 2]],
            ['date' => '2026-11-02', 'num' => 1, 'previousPeriod' => ['date' => null, 'num' => 0]],
        ],
        ['2026-11-01' => 33.3],
        ['2026-10-01' => 50.0]
    );
    eq($out[0]['accepted'], 33.3);
    eq($out[0]['previousPeriod']['accepted'], 50.0);
    eq(array_key_exists('accepted', $out[1]), false);
    eq(array_key_exists('accepted', $out[1]['previousPeriod']), false);
});
