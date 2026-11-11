<?php
/**
 * POST /analytics/settings/legal-basis-sync
 *
 * Rewrites the legal basis block in the config.js of every domain the organisation has,
 * from the platform's /api/legal-basis. Called by api/legal-basis.js after a save, with the
 * signed-in user's headers. Everything else in config.js, hand edits included, is untouched.
 *
 * Body (JSON): { organisationId }
 * Response: { updated: [domains], skipped: [domains without config.js] }
 * Needs db-config.php next to this file (see php-backend/db-config.example.php).
 */
require_once __DIR__ . '/_banner-config.php';

sendBannerCors();

$body = json_decode(file_get_contents('php://input'), true);
$organisationId = (int) ($body['organisationId'] ?? 0);
requireOrganisationMember($organisationId);

$legalBasis = fetchLegalBasis($organisationId);
if ($legalBasis === null) respond(502, ['error' => 'Could not read the legal basis settings']);

$dbConfig = require __DIR__ . '/db-config.php';
$db = mysqli_connect($dbConfig['host'], $dbConfig['username'], $dbConfig['password'], $dbConfig['dbname']);
if (!$db) respond(500, ['error' => 'Could not read the domains']);
$query = mysqli_prepare($db, 'SELECT DISTINCT domain FROM organisation_domains WHERE org_id = ?');
mysqli_stmt_bind_param($query, 'i', $organisationId);
mysqli_stmt_execute($query);
$rows = mysqli_fetch_all(mysqli_stmt_get_result($query), MYSQLI_ASSOC);

$updated = [];
$skipped = [];
foreach (array_unique(array_filter(array_map(fn ($r) => normalizeBannerDomain($r['domain']), $rows))) as $domain) {
    if (syncLegalBasis($domain, $legalBasis)) $updated[] = $domain;
    else $skipped[] = $domain;
}

respond(200, ['updated' => $updated, 'skipped' => $skipped]);
