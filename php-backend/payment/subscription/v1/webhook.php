<?php
/**
 * POST /payment/subscription/v1/webhook
 *
 * Stripe webhook handler. Register this URL in the Stripe Dashboard under
 * Developers → Webhooks, and enable the following events:
 *
 *   checkout.session.completed
 *   customer.subscription.created
 *   customer.subscription.updated
 *   customer.subscription.deleted
 *
 * Set the signing secret as STRIPE_WEBHOOK_SECRET in your server environment.
 * This endpoint must be publicly reachable by Stripe and must NOT require auth.
 */

define('ROOT_PATH', dirname(__DIR__, 3));

require_once ROOT_PATH . '/vendor/autoload.php';
require_once ROOT_PATH . '/shared/db.php';

// Load .env if vars aren't already injected by the server
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

header('Content-Type: application/json; charset=utf-8');

// Stripe only POSTs to webhooks
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    exit;
}

// ── Verify Stripe signature ──────────────────────────────────────────────────
$isLive = (($_ENV['STRIPE_MODE'] ?? getenv('STRIPE_MODE') ?: 'test') === 'live');
$stripeKey = $isLive
    ? ($_ENV['STRIPE_SECRET_KEY_LIVE'] ?? getenv('STRIPE_SECRET_KEY_LIVE'))
    : ($_ENV['STRIPE_SECRET_KEY_TEST'] ?? getenv('STRIPE_SECRET_KEY_TEST'));

$webhookSecret = $_ENV['STRIPE_WEBHOOK_SECRET'] ?? getenv('STRIPE_WEBHOOK_SECRET');

\Stripe\Stripe::setApiKey($stripeKey);

$payload   = file_get_contents('php://input');
$sigHeader = $_SERVER['HTTP_STRIPE_SIGNATURE'] ?? '';

try {
    $event = \Stripe\Webhook::constructEvent($payload, $sigHeader, $webhookSecret);
} catch (\Stripe\Exception\SignatureVerificationException $e) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid signature']);
    exit;
} catch (\Throwable $e) {
    http_response_code(400);
    echo json_encode(['error' => 'Malformed payload']);
    exit;
}

// ── Map Stripe price IDs → plan names ───────────────────────────────────────
// Keep in sync with create-checkout-session.php.
$planByPrice = [
    ($_ENV['STRIPE_PRICE_ID_STARTER_LIVE']       ?? getenv('STRIPE_PRICE_ID_STARTER_LIVE'))       => 'starter',
    ($_ENV['STRIPE_PRICE_ID_STARTER_TEST']        ?? getenv('STRIPE_PRICE_ID_STARTER_TEST'))        => 'starter',
    ($_ENV['STRIPE_PRICE_ID_GROWTH_LIVE']         ?? getenv('STRIPE_PRICE_ID_GROWTH_LIVE'))         => 'growth',
    ($_ENV['STRIPE_PRICE_ID_GROWTH_TEST']         ?? getenv('STRIPE_PRICE_ID_GROWTH_TEST'))         => 'growth',
    ($_ENV['STRIPE_PRICE_ID_AGENCY_PRO_LIVE']     ?? getenv('STRIPE_PRICE_ID_AGENCY_PRO_LIVE'))     => 'agency-pro',
    ($_ENV['STRIPE_PRICE_ID_AGENCY_PRO_TEST']     ?? getenv('STRIPE_PRICE_ID_AGENCY_PRO_TEST'))     => 'agency-pro',
    ($_ENV['STRIPE_PRICE_ID_AGENCY_PRO_6M_LIVE']  ?? getenv('STRIPE_PRICE_ID_AGENCY_PRO_6M_LIVE')) => 'agency-pro-6m',
    ($_ENV['STRIPE_PRICE_ID_AGENCY_PRO_6M_TEST']  ?? getenv('STRIPE_PRICE_ID_AGENCY_PRO_6M_TEST')) => 'agency-pro-6m',
];

