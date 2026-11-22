import punycode from "punycode";

export function toUnicodeDomain(domain) {
    try {
        return punycode.toUnicode(domain);
    } catch {
        return domain;
    }
}

/** The organisation's domain names, from the list the header keeps in localStorage. */
/** The header's domain (DomainContext value) when it's one of `domains`, else "". */
export function headerDomainIn(domains, headerDomain) {
    if (!headerDomain || headerDomain === "combined view") return "";
    const wanted = String(headerDomain).trim().toLowerCase();
    return (domains || []).find((d) => d.toLowerCase() === wanted) || "";
}

export function readCachedDomains() {
    try {
        const names = JSON.parse(localStorage.getItem("domains"));
        if (!Array.isArray(names)) return [];
        return names.filter((n) => typeof n === "string" && n && n !== "combined view").map((n) => punycode.toUnicode(n));
    } catch {
        return [];
    }
}
