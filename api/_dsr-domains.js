import { isPlatformHost, normalizeHost } from "./_known-hosts.js";

/**
 * Customer domains for the public request form, attached to this Vercel
 * project through its API so they get HTTPS automatically. Subdomains only:
 * pointing a root domain here would take over the customer's main website.
 */
const LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const OWN_DOMAINS = /(^|\.)(intastellar[a-z-]*|consentsmanagement|vercel)\.[a-z.]+$/;
// Two-part endings, so that company.co.uk isn't mistaken for a subdomain.
const SECOND_LEVEL = new Set(["co.uk", "org.uk", "me.uk", "ac.uk", "com.au", "net.au", "org.au", "co.nz", "org.nz", "co.jp", "or.jp", "ne.jp", "com.br", "net.br", "org.br", "co.za", "com.mx", "co.in", "com.sg", "com.hk", "co.kr", "com.tr", "com.pl", "com.cn"]);
const FAILING_DAYS_BEFORE_REMOVAL = 14;
const API = "https://api.vercel.com";

/** A clean subdomain, or { error }. */
export function normalizeCustomDomain(input) {
    const name = normalizeHost(String(input || "").trim().replace(/^[a-z]+:\/\//i, "").split("/")[0]);
    const labels = name.split(".");
    if (!name || name.length > 253 || !labels.every((l) => LABEL.test(l)) || labels.length < 2 || !/[a-z]/.test(labels[labels.length - 1])) return { error: "Enter a domain like privacy.yourcompany.com" };
    if (isPlatformHost(name) || OWN_DOMAINS.test(name)) return { error: "That domain can't be used" };
    const rootParts = SECOND_LEVEL.has(labels.slice(-2).join(".")) ? 3 : 2;
    if (labels.length <= rootParts) return { error: "Use a subdomain, like privacy.yourcompany.com" };
    return name;
}

const vercelConfig = () => ({ token: process.env.VERCEL_API_TOKEN, project: process.env.VERCEL_PROJECT_ID, team: process.env.VERCEL_TEAM_ID });
export const customDomainsConfigured = () => { const c = vercelConfig(); return Boolean(c.token && c.project); };

function client(fetchImpl = globalThis.fetch) {
    const { token, project, team } = vercelConfig();
    const call = async (method, path, body) => {
        const separator = path.includes("?") ? "&" : "?";
        const response = await fetchImpl(`${API}${path.replace(":project", encodeURIComponent(project))}${team ? `${separator}teamId=${encodeURIComponent(team)}` : ""}`, {
            method,
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            ...(body ? { body: JSON.stringify(body) } : {}),
        });
        const data = await response.json().catch(() => ({}));
        return { ok: response.ok, status: response.status, data };
    };
    return call;
}

/** The DNS records to show the customer. */
export function dnsInstructions(domain, config, projectDomain) {
    const apex = projectDomain?.apexName;
    const host = apex && domain.endsWith(`.${apex}`) ? domain.slice(0, -apex.length - 1) : domain.split(".")[0];
    const target = String(config?.recommendedCNAME?.[0]?.value || "cname.vercel-dns.com").replace(/\.$/, "");
    const records = [{ type: "CNAME", name: host, value: target }];
    for (const v of projectDomain?.verification || []) records.push({ type: v.type, name: v.domain, value: v.value });
    return records;
}

/** Live state of an attached domain: { status: "active"|"pending", dns }. */
export async function domainState(domain, { fetchImpl } = {}) {
    const call = client(fetchImpl);
    const name = encodeURIComponent(domain);
    let { data: project } = await call("GET", `/v9/projects/:project/domains/${name}`);
    if (project && project.verified === false) project = (await call("POST", `/v9/projects/:project/domains/${name}/verify`)).data || project;
    const { ok, data: config } = await call("GET", `/v6/domains/${name}/config`);
    // Vercel's two answers can disagree, so a domain must pass both to count.
    const active = project?.verified === true && ok && config?.misconfigured === false;
    return { status: active ? "active" : "pending", dns: dnsInstructions(domain, config, project) };
}

export async function attachDomain(domain, { fetchImpl } = {}) {
    const call = client(fetchImpl);
    const { ok, status, data } = await call("POST", "/v10/projects/:project/domains", { name: domain });
    if (!ok && data?.error?.code !== "domain_already_in_use_by_this_project") {
        console.error("[dsr-domains] attach failed:", status, JSON.stringify(data).slice(0, 300));
        return { error: status === 409 ? "That domain is already connected elsewhere." : "The domain couldn't be connected. Please try again." };
    }
    if (data?.apexName === domain) {
        await detachDomain(domain, { fetchImpl });
        return { error: "Use a subdomain, like privacy.yourcompany.com" };
    }
    return {};
}

export async function detachDomain(domain, { fetchImpl } = {}) {
    const { ok, status } = await client(fetchImpl)("DELETE", `/v9/projects/:project/domains/${encodeURIComponent(domain)}`);
    return ok || status === 404;
}

const CLEARED = `custom_domain = NULL, custom_domain_status = NULL, custom_domain_dns = NULL, custom_domain_checked_at = NULL, custom_domain_failed_since = NULL`;
export const CLEAR_CUSTOM_DOMAIN = CLEARED;

/** Daily: refresh a batch of domains, and detach any that have pointed elsewhere for two weeks. */
export async function checkCustomDomains(db, { fetchImpl, limit = 20 } = {}) {
    if (!customDomainsConfigured()) return { checked: 0, removed: 0 };
    const { rows } = await db.query(
        `SELECT token, custom_domain, custom_domain_failed_since FROM dsr_public_forms WHERE custom_domain IS NOT NULL ORDER BY custom_domain_checked_at ASC NULLS FIRST LIMIT $1`,
        [limit]
    );
    let removed = 0;
    for (const form of rows) {
        const { status, dns } = await domainState(form.custom_domain, { fetchImpl });
        const failingFor = form.custom_domain_failed_since ? Date.now() - new Date(form.custom_domain_failed_since).getTime() : 0;
        if (status !== "active" && failingFor > FAILING_DAYS_BEFORE_REMOVAL * 86400000) {
            await detachDomain(form.custom_domain, { fetchImpl });
            await db.query(`UPDATE dsr_public_forms SET ${CLEARED} WHERE token = $1`, [form.token]);
            removed += 1;
            continue;
        }
        await db.query(
            `UPDATE dsr_public_forms SET custom_domain_status = $2, custom_domain_dns = $3::jsonb, custom_domain_checked_at = NOW(),
                    custom_domain_failed_since = CASE WHEN $2 = 'active' THEN NULL ELSE COALESCE(custom_domain_failed_since, NOW()) END
              WHERE token = $1`,
            [form.token, status, JSON.stringify(dns)]
        );
    }
    return { checked: rows.length, removed };
}
