import { getPool } from "./_db.js";
import { requireMember } from "./_member-auth.js";
import { randomBytes } from "crypto";
import {
    ensureDsrTables, listRequests, getRequest, createRequest, saveAction, validateNewRequest, applyAction,
    seedVendorNotifications, listVendorNotifications, addVendorNotification, validateVendorUpdate, saveVendorNotification, needsVendorNotice, DEADLINE_RULES,
} from "./_dsr.js";
import { ADAPTERS, VENDOR_ADAPTER, deletionStatus, runDeletion, encryptCredentials, decryptCredentials } from "./_dsr-deletion.js";

/**
 * /api/dsr — the organisation's data subject requests.
 *
 * GET            → { requests }
 * GET ?id=       → { request, events }
 * GET ?setup=1  → { forms, connectors }
 * POST { action: "create", ... } or a workflow step { action, id, ... }
 * POST vendor_update | vendor_add | vendor_delete, form_save | form_disable, connector_save | connector_remove
 *
 * Headers: Authorization (Bearer), Organisation, X-User-Email
 */
const ALLOWED_ORIGINS = [
    "https://www.intastellarconsents.com",
    "https://www.consentsmanagement.com",
    "https://consentsplatform.com",
    "http://localhost:8080",
    "http://localhost:3000",
];

function setCors(req, res) {
    const origin = req.headers.origin || "";
    if (ALLOWED_ORIGINS.includes(origin)) res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Authorization, Organisation, Content-Type, X-User-Email");
    res.setHeader("Access-Control-Max-Age", "86400");
}

const validId = (id) => /^\d{1,18}$/.test(String(id ?? ""));
const PLATFORM_ADAPTERS = ["google_analytics", "google_ads", "meta_ads"];

async function deletionContext(db, organisationId, request) {
    const { rows: stored } = await db.query(`SELECT adapter, ciphertext, config FROM dsr_vendor_credentials WHERE organisation_id = $1`, [organisationId]);
    const credentials = Object.fromEntries(stored.map((r) => [r.adapter, r]));
    const connections = {};
    if (request.domain) {
        const bare = request.domain.replace(/^www\./, "");
        const { rows } = await db.query(
            `SELECT * FROM ad_platform_connections WHERE organisation_id = $1 AND domain = ANY($2) AND platform = ANY($3)`,
            [organisationId, [bare, `www.${bare}`], PLATFORM_ADAPTERS]
        ).catch(() => ({ rows: [] }));
        for (const r of rows) connections[r.platform] = r;
    }
    return { credentials, connections };
}

async function detail(db, organisationId, id) {
    const found = await getRequest(db, organisationId, id);
    if (!found) return null;
    await seedVendorNotifications(db, organisationId, found.request, () => import("./_scan-core.js").then((m) => m.reclassifyStoredTransfer));
    const rows = await listVendorNotifications(db, organisationId, id);
    const context = await deletionContext(db, organisationId, found.request);
    const closed = found.request.anonymized_at || ["completed", "rejected"].includes(found.request.status);
    const vendors = rows.map((v) => ({ ...v, deletion: closed ? null : deletionStatus(v.vendor, found.request, context) }));
    return { ...found, vendors, notice_required: needsVendorNotice(found.request.type) };
}

async function vendorDelete(db, organisationId, email, request, vendor, identifier) {
    const adapterId = VENDOR_ADAPTER[vendor];
    const context = await deletionContext(db, organisationId, request);
    const status = deletionStatus(vendor, request, context);
    if (!status?.ready) return { status: 400, error: status?.reason || "This vendor can't be deleted through an API." };
    const run = { identifier, email: request.requester_email, request, actor: email };
    if (ADAPTERS[adapterId].kind === "key") {
        if (!process.env.DSR_CREDENTIALS_KEY) return { status: 503, error: "Vendor connections aren't set up on the server yet." };
        run.credentials = decryptCredentials(context.credentials[adapterId].ciphertext, process.env.DSR_CREDENTIALS_KEY);
        run.config = context.credentials[adapterId].config;
    } else {
        const { tryRefreshToken } = await import("./_ad-platform-fetch.js");
        run.conn = await tryRefreshToken(db, context.connections[adapterId]).catch(() => context.connections[adapterId]);
    }
    const result = await runDeletion(adapterId, run);
    await db.query(
        `INSERT INTO dsr_events (request_id, organisation_id, actor, action, detail) VALUES ($1, $2, $3, $4, $5::jsonb)`,
        [request.id, organisationId, email, result.ok ? "vendor_deletion" : "vendor_deletion_failed", JSON.stringify({ vendor })]
    );
    if (!result.ok) return { status: 502, error: result.message };
    const [current] = (await listVendorNotifications(db, organisationId, request.id)).filter((v) => v.vendor === vendor);
    await saveVendorNotification(db, organisationId, email, request.id, vendor, {
        ...validateVendorUpdate({ status: result.nothingFound ? "cannot_identify" : "notified", method: "Vendor API", contact: current?.contact, note: [current?.note, result.message].filter(Boolean).join("\n") }, current),
        deletion_ref: result.ref || null,
    });
    return { message: result.message };
}

