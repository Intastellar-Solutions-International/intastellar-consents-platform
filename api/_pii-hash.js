import { createHash } from "crypto";

const SHA256_HEX_RE = /^[0-9a-f]{64}$/i;

export const isHashed = (value) => SHA256_HEX_RE.test(value);

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

// Google's documented normalization for enhanced conversions / Customer
// Match: trim + lowercase, plus the Gmail dot-stripping it recommends for
// better match rates (same rule api/_dsr-deletion.js's hashEmail uses).
const normalizeEmail = (email) => {
    let value = String(email).trim().toLowerCase();
    const [local, host] = value.split("@");
    if (host === "gmail.com" || host === "googlemail.com") value = `${local.replace(/\./g, "")}@${host}`;
    return value;
};

// Google requires E.164 (leading +, digits only) before hashing a phone
// number — without a leading +, there's no reliable country code to assume,
// so that case is rejected rather than guessed at.
const normalizePhone = (phone) => {
    const digits = String(phone).trim().replace(/[^\d+]/g, "");
    return digits.startsWith("+") && digits.length > 1 ? digits : null;
};

/**
 * Accepts either a raw value or one already hashed client-side (the embed
 * script hashes before it ever leaves the browser) — stays defensive in
 * case a raw value arrives anyway, so a plaintext email/phone never gets
 * persisted or forwarded on.
 */
export function hashEmailField(value) {
    const raw = String(value ?? "").trim();
    if (!raw) return null;
    if (isHashed(raw)) return raw.toLowerCase();
    return sha256(normalizeEmail(raw));
}

export function hashPhoneField(value) {
    const raw = String(value ?? "").trim();
    if (!raw) return null;
    if (isHashed(raw)) return raw.toLowerCase();
    const normalized = normalizePhone(raw);
    return normalized ? sha256(normalized) : null;
}
