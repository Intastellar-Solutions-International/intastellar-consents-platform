-- ─────────────────────────────────────────────────────────────────────────────
-- Stripe subscription tables
-- Run once on the API server database.
-- ─────────────────────────────────────────────────────────────────────────────

-- Maps each organisation to its Stripe Customer object.
-- Created the first time an organisation starts a checkout session.
CREATE TABLE IF NOT EXISTS stripe_customers (
    id                  INT UNSIGNED    NOT NULL AUTO_INCREMENT,
    organisation_id     INT UNSIGNED    NOT NULL,
    stripe_customer_id  VARCHAR(255)    NOT NULL,
    created_at          DATETIME        NOT NULL DEFAULT NOW(),

    PRIMARY KEY (id),
    UNIQUE KEY uq_organisation   (organisation_id),
    UNIQUE KEY uq_stripe_customer (stripe_customer_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Stores the active subscription state per organisation.
-- The `subscription` column holds the plan name and is read by the existing
-- /payment/subscription/v1/subscription endpoint ("none", "starter", etc.).
-- If you already have a subscriptions table, add the missing columns instead.
CREATE TABLE IF NOT EXISTS subscriptions (
    id                      INT UNSIGNED    NOT NULL AUTO_INCREMENT,
    organisation_id         INT UNSIGNED    NOT NULL,
    stripe_subscription_id  VARCHAR(255)    DEFAULT NULL,
    stripe_customer_id      VARCHAR(255)    DEFAULT NULL,
    subscription            VARCHAR(50)     NOT NULL DEFAULT 'none',
    stripe_status           VARCHAR(50)     DEFAULT NULL,   -- active | past_due | canceled | ...
    current_period_end      DATETIME        DEFAULT NULL,
    created_at              DATETIME        NOT NULL DEFAULT NOW(),
    updated_at              DATETIME        NOT NULL DEFAULT NOW() ON UPDATE NOW(),

    PRIMARY KEY (id),
    UNIQUE KEY uq_organisation (organisation_id),
    KEY idx_stripe_subscription (stripe_subscription_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
