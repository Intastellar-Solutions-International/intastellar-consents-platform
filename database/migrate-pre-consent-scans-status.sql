-- Allow organisation_id to be NULL for public/unassociated scans
ALTER TABLE pre_consent_scans
    ALTER COLUMN organisation_id DROP NOT NULL;

-- Expand status to include in-progress states
ALTER TABLE pre_consent_scans
    DROP CONSTRAINT IF EXISTS pre_consent_scans_status_check;

ALTER TABLE pre_consent_scans
    ADD CONSTRAINT pre_consent_scans_status_check
    CHECK (status IN ('pending', 'in_progress', 'completed', 'failed'));
