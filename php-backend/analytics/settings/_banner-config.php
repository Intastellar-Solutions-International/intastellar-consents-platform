<?php
/**
 * Shared by add-domain.php and legal-basis-sync.php: who may change an organisation's
 * banner, and writing the domain's config.js that the banner loads before uc.js.
 *
 * config.js is plain JavaScript and some files are edited by hand, so it is never parsed.
 * The legal basis services live in their own marked block at the end, replaced in place:
 *
 *   window.INTA = { … };                       ← add-domain / hand edits
 *   /* @intastellar:legal-basis:start *\/
 *   … settings.legalBasis …                    ← legal-basis-sync, from the platform
 *   /* @intastellar:legal-basis:end *\/
 */

require_once dirname(__DIR__, 2) . '/shared/auth.php';

const MEMBERSHIP_URL = 'https://apis.intastellarsolutions.com/analytics/settings/getOrganisation';
const LEGAL_BASIS_URL = 'https://www.intastellarconsents.com/api/legal-basis?organisation=';
const LEGAL_BASIS_START = '/* @intastellar:legal-basis:start */';
const LEGAL_BASIS_END = '/* @intastellar:legal-basis:end */';
const DOMAIN_PATTERN = '/^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{1,62}$/';

function respond(int $status, $body): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($body);
    exit;
}

function sendBannerCors(): void
{
    $allowed = [
        'https://www.intastellarconsents.com',
        'https://consentsplatform.com',
        'https://platform.intastellarconsents.com',
        'http://localhost:8080',
        'http://localhost:3000',
    ];
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    if (in_array($origin, $allowed, true)) header('Access-Control-Allow-Origin: ' . $origin);
    header('Access-Control-Allow-Methods: POST, OPTIONS');
    header('Access-Control-Allow-Headers: Authorization, Content-Type, Organisation, X-User-Email');
    header('Access-Control-Max-Age: 86400');
    if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
        http_response_code(204);
        exit;
    }
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') respond(405, ['error' => 'Method not allowed']);
}

/**
 * Stops the request unless the signed-in user belongs to $organisationId, the same check as
 * api/_member-auth.js: a valid token, then membership confirmed by getOrganisation.
 */
function requireOrganisationMember(int $organisationId): string
{
    $token = getAuthToken();
    $claims = $token ? validateToken($token) : null;
    if (!$claims || $organisationId <= 0) respond(401, ['error' => 'Unauthorized']);

    $email = null;
    foreach ([$claims->email ?? null, $claims->user->email ?? null, $claims->data->email ?? null, $claims->sub ?? null] as $candidate) {
        if (is_string($candidate) && str_contains($candidate, '@')) {
            $email = $candidate;
            break;
        }
    }
    $fromClient = trim($_SERVER['HTTP_X_USER_EMAIL'] ?? '');
    if ($email && $fromClient && strcasecmp($email, $fromClient) !== 0) respond(401, ['error' => 'Unauthorized']);
    $email = $email ?: $fromClient;
    if (!$email) respond(401, ['error' => 'Unauthorized']);

    $ch = curl_init(MEMBERSHIP_URL);
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 10,
        CURLOPT_HTTPHEADER => ['Authorization: Bearer ' . $token, 'Content-Type: application/json'],
        CURLOPT_POSTFIELDS => json_encode(['organisationMember' => $email]),
    ]);
    $body = curl_exec($ch);
    $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    if ($body === false) respond(503, ['error' => 'Membership could not be confirmed']);

    $response = json_decode($body, true);
    $list = is_array($response) ? ($response['organisations'] ?? $response['data'] ?? (array_is_list($response) ? $response : [])) : [];
    foreach ($list as $organisation) {
        if ((int) ($organisation['id'] ?? $organisation['organisationId'] ?? 0) !== $organisationId) continue;
        if (!isset($organisation['users']) || !is_array($organisation['users'])) return $email;
        foreach ($organisation['users'] as $user) {
            if (strcasecmp((string) ($user['email'] ?? ''), $email) === 0) return $email;
        }
    }
    respond($status >= 500 ? 503 : 403, ['error' => 'Forbidden']);
}

