#!/usr/bin/env node
/**
 * One-off: copies every blob (recordings, evidence files, GeoIP db) from the
 * legacy US store to the EU store, then points analytics_recordings.chunk_urls
 * at the copies. See api/_blob-stores.js.
 *
 * Needs Node 20+ (@vercel/blob's minimum; `nvm use 20`).
 *
 *   vercel env pull .env.migrate --environment=production
 *   node --env-file=.env.migrate scripts/migrate-blob-store.mjs            # dry run
 *   node --env-file=.env.migrate scripts/migrate-blob-store.mjs --apply
 *
 * Needs POSTGRES_URL, BLOB_READ_WRITE_TOKEN (EU store) and
 * LEGACY_BLOB_READ_WRITE_TOKEN (old store). Deploy the code that reads both
 * stores first, so nothing breaks while this runs.
 *
 * Nothing is deleted from the legacy store: check the result, then delete
 * that store in the Vercel dashboard and unset LEGACY_BLOB_READ_WRITE_TOKEN.
 * Safe to re-run: blobs already in the EU store are skipped.
 */
import { get, put, list } from "@vercel/blob";
import pg from "pg";
import { storeIdFromToken } from "../api/_blob-stores.js";

const APPLY = process.argv.includes("--apply");
const NEW_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;
const OLD_TOKEN = process.env.LEGACY_BLOB_READ_WRITE_TOKEN;

if (!process.env.POSTGRES_URL || !NEW_TOKEN || !OLD_TOKEN) {
    console.error("POSTGRES_URL, BLOB_READ_WRITE_TOKEN and LEGACY_BLOB_READ_WRITE_TOKEN must be set.");
    process.exit(1);
}
const OLD_STORE = storeIdFromToken(OLD_TOKEN);
if (OLD_STORE === storeIdFromToken(NEW_TOKEN)) {
    console.error("Both tokens point to the same store — nothing to migrate.");
    process.exit(1);
}

async function listAll(token) {
    const blobs = [];
    let cursor;
    do {
        const page = await list({ token, cursor, limit: 1000 });
        blobs.push(...page.blobs);
        cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);
    return blobs;
}

const oldBlobs = await listAll(OLD_TOKEN);
const newUrlByPath = new Map((await listAll(NEW_TOKEN)).map(b => [b.pathname, b.url]));
const toCopy = oldBlobs.filter(b => !newUrlByPath.has(b.pathname));
const mb = toCopy.reduce((n, b) => n + b.size, 0) / 1e6;
console.log(`Legacy store: ${oldBlobs.length} blobs, ${toCopy.length} still to copy (${mb.toFixed(1)} MB)${APPLY ? "" : " — dry run"}.`);
for (const prefix of ["recordings/", "geoip/", "evidence"]) {
    console.log(`  ${prefix.padEnd(12)} ${toCopy.filter(b => b.pathname.startsWith(prefix)).length}`);
}
if (!APPLY) process.exit(0);

// ── 1. Copy blobs ─────────────────────────────────────────────────────────────
let copied = 0, failed = 0;
for (const b of toCopy) {
    try {
        const res = await get(b.url, { access: "private", token: OLD_TOKEN });
        if (!res) { console.warn(`gone: ${b.pathname}`); continue; }
        const body = Buffer.from(await new Response(res.stream).arrayBuffer());
        const out = await put(b.pathname, body, {
            access: "private",
            contentType: res.blob.contentType || undefined,
            addRandomSuffix: false,
            allowOverwrite: true,
            token: NEW_TOKEN,
        });
        newUrlByPath.set(b.pathname, out.url);
        if (++copied % 200 === 0) console.log(`  copied ${copied}/${toCopy.length}`);
    } catch (err) {
        failed++;
        console.error(`failed ${b.pathname}: ${err.message}`);
    }
}
console.log(`Copied ${copied} blobs, ${failed} failed.`);

// ── 2. Re-point recording chunk URLs ──────────────────────────────────────────
// Evidence files and the GeoIP db are stored by pathname and need no update.
const db = new pg.Client({ connectionString: process.env.POSTGRES_URL, ssl: { rejectUnauthorized: false } });
await db.connect();
const isOld = u => { try { return new URL(u).hostname.toLowerCase().startsWith(OLD_STORE + "."); } catch { return false; } };
const { rows } = await db.query(`SELECT id, chunk_urls FROM analytics_recordings`);
let repointed = 0, incomplete = 0;
for (const rec of rows) {
    const urls = rec.chunk_urls || [];
    if (!urls.some(isOld)) continue;
    const next = urls.map(u => isOld(u) ? (newUrlByPath.get(new URL(u).pathname.slice(1)) || u) : u);
    if (next.some(isOld)) incomplete++;
    // Only swap if the row didn't change meanwhile (ingest append, retention delete).
    const { rowCount } = await db.query(
        `UPDATE analytics_recordings SET chunk_urls = $2 WHERE id = $1 AND chunk_urls = $3`,
        [rec.id, next, urls]
    );
    repointed += rowCount;
}
await db.end();
console.log(`Re-pointed ${repointed} recordings; ${incomplete} still reference legacy chunks (re-run to retry).`);
