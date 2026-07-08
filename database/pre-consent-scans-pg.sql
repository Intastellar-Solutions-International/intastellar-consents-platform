-- ============================================================
-- Pre-consent scan results (PostgreSQL / Neon)
-- Converted from MySQL: AUTO_INCREMENT→SERIAL, ENUM→CHECK,
-- JSON→JSONB, DATETIME→TIMESTAMP. FK constraints omitted
-- since organisations/workspaces are on the separate MySQL host.
-- ============================================================

CREATE TABLE IF NOT EXISTS pre_consent_scans (
    id                SERIAL          PRIMARY KEY,
    domain            VARCHAR(255)    NOT NULL,
    organisation_id   INTEGER         NOT NULL,
    workspace_id      INTEGER         DEFAULT NULL,
    scanned_at        TIMESTAMP       NOT NULL,
    scan_duration_ms  INTEGER         DEFAULT NULL,
    status            VARCHAR(20)     NOT NULL DEFAULT 'completed'
                          CHECK (status IN ('completed', 'failed')),

    -- JSONB array of { host, service, category, resourceType }
    transfers         JSONB           DEFAULT NULL,

    error_message     TEXT            DEFAULT NULL,
    created_at        TIMESTAMP       NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pcs_domain_org
    ON pre_consent_scans (domain, organisation_id);

CREATE INDEX IF NOT EXISTS idx_pcs_org_scanned
    ON pre_consent_scans (organisation_id, scanned_at);

CREATE INDEX IF NOT EXISTS idx_pcs_workspace
    ON pre_consent_scans (workspace_id);