// ── Event handlers ───────────────────────────────────────────────────────────
try {
    $db = getDb();

    switch ($event->type) {

        // Fired when the embedded checkout form completes (payment collected).
        // The subscription object is attached to the session.
        case 'checkout.session.completed':
            $session        = $event->data->object;
            $organisationId = (int)($session->client_reference_id ?? 0);
            $subId          = $session->subscription ?? null;
            $customerId     = $session->customer ?? null;

            if (!$organisationId || !$subId) break;

            // Fetch the subscription so we know which price/plan was purchased
            $subscription = \Stripe\Subscription::retrieve([
                'id'     => $subId,
                'expand' => ['items.data.price'],
            ]);

            $priceId    = $subscription->items->data[0]->price->id ?? null;
            $planName   = $planByPrice[$priceId] ?? 'active';
            $periodEnd  = $subscription->current_period_end ?? null;
            $subStatus  = $subscription->status ?? 'active';

            upsertSubscription($db, $organisationId, $subId, $customerId, $planName, $subStatus, $periodEnd);
            break;

        // Fired when a subscription is created outside of checkout (e.g. API).
        case 'customer.subscription.created':
            $subscription   = $event->data->object;
            $organisationId = (int)($subscription->metadata->organisation_id ?? 0);
            if (!$organisationId) break;

            $priceId   = $subscription->items->data[0]->price->id ?? null;
            $planName  = $planByPrice[$priceId] ?? 'active';
            $subStatus = $subscription->status;
            $periodEnd = $subscription->current_period_end;

            upsertSubscription(
                $db, $organisationId,
                $subscription->id, $subscription->customer,
                $planName, $subStatus, $periodEnd
            );
            break;

        // Fired on renewals, plan changes, cancellation scheduling, etc.
        case 'customer.subscription.updated':
            $subscription   = $event->data->object;
            $organisationId = (int)($subscription->metadata->organisation_id ?? 0);

            // Fall back to DB lookup if metadata wasn't set
            if (!$organisationId) {
                $organisationId = orgIdFromCustomer($db, $subscription->customer);
            }
            if (!$organisationId) break;

            $priceId   = $subscription->items->data[0]->price->id ?? null;
            $planName  = $planByPrice[$priceId] ?? 'active';
            $subStatus = $subscription->status;
            $periodEnd = $subscription->current_period_end;

            // If the subscription was cancelled immediately, treat as none
            if ($subStatus === 'canceled') {
                $planName = 'none';
            }

            upsertSubscription(
                $db, $organisationId,
                $subscription->id, $subscription->customer,
                $planName, $subStatus, $periodEnd
            );
            break;

        // Fired when a subscription ends (cancellation, non-payment, etc.).
        case 'customer.subscription.deleted':
            $subscription   = $event->data->object;
            $organisationId = (int)($subscription->metadata->organisation_id ?? 0);

            if (!$organisationId) {
                $organisationId = orgIdFromCustomer($db, $subscription->customer);
            }
            if (!$organisationId) break;

            upsertSubscription(
                $db, $organisationId,
                $subscription->id, $subscription->customer,
                'none', 'canceled', null
            );
            break;
    }

    http_response_code(200);
    echo json_encode(['received' => true]);

} catch (\Throwable $e) {
    error_log('[webhook] Unhandled error: ' . $e->getMessage());
    // Still return 200 so Stripe doesn't retry indefinitely
    http_response_code(200);
    echo json_encode(['received' => true, 'warning' => 'handler error logged']);
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Insert or update the organisation's subscription record.
 * 'subscription' column holds the plan name ("none", "starter", etc.) which
 * is what the existing /payment/subscription/v1/subscription endpoint reads.
 */
function upsertSubscription(
    PDO    $db,
    int    $organisationId,
    string $stripeSubscriptionId,
    string $stripeCustomerId,
    string $planName,
    string $stripeStatus,
    ?int   $currentPeriodEnd
): void {
    $periodEndDate = $currentPeriodEnd
        ? date('Y-m-d H:i:s', $currentPeriodEnd)
        : null;

    $db->prepare(
        'INSERT INTO subscriptions
             (organisation_id, stripe_subscription_id, stripe_customer_id,
              subscription, stripe_status, current_period_end)
         VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
             stripe_subscription_id = VALUES(stripe_subscription_id),
             stripe_customer_id     = VALUES(stripe_customer_id),
             subscription           = VALUES(subscription),
             stripe_status          = VALUES(stripe_status),
             current_period_end     = VALUES(current_period_end),
             updated_at             = NOW()'
    )->execute([
        $organisationId,
        $stripeSubscriptionId,
        $stripeCustomerId,
        $planName,
        $stripeStatus,
        $periodEndDate,
    ]);
}

/**
 * Look up organisation_id via the stripe_customers table when subscription
 * metadata doesn't carry it (older subscriptions, manual Stripe edits, etc.)
 */
function orgIdFromCustomer(PDO $db, string $customerId): int
{
    $stmt = $db->prepare(
        'SELECT organisation_id FROM stripe_customers WHERE stripe_customer_id = ? LIMIT 1'
    );
    $stmt->execute([$customerId]);
    return (int)($stmt->fetchColumn() ?: 0);
}
