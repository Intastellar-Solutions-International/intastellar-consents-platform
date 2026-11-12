-- Audit log evidence: which banner configuration a consent was given under.
--
-- Safe to run before or after uploading collect.php and
-- getDomainStatistics.php: both check that the column exists before using it.
-- Nothing is changed except the new column. Older records stay NULL
-- ("not recorded"); there is no way to backfill which config they saw.

ALTER TABLE user_consents_tracking
    -- First 12 hex characters of the SHA-256 of the domain's config.js on the
    -- server when the consent was recorded. See bannerConfigVersion() in
    -- consents/collect.php.
    ADD COLUMN banner_config_version CHAR(12) NULL;
