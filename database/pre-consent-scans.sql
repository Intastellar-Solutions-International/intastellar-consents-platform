-- ============================================================
-- Pre-consent scan results
-- Stores the output of domain-level pre-consent transfer scans.
-- One row per scan run; GET endpoint reads the most recent row
-- for a given domain + organisation pair.
-- ============================================================

CREATE TABLE IF NOT EXISTS pre_consent_scans (
    id                INT            AUTO_INCREMENT PRIMARY KEY,
    domain            VARCHAR(255)   NOT NULL,
    organisation_id   INT            NOT NULL,
    workspace_id      INT            DEFAULT NULL,
    scanned_at        DATETIME       NOT NULL,
    scan_duration_ms  INT            DEFAULT NULL,
    status            ENUM('completed', 'failed') NOT NULL DEFAULT 'completed',

    -- JSON array of { host, service, category, resourceType }
    transfers         JSON           DEFAULT NULL,

    error_message     TEXT           DEFAULT NULL,
    created_at        TIMESTAMP      DEFAULT CURRENT_TIMESTAMP,

    INDEX idx_domain_org       (domain, organisation_id),
    INDEX idx_org_scanned      (organisation_id, scanned_at),
    INDEX idx_workspace        (workspace_id),

    CONSTRAINT fk_pcs_organisation
        FOREIGN KEY (organisation_id) REFERENCES organisations(id) ON DELETE CASCADE,
    CONSTRAINT fk_pcs_workspace
        FOREIGN KEY (workspace_id)    REFERENCES workspaces(id)    ON DELETE SET NULL

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
