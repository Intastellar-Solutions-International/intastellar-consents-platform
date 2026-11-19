// One place for the install code of both products, so Getting started, Add
// domain and Analytics' own setup card can never hand out different tags.
//
// The banner goes first: the analytics tracker reads the visitor's consent
// from it, and the banner must load before any other script that sets
// cookies.

export const CMP_CORE_SCRIPT = "https://consents.cdn.intastellarsolutions.com/uc.js";
export const cmpConfigScript = (domain) => `https://downloads.intastellarsolutions.com/cookieconsents/${domain}/config.js`;
export const ANALYTICS_INGEST_URL = "https://analytics.consentsmanagement.com/api/a";

export function cmpSnippet(domain) {
    return `<script src="${cmpConfigScript(domain)}"></script>\n<script src="${CMP_CORE_SCRIPT}"></script>`;
}

export function analyticsSnippet(siteKey) {
    return `<script src="${ANALYTICS_INGEST_URL}" data-site="${siteKey}" async defer></script>`;
}

// Banner + (when the domain has a site key) the analytics tracker.
export function installSnippet({ domain, siteKey }) {
    return siteKey ? `${cmpSnippet(domain)}\n${analyticsSnippet(siteKey)}` : cmpSnippet(domain);
}
