<?php
/**
 * POST /analytics/settings/workspaces/v1/delete-workspace
 *
 * Permanently deletes a workspace and all its associated domains and users
 * (cascade is handled by the FK constraints defined in the schema).
 * Removes any domain_verifications records that are no longer attached to
 * any workspace domain within the organisation.
 *
 * Body (JSON):
 *   workspaceId    int   required
 *   organisationId int   required (ownership check)
 *
 * Response 200:
 *   { "success": true }
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

$workspaceId    = (int)($body['workspaceId']    ?? 0);
$organisationId = (int)($body['organisationId'] ?? 0);

if ($workspaceId <= 0) {
    http_response_code(400);
    echo json_encode(['error' => 'workspaceId is required']);
    exit;
}

if ($organisationId <= 0) {
    http_response_code(400);
    echo json_encode(['error' => 'organisationId is required']);
    exit;
}

// ── Delete ────────────────────────────────────────────────────────────────────
try {
    $db = getDb();
    $db->beginTransaction();

    // Ownership check
    $ownerStmt = $db->prepare(
        'SELECT id FROM workspaces WHERE id = ? AND organisation_id = ? LIMIT 1'
    );
    $ownerStmt->execute([$workspaceId, $organisationId]);
    if (!$ownerStmt->fetch()) {
        $db->rollBack();
        http_response_code(404);
        echo json_encode(['error' => 'Workspace not found']);
        exit;
    }

    // Collect the domains of this workspace so we can clean up orphaned
    // domain_verifications records that are no longer used by any workspace.
    $domainStmt = $db->prepare(
        'SELECT domain FROM workspace_domains WHERE workspace_id = ?'
    );
    $domainStmt->execute([$workspaceId]);
    $workspaceDomains = $domainStmt->fetchAll(PDO::FETCH_COLUMN);

    // Delete the workspace — FK CASCADE removes workspace_domains and workspace_users
    $db->prepare('DELETE FROM workspaces WHERE id = ?')->execute([$workspaceId]);

    // Remove domain_verifications for domains that are now orphaned (no longer
    // attached to any workspace domain in this organisation).
    if (!empty($workspaceDomains)) {
        $ph = implode(',', array_fill(0, count($workspaceDomains), '?'));
        $orphanStmt = $db->prepare(
            "DELETE dv FROM domain_verifications dv
             WHERE dv.organisation_id = ?
               AND dv.domain IN ($ph)
               AND NOT EXISTS (
                   SELECT 1 FROM workspace_domains wd
                   JOIN workspaces w ON w.id = wd.workspace_id
                   WHERE w.organisation_id = dv.organisation_id
                     AND wd.domain = dv.domain
               )"
        );
        $orphanStmt->execute(array_merge([$organisationId], $workspaceDomains));
    }

    $db->commit();

    echo json_encode(['success' => true]);

} catch (\Throwable $e) {
    if (isset($db) && $db->inTransaction()) $db->rollBack();
    error_log('[delete-workspace] ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['error' => 'Internal server error']);
}
