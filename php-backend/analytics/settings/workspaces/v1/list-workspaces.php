<?php
/**
 * GET /analytics/settings/workspaces/v1/list-workspaces
 *
 * Returns all workspaces for the authenticated organisation,
 * including their domains and assigned users.
 *
 * Headers:
 *   Authorization: Bearer <token>
 *   Organisation:  <organisation_id>
 *
 * Response:
 *   { "workspaces": [ { id, name, description, domains, users, ... } ] }
 */

// ── CORS — must come before any output or requires ────────────────────────────
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
// ROOT_PATH = php-backend/  (4 levels up from analytics/settings/workspaces/v1/)
define('ROOT_PATH', dirname(__DIR__, 4));

// Load .env if environment variables are not already set by the server
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
if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
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

// ── Organisation ──────────────────────────────────────────────────────────────
$organisationId = (int)($_SERVER['HTTP_ORGANISATION'] ?? 0);

if ($organisationId <= 0) {
    http_response_code(400);
    echo json_encode(['error' => 'Missing Organisation header']);
    exit;
}

// ── Query ─────────────────────────────────────────────────────────────────────
try {
    $db = getDb();

    $stmt = $db->prepare(
        'SELECT id, organisation_id, name, description, created_by, created_at, updated_at
         FROM workspaces
         WHERE organisation_id = ?
         ORDER BY name ASC'
    );
    $stmt->execute([$organisationId]);
    $workspaces = $stmt->fetchAll();

    if (empty($workspaces)) {
        echo json_encode(['workspaces' => []]);
        exit;
    }

    $workspaceIds = array_column($workspaces, 'id');
    $placeholders = implode(',', array_fill(0, count($workspaceIds), '?'));

    $domainStmt = $db->prepare(
        "SELECT workspace_id, domain, is_primary, added_at
         FROM workspace_domains
         WHERE workspace_id IN ($placeholders)
         ORDER BY is_primary DESC, added_at ASC"
    );
    $domainStmt->execute($workspaceIds);
    $allDomains = $domainStmt->fetchAll();

    $userStmt = $db->prepare(
        "SELECT workspace_id, user_email, added_at
         FROM workspace_users
         WHERE workspace_id IN ($placeholders)
         ORDER BY added_at ASC"
    );
    $userStmt->execute($workspaceIds);
    $allUsers = $userStmt->fetchAll();

    // Group by workspace_id
    $domainsByWs = [];
    foreach ($allDomains as $d) {
        $domainsByWs[$d['workspace_id']][] = [
            'domain'    => $d['domain'],
            'isPrimary' => (bool)$d['is_primary'],
            'addedAt'   => $d['added_at'],
        ];
    }

    $usersByWs = [];
    foreach ($allUsers as $u) {
        $usersByWs[$u['workspace_id']][] = [
            'email'   => $u['user_email'],
            'addedAt' => $u['added_at'],
        ];
    }

    $result = array_map(function ($ws) use ($domainsByWs, $usersByWs) {
        return [
            'id'             => $ws['id'],
            'organisationId' => $ws['organisation_id'],
            'name'           => $ws['name'],
            'description'    => $ws['description'],
            'createdBy'      => $ws['created_by'],
            'createdAt'      => $ws['created_at'],
            'updatedAt'      => $ws['updated_at'],
            'domains'        => $domainsByWs[$ws['id']] ?? [],
            'users'          => $usersByWs[$ws['id']] ?? [],
        ];
    }, $workspaces);

    echo json_encode(['workspaces' => $result]);

} catch (\Throwable $e) {
    error_log('[list-workspaces] ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['error' => 'Internal server error']);
}
