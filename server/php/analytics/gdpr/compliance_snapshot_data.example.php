<?php
/**
 * Copy to compliance_snapshot_data.php on the server and implement DB queries.
 * This file is NOT loaded automatically — only compliance_snapshot_data.php is.
 *
 * Expected function:
 *   function compliance_snapshot_load_inputs(array $headers, string $domains, string $fromDate, string $toDate): array
 *
 * Return:
 *   [
 *     'audit_rows' => list<array{country_code?: string, regulation_applied?: string, ...}>,
 *     'traffic_totals' => array<string, int>   // ISO2 => total interactions in period
 *   ]
 */

declare(strict_types=1);

/*
function compliance_snapshot_load_inputs(array $headers, string $domains, string $fromDate, string $toDate): array
{
    // 1) Validate $headers['Authorization'], Organisation — reuse your existing analytics bootstrap.
    // 2) Query audit / consent log for $domains, date range — same source as getDomainStatistics.
    // 3) Query per-country interaction totals — same source as interactionsByCountry.

    return [
        'audit_rows' => [],
        'traffic_totals' => [],
    ];
}
*/
