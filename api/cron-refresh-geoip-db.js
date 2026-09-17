import { put } from "@vercel/blob";
import zlib from "zlib";
import tarStream from "tar-stream";
/**
 * GET /api/cron-refresh-geoip-db
 *
 * Vercel cron handler — schedule configured in vercel.json (weekly).
 *
 * Downloads MaxMind's free GeoLite2-ASN database and re-uploads just the
 * .mmdb file inside it to Vercel Blob storage, where api/_geoip.js fetches
 * it into memory (once per warm lambda instance) to resolve ASN/hosting-
 * provider info for analytics traffic. MaxMind's GeoLite2 license forbids
 * using data older than 30 days, hence the weekly refresh rather than a
 * one-time bundle.
 *
 * Required env vars (Vercel project settings):
 *   CRON_SECRET          — Set in Vercel; automatically sent in Authorization header
 *   MAXMIND_ACCOUNT_ID   — MaxMind account ID (free account works)
 *   MAXMIND_LICENSE_KEY  — MaxMind license key (free account works)
 */
const DOWNLOAD_URL = "https://download.maxmind.com/geoip/databases/GeoLite2-ASN/download?suffix=tar.gz";
const BLOB_PATHNAME = "geoip/GeoLite2-ASN.mmdb";

function extractMmdb(tarBuf) {
    return new Promise((resolve, reject) => {
        const extract = tarStream.extract();
        let found = null;
        extract.on("entry", (header, stream, next) => {
            if (!found && header.name.endsWith(".mmdb")) {
                const chunks = [];
                stream.on("data", c => chunks.push(c));
                stream.on("end", () => { found = Buffer.concat(chunks); next(); });
                stream.on("error", reject);
            } else {
                stream.resume();
                stream.on("end", next);
            }
        });
        extract.on("finish", () => resolve(found));
        extract.on("error", reject);
        extract.end(tarBuf);
    });
}

export default async function handler(req, res) {
    const secret = process.env.CRON_SECRET;
    if (!secret) {
        console.warn("[cron-refresh-geoip-db] CRON_SECRET is not set — endpoint is unprotected");
    } else if (req.headers.authorization !== `Bearer ${secret}`) {
        return res.status(401).json({ error: "Unauthorized" });
    }

    const accountId  = process.env.MAXMIND_ACCOUNT_ID;
    const licenseKey = process.env.MAXMIND_LICENSE_KEY;
    if (!accountId || !licenseKey) {
        return res.status(500).json({ error: "MAXMIND_ACCOUNT_ID / MAXMIND_LICENSE_KEY not configured" });
    }

    let mmdbBuffer;
    try {
        const authHeader = "Basic " + Buffer.from(`${accountId}:${licenseKey}`).toString("base64");
        const dlRes = await fetch(DOWNLOAD_URL, { headers: { Authorization: authHeader } });
        if (!dlRes.ok) throw new Error(`MaxMind download failed: ${dlRes.status}`);
        const gz = Buffer.from(await dlRes.arrayBuffer());
        const tarBuf = zlib.gunzipSync(gz);
        mmdbBuffer = await extractMmdb(tarBuf);
    } catch (err) {
        return res.status(502).json({ error: "Failed to fetch/extract GeoLite2-ASN database", detail: String(err) });
    }

    if (!mmdbBuffer) {
        return res.status(502).json({ error: "No .mmdb file found in the downloaded archive" });
    }

    try {
        const blob = await put(BLOB_PATHNAME, mmdbBuffer, {
            access: "public",
            addRandomSuffix: false,
            allowOverwrite: true,
            contentType: "application/octet-stream",
        });
        return res.status(200).json({ ok: true, url: blob.url, bytes: mmdbBuffer.length });
    } catch (err) {
        return res.status(502).json({ error: "Failed to upload to Blob storage", detail: String(err) });
    }
}
