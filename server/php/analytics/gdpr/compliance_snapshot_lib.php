<?php
/**
 * Pure logic for compliance snapshot (no I/O).
 * Mirrors frontend rules in complianceRegions.js + traffic “logging gap” hints.
 */

declare(strict_types=1);

/** @return list<string> */
function compliance_snapshot_framework_ids(): array
{
    return ['GDPR', 'LGPD', 'CCPA', 'POPIA'];
}

/** @return array<string, true> */
function compliance_snapshot_eu_eea_uk_set(): array
{
    $codes = [
        'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT',
        'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE', 'IS', 'LI', 'NO',
        'GB', 'GI', 'IM',
    ];
    $m = [];
    foreach ($codes as $c) {
        $m[$c] = true;
    }
    return $m;
}

/**
 * Frameworks implied by regulation_applied text only.
 *
 * @return list<string>
 */
function compliance_snapshot_frameworks_from_regulation(string $reg): array
{
    $u = strtoupper($reg);
    $out = [];
    if (strpos($u, 'GDPR') !== false) {
        $out['GDPR'] = true;
    }
    if (strpos($u, 'LGPD') !== false) {
        $out['LGPD'] = true;
    }
    if (strpos($u, 'CCPA') !== false || strpos($u, 'CPRA') !== false) {
        $out['CCPA'] = true;
    }
    if (strpos($u, 'POPIA') !== false) {
        $out['POPIA'] = true;
    }
    return array_keys($out);
}

/**
 * Frameworks implied by country_code only (when regulation is empty).
 *
 * @return list<string>
 */
function compliance_snapshot_frameworks_from_country(string $countryCode): array
{
    $cc = strtoupper(trim($countryCode));
    if ($cc === '') {
        return [];
    }
    $eu = compliance_snapshot_eu_eea_uk_set();
    if ($cc === 'BR') {
        return ['LGPD'];
    }
    if ($cc === 'US') {
        return ['CCPA'];
    }
    if ($cc === 'ZA') {
        return ['POPIA'];
    }
    if (isset($eu[$cc])) {
        return ['GDPR'];
    }
    return [];
}

/**
 * Same as frontend frameworksForAuditRow: regulation first, else geo inference.
 *
 * @param array<string, mixed> $row
 * @return list<string>
 */
function compliance_snapshot_frameworks_for_row(array $row): array
{
    $reg = (string) ($row['regulation_applied'] ?? '');
    $fromReg = compliance_snapshot_frameworks_from_regulation($reg);
    if ($fromReg !== []) {
        return $fromReg;
    }
    return compliance_snapshot_frameworks_from_country((string) ($row['country_code'] ?? ''));
}

/**
 * @param list<array<string, mixed>> $auditRows
 * @return array<string, true>
 */
function compliance_snapshot_observed_frameworks(array $auditRows): array
{
    $obs = [];
    foreach ($auditRows as $row) {
        foreach (compliance_snapshot_frameworks_for_row($row) as $f) {
            $obs[$f] = true;
        }
    }
    return $obs;
}

/**
 * Country codes that appear in the audit sample (consent rows).
 *
 * @param list<array<string, mixed>> $auditRows
 * @return array<string, true>
 */
function compliance_snapshot_audit_country_codes(array $auditRows): array
{
    $s = [];
    foreach ($auditRows as $row) {
        $cc = strtoupper(trim((string) ($row['country_code'] ?? '')));
        if (strlen($cc) === 2 && $cc !== '—') {
            $s[$cc] = true;
        }
    }
    return $s;
}

/**
 * Which frameworks have meaningful traffic in the period (from per-country totals).
 *
 * @param array<string, int|float> $trafficTotals country ISO2 => interaction count
 * @return array<string, bool>
 */
function compliance_snapshot_frameworks_with_traffic(array $trafficTotals, int $minTotal): array
{
    $eu = compliance_snapshot_eu_eea_uk_set();
    $fw = array_fill_keys(compliance_snapshot_framework_ids(), false);
    foreach ($trafficTotals as $code => $n) {
        $cc = strtoupper(trim((string) $code));
        $num = (int) $n;
        if ($num < $minTotal) {
            continue;
        }
        if (isset($eu[$cc])) {
            $fw['GDPR'] = true;
        }
        if ($cc === 'US') {
            $fw['CCPA'] = true;
        }
        if ($cc === 'BR') {
            $fw['LGPD'] = true;
        }
        if ($cc === 'ZA') {
            $fw['POPIA'] = true;
        }
    }
    return $fw;
}

/**
 * @param list<array<string, mixed>> $auditRows
 * @param array<string, int|float> $trafficTotals
 * @param array{min_traffic?: int} $options
 * @return array{complianceRegionRisk: array<string, string>, issues: list<array<string, mixed>>}
 */
function compliance_snapshot_build(array $auditRows, array $trafficTotals, array $options = []): array
{
    $minTraffic = (int) ($options['min_traffic'] ?? 10);
    $frameworks = compliance_snapshot_framework_ids();

    $observed = compliance_snapshot_observed_frameworks($auditRows);
    $trafficFw = compliance_snapshot_frameworks_with_traffic($trafficTotals, $minTraffic);

    $complianceRegionRisk = [];
    $issues = [];

    foreach ($frameworks as $f) {
        if ($trafficFw[$f] && !isset($observed[$f])) {
            $complianceRegionRisk[$f] = 'watch';
            $issues[] = [
                'code' => 'LOGGING_GAP',
                'severity' => 'watch',
                'framework' => $f,
                'detail' => 'Traffic in this regulatory geography in the selected period, but no consent rows in the audit sample implied that framework.',
            ];
        }
    }

    foreach ($auditRows as $row) {
        $reg = (string) ($row['regulation_applied'] ?? '');
        $cc = strtoupper(trim((string) ($row['country_code'] ?? '')));
        if ($reg === '' || strlen($cc) !== 2) {
            continue;
        }
        $rFw = compliance_snapshot_frameworks_from_regulation($reg);
        $gFw = compliance_snapshot_frameworks_from_country($cc);
        if ($rFw === [] || $gFw === []) {
            continue;
        }
        $intersect = array_intersect($rFw, $gFw);
        if ($intersect === []) {
            $issues[] = [
                'code' => 'REG_GEO_MISMATCH',
                'severity' => 'watch',
                'framework' => $rFw[0],
                'detail' => 'regulation_applied does not align with country_code for this row (sample review).',
                'country_code' => $cc,
                'regulation_applied' => $reg,
            ];
            foreach ($rFw as $f) {
                $complianceRegionRisk[$f] = 'watch';
            }
        }
    }

    return [
        'complianceRegionRisk' => $complianceRegionRisk,
        'issues' => $issues,
    ];
}
