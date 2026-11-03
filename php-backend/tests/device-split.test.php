<?php
// Home device split — counts consent rows per width bucket (it used to count
// distinct screen widths). Run against SQLite, which has JSON_EXTRACT too.
load_functions("$ROOT/analytics/gdpr/getInteractions.php", ['deviceSplitSql']);

function device_split_on(array $rows, string $condition = "WHERE `type` != ''"): array
{
    $db = new PDO('sqlite::memory:');
    $db->exec("CREATE TABLE cookiebanner_tracking_settings (`type` TEXT, domain TEXT, screenSize TEXT)");
    $ins = $db->prepare("INSERT INTO cookiebanner_tracking_settings VALUES (?, ?, ?)");
    foreach ($rows as $r) $ins->execute($r);
    return array_map('intval', $db->query(deviceSplitSql($condition))->fetch(PDO::FETCH_ASSOC));
}

$size = fn ($w, $h) => json_encode(['width' => $w, 'height' => $h]);

test('device split counts every row, not distinct widths', function () use ($size) {
    $rows = array_fill(0, 5, ['all', 'a.com', $size(390, 844)]);   // 5 × the same phone
    $rows[] = ['all', 'a.com', $size(1920, 1080)];
    eq(device_split_on($rows), ['mobile' => 5, 'tablet' => 0, 'desktop' => 1]);
});

test('device split buckets by width only (tall tablets and desktops count)', function () use ($size) {
    eq(device_split_on([
        ['all', 'a.com', $size(767, 1200)],   // mobile, tall
        ['all', 'a.com', $size(768, 1024)],   // tablet portrait (was dropped: height > 400)
        ['all', 'a.com', $size(1024, 1366)],  // iPad Pro (was dropped)
        ['all', 'a.com', $size(1025, 1600)],  // desktop, tall (was dropped: height > 1400)
    ]), ['mobile' => 1, 'tablet' => 2, 'desktop' => 1]);
});

test('device split leaves rows without a width out (they are "other")', function () use ($size) {
    eq(device_split_on([['all', 'a.com', null], ['all', 'a.com', '{}'], ['all', 'a.com', $size(400, 800)]]),
        ['mobile' => 1, 'tablet' => 0, 'desktop' => 0]);
});

test('device split applies the caller\'s filters', function () use ($size) {
    eq(device_split_on([
        ['all', 'a.com', $size(400, 800)],
        ['all', 'b.com', $size(400, 800)],
        ['',    'a.com', $size(400, 800)],
    ], "WHERE `type` != '' AND domain IN ('a.com')"), ['mobile' => 1, 'tablet' => 0, 'desktop' => 0]);
});
