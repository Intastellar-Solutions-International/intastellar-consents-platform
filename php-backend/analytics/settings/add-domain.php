<?php
/**
 * POST /analytics/settings/add-domain
 *
 * Adds domains to an organisation and writes each one's config.js for the banner.
 *
 * Body (JSON):
 *   organisationId int     required
 *   domains        array   required — hostnames or URLs
 *   settings       string  the page's "<script>window.INTA = {…};</script>" (AddDomain.js buildConfigScript)
 *
 * Only JSON is accepted as the banner settings: config.js is served to every visitor of the
 * site, so the request can't put its own JavaScript in it. A domain another organisation
 * already has is refused. The legal basis block comes from the platform, not the request.
 *
 * Response: "success" (what AddDomain.js expects), or { error } with a 4xx/5xx status.
 * Needs db-config.php next to this file (see php-backend/db-config.example.php).
 */
require_once __DIR__ . '/_banner-config.php';

sendBannerCors();

$body = json_decode(file_get_contents('php://input'), true);
$organisationId = (int) ($body['organisationId'] ?? 0);
requireOrganisationMember($organisationId);

$domains = [];
foreach ((array) ($body['domains'] ?? []) as $raw) {
    $domain = normalizeBannerDomain($raw);
    if (!$domain) respond(400, ['error' => 'Invalid domain: ' . mb_substr((string) $raw, 0, 100)]);
    $domains[$domain] = true;
}
$domains = array_keys($domains);
if (!$domains || count($domains) > 50) respond(400, ['error' => 'Send between 1 and 50 domains']);

/* buildConfigScript sends JSON wrapped as a script: anything that isn't exactly that is refused. */
$script = trim(preg_replace('#^\s*<script>|</script>\s*$#i', '', (string) ($body['settings'] ?? '')));
if (!preg_match('/^window\.INTA\s*=\s*(\{.*\})\s*;?$/s', $script, $match)) respond(400, ['error' => 'Invalid banner settings']);
$settings = json_decode($match[1], true);
if (!is_array($settings)) respond(400, ['error' => 'Invalid banner settings']);
$base = 'window.INTA = ' . json_encode($settings, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_HEX_TAG) . ";\n";

$dbConfig = require __DIR__ . '/db-config.php';
$db = mysqli_connect($dbConfig['host'], $dbConfig['username'], $dbConfig['password'], $dbConfig['dbname']);
if (!$db) respond(500, ['error' => 'Could not save the domains']);

$owner = mysqli_prepare($db, 'SELECT org_id FROM organisation_domains WHERE domain = ? OR domain = ?');
$insert = mysqli_prepare($db, 'INSERT INTO organisation_domains (`org_id`, `domain`) VALUES (?, ?)');
foreach ($domains as $domain) {
    $www = 'www.' . $domain;
    mysqli_stmt_bind_param($owner, 'ss', $domain, $www);
    mysqli_stmt_execute($owner);
    $owners = array_map('intval', array_column(mysqli_fetch_all(mysqli_stmt_get_result($owner), MYSQLI_ASSOC), 'org_id'));
    if (array_diff($owners, [$organisationId])) respond(409, ['error' => "$domain belongs to another organisation"]);
    if (!$owners) {
        mysqli_stmt_bind_param($insert, 'is', $organisationId, $domain);
        if (!mysqli_stmt_execute($insert)) respond(500, ['error' => 'Could not save the domains']);
    }
}

$legalBasis = fetchLegalBasis($organisationId);
foreach ($domains as $domain) {
    $path = bannerConfigPath($domain);
    $existing = is_file($path) ? file_get_contents($path) : null;
    // A file edited by hand (experiments, gtagId …) is kept next to the new one before it is replaced.
    if ($existing !== null && !copy($path, $path . '.' . date('Ymd-His') . '.bak')) respond(500, ['error' => 'Could not back up config.js']);
    // When the platform can't be reached, the block already in the file stays.
    $block = $legalBasis !== null ? legalBasisBlock($legalBasis) : ($existing !== null ? existingLegalBasisBlock($existing) : '');
    if (!writeBannerConfig($domain, $base . $block)) respond(500, ['error' => 'Could not write config.js']);
}

echo json_encode('success');
