/**
 * All Blob storage (session recordings, evidence files, the GeoIP db) lives
 * in an EU store (fra1). BLOB_READ_WRITE_TOKEN is that store, so every write
 * lands there without passing a token.
 *
 * LEGACY_BLOB_READ_WRITE_TOKEN is the previous US store, kept readable until
 * scripts/migrate-blob-store.mjs has copied everything across; once the old
 * store is deleted, unset it and these helpers behave like plain get()/del().
 *
 * Recording chunks are referenced by full URL
 * (https://<storeId>.private.blob.vercel-storage.com/...), so the URL says
 * which store holds them. Evidence files and the GeoIP db are referenced by
 * pathname, which resolves against the token's store, so reads try the EU
 * store first and fall back to the legacy one. A read-write token is
 * vercel_blob_rw_<storeId>_<secret>.
 */
import { get, del } from "@vercel/blob";

const LEGACY_TOKEN = process.env.LEGACY_BLOB_READ_WRITE_TOKEN || undefined;

export function storeIdFromToken(token) {
    return (String(token || "").split("_")[3] || "").toLowerCase();
}

const LEGACY_STORE_ID = storeIdFromToken(LEGACY_TOKEN);

function isUrl(urlOrPathname) {
    return /^https?:\/\//i.test(String(urlOrPathname));
}

export function isLegacyUrl(urlOrPathname) {
    if (!LEGACY_STORE_ID || !isUrl(urlOrPathname)) return false;
    try { return new URL(urlOrPathname).hostname.toLowerCase().startsWith(LEGACY_STORE_ID + "."); }
    catch { return false; }
}

function tokenFor(urlOrPathname) {
    return isLegacyUrl(urlOrPathname) ? LEGACY_TOKEN : undefined;
}

// get(…, {access:"private"}) that knows about the legacy store. Resolves to
// null when the blob is in neither store, like get() itself.
export async function getPrivate(urlOrPathname) {
    const result = await get(urlOrPathname, { access: "private", token: tokenFor(urlOrPathname) });
    if (result || !LEGACY_TOKEN || isUrl(urlOrPathname)) return result;
    return get(urlOrPathname, { access: "private", token: LEGACY_TOKEN });
}

// A pathname may exist in both stores mid-migration, so it's removed from both.
export async function delPrivate(urlOrPathname) {
    await del(urlOrPathname, { token: tokenFor(urlOrPathname) });
    if (LEGACY_TOKEN && !isUrl(urlOrPathname)) {
        await del(urlOrPathname, { token: LEGACY_TOKEN }).catch(() => {});
    }
}
