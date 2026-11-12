<?php
// Audit log evidence: banner config fingerprint and TCF record per consent.
load_functions("$ROOT/consents/collect.php", ['bannerConfigVersion']);
load_functions("$ROOT/analytics/gdpr/getDomainStatistics.php", ['matchTcfRecord']);

test('config version: fingerprint of the domain config.js, null without one', function () {
    $root = sys_get_temp_dir() . '/audit-evidence-' . getmypid();
    @mkdir("$root/downloads/cookieconsents/shop.dk", 0777, true);
    file_put_contents("$root/downloads/cookieconsents/shop.dk/config.js", 'window.INTA = {};');
    eq(bannerConfigVersion('shop.dk', $root), substr(hash('sha256', 'window.INTA = {};'), 0, 12));
    eq(bannerConfigVersion('other.dk', $root), null);
});

test('config version: a domain that could leave the folder is refused', function () {
    eq(bannerConfigVersion('../../etc/passwd', '/'), null);
    eq(bannerConfigVersion('shop.dk/../x', '/'), null);
    eq(bannerConfigVersion('', '/'), null);
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
