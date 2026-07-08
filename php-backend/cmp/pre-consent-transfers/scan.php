<?php
/**
 * POST /cmp/pre-consent-transfers/scan
 *
 * Triggers a fresh pre-consent scan for a domain by proxying to the
 * internal Node scanner server (SCANNER_URL env, default http://localhost:9000).
 *
 * Headers:
 *   Authorization:  Bearer <token>
 *   Organisation:   <organisation_id>
 *   Content-Type:   application/json
 *
 * Body:
 *   { "domain": "example.com", "workspaceId": 42 }
 *
 * Response 200:
 *   {
 *     "domain": "example.com",
 *     "scanned_at": "2026-07-08 10:00:00",
 *     "status": "completed",
 *     "pre_consent_transfers": [ ... ]
 *   }
 *
 * Env vars required on the PHP host:
 *   SCANNER_URL            — base URL of the Node scanner, e.g. http://localhost:9000
 *   SCANNER_INTERNAL_TOKEN — shared secret; must match Node's SCANNER_INTERNAL_TOKEN
 */

set_time_limit(90);

// ── CORS ──────────────────────────────────────────────────────────────────────
$_CORS_ALLOWED = [
    'https://www.intastellarconsents.com',
    'https://consentsplatform.com',
    'http://localhost:8080',
    'http://localhost:3000',
];
$_CORS_ORIGIN = $_SERVER['HTTP_ORIGIN'] ?? '';
if (in_array($_CORS_ORIGIN, $_CORS_ALLOWED, true)) {
    header('Access-Control-Allow-Origin: ' . $_CORS_ORIGIN);
}
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Authorization, Content-Type, Organisation');
header('Access-Control-Max-Age: 86400');
header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────
define('ROOT_PATH', dirname(__DIR__, 2));

if (!getenv('DB_NAME') && !($_ENV['DB_NAME'] ?? null)) {
    $envFile = ROOT_PATH . '/.env';
    if (file_exists($envFile)) {
        foreach (file($envFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
            $line = trim($line);
            if ($line === '' || str_starts_with($line, '#') || !str_contains($line, '=')) continue;
            [$key, $val] = explode('=', $line, 2);
            $key = trim($key); $val = trim($val);
            if ($key !== '' && !getenv($key)) { putenv("$key=$val"); $_ENV[$key] = $val; }
        }
    }
}

// ── Method guard ──────────────────────────────────────────────────────────────
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

// ── Auth ──────────────────────────────────────────────────────────────────────
$_authHeader = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
if (!$_authHeader && function_exists('getallheaders')) {
    $h = getallheaders();
    $_authHeader = $h['Authorization'] ?? $h['authorization'] ?? '';
}

preg_match('/Bearer\s(\S+)/', $_authHeader, $_m);
$_jwtRaw = $_m[1] ?? null;

if (!$_jwtRaw) { http_response_code(401); echo json_encode(['error' => 'Unauthorized']); exit; }

$_encodedToken = base64_decode($_jwtRaw);
$_splitToken   = explode('.', $_encodedToken);

if (count($_splitToken) !== 3) { http_response_code(401); echo json_encode(['error' => 'Invalid token format']); exit; }

$_jwtPayload = json_decode(base64_decode($_splitToken[1]), true);
$_now = time();

if (
    ($_jwtPayload['iss'] ?? '') !== 'Intastellar Account' ||
    ($_jwtPayload['nbf'] ?? 0) > $_now ||
    ($_jwtPayload['exp'] ?? 0) < $_now
) {
    http_response_code(401);
    echo json_encode(['error' => 'Token expired or invalid issuer']);
    exit;
}

// ── Input ─────────────────────────────────────────────────────────────────────
$organisationId = (int)($_SERVER['HTTP_ORGANISATION'] ?? 0);
if ($organisationId <= 0) {
    http_response_code(400);
    echo json_encode(['error' => 'Missing Organisation header']);
    exit;
}

$body       = json_decode(file_get_contents('php://input'), true);
$domain     = strtolower(trim((string)($body['domain']      ?? '')));
$workspaceId = (int)($body['workspaceId'] ?? 0) ?: null;

$domain = preg_replace('#^https?://#', '', $domain);
$domain = explode('/', $domain)[0];

if (!$domain) {
    http_response_code(400);
    echo json_encode(['error' => 'domain is required']);
    exit;
}

// ── Scanner config ────────────────────────────────────────────────────────────
$scannerUrl   = rtrim(getenv('SCANNER_URL') ?: 'http://localhost:9000', '/');
$scannerToken = getenv('SCANNER_INTERNAL_TOKEN') ?: '';

if (!$scannerToken) {
    error_log('[pre-consent-scan] SCANNER_INTERNAL_TOKEN is not set');
    http_response_code(500);
    echo json_encode(['error' => 'Scanner not configured (missing SCANNER_INTERNAL_TOKEN)']);
    exit;
}

// ── Proxy to Node scanner ─────────────────────────────────────────────────────
$payload = json_encode([
    'domain'         => $domain,
    'organisationId' => $organisationId,
    'workspaceId'    => $workspaceId,
]);

$ch = curl_init($scannerUrl . '/pre-consent-scan');
curl_setopt_array($ch, [
    CURLOPT_POST           => true,
    CURLOPT_POSTFIELDS     => $payload,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT        => 75,
    CURLOPT_CONNECTTIMEOUT => 5,
    CURLOPT_HTTPHEADER     => [
        'Content-Type: application/json',
        'X-Scanner-Token: ' . $scannerToken,
    ],
]);

$raw  = curl_exec($ch);
$code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
$err  = curl_error($ch);
curl_close($ch);

if ($raw === false || $code === 0) {
    error_log('[pre-consent-scan] Could not reach scanner: ' . $err);
    http_response_code(502);
    echo json_encode(['error' => 'Scanner unavailable: ' . $err]);
    exit;
}

$result = json_decode($raw, true);

if ($result === null) {
    http_response_code(502);
    echo json_encode(['error' => 'Scanner returned invalid JSON']);
    exit;
}

http_response_code($code >= 200 && $code < 300 ? 200 : $code);
echo json_encode($result);
