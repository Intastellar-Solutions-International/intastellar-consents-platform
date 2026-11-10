/**
 * Hosts that serve the dashboard itself. Any other host reaching this project
 * is a customer's domain, which must only ever show their request form.
 * Add new platform domains here when adding them to the Vercel project.
 */
const PLATFORM_HOSTS = new Set([
    "www.intastellarconsents.com", "intastellarconsents.com", "dev.intastellarconsents.com",
    "analytics.consentsmanagement.com", "www.consentsmanagement.com", "consentsmanagement.com",
    "consents.inta.dev", "consentsplatform.com", "www.consentsplatform.com",
    "consents.check.intastellarsolutions.com", "analytics.tst.intastellarsolutions.com",
    "analytics.prd.intastellarsolutions.com", "analytics.dev.intastellarsolutions.com",
    "localhost", "127.0.0.1",
]);

export const normalizeHost = (host) => String(host || "").trim().toLowerCase().split(",")[0].trim().replace(/:\d+$/, "").replace(/\.$/, "");

export function isPlatformHost(host) {
    const name = normalizeHost(host);
    return !name || PLATFORM_HOSTS.has(name) || name.endsWith(".vercel.app");
}

/** Where a page request on a customer's domain should go, or null for platform hosts. */
export function customHostTarget(host, search = "") {
    if (isPlatformHost(host)) return null;
    return `/api/dsr-public?host=1${search ? `&${search.replace(/^\?/, "")}` : ""}`;
}