async function setup(db, organisationId) {
    const { rows: forms } = await db.query(`SELECT token, company_name, domain, notify_email, default_regulation, enabled, created_at FROM dsr_public_forms WHERE organisation_id = $1 ORDER BY created_at DESC`, [organisationId]);
    const { rows: stored } = await db.query(`SELECT adapter, config, updated_at FROM dsr_vendor_credentials WHERE organisation_id = $1`, [organisationId]);
    const byId = Object.fromEntries(stored.map((r) => [r.adapter, r]));
    const connectors = Object.entries(ADAPTERS).filter(([, a]) => a.kind === "key").map(([id, a]) => ({ id, label: a.label, fields: a.fields, regions: Boolean(a.regions), connected: Boolean(byId[id]), region: byId[id]?.config?.region || "us" }));
    return { forms, connectors, encryption_ready: Boolean(process.env.DSR_CREDENTIALS_KEY) };
}

const short = (value, max = 255) => String(value ?? "").trim().slice(0, max);

async function saveForm(db, organisationId, email, body) {
    const company_name = short(body.company_name);
    if (!company_name) return { status: 400, error: "Add the company name people will see" };
    const notify_email = short(body.notify_email) || null;
    if (notify_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(notify_email)) return { status: 400, error: "That notification email doesn't look right" };
    const default_regulation = DEADLINE_RULES[body.default_regulation] ? body.default_regulation : "GDPR";
    const token = body.token ? short(body.token, 64) : randomBytes(18).toString("base64url");
    await db.query(
        `INSERT INTO dsr_public_forms (token, organisation_id, company_name, domain, notify_email, default_regulation, enabled, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, TRUE), $8)
         ON CONFLICT (token) DO UPDATE SET company_name = EXCLUDED.company_name, domain = EXCLUDED.domain, notify_email = EXCLUDED.notify_email,
                default_regulation = EXCLUDED.default_regulation, enabled = EXCLUDED.enabled
          WHERE dsr_public_forms.organisation_id = EXCLUDED.organisation_id`,
        [token, organisationId, company_name, short(body.domain) || null, notify_email, default_regulation, typeof body.enabled === "boolean" ? body.enabled : null, email]
    );
    return {};
}

