/**
 * Domain Verification Utility
 *
 * Handles domain ownership verification for organisations and workspaces.
 * Uses the backend API as the source of truth; localStorage is a read-through
 * cache so synchronous render calls (getVerificationStatusLabel) stay fast.
 */

import Authentication from "../Authentication/Auth";
import { PrimaryHost } from "../API/host";

const STORAGE_KEY = "domain_verifications";
const REVERIFICATION_DAYS = 14;

// ── Cache helpers ─────────────────────────────────────────────────────────────

function getStoredVerifications() {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) return JSON.parse(stored);
    } catch { /* ignore */ }
    return {};
}

function saveVerifications(verifications) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(verifications));
    } catch { /* ignore */ }
}

function createKey(domain, organisationId) {
    return `${organisationId}:${domain.toLowerCase()}`;
}

// ── Auth headers (fresh at call time) ────────────────────────────────────────

function authHeaders() {
    return {
        "Authorization": Authentication.getToken(),
        "Content-Type": "application/json",
    };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Writes a verification record from an external source (e.g. workspace list
 * response) into the local cache without hitting the backend.
 * Only overwrites if the incoming data is newer or the cache is empty.
 */
export function populateVerificationCache(domain, organisationId, data) {
    const verifications = getStoredVerifications();
    const key = createKey(domain, organisationId);
    const existing = verifications[key];

    // Don't overwrite a more recent local check with stale backend data
    if (
        existing?.lastCheckedAt &&
        data.lastCheckedAt &&
        existing.lastCheckedAt >= data.lastCheckedAt
    ) {
        return;
    }

    verifications[key] = {
        domain:              domain.toLowerCase(),
        organisationId,
        token:               data.token,
        verified:            data.verified,
        verifiedAt:          data.verifiedAt ?? null,
        lastCheckedAt:       data.lastCheckedAt ?? null,
        nextVerificationDue: data.nextVerificationDue ?? null,
        createdAt:           data.createdAt ?? null,
    };
    saveVerifications(verifications);
}

/**
 * Reads the cached verification record for a domain (sync, for rendering).
 */
export function getVerificationStatus(domain, organisationId) {
    const verifications = getStoredVerifications();
    return verifications[createKey(domain, organisationId)] || null;
}

/**
 * Returns true when a domain is verified and the verification hasn't expired.
 */
export function isDomainVerified(domain, organisationId) {
    const status = getVerificationStatus(domain, organisationId);
    if (!status || !status.verified) return false;

    if (status.nextVerificationDue) {
        return new Date() <= new Date(status.nextVerificationDue);
    }
    return true;
}

/**
 * Returns true when the domain was verified but the re-verification window
 * has passed.
 */
export function isVerificationExpired(domain, organisationId) {
    const status = getVerificationStatus(domain, organisationId);
    if (!status || !status.verified) return false;

    if (status.nextVerificationDue) {
        return new Date() > new Date(status.nextVerificationDue);
    }
    return false;
}

/**
 * Gets or creates a verification record via the backend, then writes the
 * result into the local cache and returns it.
 *
 * @returns {Promise<object>} Verification record
 */
export async function getOrCreateVerificationRecord(domain, organisationId) {
    const domainLower = domain.toLowerCase();

    // Return cached record if it already has a token
    const cached = getVerificationStatus(domainLower, organisationId);
    if (cached?.token) return cached;

    const res = await fetch(
        `${PrimaryHost}/analytics/settings/domain-verification/v1/init`,
        {
            method: "POST",
            headers: authHeaders(),
            body: JSON.stringify({ domain: domainLower, organisationId }),
        }
    );

    if (!res.ok) {
        throw new Error("Failed to initialise verification record");
    }

    const data = await res.json();

    // Populate cache
    const verifications = getStoredVerifications();
    const key = createKey(domainLower, organisationId);
    verifications[key] = {
        domain:              data.domain,
        organisationId,
        token:               data.token,
        verified:            data.verified,
        verifiedAt:          data.verifiedAt,
        lastCheckedAt:       data.lastCheckedAt,
        nextVerificationDue: data.nextVerificationDue,
        createdAt:           data.createdAt,
    };
    saveVerifications(verifications);

    return verifications[key];
}

/**
 * Triggers a live verification check via the backend.
 * Updates the local cache with the result.
 *
 * @returns {Promise<{success: boolean, message: string, verifiedAt?, nextVerificationDue?}>}
 */
export async function checkDomainVerification(domain, organisationId) {
    const domainLower = domain.toLowerCase();

    // Always call /init directly (bypassing the localStorage cache) before
    // checking. /init is idempotent — it returns the existing record if one
    // exists in the DB. This self-heals the case where the localStorage was
    // populated by the old simulation but the DB record never existed, or
    // was lost. Without this, a cached-but-stale token would reach /check
    // and get a 404.
    try {
        const initRes = await fetch(
            `${PrimaryHost}/analytics/settings/domain-verification/v1/init`,
            {
                method: "POST",
                headers: authHeaders(),
                body: JSON.stringify({ domain: domainLower, organisationId }),
            }
        );
        if (initRes.ok) {
            const initData = await initRes.json();
            const verifications = getStoredVerifications();
            const key = createKey(domainLower, organisationId);
            verifications[key] = {
                domain:              initData.domain,
                organisationId,
                token:               initData.token,
                verified:            initData.verified,
                verifiedAt:          initData.verifiedAt,
                lastCheckedAt:       initData.lastCheckedAt,
                nextVerificationDue: initData.nextVerificationDue,
                createdAt:           initData.createdAt,
            };
            saveVerifications(verifications);
        }
    } catch (_) { /* network error — proceed anyway, /check will give a clear error */ }

    const verifications = getStoredVerifications();
    const key = createKey(domainLower, organisationId);

    if (!verifications[key]?.token) {
        return {
            success: false,
            message: "Could not create a verification token. Please try again.",
        };
    }

    const res = await fetch(
        `${PrimaryHost}/analytics/settings/domain-verification/v1/check`,
        {
            method: "POST",
            headers: authHeaders(),
            body: JSON.stringify({ domain: domainLower, organisationId }),
        }
    );

    const data = await res.json();

    if (!res.ok) {
        return {
            success: false,
            message: data.detail || data.error || "Verification check failed.",
        };
    }

    // Update cache
    if (data.success) {
        verifications[key] = {
            ...verifications[key],
            verified:            true,
            verifiedAt:          data.verifiedAt,
            lastCheckedAt:       data.verifiedAt,
            nextVerificationDue: data.nextVerificationDue,
        };
    } else {
        verifications[key] = {
            ...verifications[key],
            lastCheckedAt: new Date().toISOString(),
        };
    }
    saveVerifications(verifications);

    return data;
}

/**
 * Returns a UI label object for the current verification state of a domain.
 * Reads from the local cache (synchronous, safe to call during render).
 */
export function getVerificationStatusLabel(domain, organisationId) {
    const status = getVerificationStatus(domain, organisationId);

    if (!status?.token) {
        // No verification record exists yet — render nothing
        return { label: "", type: "none", icon: "" };
    }

    if (!status.verified) {
        return { label: "Unverified", type: "unverified", icon: "?" };
    }

    if (isVerificationExpired(domain, organisationId)) {
        return { label: "Expired", type: "expired", icon: "!" };
    }

    return { label: "Verified", type: "verified", icon: "✓" };
}

/**
 * Returns the number of days until re-verification is required, or null.
 */
export function getDaysUntilReverification(domain, organisationId) {
    const status = getVerificationStatus(domain, organisationId);
    if (!status?.nextVerificationDue) return null;

    const diffMs = new Date(status.nextVerificationDue) - new Date();
    return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Returns all locally-cached domains that need re-verification within X days.
 */
export function getDomainsNeedingReverification(withinDays = 3) {
    const verifications = getStoredVerifications();
    const needsReverification = [];

    for (const key in verifications) {
        const record = verifications[key];
        if (record.verified && record.nextVerificationDue) {
            const daysUntil = getDaysUntilReverification(record.domain, record.organisationId);
            if (daysUntil !== null && daysUntil <= withinDays) {
                needsReverification.push({ ...record, daysUntilDue: daysUntil });
            }
        }
    }

    return needsReverification;
}
