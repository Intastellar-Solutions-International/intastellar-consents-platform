/**
 * Domain Verification Utility
 *
 * Handles domain ownership verification for organisations and workspaces.
 * Currently uses localStorage for storage - will be replaced with backend API.
 */

const STORAGE_KEY = "domain_verifications";
const REVERIFICATION_DAYS = 14; // Re-verify every 14 days

/**
 * Generate a unique verification token for a domain + organisation combination
 */
export function generateVerificationToken(domain, organisationId) {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 10);
    return `inta_${organisationId}_${timestamp}_${random}`;
}

/**
 * Get all stored verification records
 */
function getStoredVerifications() {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            return JSON.parse(stored);
        }
    } catch {
        /* ignore */
    }
    return {};
}

/**
 * Save verification records to localStorage
 */
function saveVerifications(verifications) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(verifications));
    } catch {
        /* ignore */
    }
}

/**
 * Create a unique key for domain + organisation combination
 */
function createKey(domain, organisationId) {
    return `${organisationId}:${domain.toLowerCase()}`;
}

/**
 * Get verification status for a domain
 * @returns {Object|null} Verification record or null if not found
 */
export function getVerificationStatus(domain, organisationId) {
    const verifications = getStoredVerifications();
    const key = createKey(domain, organisationId);
    return verifications[key] || null;
}

/**
 * Check if a domain is verified and verification hasn't expired
 */
export function isDomainVerified(domain, organisationId) {
    const status = getVerificationStatus(domain, organisationId);
    if (!status || !status.verified) {
        return false;
    }

    // Check if re-verification is needed
    if (status.nextVerificationDue) {
        const dueDate = new Date(status.nextVerificationDue);
        if (new Date() > dueDate) {
            return false; // Verification expired
        }
    }

    return true;
}

/**
 * Check if verification is expired (was verified but needs re-verification)
 */
export function isVerificationExpired(domain, organisationId) {
    const status = getVerificationStatus(domain, organisationId);
    if (!status || !status.verified) {
        return false; // Never verified, not "expired"
    }

    if (status.nextVerificationDue) {
        const dueDate = new Date(status.nextVerificationDue);
        return new Date() > dueDate;
    }

    return false;
}

/**
 * Get or create a verification token for a domain
 * If token already exists, return it; otherwise generate a new one
 */
export function getOrCreateVerificationToken(domain, organisationId) {
    const verifications = getStoredVerifications();
    const key = createKey(domain, organisationId);

    if (verifications[key]?.token) {
        return verifications[key].token;
    }

    // Generate new token
    const token = generateVerificationToken(domain, organisationId);

    verifications[key] = {
        domain: domain.toLowerCase(),
        organisationId,
        token,
        verified: false,
        verifiedAt: null,
        lastCheckedAt: null,
        nextVerificationDue: null,
        createdAt: new Date().toISOString(),
    };

    saveVerifications(verifications);
    return token;
}

/**
 * Get full verification record, creating one if it doesn't exist
 */
export function getOrCreateVerificationRecord(domain, organisationId) {
    const token = getOrCreateVerificationToken(domain, organisationId);
    return getVerificationStatus(domain, organisationId);
}

/**
 * Simulate verification check (will be replaced with actual API call)
 * In production, this would fetch the domain and check for the token
 *
 * @param {string} domain - Domain to verify
 * @param {number} organisationId - Organisation ID
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function checkDomainVerification(domain, organisationId) {
    const verifications = getStoredVerifications();
    const key = createKey(domain, organisationId);
    const record = verifications[key];

    if (!record) {
        return {
            success: false,
            message: "No verification token found. Please generate a token first.",
        };
    }

    // Simulate API call delay
    await new Promise((resolve) => setTimeout(resolve, 1500));

    // TODO: Replace with actual verification API call
    // The backend would:
    // 1. Fetch the domain's HTML
    // 2. Look for <meta name="intastellar-verification" content="TOKEN">
    // 3. Or check for window.INTA.verification === TOKEN
    // 4. Return success/failure

    // For now, simulate random success/failure for testing
    // In production, remove this and use actual API
    const simulatedSuccess = Math.random() > 0.3; // 70% success rate for testing

    if (simulatedSuccess) {
        const now = new Date();
        const nextDue = new Date(now);
        nextDue.setDate(nextDue.getDate() + REVERIFICATION_DAYS);

        verifications[key] = {
            ...record,
            verified: true,
            verifiedAt: now.toISOString(),
            lastCheckedAt: now.toISOString(),
            nextVerificationDue: nextDue.toISOString(),
        };

        saveVerifications(verifications);

        return {
            success: true,
            message: "Domain verified successfully!",
            verifiedAt: now.toISOString(),
            nextVerificationDue: nextDue.toISOString(),
        };
    } else {
        verifications[key] = {
            ...record,
            lastCheckedAt: new Date().toISOString(),
        };

        saveVerifications(verifications);

        return {
            success: false,
            message: "Verification token not found on domain. Please ensure the token is properly installed.",
        };
    }
}

/**
 * Mark a domain as manually verified (for testing/admin purposes)
 */
export function manuallyVerifyDomain(domain, organisationId) {
    const verifications = getStoredVerifications();
    const key = createKey(domain, organisationId);

    const now = new Date();
    const nextDue = new Date(now);
    nextDue.setDate(nextDue.getDate() + REVERIFICATION_DAYS);

    const existingRecord = verifications[key] || {
        domain: domain.toLowerCase(),
        organisationId,
        token: generateVerificationToken(domain, organisationId),
        createdAt: now.toISOString(),
    };

    verifications[key] = {
        ...existingRecord,
        verified: true,
        verifiedAt: now.toISOString(),
        lastCheckedAt: now.toISOString(),
        nextVerificationDue: nextDue.toISOString(),
    };

    saveVerifications(verifications);
}

/**
 * Reset verification status for a domain (for testing)
 */
export function resetVerification(domain, organisationId) {
    const verifications = getStoredVerifications();
    const key = createKey(domain, organisationId);

    if (verifications[key]) {
        verifications[key] = {
            ...verifications[key],
            verified: false,
            verifiedAt: null,
            lastCheckedAt: null,
            nextVerificationDue: null,
        };
        saveVerifications(verifications);
    }
}

/**
 * Get verification status label for UI display
 */
export function getVerificationStatusLabel(domain, organisationId) {
    const status = getVerificationStatus(domain, organisationId);

    if (!status) {
        return { label: "Unverified", type: "unverified", icon: "?" };
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
 * Get days until re-verification is required
 */
export function getDaysUntilReverification(domain, organisationId) {
    const status = getVerificationStatus(domain, organisationId);

    if (!status?.nextVerificationDue) {
        return null;
    }

    const dueDate = new Date(status.nextVerificationDue);
    const now = new Date();
    const diffTime = dueDate - now;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    return diffDays;
}

/**
 * Get all domains that need re-verification soon (within X days)
 */
export function getDomainsNeedingReverification(withinDays = 3) {
    const verifications = getStoredVerifications();
    const needsReverification = [];

    for (const key in verifications) {
        const record = verifications[key];
        if (record.verified && record.nextVerificationDue) {
            const daysUntil = getDaysUntilReverification(record.domain, record.organisationId);
            if (daysUntil !== null && daysUntil <= withinDays) {
                needsReverification.push({
                    ...record,
                    daysUntilDue: daysUntil,
                });
            }
        }
    }

    return needsReverification;
}
