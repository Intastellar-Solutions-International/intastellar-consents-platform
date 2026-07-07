<?php
/**
 * POST /analytics/settings/domain-verification/v1/init
 *
 * Returns the verification record for a domain + organisation, creating one
 * (with a fresh token) if it does not yet exist.
 *
 * Token format matches the JS helper in domainVerification.js:
 *   inta_{org_id}_{timestamp_base36}_{random_hex}
 *
 * Body (JSON):
 *   domain         string   required
 *   organisationId int      required
 *
 * Response 200:
 *   {
 *     "domain":              "example.com",
 *     "token":               "inta_1_m5x7k2_a1b2c3d4",
 *     "verified":            false,
 *     "verifiedAt":          null,
 *     "lastCheckedAt":       null,
 *     "nextVerificationDue": null,
 *     "createdAt":           "2026-07-07 10:00:00"
 *   }
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
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Authorization, Content-Type, Organisation');
header('Access-Control-Max-Age: 86400');
header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// ── Debug mode ────────────────────────────────────────────────────────────────
$_DEBUG  = isset($_GET['debug']) && $_GET['debug'] === '1';
$_dbgLog = [];
function dbg(string $k, $v): void { global $_dbgLog; $_dbgLog[$k] = $v; }

// ── Bootstrap ─────────────────────────────────────────────────────────────────
// ROOT_PATH = php-backend/  (4 levels up from analytics/settings/domain-verification/v1/)
define('ROOT_PATH', dirname(__DIR__, 4));
dbg('root_path', ROOT_PATH);
dbg('root_path_exists', is_dir(ROOT_PATH));
dbg('shared_db_exists', file_exists(ROOT_PATH . '/shared/db.php'));

if (!getenv('DB_NAME') && !($_ENV['DB_NAME'] ?? null)) {
    $envFile = ROOT_PATH . '/.env';
    dbg('env_file_path', $envFile);
    dbg('env_file_exists', file_exists($envFile));
    if (file_exists($envFile)) {
        foreach (file($envFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
            $line = trim($line);
            if ($line === '' || str_starts_with($line, '#') || !str_contains($line, '=')) continue;
            [$key, $val] = explode('=', $line, 2);
            $key = trim($key);
            $val = trim($val);
            if ($key !== '' && !getenv($key)) {
                putenv("$key=$val");
                $_ENV[$key] = $val;
            }
        }
    }
}
dbg('db_host', getenv('DB_HOST') ?: ($_ENV['DB_HOST'] ?? '(not set)'));
dbg('db_name', getenv('DB_NAME') ?: ($_ENV['DB_NAME'] ?? '(not set)'));
dbg('db_user', getenv('DB_USER') ?: ($_ENV['DB_USER'] ?? '(not set)'));
dbg('db_pass_set', !empty(getenv('DB_PASS') ?: ($_ENV['DB_PASS'] ?? '')));

require_once ROOT_PATH . '/shared/db.php';

// ── Method guard ──────────────────────────────────────────────────────────────
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

// ── Auth ──────────────────────────────────────────────────────────────────────
$_authHeader = $_SERVER['HTTP_AUTHORIZATION']
    ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION']
    ?? '';

if (!$_authHeader && function_exists('getallheaders')) {
    $h = getallheaders();
    $_authHeader = $h['Authorization'] ?? $h['authorization'] ?? '';
}

preg_match('/Bearer\s(\S+)/', $_authHeader, $_m);
$_jwtRaw = $_m[1] ?? null;

if (!$_jwtRaw) {
    http_response_code(401);
    echo json_encode(['error' => 'Unauthorized']);
    exit;
}

$_encodedToken = base64_decode($_jwtRaw);
$_splitToken   = explode('.', $_encodedToken);

if (count($_splitToken) !== 3) {
    http_response_code(401);
    echo json_encode(['error' => 'Invalid token format']);
    exit;
}

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

// ── Parse body ────────────────────────────────────────────────────────────────
$body = json_decode(file_get_contents('php://input'), true);

$domain         = strtolower(trim((string)($body['domain']         ?? '')));
$organisationId = (int)($body['organisationId'] ?? 0);

if (!$domain) {
    http_response_code(400);
    echo json_encode(['error' => 'domain is required']);
    exit;
}

if (!preg_match('/^[a-zA-Z0-9][a-zA-Z0-9\-_.]*\.[a-zA-Z]{2,}$/', $domain)) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid domain format']);
    exit;
}

if ($organisationId <= 0) {
    http_response_code(400);
    echo json_encode(['error' => 'organisationId is required']);
    exit;
}

// ── Get or create verification record ────────────────────────────────────────
try {
    $db = getDb();

    $stmt = $db->prepare(
        'SELECT domain, organisation_id, verification_token, verified, verified_at,
                last_checked_at, next_verification_due, created_at
         FROM domain_verifications
         WHERE domain = ? AND organisation_id = ?
         LIMIT 1'
    );
    $stmt->execute([$domain, $organisationId]);
    $row = $stmt->fetch();

    if ($row) {
        // Record already exists — return it as-is
        echo json_encode([
            'domain'              => $row['domain'],
            'organisationId'      => $organisationId,
            'token'               => $row['verification_token'],
            'verified'            => (bool)$row['verified'],
            'verifiedAt'          => $row['verified_at'],
            'lastCheckedAt'       => $row['last_checked_at'],
            'nextVerificationDue' => $row['next_verification_due'],
            'createdAt'           => $row['created_at'],
        ]);
        exit;
    }

    // Generate a token that mirrors the JS format:
    //   inta_{org_id}_{timestamp_base36}_{random_hex}
    $timestampBase36 = base_convert((string)(int)(microtime(true) * 1000), 10, 36);
    $randomHex       = substr(bin2hex(random_bytes(5)), 0, 8);
    $token           = "inta_{$organisationId}_{$timestampBase36}_{$randomHex}";

    $insert = $db->prepare(
        'INSERT INTO domain_verifications
             (domain, organisation_id, verification_token, verified)
         VALUES (?, ?, ?, 0)'
    );
    $insert->execute([$domain, $organisationId, $token]);

    $createdAt = date('Y-m-d H:i:s');

    echo json_encode([
        'domain'              => $domain,
        'organisationId'      => $organisationId,
        'token'               => $token,
        'verified'            => false,
        'verifiedAt'          => null,
        'lastCheckedAt'       => null,
        'nextVerificationDue' => null,
        'createdAt'           => $createdAt,
    ]);

} catch (\Throwable $e) {
    error_log('[domain-verification/init] ' . $e->getMessage());
    http_response_code(500);
    $resp = [
        'error'  => 'Internal server error',
        'detail' => $e->getMessage(),
        'file'   => $e->getFile() . ':' . $e->getLine(),
        'type'   => get_class($e),
    ];
    if ($_DEBUG) $resp['debug'] = $_dbgLog;
    echo json_encode($resp);
}
