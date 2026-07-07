<?php
/**
 * POST /payment/subscription/v1/create-checkout-session
 *
 * Creates a Stripe Checkout Session in embedded UI mode so the payment form
 * renders directly on the CMP platform without redirecting to Stripe.
 *
 * Request body (JSON):
 *   planId         string  "starter" | "growth" | "agency-pro" | "agency-pro-6m"
 *   organisationId int     The org the subscription belongs to
 *   email          string  Billing contact email
 *
 * Response (JSON):
 *   { "clientSecret": "<session.client_secret>" }
 */

// ── CORS — MUST come before any require_once or define ──────────────────────
// If vendor/autoload.php is missing or auth.php throws, the browser still gets
// the CORS headers and can read the error instead of being blocked by CORS.
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
header('Access-Control-Allow-Headers: Authorization, Content-Type');
header('Access-Control-Max-Age: 86400');
header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// ── Requires ─────────────────────────────────────────────────────────────────
define('ROOT_PATH', dirname(__DIR__, 3));

require_once ROOT_PATH . '/vendor/autoload.php';
require_once ROOT_PATH . '/shared/db.php';

// Load .env if vars aren't already set by the server (Apache SetEnv / system env)
if (!getenv('STRIPE_MODE') && !($_ENV['STRIPE_MODE'] ?? null)) {
    $envFile = ROOT_PATH . '/.env';
    if (file_exists($envFile)) {
        foreach (file($envFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
            $line = trim($line);
            if ($line === '' || str_starts_with($line, '#')) continue;
            if (!str_contains($line, '=')) continue;
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

// ── Method guard ─────────────────────────────────────────────────────────────
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

// ── Auth — same pattern as Authentication.php used by all other API endpoints ─
// Apache/CGI can put the header in either of these two server vars.
$_authHeader = $_SERVER['HTTP_AUTHORIZATION']
    ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION']
    ?? '';

// Last-resort fallback for some FastCGI setups
if (!$_authHeader && function_exists('getallheaders')) {
    $allHeaders = getallheaders();
    $_authHeader = $allHeaders['Authorization'] ?? $allHeaders['authorization'] ?? '';
}

preg_match('/Bearer\s(\S+)/', $_authHeader, $_authMatches);
$_jwtRaw = $_authMatches[1] ?? null;

if (!$_jwtRaw) {
    http_response_code(401);
    echo json_encode(['error' => 'Unauthorized']);
    exit;
}

// Decode token — mirrors JWTDecode() in Authentication.php
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

// ── Parse body ───────────────────────────────────────────────────────────────
$body = json_decode(file_get_contents('php://input'), true);

$planId         = trim((string)($body['planId']         ?? ''));
$organisationId = (int)($body['organisationId']         ?? 0);
$email          = trim((string)($body['email']          ?? ''));

if (!$planId || $organisationId <= 0) {
    http_response_code(400);
    echo json_encode(['error' => 'Missing required fields: planId, organisationId']);
    exit;
}

// ── Stripe mode + price ID mapping ───────────────────────────────────────────
$isLive = (($_ENV['STRIPE_MODE'] ?? getenv('STRIPE_MODE') ?: 'test') === 'live');

$priceIds = [
    'starter'       => $isLive
        ? ($_ENV['STRIPE_PRICE_ID_STARTER_LIVE']       ?? getenv('STRIPE_PRICE_ID_STARTER_LIVE'))
        : ($_ENV['STRIPE_PRICE_ID_STARTER_TEST']       ?? getenv('STRIPE_PRICE_ID_STARTER_TEST')),

    'growth'        => $isLive
        ? ($_ENV['STRIPE_PRICE_ID_GROWTH_LIVE']        ?? getenv('STRIPE_PRICE_ID_GROWTH_LIVE'))
        : ($_ENV['STRIPE_PRICE_ID_GROWTH_TEST']        ?? getenv('STRIPE_PRICE_ID_GROWTH_TEST')),

    'agency-pro'    => $isLive
        ? ($_ENV['STRIPE_PRICE_ID_AGENCY_PRO_LIVE']    ?? getenv('STRIPE_PRICE_ID_AGENCY_PRO_LIVE'))
        : ($_ENV['STRIPE_PRICE_ID_AGENCY_PRO_TEST']    ?? getenv('STRIPE_PRICE_ID_AGENCY_PRO_TEST')),

    'agency-pro-6m' => $isLive
        ? ($_ENV['STRIPE_PRICE_ID_AGENCY_PRO_6M_LIVE'] ?? getenv('STRIPE_PRICE_ID_AGENCY_PRO_6M_LIVE'))
        : ($_ENV['STRIPE_PRICE_ID_AGENCY_PRO_6M_TEST'] ?? getenv('STRIPE_PRICE_ID_AGENCY_PRO_6M_TEST')),
];

$priceId = $priceIds[$planId] ?? null;
if (!$priceId) {
    http_response_code(400);
    echo json_encode(['error' => 'Unknown plan: ' . $planId]);
    exit;
}

// ── Stripe client ─────────────────────────────────────────────────────────────
$stripeKey = $isLive
    ? ($_ENV['STRIPE_SECRET_KEY_LIVE'] ?? getenv('STRIPE_SECRET_KEY_LIVE'))
    : ($_ENV['STRIPE_SECRET_KEY_TEST'] ?? getenv('STRIPE_SECRET_KEY_TEST'));

\Stripe\Stripe::setApiKey($stripeKey);

// ── Resolve or create Stripe Customer for this organisation ───────────────────
try {
    $db = getDb();

    $stmt = $db->prepare(
        'SELECT stripe_customer_id FROM stripe_customers WHERE organisation_id = ? LIMIT 1'
    );
    $stmt->execute([$organisationId]);
    $row = $stmt->fetch();

    if ($row) {
        $customerId = $row['stripe_customer_id'];
    } else {
        $orgStmt = $db->prepare('SELECT name FROM organisations WHERE id = ? LIMIT 1');
        $orgStmt->execute([$organisationId]);
        $org = $orgStmt->fetch();

        $customer = \Stripe\Customer::create(array_filter([
            'email'    => $email ?: null,
            'name'     => $org['name'] ?? null,
            'metadata' => ['organisation_id' => (string)$organisationId],
        ]));

        $customerId = $customer->id;

        $db->prepare(
            'INSERT INTO stripe_customers (organisation_id, stripe_customer_id) VALUES (?, ?)'
        )->execute([$organisationId, $customerId]);
    }
} catch (\Throwable $e) {
    error_log('[create-checkout-session] DB error: ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['error' => 'Internal server error']);
    exit;
}

// ── Create the embedded Checkout Session ──────────────────────────────────────
try {
    $appUrl = rtrim(
        $_ENV['APP_URL'] ?? getenv('APP_URL') ?: 'https://www.intastellarconsents.com',
        '/'
    );

    $session = \Stripe\Checkout\Session::create([
        'customer'            => $customerId,
        'mode'                => 'subscription',
        'ui_mode'             => 'embedded',
        'line_items'          => [
            ['price' => $priceId, 'quantity' => 1],
        ],
        'client_reference_id' => (string)$organisationId,
        'return_url'          => $appUrl . '/gdpr/dashboard?session_id={CHECKOUT_SESSION_ID}',
        'subscription_data'   => [
            'metadata' => ['organisation_id' => (string)$organisationId],
        ],
    ]);

    echo json_encode(['clientSecret' => $session->client_secret]);
} catch (\Stripe\Exception\ApiErrorException $e) {
    error_log('[create-checkout-session] Stripe error: ' . $e->getMessage());
    http_response_code(502);
    echo json_encode(['error' => 'Payment provider error: ' . $e->getMessage()]);
}
