import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

/**
 * Deletion through vendors' own APIs. Only ever run by a person, for one vendor
 * at a time, on an erasure request. Identifiers are used for the call and not
 * stored. Audience connectors remove someone from ad audiences; they don't
 * erase what the platform itself holds, and say so in their result.
 */
export const VENDOR_ADAPTER = {
    "Google Analytics": "google_analytics",
    "Google Ads": "google_ads",
    "Google Marketing Platform": "google_ads",
    "Facebook / Meta Pixel": "meta_ads",
    "Instagram (Meta)": "meta_ads",
    "HubSpot": "hubspot",
    "Mixpanel": "mixpanel",
    "Amplitude": "amplitude",
    "Segment": "segment",
};

export const ADAPTERS = {
    google_analytics: { label: "Google Analytics", kind: "oauth", needsScope: "analytics.user.deletion", identifier: "Google Analytics client ID (from the person's _ga cookie)" },
    google_ads: { label: "Google Ads customer lists", kind: "oauth", needsScope: "datamanager", usesEmail: true },
    meta_ads: { label: "Meta customer audiences", kind: "oauth", usesEmail: true },
    hubspot: { label: "HubSpot", kind: "key", usesEmail: true, fields: [{ id: "token", label: "Private app token" }] },
    mixpanel: { label: "Mixpanel", kind: "key", identifier: "Mixpanel distinct ID", fields: [{ id: "oauth_token", label: "GDPR API token" }, { id: "project_token", label: "Project token" }] },
    amplitude: { label: "Amplitude", kind: "key", identifier: "Amplitude user ID", fields: [{ id: "api_key", label: "API key" }, { id: "secret_key", label: "Secret key" }], regions: true },
    segment: { label: "Segment", kind: "key", identifier: "Segment user ID", fields: [{ id: "token", label: "Public API token" }], regions: true },
};

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

export function hashEmail(email, { google = false } = {}) {
    let value = String(email).trim().toLowerCase();
    if (google) {
        const [local, host] = value.split("@");
        if (host === "gmail.com" || host === "googlemail.com") value = `${local.replace(/\./g, "")}@${host}`;
    }
    return sha256(value);
}

const encryptionKey = (secret) => createHash("sha256").update(secret).digest();

/** Vendor keys are encrypted at rest with DSR_CREDENTIALS_KEY and never returned to the browser. */
export function encryptCredentials(values, secret) {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", encryptionKey(secret), iv);
    const body = Buffer.concat([cipher.update(JSON.stringify(values), "utf8"), cipher.final()]);
    return [iv, cipher.getAuthTag(), body].map((b) => b.toString("base64")).join(".");
}

export function decryptCredentials(ciphertext, secret) {
    const [iv, tag, body] = ciphertext.split(".").map((p) => Buffer.from(p, "base64"));
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(secret), iv);
    decipher.setAuthTag(tag);
    return JSON.parse(Buffer.concat([decipher.update(body), decipher.final()]).toString("utf8"));
}

async function failure(response, fallback) {
    const text = await response.text().catch(() => "");
    console.error("[dsr-deletion]", response.status, text.slice(0, 300));
    if (response.status === 401 || response.status === 403) return { ok: false, message: "The vendor refused this connection. Check it has permission to delete." };
    return { ok: false, message: fallback };
}

const hasScope = (conn, scope) => String(conn?.scopes || "").includes(scope);
const json = (token) => ({ Authorization: `Bearer ${token}`, "Content-Type": "application/json" });

