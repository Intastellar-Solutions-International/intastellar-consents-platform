-- ============================================
-- Workspaces & Domain Verification Tables
-- ============================================
-- Run this SQL to create the necessary tables for
-- agency workspaces and domain verification features.
-- ============================================

-- ---------------------------------------------
-- Table: workspaces
-- Stores client workspaces for agency users
-- ---------------------------------------------
CREATE TABLE IF NOT EXISTS workspaces (
    id INT AUTO_INCREMENT PRIMARY KEY,
    organisation_id INT NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT DEFAULT NULL,
    created_by INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    -- Foreign keys
    CONSTRAINT fk_workspace_organisation
        FOREIGN KEY (organisation_id) REFERENCES organisations(id)
        ON DELETE CASCADE,
    CONSTRAINT fk_workspace_created_by
        FOREIGN KEY (created_by) REFERENCES users(id)
        ON DELETE SET NULL,

    -- Indexes
    INDEX idx_workspace_organisation (organisation_id),
    INDEX idx_workspace_created_by (created_by)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ---------------------------------------------
-- Table: workspace_domains
-- Links domains to workspaces (many-to-many)
-- ---------------------------------------------
CREATE TABLE IF NOT EXISTS workspace_domains (
    id INT AUTO_INCREMENT PRIMARY KEY,
    workspace_id INT NOT NULL,
    domain VARCHAR(255) NOT NULL,
    is_primary TINYINT(1) DEFAULT 0,
    added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Foreign keys
    CONSTRAINT fk_workspace_domain_workspace
        FOREIGN KEY (workspace_id) REFERENCES workspaces(id)
        ON DELETE CASCADE,

    -- Unique constraint: domain can only be in one workspace per organisation
    -- (enforced at application level, but we prevent duplicates within workspace)
    UNIQUE KEY uk_workspace_domain (workspace_id, domain),

    -- Indexes
    INDEX idx_workspace_domain_workspace (workspace_id),
    INDEX idx_workspace_domain_domain (domain)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ---------------------------------------------
-- Table: workspace_users
-- Links users to workspaces (many-to-many)
-- ---------------------------------------------
CREATE TABLE IF NOT EXISTS workspace_users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    workspace_id INT NOT NULL,
    user_email VARCHAR(255) NOT NULL,
    added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Foreign keys
    CONSTRAINT fk_workspace_user_workspace
        FOREIGN KEY (workspace_id) REFERENCES workspaces(id)
        ON DELETE CASCADE,

    -- Unique constraint: user can only be added once per workspace
    UNIQUE KEY uk_workspace_user (workspace_id, user_email),

    -- Indexes
    INDEX idx_workspace_user_workspace (workspace_id),
    INDEX idx_workspace_user_email (user_email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ---------------------------------------------
-- Table: domain_verifications
-- Tracks domain ownership verification status
-- ---------------------------------------------
CREATE TABLE IF NOT EXISTS domain_verifications (
    id INT AUTO_INCREMENT PRIMARY KEY,
    domain VARCHAR(255) NOT NULL,
    organisation_id INT NOT NULL,
    verification_token VARCHAR(100) NOT NULL,
    verified TINYINT(1) DEFAULT 0,
    verified_at TIMESTAMP NULL DEFAULT NULL,
    last_checked_at TIMESTAMP NULL DEFAULT NULL,
    next_verification_due TIMESTAMP NULL DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    -- Foreign keys
    CONSTRAINT fk_verification_organisation
        FOREIGN KEY (organisation_id) REFERENCES organisations(id)
        ON DELETE CASCADE,

    -- Unique constraint: one verification record per domain + organisation
    UNIQUE KEY uk_domain_organisation (domain, organisation_id),

    -- Unique token
    UNIQUE KEY uk_verification_token (verification_token),

    -- Indexes
    INDEX idx_verification_domain (domain),
    INDEX idx_verification_organisation (organisation_id),
    INDEX idx_verification_verified (verified),
    INDEX idx_verification_next_due (next_verification_due)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ---------------------------------------------
-- Optional: View for workspace summary
-- ---------------------------------------------
CREATE OR REPLACE VIEW v_workspace_summary AS
SELECT
    w.id,
    w.organisation_id,
    w.name,
    w.description,
    w.created_at,
    w.updated_at,
    COUNT(DISTINCT wd.id) AS domain_count,
    COUNT(DISTINCT wu.id) AS user_count,
    (
        SELECT wd2.domain
        FROM workspace_domains wd2
        WHERE wd2.workspace_id = w.id AND wd2.is_primary = 1
        LIMIT 1
    ) AS primary_domain
FROM workspaces w
LEFT JOIN workspace_domains wd ON w.id = wd.workspace_id
LEFT JOIN workspace_users wu ON w.id = wu.workspace_id
GROUP BY w.id;


-- ---------------------------------------------
-- Optional: View for domains needing re-verification
-- ---------------------------------------------
CREATE OR REPLACE VIEW v_domains_need_reverification AS
SELECT
    dv.*,
    DATEDIFF(dv.next_verification_due, NOW()) AS days_until_due
FROM domain_verifications dv
WHERE dv.verified = 1
  AND dv.next_verification_due IS NOT NULL
  AND dv.next_verification_due <= DATE_ADD(NOW(), INTERVAL 3 DAY)
ORDER BY dv.next_verification_due ASC;


-- ============================================
-- Sample queries for reference
-- ============================================

-- Get all workspaces for an organisation with domain/user counts:
-- SELECT * FROM v_workspace_summary WHERE organisation_id = ?;

-- Get workspace with all its domains:
-- SELECT w.*, wd.domain, wd.is_primary
-- FROM workspaces w
-- JOIN workspace_domains wd ON w.id = wd.workspace_id
-- WHERE w.id = ?;

-- Get verification status for a domain:
-- SELECT * FROM domain_verifications
-- WHERE domain = ? AND organisation_id = ?;

-- Check if domain is verified (and not expired):
-- SELECT * FROM domain_verifications
-- WHERE domain = ?
--   AND organisation_id = ?
--   AND verified = 1
--   AND (next_verification_due IS NULL OR next_verification_due > NOW());

-- Get all domains needing re-verification soon:
-- SELECT * FROM v_domains_need_reverification WHERE organisation_id = ?;

-- Generate verification token (do this in application code):
-- Token format: inta_{org_id}_{timestamp_base36}_{random_string}
-- Example: inta_1_m5x7k2_a1b2c3d4