/** "https://www.Exämple.com/x" → "xn--exmple-cua.com"; null when it isn't a domain. Only these ever reach a file path. */
function normalizeBannerDomain($raw): ?string
{
    $host = mb_strtolower(trim((string) $raw));
    $host = preg_replace('#^[a-z][a-z0-9+.-]*://#', '', $host);
    $host = preg_split('#[/?\#:]#', $host)[0];
    $host = preg_replace('/^www\./', '', rtrim($host, '.'));
    $ascii = function_exists('idn_to_ascii') ? idn_to_ascii($host, IDNA_DEFAULT, INTL_IDNA_VARIANT_UTS46) : $host;
    return ($ascii && preg_match(DOMAIN_PATTERN, $ascii)) ? $ascii : null;
}

function bannerConfigPath(string $domain): string
{
    return $_SERVER['DOCUMENT_ROOT'] . '/downloads/cookieconsents/' . $domain . '/config.js';
}

/** The marked block that sets settings.legalBasis, or "" when there's nothing to set. */
function legalBasisBlock(?array $legalBasis): string
{
    if (!$legalBasis || empty($legalBasis['services'])) return '';
    $json = json_encode($legalBasis, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_HEX_TAG);
    return LEGAL_BASIS_START . "\n"
        . "window.INTA = window.INTA || {};\n"
        . "window.INTA.settings = window.INTA.settings || {};\n"
        . "window.INTA.settings.legalBasis = " . $json . ";\n"
        . LEGAL_BASIS_END . "\n";
}

/** $content without its legal basis block. */
function withoutLegalBasisBlock(string $content): string
{
    $start = strpos($content, LEGAL_BASIS_START);
    $end = strpos($content, LEGAL_BASIS_END);
    if ($start === false || $end === false || $end < $start) return $content;
    return rtrim(substr($content, 0, $start) . substr($content, $end + strlen(LEGAL_BASIS_END))) . "\n";
}

/** The legal basis block already in $content, or "". */
function existingLegalBasisBlock(string $content): string
{
    $start = strpos($content, LEGAL_BASIS_START);
    $end = strpos($content, LEGAL_BASIS_END);
    if ($start === false || $end === false || $end < $start) return '';
    return substr($content, $start, $end + strlen(LEGAL_BASIS_END) - $start) . "\n";
}

/** Writes through a temp file and rename, so the banner never loads a half-written config.js. */
function writeBannerConfig(string $domain, string $content): bool
{
    $path = bannerConfigPath($domain);
    if (!is_dir(dirname($path)) && !mkdir(dirname($path), 0755, true)) return false;
    $tmp = $path . '.' . bin2hex(random_bytes(4)) . '.tmp';
    if (file_put_contents($tmp, $content, LOCK_EX) === false) return false;
    return rename($tmp, $path);
}

/** Replaces only the legal basis block of a domain's config.js. A domain without config.js is skipped. */
function syncLegalBasis(string $domain, ?array $legalBasis): bool
{
    $path = bannerConfigPath($domain);
    if (!is_file($path)) return false;
    $current = file_get_contents($path);
    $next = rtrim(withoutLegalBasisBlock($current)) . "\n" . legalBasisBlock($legalBasis);
    return $next === $current || writeBannerConfig($domain, $next);
}

/** The organisation's block from the platform. Null when it can't be read, so callers leave files alone. */
function fetchLegalBasis(int $organisationId): ?array
{
    $ch = curl_init(LEGAL_BASIS_URL . $organisationId);
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 10]);
    $body = curl_exec($ch);
    $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    if ($body === false || $status !== 200) return null;
    $data = json_decode($body, true);
    return is_array($data['legalBasis'] ?? null) ? $data['legalBasis'] : null;
}