const RUNNERS = {
    async google_analytics({ conn, identifier, fetchImpl }) {
        const response = await fetchImpl("https://www.googleapis.com/analytics/v3/userDeletion/userDeletionRequests:upsert", {
            method: "POST",
            headers: json(conn.access_token),
            body: JSON.stringify({ kind: "analytics#userDeletionRequest", id: { type: "CLIENT_ID", userId: identifier }, propertyId: String(conn.account_id) }),
        });
        if (!response.ok) return failure(response, "Google Analytics didn't accept the deletion.");
        return { ok: true, message: "Google Analytics accepted the deletion request." };
    },

    async google_ads({ conn, email, fetchImpl }) {
        const customerId = String(conn.account_id || "").replace(/\D/g, "");
        const headers = { ...json(conn.access_token), "developer-token": process.env.GOOGLE_ADS_DEVELOPER_TOKEN || "" };
        const loginId = String(conn.login_customer_id || "").replace(/\D/g, "");
        if (loginId) headers["login-customer-id"] = loginId;
        const search = await fetchImpl(`https://googleads.googleapis.com/v25/customers/${customerId}/googleAds:search`, {
            method: "POST",
            headers,
            body: JSON.stringify({ query: "SELECT user_list.id FROM user_list WHERE user_list.type = 'CRM_BASED'" }),
        });
        if (!search.ok) return failure(search, "Google Ads customer lists couldn't be read.");
        const lists = ((await search.json()).results || []).map((r) => r.userList?.id).filter(Boolean);
        if (!lists.length) return { ok: true, nothingFound: true, message: "This Google Ads account has no customer lists." };
        const operatingAccount = { accountType: "GOOGLE_ADS", accountId: customerId };
        const audienceMembers = [{ userData: { userIdentifiers: [{ emailAddress: hashEmail(email, { google: true }) }] } }];
        let failed = 0;
        for (const productDestinationId of lists) {
            const response = await fetchImpl("https://datamanager.googleapis.com/v1/audienceMembers:remove", {
                method: "POST",
                headers: json(conn.access_token),
                body: JSON.stringify({ destinations: [{ operatingAccount, ...(loginId ? { loginAccount: { accountType: "GOOGLE_ADS", accountId: loginId } } : {}), productDestinationId: String(productDestinationId) }], audienceMembers, encoding: "HEX" }),
            });
            if (!response.ok) { failed += 1; await failure(response, ""); }
        }
        if (failed) return { ok: false, message: `${failed} of ${lists.length} Google Ads customer lists couldn't be updated.` };
        return { ok: true, message: `Removal requested from ${lists.length} Google Ads customer list${lists.length === 1 ? "" : "s"}. Other data Google holds isn't affected.` };
    },

    async meta_ads({ conn, email, fetchImpl }) {
        const accountId = String(conn.account_id || "").replace(/^act_/, "");
        const list = await fetchImpl(`https://graph.facebook.com/v26.0/act_${accountId}/customaudiences?fields=id,subtype&limit=500`, { headers: { Authorization: `Bearer ${conn.access_token}` } });
        if (!list.ok) return failure(list, "Meta audiences couldn't be read.");
        const audiences = ((await list.json()).data || []).filter((a) => a.subtype === "CUSTOM").map((a) => a.id);
        if (!audiences.length) return { ok: true, nothingFound: true, message: "This Meta ad account has no customer list audiences." };
        const body = new URLSearchParams({ payload: JSON.stringify({ schema: "EMAIL_SHA256", data: [hashEmail(email)] }), access_token: conn.access_token });
        let failed = 0;
        for (const id of audiences) {
            const response = await fetchImpl(`https://graph.facebook.com/v26.0/${id}/users`, { method: "DELETE", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
            if (!response.ok) { failed += 1; await failure(response, ""); }
        }
        if (failed) return { ok: false, message: `${failed} of ${audiences.length} Meta audiences couldn't be updated.` };
        return { ok: true, message: `Removal requested from ${audiences.length} Meta audience${audiences.length === 1 ? "" : "s"}. Other data Meta holds isn't affected.` };
    },

    async hubspot({ credentials, email, fetchImpl }) {
        const response = await fetchImpl("https://api.hubapi.com/crm/v3/objects/contacts/gdpr-delete", {
            method: "POST",
            headers: json(credentials.token),
            body: JSON.stringify({ objectId: email, idProperty: "email" }),
        });
        if (response.status === 404) return { ok: true, nothingFound: true, message: "HubSpot has no contact with this email." };
        if (!response.ok) return failure(response, "HubSpot didn't accept the deletion.");
        return { ok: true, message: "HubSpot permanently deleted the contact." };
    },

    async mixpanel({ credentials, identifier, request, fetchImpl }) {
        const response = await fetchImpl(`https://mixpanel.com/api/app/data-deletions/v3.0/?token=${encodeURIComponent(credentials.project_token)}`, {
            method: "POST",
            headers: json(credentials.oauth_token),
            body: JSON.stringify({ distinct_ids: [identifier], compliance_type: ["GDPR", "UK_GDPR"].includes(request.regulation) ? "GDPR" : "CCPA" }),
        });
        if (!response.ok) return failure(response, "Mixpanel didn't accept the deletion.");
        const data = await response.json().catch(() => ({}));
        return { ok: true, ref: data?.results?.task_id || null, message: "Mixpanel accepted the deletion. It can take weeks to complete." };
    },

    async amplitude({ credentials, identifier, actor, config, fetchImpl }) {
        const host = config?.region === "eu" ? "analytics.eu.amplitude.com" : "amplitude.com";
        const response = await fetchImpl(`https://${host}/api/2/deletions/users`, {
            method: "POST",
            headers: { Authorization: `Basic ${Buffer.from(`${credentials.api_key}:${credentials.secret_key}`).toString("base64")}`, "Content-Type": "application/json" },
            body: JSON.stringify({ user_ids: [identifier], requester: actor, ignore_invalid_id: "True" }),
        });
        if (!response.ok) return failure(response, "Amplitude didn't accept the deletion.");
        return { ok: true, message: "Amplitude scheduled the deletion." };
    },

    async segment({ credentials, identifier, config, fetchImpl }) {
        const host = config?.region === "eu" ? "eu1.api.segmentapis.com" : "api.segmentapis.com";
        const response = await fetchImpl(`https://${host}/regulations`, {
            method: "POST",
            headers: json(credentials.token),
            body: JSON.stringify({ regulationType: "SUPPRESS_WITH_DELETE", subjectType: "USER_ID", subjectIds: [identifier] }),
        });
        if (!response.ok) return failure(response, "Segment didn't accept the deletion.");
        const data = await response.json().catch(() => ({}));
        return { ok: true, ref: data?.data?.regulateId || null, message: "Segment accepted the deletion and suppressed this user." };
    },
};

/** Whether a vendor can be deleted through its API on this request, and what's still missing. */
export function deletionStatus(vendor, request, { connections = {}, credentials = {} } = {}) {
    const id = VENDOR_ADAPTER[vendor];
    if (!id || request.type !== "erasure") return null;
    const adapter = ADAPTERS[id];
    const base = { adapter: id, label: adapter.label, identifier: adapter.identifier || null, usesEmail: Boolean(adapter.usesEmail) };
    if (adapter.usesEmail && !request.requester_email) return { ...base, ready: false, reason: "Add the requester's email first." };
    if (adapter.kind === "key") return credentials[id] ? { ...base, ready: true } : { ...base, ready: false, reason: "Connect this vendor under Vendor connections." };
    if (!request.domain) return { ...base, ready: false, reason: "Set the request's domain to use this connection." };
    const conn = connections[id];
    if (!conn?.access_token) return { ...base, ready: false, reason: "Connect this account for the domain under Marketing." };
    if (adapter.needsScope && !hasScope(conn, adapter.needsScope)) return { ...base, ready: false, reconnect: id, reason: "This connection doesn't have deletion permission yet." };
    return { ...base, ready: true };
}

export async function runDeletion(id, context) {
    const adapter = ADAPTERS[id];
    if (!adapter) return { ok: false, message: "Unknown connector" };
    if (!adapter.usesEmail && !String(context.identifier || "").trim()) return { ok: false, message: `Enter the ${adapter.identifier}.` };
    return RUNNERS[id]({ fetchImpl: globalThis.fetch, ...context, identifier: String(context.identifier || "").trim() });
}
