<?php
/**
 * POST /analytics/settings/workspaces/v1/create-workspace
 *
 * Creates a new workspace with its domains and users in a single transaction.
 * Rejects the request if any of the supplied domains are already assigned to
 * another workspace within the same organisation.
 *
 * Body (JSON):
 *   name           string   required
 *   description    string   optional
 *   organisationId int      required
 *   domains        array    required — [{domain: string, isPrimary: bool}]
 *   users          array    optional — [{email: string}]
 *
 * Response 201:
 *   { "workspace": { id, name, description, organisationId, domains, users, createdAt } }
 *
 * Response 409:
 *   { "error": "...", "domains": ["already-assigned.com"] }
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

// ── Debug mode — set ?debug=1 in the request URL to enable ───────────────────
$_DEBUG = isset($_GET['debug']) && $_GET['debug'] === '1';
$_debugLog = [];

function dbg(string $key, $value): void {
    global $_debugLog;
    $_debugLog[$key] = $value;
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────
define('ROOT_PATH', dirname(__DIR__, 4));
dbg('root_path', ROOT_PATH);
dbg('root_path_exists', is_dir(ROOT_PATH));
dbg('shared_db_exists', file_exists(ROOT_PATH . '/shared/db.php'));

$_envLoaded = false;
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
        $_envLoaded = true;
    }
} else {
    $_envLoaded = true; // already set by server
}
dbg('env_loaded', $_envLoaded);
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

dbg('jwt_iss',  $_jwtPayload['iss'] ?? '(missing)');
dbg('jwt_exp',  $_jwtPayload['exp'] ?? '(missing)');
dbg('jwt_nbf',  $_jwtPayload['nbf'] ?? '(missing)');
dbg('jwt_now',  $_now);
dbg('jwt_exp_ok', ($_jwtPayload['exp'] ?? 0) >= $_now);
dbg('jwt_nbf_ok', ($_jwtPayload['nbf'] ?? 0) <= $_now);

if (
    ($_jwtPayload['iss'] ?? '') !== 'Intastellar Account' ||
    ($_jwtPayload['nbf'] ?? 0) > $_now ||
    ($_jwtPayload['exp'] ?? 0) < $_now
) {
    http_response_code(401);
    $resp = ['error' => 'Token expired or invalid issuer'];
    if ($_DEBUG) $resp['debug'] = $_debugLog;
    echo json_encode($resp);
    exit;
}

// ── Parse body ────────────────────────────────────────────────────────────────
$rawInput = file_get_contents('php://input');
$body = json_decode($rawInput, true);
dbg('raw_body', $rawInput);
dbg('body_parsed', $body);

$name           = trim((string)($body['name']          ?? ''));
$description    = trim((string)($body['description']   ?? ''));
$organisationId = (int)($body['organisationId']        ?? 0);
$domains        = $body['domains'] ?? [];
$users          = $body['users']   ?? [];

if (!$name) {
    http_response_code(400);
    echo json_encode(['error' => 'Workspace name is required']);
    exit;
}

if ($organisationId <= 0) {
    http_response_code(400);
    echo json_encode(['error' => 'organisationId is required']);
    exit;
}

if (!is_array($domains) || count($domains) === 0) {
    http_response_code(400);
    echo json_encode(['error' => 'At least one domain is required']);
    exit;
}

// Validate and normalise domains
$normalisedDomains = [];
foreach ($domains as $d) {
    $domain = strtolower(trim((string)($d['domain'] ?? '')));
    if (!preg_match('/^[a-zA-Z0-9][a-zA-Z0-9\-_.]*\.[a-zA-Z]{2,}$/', $domain)) {
        http_response_code(400);
        echo json_encode(['error' => "Invalid domain format: $domain"]);
        exit;
    }
    $normalisedDomains[] = [
        'domain'    => $domain,
        'isPrimary' => !empty($d['isPrimary']),
    ];
}

// Ensure exactly one primary — first domain wins if none is flagged
$hasPrimary = false;
foreach ($normalisedDomains as $d) {
    if ($d['isPrimary']) { $hasPrimary = true; break; }
}
if (!$hasPrimary) {
    $normalisedDomains[0]['isPrimary'] = true;
}

// ── DB transaction ────────────────────────────────────────────────────────────
try {
    $db = getDb();
    $db->beginTransaction();

    // Check for conflicts: any of these domains already in another workspace?
    $domainNames  = array_column($normalisedDomains, 'domain');
    $placeholders = implode(',', array_fill(0, count($domainNames), '?'));
    $conflictStmt = $db->prepare(
        "SELECT wd.domain
         FROM workspace_domains wd
         JOIN workspaces w ON w.id = wd.workspace_id
         WHERE w.organisation_id = ? AND wd.domain IN ($placeholders)"
    );
    $conflictStmt->execute(array_merge([$organisationId], $domainNames));
    $conflicts = $conflictStmt->fetchAll(PDO::FETCH_COLUMN);

    if (!empty($conflicts)) {
        $db->rollBack();
        http_response_code(409);
        echo json_encode([
            'error'   => 'Domain(s) already assigned to another workspace in this organisation',
            'domains' => array_values($conflicts),
        ]);
        exit;
    }

    // created_by: use JWT sub claim if it looks like a local user integer, else NULL
    $createdBy = null;
    $jwtSub = $_jwtPayload['sub'] ?? $_jwtPayload['userId'] ?? $_jwtPayload['user_id'] ?? null;
    if ($jwtSub !== null && ctype_digit((string)$jwtSub) && (int)$jwtSub > 0) {
        $createdBy = (int)$jwtSub;
    }

    // Insert workspace
    $wsStmt = $db->prepare(
        'INSERT INTO workspaces (organisation_id, name, description, created_by)
         VALUES (?, ?, ?, ?)'
    );
    $wsStmt->execute([$organisationId, $name, $description ?: null, $createdBy]);
    $workspaceId = (int)$db->lastInsertId();

    // Insert domains
    $domainInsert = $db->prepare(
        'INSERT INTO workspace_domains (workspace_id, domain, is_primary) VALUES (?, ?, ?)'
    );
    foreach ($normalisedDomains as $d) {
        $domainInsert->execute([$workspaceId, $d['domain'], $d['isPrimary'] ? 1 : 0]);
    }

    // Insert users
    if (!empty($users) && is_array($users)) {
        $userInsert = $db->prepare(
            'INSERT IGNORE INTO workspace_users (workspace_id, user_email) VALUES (?, ?)'
        );
        foreach ($users as $u) {
            $email = strtolower(trim((string)($u['email'] ?? '')));
            if ($email) {
                $userInsert->execute([$workspaceId, $email]);
            }
        }
    }

    $db->commit();

    // Build response
    $usersOut = [];
    if (!empty($users) && is_array($users)) {
        foreach ($users as $u) {
            $email = strtolower(trim((string)($u['email'] ?? '')));
            if ($email) $usersOut[] = ['email' => $email];
        }
    }

    $now = date('Y-m-d H:i:s');

    http_response_code(201);
    echo json_encode([
        'workspace' => [
            'id'             => $workspaceId,
            'organisationId' => $organisationId,
            'name'           => $name,
            'description'    => $description ?: null,
            'createdAt'      => $now,
            'updatedAt'      => $now,
            'domains'        => $normalisedDomains,
            'users'          => $usersOut,
        ],
    ]);

} catch (\Throwable $e) {
    if (isset($db) && $db->inTransaction()) $db->rollBack();
    error_log('[create-workspace] ' . $e->getMessage());
    http_response_code(500);
    $resp = [
        'error'   => 'Internal server error',
        'detail'  => $e->getMessage(),
        'file'    => $e->getFile() . ':' . $e->getLine(),
        'type'    => get_class($e),
    ];
    if ($_DEBUG) $resp['debug'] = $_debugLog;
    echo json_encode($resp);
}
