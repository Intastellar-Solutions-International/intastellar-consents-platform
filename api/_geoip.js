import { head } from "@vercel/blob";
import { Reader } from "maxmind";

// ASN / hosting-provider lookup for a request's IP, used to help classify
// bot and suspicious traffic (datacenter/hosting-network origin vs.
// residential/mobile). The IP itself is never persisted anywhere — same
// "derive, don't store" approach api/a.js already uses for country_code via
// Vercel's geo headers, just backed by a locally-held MaxMind database
// instead, since Vercel doesn't expose ASN in its request headers.
//
// The .mmdb file lives in Vercel Blob storage, refreshed periodically by
// /api/cron-refresh-geoip-db (MaxMind's GeoLite2 license forbids using data
// older than 30 days, hence the periodic refresh rather than a one-time
// bundle).
const BLOB_PATHNAME = "geoip/GeoLite2-ASN.mmdb";
const FETCH_TIMEOUT_MS = 4000;

let readerPromise = null;

async function fetchWithTimeout(url, ms) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    try {
        return await fetch(url, { signal: controller.signal });
    } finally {
        clearTimeout(timer);
    }
}

// Cached per warm lambda instance — the mmdb file (a few MB) is fetched and
// parsed at most once per instance rather than on every request.
function loadReader() {
    if (!readerPromise) {
        readerPromise = (async () => {
            try {
                const meta = await head(BLOB_PATHNAME);
                const res = await fetchWithTimeout(meta.url, FETCH_TIMEOUT_MS);
                if (!res.ok) throw new Error(`geoip blob fetch ${res.status}`);
                const buf = Buffer.from(await res.arrayBuffer());
                return new Reader(buf);
            } catch {
                readerPromise = null; // let a later invocation retry (e.g. blob not uploaded yet)
                return null;
            }
        })();
    }
    return readerPromise;
}

// Common cloud/hosting/proxy providers — GeoLite2-ASN's free tier only gives
// the AS number/org name, not MaxMind's paid "hosting provider" flag, so this
// infers it from the org name instead. Deliberately not exhaustive: it only
// needs to catch the large, common providers behind most bot/scraper/proxy
// traffic, not every possible one — an unlisted provider is a false negative,
// not a false positive.
const HOSTING_KEYWORDS = [
    "amazon", "aws", "google cloud", "google llc", "microsoft corporation", "microsoft azure", "azure",
    "digitalocean", "digital ocean", "linode", "akamai", "ovh", "hetzner",
    "vultr", "oracle cloud", "alibaba", "tencent", "cloudflare", "fastly",
    "contabo", "scaleway", "leaseweb", "choopa", "hurricane electric",
    "psychz", "colocrossing", "m247", "the constant company", "datacamp limited",
    "hosting", " colo", "datacenter", "data center",
];
function isHostingOrg(org) {
    if (!org) return false;
    const lower = org.toLowerCase();
    return HOSTING_KEYWORDS.some(k => lower.includes(k));
}

function clientIp(req) {
    const xff = req.headers["x-forwarded-for"];
    if (xff) {
        const first = String(xff).split(",")[0].trim();
        if (first) return first;
    }
    const real = req.headers["x-real-ip"];
    return real ? String(real).trim() : null;
}

// Resolves ASN / hosting-provider info for the request's IP. Never throws —
// callers can await this unconditionally and get all-null fields back on any
// failure (blob not uploaded yet, malformed IP, lookup miss, ...) rather than
// a rejected promise, matching the "never let analytics break the page"
// posture used throughout the rest of api/a.js's ingest handler.
export async function lookupNetwork(req) {
    try {
        const ip = clientIp(req);
        if (!ip) return { asn: null, asOrg: null, isHosting: false };
        const reader = await loadReader();
        if (!reader) return { asn: null, asOrg: null, isHosting: false };
        const rec = reader.get(ip);
        if (!rec) return { asn: null, asOrg: null, isHosting: false };
        const asOrg = (rec.autonomous_system_organization || "").slice(0, 255) || null;
        return {
            asn: Number.isInteger(rec.autonomous_system_number) ? rec.autonomous_system_number : null,
            asOrg,
            isHosting: isHostingOrg(asOrg),
        };
    } catch {
        return { asn: null, asOrg: null, isHosting: false };
    }
}
