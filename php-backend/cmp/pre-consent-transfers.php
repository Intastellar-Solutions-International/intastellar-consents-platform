<?php
/**
 * GET /cmp/pre-consent-transfers
 *
 * Returns the most recent pre-consent scan result for a domain.
 * Proxies to the Vercel GET endpoint (api/pre-consent-transfers.js)
 * which reads from the Neon PostgreSQL database (EU Frankfurt).
 *
 * Headers:
 *   Authorization:  Bearer <token>
 *   Organisation:   <organisation_id>
 *
 * Query params:
 *   domain   string   required
 *
 * Env vars required on the PHP host:
 *   SCANNER_URL            — Vercel deployment base URL, e.g. https://your-app.vercel.app
 *   SCANNER_INTERNAL_TOKEN — shared secret; must match Vercel SCANNER_INTERNAL_TOKEN
 *
 * Response 200:
 *   {
 *     "domain": "example.com",
 *     "scanned_at": "2026-07-08 10:00:00",
 *     "scan_duration_ms": 12400,
 *     "status": "completed",
 *     "pre_consent_transfers": [
 *       { "host": "connect.facebook.net", "service": "Facebook / Meta Pixel",
 *         "category": "advertising", "resourceType": "script" }
 *     ]
 *   }
 * Response 404: { "error": "No scan found for this domain." }
 */

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
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Authorization, Content-Type, Organisation');
header('Access-Control-Max-Age: 86400');
header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────
define('ROOT_PATH', dirname(__DIR__, 1));

if (!getenv('SCANNER_URL') && !($_ENV['SCANNER_URL'] ?? null)) {
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
if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

// ── Auth ──────────────────────────────────────────────────────────────���───────
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

$domain = strtolower(trim((string)($_GET['domain'] ?? '')));
$domain = preg_replace('#^https?://#', '', $domain);
$domain = explode('/', $domain)[0];

if (!$domain) {
    http_response_code(400);
    echo json_encode(['error' => 'Missing domain query parameter']);
    exit;
}

// ── Proxy to Vercel ───────────────────────────────────────────────────────────
$scannerUrl   = rtrim(getenv('SCANNER_URL') ?: '', '/');
$scannerToken = getenv('SCANNER_INTERNAL_TOKEN') ?: '';

if (!$scannerUrl || !$scannerToken) {
    error_log('[pre-consent-transfers/get] SCANNER_URL or SCANNER_INTERNAL_TOKEN not set');
    http_response_code(500);
    echo json_encode(['error' => 'Scanner not configured']);
    exit;
}

$url = $scannerUrl . '/api/pre-consent-transfers?' . http_build_query(['domain' => $domain]);

$ch = curl_init($url);
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT        => 10,
    CURLOPT_CONNECTTIMEOUT => 5,
    CURLOPT_HTTPHEADER     => [
        'X-Scanner-Token: ' . $scannerToken,
        'Organisation: '    . $organisationId,
    ],
]);

$raw  = curl_exec($ch);
$code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
$err  = curl_error($ch);
curl_close($ch);

if ($raw === false || $code === 0) {
    error_log('[pre-consent-transfers/get] Could not reach Vercel: ' . $err);
    http_response_code(502);
    echo json_encode(['error' => 'Data service unavailable']);
    exit;
}

http_response_code($code);
echo $raw;
