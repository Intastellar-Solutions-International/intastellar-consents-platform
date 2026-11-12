<?php
// Audit log evidence: banner config fingerprint and TCF record per consent.
load_functions("$ROOT/consents/collect.php", ['bannerConfigVersion']);
load_functions("$ROOT/analytics/gdpr/getDomainStatistics.php", ['matchTcfRecord']);

test('config version: taken from what the banner reports, never guessed', function () {
    $hash = hash('sha256', '{"settings":{}}');
    eq(bannerConfigVersion($hash), substr($hash, 0, 12));
    eq(bannerConfigVersion(strtoupper($hash)), substr($hash, 0, 12));
    eq(bannerConfigVersion(null), null, 'older banners send nothing');
    eq(bannerConfigVersion("abc'; DROP TABLE x"), null);
    eq(bannerConfigVersion('abc123'), null, 'too short to identify a config');
});

test('tcf: each consent gets the TCF record current at that moment', function () {
    $at = function ($utc) { return (new DateTime($utc, new DateTimeZone('UTC')))->getTimestamp() * 1000; };
    $records = [
        ['cmp_id' => 1, 'cmp_version' => 3, 'tcf_policy_version' => 4, 'vendor_list_version' => 90, 'consent_language' => 'EN', 'tc_last_updated' => $at('2026-11-01 10:00:02'), 'tc_string' => '{"version":2}'],
        ['cmp_id' => 1, 'cmp_version' => 4, 'tcf_policy_version' => 5, 'vendor_list_version' => 95, 'consent_language' => 'EN', 'tc_last_updated' => $at('2026-11-05 09:00:00'), 'tc_string' => '{"version":2}'],
    ];
    eq(matchTcfRecord($records, '2026-11-01 10:00:00')['vendor_list_version'], 90, 'sent with the same click, 2 s later');
    eq(matchTcfRecord($records, '2026-11-03 12:00:00')['vendor_list_version'], 90, 'still the latest before it');
    eq(matchTcfRecord($records, '2026-11-06 12:00:00')['cmp_version'], 4);
    eq(matchTcfRecord($records, '2026-10-01 12:00:00'), null, 'no TCF record yet');
    eq(matchTcfRecord($records, '2026-11-05 09:00:00')['last_updated'], '2026-11-05T09:00:00Z');
});
