/**
 * Legal Basis Tracking: the purpose × regulation matrix, and the services a site runs
 * without consent under another legal basis. The services go into the domain's config.js
 * as settings.legalBasis, so the banner lets them through without fetching anything.
 */

export const PURPOSES = ["analytics", "marketing", "advertising", "functional", "personalisation", "security", "payment", "research"];
/** Bases that let a service run before consent. Consent itself is the default, so it isn't stored per service. */
export const SERVICE_BASES = ["legitimate_interest", "contract", "legal_obligation", "vital_interest", "public_task"];
const MAX_SERVICES = 50;
const MAX_HOSTS = 10;
const HOST = /^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const ID = /^[a-z0-9][a-z0-9-]{0,47}$/;

let tablesReady = false;
export async function ensureLegalBasisTables(db) {
    if (tablesReady) return;
    await db.query(`
        CREATE TABLE IF NOT EXISTS legal_basis_settings (
            organisation_id BIGINT      PRIMARY KEY,
            matrix          JSONB       NOT NULL DEFAULT '{}',
            services        JSONB       NOT NULL DEFAULT '[]',
            updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_by      TEXT
        )
    `);
    tablesReady = true;
}

/** "https://JS.hsforms.net/forms" → "js.hsforms.net"; null when it isn't a hostname. */
export function normalizeHost(raw) {
    const host = String(raw ?? "").trim().toLowerCase()
        .replace(/^[a-z][a-z0-9+.-]*:\/\//, "")
        .split(/[/?#:]/)[0]
        .replace(/^\*\./, "")
        .replace(/\.$/, "");
    return HOST.test(host) ? host : null;
}

/** A hostname as a banner pattern: the host itself or any subdomain of it, never a longer name that merely ends the same way. */
export function hostPattern(host) {
    return `(?:^|[^a-z0-9.-]|\\.)${host.replace(/[.\-]/g, "\\$&")}(?![a-z0-9-]|\\.[a-z0-9])`;
}

/** The matrix as sent by the page: { FRAMEWORK: { purpose: basisId } }, with only known purposes and short ids kept. */
export function validateMatrix(input) {
    if (!input || typeof input !== "object" || Array.isArray(input)) return { error: "The legal basis table is missing" };
    const matrix = {};
    for (const [framework, row] of Object.entries(input)) {
        if (!/^[A-Z0-9]{2,10}$/.test(framework) || !row || typeof row !== "object") continue;
        matrix[framework] = {};
        for (const purpose of PURPOSES) {
            const basis = row[purpose];
            if (typeof basis === "string" && /^[a-z_]{2,40}$/.test(basis)) matrix[framework][purpose] = basis;
        }
    }
    return { matrix };
}

/** Services as sent by the page. The first problem found is returned as { error } for the page to show. */
export function validateServices(input) {
    if (!Array.isArray(input)) return { error: "The services list is missing" };
    if (input.length > MAX_SERVICES) return { error: `At most ${MAX_SERVICES} services can be listed` };
    const services = [];
    const ids = new Set();
    for (const raw of input) {
        const name = String(raw?.name ?? "").trim().slice(0, 80);
        if (!name) return { error: "Every service needs a name" };
        const id = String(raw?.id || name).trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);
        if (!ID.test(id) || ids.has(id)) return { error: `“${name}” needs a different name; it clashes with another service` };
        ids.add(id);
        if (!PURPOSES.includes(raw?.purpose)) return { error: `Choose a purpose for “${name}”` };
        if (!SERVICE_BASES.includes(raw?.basis)) return { error: `Choose a legal basis for “${name}”` };
        const hostList = Array.isArray(raw?.hosts) ? raw.hosts : String(raw?.hosts ?? "").split(/[\s,]+/);
        const hosts = [];
        for (const entry of hostList.filter((h) => String(h).trim())) {
            const host = normalizeHost(entry);
            if (!host) return { error: `“${String(entry).trim()}” isn't a hostname (use e.g. js.hsforms.net)` };
            if (!hosts.includes(host)) hosts.push(host);
        }
        if (!hosts.length) return { error: `Add the hostname “${name}” loads its scripts from` };
        if (hosts.length > MAX_HOSTS) return { error: `“${name}” can have at most ${MAX_HOSTS} hostnames` };
        services.push({ id, name, purpose: raw.purpose, basis: raw.basis, hosts, deviceAccess: raw?.deviceAccess === true });
    }
    return { services };
}

/**
 * What config.js carries as settings.legalBasis. Services that store or read on the device are
 * left out: ePrivacy Art. 5(3) needs consent for that whatever the GDPR basis, so they stay
 * with the consent categories. The banner checks deviceAccess too, for hand-edited files.
 */
export function bannerLegalBasis(services) {
    return {
        services: (services || []).filter((s) => !s.deviceAccess && SERVICE_BASES.includes(s.basis)).map((s) => ({
            id: s.id,
            name: s.name,
            purpose: s.purpose,
            basis: s.basis,
            match: s.hosts.map(hostPattern),
        })),
    };
}

export async function readLegalBasis(db, organisationId) {
    const { rows } = await db.query(
        `SELECT matrix, services, updated_at, updated_by FROM legal_basis_settings WHERE organisation_id = $1`,
        [organisationId]
    );
    return rows[0] || { matrix: {}, services: [], updated_at: null, updated_by: null };
}

export async function saveLegalBasis(db, organisationId, { matrix, services }, email) {
    await db.query(
        `INSERT INTO legal_basis_settings (organisation_id, matrix, services, updated_at, updated_by) VALUES ($1, $2, $3, NOW(), $4)
         ON CONFLICT (organisation_id) DO UPDATE SET matrix = EXCLUDED.matrix, services = EXCLUDED.services, updated_at = NOW(), updated_by = EXCLUDED.updated_by`,
        [organisationId, JSON.stringify(matrix), JSON.stringify(services), email]
    );
}
