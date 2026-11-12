-- Audit log evidence: which banner configuration a consent was given under.
--
-- Safe to run before or after uploading collect.php and
-- getDomainStatistics.php: both check that the column exists before using it.
-- Nothing is changed except the new column. Records stay NULL ("not
-- recorded") until the banner sends configVersion; there is no way to
-- backfill which config older consents saw.

ALTER TABLE user_consents_tracking
    -- First 12 hex characters of the SHA-256 of the banner settings the visitor
    -- was shown, as reported by the banner (configVersion in the consent
    -- payload). See bannerConfigVersion() in consents/collect.php.
    ADD COLUMN banner_config_version CHAR(12) NULL;
