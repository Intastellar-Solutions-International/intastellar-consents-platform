<?php
/**
 * POST /analytics/settings/domain-verification/v1/check
 *
 * Fetches the live domain and checks whether the Intastellar verification
 * token is present, then updates the domain_verifications record accordingly.
 *
 * Looks for any of these in the fetched HTML:
 *   1. <meta name="intastellar-verification" content="TOKEN">
 *   2. window.INTA = { ..., verification: "TOKEN", ... }
 *   3. window.INTA.verification = "TOKEN"
 *
 * Uses cURL when available (handles gzip, works when allow_url_fopen=Off),
 * falls back to file_get_contents otherwise.
 *
 * Append ?debug=1 to the request URL to get detailed diagnostic output.
 *
 * Re-verification is required every 14 days.
 *
 * Body (JSON):
 *   domain         string   required
 *   organisationId int      required
 *
 * Response 200:
 *   { "success": true,  "message": "...", "verifiedAt": "...", "nextVerificationDue": "..." }
 *   { "success": false, "message": "Verification token not found on domain." }
 *
 * Response 404:  { "error": "No verification record found. Call /init first." }
 * Response 422:  { "error": "Could not reach domain.", "detail": "..." }
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

// ── Debug mode — append ?debug=1 to the URL ───────────────────────────────────
$_DEBUG   = isset($_GET['debug']) && $_GET['debug'] === '1';
$_dbgLog  = [];

function dbg(string $key, $value): void {
    global $_dbgLog;
    $_dbgLog[$key] = $value;
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────
define('ROOT_PATH', dirname(__DIR__, 4));
dbg('root_path', ROOT_PATH);
dbg('root_path_exists', is_dir(ROOT_PATH));

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
$body           = json_decode(file_get_contents('php://input'), true);
$domain         = strtolower(trim((string)($body['domain']         ?? '')));
$organisationId = (int)($body['organisationId'] ?? 0);

if (!$domain || $organisationId <= 0) {
    http_response_code(400);
    echo json_encode(['error' => 'domain and organisationId are required']);
    exit;
}

dbg('domain', $domain);
dbg('organisation_id', $organisationId);

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
        $resp = ['error' => 'No verification record found. Call /init first.'];
        if ($_DEBUG) $resp['debug'] = $_dbgLog;
        echo json_encode($resp);
        exit;
    }

    $token    = $record['verification_token'];
    $recordId = (int)$record['id'];
    dbg('token', $token);

} catch (\Throwable $e) {
    error_log('[domain-verification/check] DB read: ' . $e->getMessage());
    http_response_code(500);
    $resp = ['error' => 'Internal server error', 'detail' => $e->getMessage()];
    if ($_DEBUG) $resp['debug'] = $_dbgLog;
    echo json_encode($resp);
    exit;
}

// ── HTTP fetch helpers ────────────────────────────────────────────────────────

/**
 * Fetch up to 512 KB of a URL using cURL.
 * Returns [html|null, httpCode, errorMsg, finalUrl].
 */
function curlFetch(string $url, bool $verifySsl = true): array
{
    $ch = curl_init();
    curl_setopt_array($ch, [
        CURLOPT_URL            => $url,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 15,
        CURLOPT_CONNECTTIMEOUT => 8,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_MAXREDIRS      => 5,
        CURLOPT_SSL_VERIFYPEER => $verifySsl,
        CURLOPT_SSL_VERIFYHOST => $verifySsl ? 2 : 0,
        CURLOPT_USERAGENT      => 'IntastellarBot/1.0 (+https://intastellarconsents.com/bot)',
        CURLOPT_HTTPHEADER     => ['Accept: text/html,application/xhtml+xml'],
        CURLOPT_ENCODING       => '',      // accept + decode gzip/deflate automatically
        CURLOPT_BUFFERSIZE     => 131072,  // 128 KB read buffer
    ]);

    $html    = curl_exec($ch);
    $code    = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err     = curl_error($ch);
    $finalUrl = curl_getinfo($ch, CURLINFO_EFFECTIVE_URL);
    curl_close($ch);

    if ($html === false || $html === '') {
        return [null, $code, $err, $finalUrl];
    }

    return [substr($html, 0, 524288), $code, $err, $finalUrl];
}

/**
 * Fetch via file_get_contents (fallback when cURL is unavailable).
 */
function fgcFetch(string $url, bool $verifySsl = true): array
{
    $ctx = stream_context_create([
        'http' => [
            'timeout'         => 15,
            'follow_location' => true,
            'max_redirects'   => 5,
            'method'          => 'GET',
            'user_agent'      => 'IntastellarBot/1.0 (+https://intastellarconsents.com/bot)',
            'header'          => "Accept: text/html\r\n",
        ],
        'ssl' => [
            'verify_peer'      => $verifySsl,
            'verify_peer_name' => $verifySsl,
        ],
    ]);

    set_error_handler(static fn() => null);
    $html = @file_get_contents($url, false, $ctx);
    restore_error_handler();

    if ($html === false) return [null, 0, 'file_get_contents failed', $url];
    return [substr($html, 0, 524288), 200, '', $url];
}

/**
 * Try HTTPS then HTTP, with SSL fallback. Returns [html|null, attempts[]]
 */
