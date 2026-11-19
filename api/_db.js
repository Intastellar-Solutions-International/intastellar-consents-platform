import pkg from "pg";
import { attachDatabasePool } from "@vercel/functions";
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
        // A suspended instance never runs idleTimeoutMillis, so its idle
        // connection stays open on the server until the instance is reaped —
        // across many warm instances that exhausts the role's connection
        // limit ("too many connections for role"). This closes idle clients
        // before Vercel suspends the instance.
        attachDatabasePool(pool);
        // An idle client dropped by the server (restart, terminated backend)
        // emits 'error' on the pool; unhandled, that crashes the function.
        pool.on("error", (err) => console.error("[db] idle client error:", err.message));
    }
    return pool;
}
