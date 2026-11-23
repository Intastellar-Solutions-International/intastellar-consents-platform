import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import { getPool } from "./_db.js";

/*
 * One-time hand-over from the mobile app to the web dashboard.
 *
 * The app (signed in) asks for a code and opens
 * /app-handoff?code=…&to=/analytics/…; the web page redeems the code for the
 * same session the app has and continues to `to` — no second sign-in.
 *
 * - A code is 256 random bits, valid HANDOFF_TTL_SECONDS, usable once
 *   (redeem deletes the row atomically).
 * - The database only holds a hash of the code. The session token is
 *   encrypted with a key derived from the code, so the table alone reveals
 *   no tokens.
 */
export const HANDOFF_TTL_SECONDS = 60;
export const MAX_OPEN_CODES_PER_USER = 10;
export const HANDOFF_CODE_RE = /^[A-Za-z0-9_-]{43}$/;

const hashCode = (code) => createHash("sha256").update(`app-handoff|${code}`).digest("hex");
const keyFor = (code) => createHash("sha256").update(`app-handoff-key|${code}`).digest();

export function newCode() {
    return randomBytes(32).toString("base64url");
}

export function seal(code, plaintext) {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", keyFor(code), iv);
    const data = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    return `${iv.toString("base64")}.${cipher.getAuthTag().toString("base64")}.${data.toString("base64")}`;
}

/** The plaintext, or null when the code doesn't open it. */
export function open(code, sealed) {
    try {
        const [iv, tag, data] = String(sealed).split(".").map((part) => Buffer.from(part, "base64"));
        const decipher = createDecipheriv("aes-256-gcm", keyFor(code), iv);
        decipher.setAuthTag(tag);
        return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
    } catch {
        return null;
    }
}

/** The session token from "Bearer …", exactly as the client sent it. */
export function bearerToken(authHeader) {
    const match = String(authHeader || "").match(/^Bearer\s+(\S+)$/i);
    return match ? match[1] : null;
}

/** Display details the web stores with the session — never trusted for access. */
export function cleanUser(user) {
    const text = (v, max) => (typeof v === "string" ? v.slice(0, max) : undefined);
    return {
        name: { first: text(user?.name?.first, 100) || "", last: text(user?.name?.last, 100) || "" },
        image: /^https:\/\//.test(user?.image || "") ? text(user.image, 500) : undefined,
    };
}

let tableReady = null;
export function ensureHandoffTable(db = getPool()) {
    if (!tableReady) {
        tableReady = db.query(`
            CREATE TABLE IF NOT EXISTS app_handoff_codes (
                code_hash       CHAR(64)     PRIMARY KEY,
                organisation_id INTEGER      NOT NULL,
                email           TEXT         NOT NULL,
                user_json       JSONB,
                sealed_token    TEXT         NOT NULL,
                expires_at      TIMESTAMPTZ  NOT NULL
            );
            CREATE INDEX IF NOT EXISTS app_handoff_codes_expires_idx ON app_handoff_codes (expires_at);
            CREATE INDEX IF NOT EXISTS app_handoff_codes_email_idx ON app_handoff_codes (email);
        `).catch((err) => { tableReady = null; throw err; });
    }
    return tableReady;
}

/** → { code, expiresIn } or { status, error }. `member` comes from requireMember. */
export async function createHandoff(db, { member, token, user }) {
    if (!token) return { status: 401, error: "Unauthorized" };
    await db.query("DELETE FROM app_handoff_codes WHERE expires_at < NOW()");
    const { rows } = await db.query("SELECT COUNT(*)::int AS n FROM app_handoff_codes WHERE email = $1", [member.email]);
    if ((rows[0]?.n || 0) >= MAX_OPEN_CODES_PER_USER) return { status: 429, error: "Too many open hand-over codes" };

    const code = newCode();
    await db.query(
        `INSERT INTO app_handoff_codes (code_hash, organisation_id, email, user_json, sealed_token, expires_at)
         VALUES ($1, $2, $3, $4, $5, NOW() + make_interval(secs => $6))`,
        [hashCode(code), member.organisationId, member.email, JSON.stringify(cleanUser(user)), seal(code, token), HANDOFF_TTL_SECONDS],
    );
    return { code, expiresIn: HANDOFF_TTL_SECONDS };
}

/** → { token, email, organisationId, user } or { status, error }. Single use. */
export async function redeemHandoff(db, code) {
    if (!HANDOFF_CODE_RE.test(String(code || ""))) return { status: 400, error: "Invalid code" };
    const { rows } = await db.query(
        `DELETE FROM app_handoff_codes WHERE code_hash = $1 AND expires_at >= NOW()
         RETURNING organisation_id, email, user_json, sealed_token`,
        [hashCode(code)],
    );
    const row = rows[0];
    const token = row && open(code, row.sealed_token);
    if (!token) return { status: 410, error: "This link has expired. Open it again from the app." };
    return { token, email: row.email, organisationId: row.organisation_id, user: row.user_json || {} };
}
