import punycode from "punycode";

export function toUnicodeDomain(domain) {
    try {
        return punycode.toUnicode(domain);
    } catch {
        return domain;
    }
}

/** The organisation's domain names, from the list the header keeps in localStorage. */
export function readCachedDomains() {
    try {
        const names = JSON.parse(localStorage.getItem("domains"));
        if (!Array.isArray(names)) return [];
        return names.filter((n) => typeof n === "string" && n && n !== "combined view").map((n) => punycode.toUnicode(n));
    } catch {
        return [];
    }
}