function fetchDomainHtml(string $domain): array
{
    $useCurl  = function_exists('curl_init');
    $attempts = [];

    $urls = ["https://{$domain}/", "http://{$domain}/"];

    foreach ($urls as $url) {
        if ($useCurl) {
            [$html, $code, $err, $final] = curlFetch($url, true);
            $attempts[] = compact('url', 'code', 'err', 'final');

            // SSL failure — retry without peer verification
            if ($html === null && $code === 0 && (
                stripos($err, 'SSL') !== false ||
                stripos($err, 'certificate') !== false ||
                stripos($err, 'TLS') !== false
            )) {
                [$html, $code, $err, $final] = curlFetch($url, false);
                $attempts[] = ['url' => $url . ' (no-ssl-verify)', 'code' => $code, 'err' => $err, 'final' => $final];
            }
        } else {
            [$html, $code, $err, $final] = fgcFetch($url, true);
            $attempts[] = compact('url', 'code', 'err', 'final');

            if ($html === null) {
                [$html, $code, $err, $final] = fgcFetch($url, false);
                $attempts[] = ['url' => $url . ' (no-ssl-verify)', 'code' => $code, 'err' => $err, 'final' => $final];
            }
        }

        if ($html !== null && $code >= 200 && $code < 400) {
            return [$html, $attempts, $useCurl];
        }
    }

    return [null, $attempts, $useCurl];
}

/**
 * Returns true and the matched method name if the token is found in the HTML.
 */
function tokenFoundInHtml(string $html, string $token): array
{
    if (strpos($html, $token) === false) {
        return [false, null];
    }

    $esc = preg_quote($token, '/');

    // 1a: <meta name="intastellar-verification" content="TOKEN" ...>
    if (preg_match('/<meta\s[^>]*name=["\']intastellar-verification["\'][^>]*content=["\']' . $esc . '["\'][^>]*>/i', $html)) {
        return [true, 'meta-tag (name first)'];
    }

    // 1b: <meta content="TOKEN" name="intastellar-verification" ...>
    if (preg_match('/<meta\s[^>]*content=["\']' . $esc . '["\'][^>]*name=["\']intastellar-verification["\'][^>]*>/i', $html)) {
        return [true, 'meta-tag (content first)'];
    }

    // 2a: window.INTA = { ..., verification: "TOKEN", ... }
    if (preg_match('/window\.INTA\s*=\s*\{[^}]*verification\s*:\s*["\']' . $esc . '["\'][^}]*\}/s', $html)) {
        return [true, 'window.INTA object'];
    }

    // 2b: window.INTA.verification = "TOKEN"
    if (preg_match('/window\.INTA\.verification\s*=\s*["\']' . $esc . '["\']/', $html)) {
        return [true, 'window.INTA.verification property'];
    }

    // 3: bare token anywhere in a script tag (last-resort catch-all)
    if (preg_match('/<script[^>]*>.*?' . $esc . '.*?<\/script>/si', $html)) {
        return [true, 'token in script tag'];
    }

    return [false, null];
}

// ── Run the check ─────────────────────────────────────────────────────────────
[$html, $fetchAttempts, $usedCurl] = fetchDomainHtml($domain);

dbg('fetch_method', $usedCurl ? 'cURL' : 'file_get_contents');
dbg('fetch_attempts', $fetchAttempts);
dbg('html_length', $html !== null ? strlen($html) : null);
dbg('html_preview', $html !== null ? substr($html, 0, 300) : null);

if ($html === null) {
    try {
        $db->prepare(
            'UPDATE domain_verifications SET last_checked_at = NOW() WHERE id = ?'
        )->execute([$recordId]);
    } catch (\Throwable $ignored) {}

    http_response_code(422);
    $resp = [
        'error'    => 'Could not reach domain.',
        'detail'   => "No successful HTTP response from {$domain}. Check the site is publicly accessible.",
        'attempts' => $fetchAttempts,
    ];
    if ($_DEBUG) $resp['debug'] = $_dbgLog;
    echo json_encode($resp);
    exit;
}

[$found, $method] = tokenFoundInHtml($html, $token);

dbg('token_found', $found);
dbg('match_method', $method);

// ── Update DB and respond ─────────────────────────────────────────────────────
const REVERIFICATION_DAYS = 14;

try {
    $now    = new DateTimeImmutable('now', new DateTimeZone('UTC'));
    $nowStr = $now->format('Y-m-d H:i:s');

    if ($found) {
        $nextDue = $now->modify('+' . REVERIFICATION_DAYS . ' days')->format('Y-m-d H:i:s');

        $db->prepare(
            'UPDATE domain_verifications
             SET verified = 1, verified_at = ?, last_checked_at = ?, next_verification_due = ?
             WHERE id = ?'
        )->execute([$nowStr, $nowStr, $nextDue, $recordId]);

        $resp = [
            'success'             => true,
            'message'             => 'Domain verified successfully!',
            'verifiedAt'          => $nowStr,
            'nextVerificationDue' => $nextDue,
        ];
    } else {
        $db->prepare(
            'UPDATE domain_verifications SET last_checked_at = ? WHERE id = ?'
        )->execute([$nowStr, $recordId]);

        $resp = [
            'success' => false,
            'message' => 'Verification token not found on domain. '
                . 'Make sure the meta tag or window.INTA variable is in the page source '
                . '(not injected by JavaScript after load) and the page is publicly accessible.',
        ];
    }

    if ($_DEBUG) $resp['debug'] = $_dbgLog;
    echo json_encode($resp);

} catch (\Throwable $e) {
    error_log('[domain-verification/check] DB update: ' . $e->getMessage());
    http_response_code(500);
    $resp = ['error' => 'Internal server error', 'detail' => $e->getMessage()];
    if ($_DEBUG) $resp['debug'] = $_dbgLog;
    echo json_encode($resp);
}
