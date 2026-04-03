<?php
/**
 * Compliance snapshot for Audit Snapshot map / warnings.
 *
 * Deploy next to other GDPR analytics scripts, e.g.
 *   https://apis.intastellarsolutions.com/analytics/gdpr/compliance-snapshot.php
 *
 * Request: same headers as getDomainStatistics / getInteractions:
 *   Authorization, Organisation, Domains, FromDate, ToDate
 *
 * Response JSON:
 *   {
 *     "ok": true,
 *     "complianceRegionRisk": { "GDPR": "watch", ... },
 *     "issues": [ { "code": "LOGGING_GAP", "severity": "watch", "framework": "GDPR", "detail": "..." } ],
 *     "meta": { "audit_row_count": 0, "traffic_country_count": 0, "min_traffic": 10 }
 *   }
 *
 * Data loading: implement compliance_snapshot_data.php (see compliance_snapshot_data.example.php).
 * Until then, empty inputs return ok with empty risk (frontend falls back to client-side sample).
 */

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/compliance_snapshot_lib.php';

$minTraffic = 10;
if (isset($_GET['min_traffic']) && is_numeric($_GET['min_traffic'])) {
    $minTraffic = max(0, (int) $_GET['min_traffic']);
}

$headers = function_exists('getallheaders') ? getallheaders() : [];
if (!is_array($headers)) {
    $headers = [];
}

$domains = '';
$fromDate = '';
$toDate = '';
foreach ($headers as $k => $v) {
    $lk = strtolower((string) $k);
    if ($lk === 'domains') {
        $domains = (string) $v;
    }
    if ($lk === 'fromdate') {
        $fromDate = (string) $v;
    }
    if ($lk === 'todate') {
        $toDate = (string) $v;
    }
}

$auditRows = [];
$trafficTotals = [];

$dataFile = __DIR__ . '/compliance_snapshot_data.php';
if (is_readable($dataFile)) {
    require_once $dataFile;
    if (function_exists('compliance_snapshot_load_inputs')) {
        $loaded = compliance_snapshot_load_inputs($headers, $domains, $fromDate, $toDate);
        if (is_array($loaded)) {
            $auditRows = isset($loaded['audit_rows']) && is_array($loaded['audit_rows']) ? $loaded['audit_rows'] : [];
            $trafficTotals = isset($loaded['traffic_totals']) && is_array($loaded['traffic_totals']) ? $loaded['traffic_totals'] : [];
        }
    }
}

$built = compliance_snapshot_build($auditRows, $trafficTotals, ['min_traffic' => $minTraffic]);

echo json_encode([
    'ok' => true,
    'complianceRegionRisk' => $built['complianceRegionRisk'],
    'issues' => $built['issues'],
    'meta' => [
        'audit_row_count' => count($auditRows),
        'traffic_country_count' => count($trafficTotals),
        'min_traffic' => $minTraffic,
        'domains' => $domains,
        'fromDate' => $fromDate,
        'toDate' => $toDate,
    ],
], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