async function saveConnector(db, organisationId, email, body) {
    const adapter = ADAPTERS[body.adapter];
    if (!adapter || adapter.kind !== "key") return { status: 400, error: "Unknown connector" };
    if (!process.env.DSR_CREDENTIALS_KEY) return { status: 503, error: "Vendor connections aren't set up on the server yet." };
    const values = Object.fromEntries(adapter.fields.map((f) => [f.id, short(body.values?.[f.id], 2000)]));
    if (Object.values(values).some((v) => !v)) return { status: 400, error: "Fill in every field" };
    await db.query(
        `INSERT INTO dsr_vendor_credentials (organisation_id, adapter, ciphertext, config, updated_by) VALUES ($1, $2, $3, $4::jsonb, $5)
         ON CONFLICT (organisation_id, adapter) DO UPDATE SET ciphertext = EXCLUDED.ciphertext, config = EXCLUDED.config, updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
        [organisationId, body.adapter, encryptCredentials(values, process.env.DSR_CREDENTIALS_KEY), JSON.stringify({ region: body.region === "eu" ? "eu" : "us" }), email]
    );
    return {};
}

export default async function handler(req, res) {
    setCors(req, res);
    if (req.method === "OPTIONS") return res.status(204).end();
    if (req.method !== "GET" && req.method !== "POST") {
        res.setHeader("Allow", "GET, POST, OPTIONS");
        return res.status(405).json({ error: "Method not allowed" });
    }
    const member = await requireMember(req);
    if (member.error) return res.status(member.status).json({ error: member.error });
    const { organisationId, email } = member;
    res.setHeader("Cache-Control", "private, no-store");

    try {
        const db = getPool();
        await ensureDsrTables(db);

        if (req.method === "GET") {
            if (req.query?.setup) return res.json(await setup(db, organisationId));
            if (req.query?.id === undefined) return res.json({ requests: await listRequests(db, organisationId) });
            const found = validId(req.query.id) ? await detail(db, organisationId, req.query.id) : null;
            return found ? res.json(found) : res.status(404).json({ error: "Request not found" });
        }

        const body = req.body || {};
        if (body.action === "create") {
            const values = validateNewRequest(body);
            if (values.error) return res.status(400).json({ error: values.error });
            return res.status(201).json({ request: await createRequest(db, organisationId, email, values) });
        }

        const organisationWide = { form_save: saveForm, connector_save: saveConnector };
        if (organisationWide[body.action]) {
            const result = await organisationWide[body.action](db, organisationId, email, body);
            return result.error ? res.status(result.status).json({ error: result.error }) : res.json(await setup(db, organisationId));
        }
        if (body.action === "form_disable") {
            await db.query(`UPDATE dsr_public_forms SET enabled = FALSE WHERE token = $1 AND organisation_id = $2`, [short(body.token, 64), organisationId]);
            return res.json(await setup(db, organisationId));
        }
        if (body.action === "connector_remove") {
            await db.query(`DELETE FROM dsr_vendor_credentials WHERE organisation_id = $1 AND adapter = $2`, [organisationId, short(body.adapter, 64)]);
            return res.json(await setup(db, organisationId));
        }

        const found = validId(body.id) ? await getRequest(db, organisationId, body.id) : null;
        if (!found) return res.status(404).json({ error: "Request not found" });

        if (body.action === "vendor_add") {
            const vendor = short(body.vendor);
            if (!vendor) return res.status(400).json({ error: "Add the vendor's name" });
            await addVendorNotification(db, organisationId, found.request.id, { vendor });
            return res.json(await detail(db, organisationId, found.request.id));
        }
        if (body.action === "vendor_update") {
            const [current] = (await listVendorNotifications(db, organisationId, found.request.id)).filter((v) => v.vendor === body.vendor);
            if (!current) return res.status(404).json({ error: "Vendor not found on this request" });
            const values = validateVendorUpdate(body, current);
            if (values.error) return res.status(400).json({ error: values.error });
            await saveVendorNotification(db, organisationId, email, found.request.id, body.vendor, values);
            return res.json(await detail(db, organisationId, found.request.id));
        }
        if (body.action === "vendor_delete") {
            if (body.confirm !== true) return res.status(400).json({ error: "Confirm the deletion first" });
            const result = await vendorDelete(db, organisationId, email, found.request, short(body.vendor), body.identifier);
            if (result.error) return res.status(result.status).json({ error: result.error });
            return res.json({ ...(await detail(db, organisationId, found.request.id)), deletion_message: result.message });
        }

        if (body.action === "complete" && needsVendorNotice(found.request.type) && body.confirm_open_vendors !== true) {
            const open = (await listVendorNotifications(db, organisationId, found.request.id)).filter((v) => v.status === "to_notify");
            if (open.length) return res.status(409).json({ error: `${open.length} vendor${open.length === 1 ? " hasn't" : "s haven't"} been dealt with yet.`, open_vendors: open.map((v) => v.vendor) });
        }
        const step = applyAction(found.request, body);
        if (step.error) return res.status(400).json({ error: step.error });
        const request = await saveAction(db, organisationId, email, found.request, step);
        if (!request) return res.status(409).json({ error: "This request was just changed by someone else. Reload and try again." });
        return res.json(await detail(db, organisationId, request.id));
    } catch (err) {
        console.error("[dsr]", err.message);
        return res.status(500).json({ error: "Internal server error" });
    }
}
