import pkg from "pg";
const { Pool } = pkg;

let pool;

// Appends uselibpqcompat=true to suppress the pg-connection-string SSL mode
// deprecation warning while keeping the existing rejectUnauthorized:false
// behaviour (Neon/Supabase/Vercel Postgres use CA-signed certs but many
// deployment environments still rely on this flag).
function buildUrl() {
    const base = process.env.POSTGRES_URL || "";
    if (!base || base.includes("uselibpqcompat")) return base;
    return base + (base.includes("?") ? "&" : "?") + "uselibpqcompat=true";
}

export function getPool() {
    if (!pool) {
        pool = new Pool({
            connectionString: buildUrl(),
            ssl: { rejectUnauthorized: false },
            max: 1,
            idleTimeoutMillis: 10_000,
            connectionTimeoutMillis: 10_000,
        });
    }
    return pool;
}
