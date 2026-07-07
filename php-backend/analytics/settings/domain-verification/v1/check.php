<?php
/**
 * POST /analytics/settings/domain-verification/v1/check
 *
 * Fetches the live domain and checks whether the Intastellar verification
 * token is present, then updates the domain_verifications record accordingly.
 *
 * The check looks for either of these in the fetched HTML:
 *   1. <meta name="intastellar-verification" content="TOKEN">
 *   2. window.INTA = { ..., verification: "TOKEN", ... }
 *   3. window.INTA.verification = "TOKEN"
 *
 * Re-verification is required every 14 days (matching the JS REVERIFICATION_DAYS).
 *
 * Body (JSON):
 *   domain         string   required
 *   organisationId int      required
 *
 * Response 200:
 *   { "success": true,  "message": "...", "verifiedAt": "...", "nextVerificationDue": "..." }
 *   { "success": false, "message": "Verification token not found on domain." }
 *
 * Response 404:
 *   { "error": "No verification record found. Call /init first." }
 *
 * Response 422:
 *   { "error": "Could not reach domain.", "detail": "..." }
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

// ── Bootstrap ─────────────────────────────────────────────────────────────────
define('ROOT_PATH', dirname(__DIR__, 4));

if (!getenv('DB_NAME') && !($_ENV['DB_NAME'] ?? null)) {
    $envFile = ROOT_PATH . '/.env';
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

if (!$domain || $organisationId <= 0) {
    http_response_code(400);
    echo json_encode(['error' => 'domain and organisationId are required']);
    exit;
}

// ── Look up token ─────────────────────────────────────────────────────────────
try {
    $db = getDb();

    $stmt = $db->prepare(
        'SELECT id, verification_token FROM domain_verifications
         WHERE domain = ? AND organisation_id = ? LIMIT 1'
    );
    $stmt->execute([$domain, $organisationId]);
    $record = $stmt->fetch();

    if (!$record) {
        http_response_code(404);
        echo json_encode(['error' => 'No verification record found. Call /init first.']);
        exit;
    }

    $token = $record['verification_token'];
    $recordId = (int)$record['id'];

} catch (\Throwable $e) {
    error_log('[domain-verification/check] DB read error: ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['error' => 'Internal server error']);
    exit;
}

// ── Fetch the domain ──────────────────────────────────────────────────────────
/**
 * Try HTTPS first, then HTTP. Returns the first 512 KB of HTML or null.
 */
function fetchDomainHtml(string $domain): ?string
{
    $context = stream_context_create([
        'http' => [
            'timeout'         => 10,
            'follow_location' => true,
            'max_redirects'   => 3,
            'method'          => 'GET',
            'user_agent'      => 'IntastellarBot/1.0 (+https://intastellarconsents.com/bot)',
            'header'          => "Accept: text/html\r\n",
        ],
        'ssl'  => [
            'verify_peer'      => true,
            'verify_peer_name' => true,
        ],
    ]);

    $urls = ["https://{$domain}/", "http://{$domain}/"];

    foreach ($urls as $url) {
        set_error_handler(static fn() => null);
        $html = @file_get_contents($url, false, $context);
        restore_error_handler();

        if ($html !== false) {
            return substr($html, 0, 524288); // cap at 512 KB
        }
    }

    // Retry HTTPS without peer verification as last resort (some shared-hosting certs fail)
    $relaxedCtx = stream_context_create([
        'http' => [
            'timeout'         => 10,
            'follow_location' => true,
            'max_redirects'   => 3,
            'method'          => 'GET',
            'user_agent'      => 'IntastellarBot/1.0 (+https://intastellarconsents.com/bot)',
        ],
        'ssl'  => [
            'verify_peer'      => false,
            'verify_peer_name' => false,
        ],
    ]);

    set_error_handler(static fn() => null);
    $html = @file_get_contents("https://{$domain}/", false, $relaxedCtx);
    restore_error_handler();

    return $html !== false ? substr($html, 0, 524288) : null;
}

/**
 * Returns true if the verification token is found in the HTML via any of the
 * supported placement methods.
 */
function tokenFoundInHtml(string $html, string $token): bool
{
    // Fast path: token not present at all
    if (strpos($html, $token) === false) {
        return false;
    }

    $escaped = preg_quote($token, '/');

    // Option 1a: <meta name="intastellar-verification" content="TOKEN" ...>
    if (preg_match(
        '/<meta\s[^>]*name=["\']intastellar-verification["\'][^>]*content=["\']' . $escaped . '["\'][^>]*>/i',
        $html
    )) {
        return true;
    }

    // Option 1b: attribute order reversed  content="..." name="..."
    if (preg_match(
        '/<meta\s[^>]*content=["\']' . $escaped . '["\'][^>]*name=["\']intastellar-verification["\'][^>]*>/i',
        $html
    )) {
        return true;
    }

    // Option 2a: window.INTA = { ..., verification: "TOKEN", ... }
    if (preg_match(
        '/window\.INTA\s*=\s*\{[^}]*verification\s*:\s*["\']' . $escaped . '["\'][^}]*\}/s',
        $html
    )) {
        return true;
    }

    // Option 2b: window.INTA.verification = "TOKEN"
    if (preg_match(
        '/window\.INTA\.verification\s*=\s*["\']' . $escaped . '["\']/',
        $html
    )) {
        return true;
    }

    return false;
}

// ── Run the check ─────────────────────────────────────────────────────────────
$html = fetchDomainHtml($domain);

if ($html === null) {
    // Record the failed attempt without marking as unverified
    try {
        $db->prepare(
            'UPDATE domain_verifications SET last_checked_at = NOW() WHERE id = ?'
        )->execute([$recordId]);
    } catch (\Throwable $ignored) {}

    http_response_code(422);
    echo json_encode([
        'error'  => 'Could not reach domain.',
        'detail' => "No HTTP response received from {$domain}. Ensure the site is publicly accessible.",
    ]);
    exit;
}

$found = tokenFoundInHtml($html, $token);

// ── Update DB and respond ─────────────────────────────────────────────────────
const REVERIFICATION_DAYS = 14;

try {
    $now     = new DateTimeImmutable('now', new DateTimeZone('UTC'));
    $nowStr  = $now->format('Y-m-d H:i:s');

    if ($found) {
        $nextDue = $now->modify('+' . REVERIFICATION_DAYS . ' days')->format('Y-m-d H:i:s');

        $db->prepare(
            'UPDATE domain_verifications
             SET verified = 1, verified_at = ?, last_checked_at = ?, next_verification_due = ?
             WHERE id = ?'
        )->execute([$nowStr, $nowStr, $nextDue, $recordId]);

        echo json_encode([
            'success'             => true,
            'message'             => 'Domain verified successfully!',
            'verifiedAt'          => $nowStr,
            'nextVerificationDue' => $nextDue,
        ]);

    } else {
        $db->prepare(
            'UPDATE domain_verifications SET last_checked_at = ? WHERE id = ?'
        )->execute([$nowStr, $recordId]);

        echo json_encode([
            'success' => false,
            'message' => 'Verification token not found on domain. '
                . 'Please ensure the meta tag or window.INTA variable is correctly installed '
                . 'and that the page is publicly accessible.',
        ]);
    }

} catch (\Throwable $e) {
    error_log('[domain-verification/check] DB update error: ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['error' => 'Internal server error']);
}
