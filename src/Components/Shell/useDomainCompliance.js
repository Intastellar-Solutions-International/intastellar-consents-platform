import API from "../../API/api";
import { isCombinedOrClearDomain } from "../../Functions/domainPathSegments.js";
import { scanCompliance } from "../../Functions/transferCompliance.js";

const { useState, useEffect } = React;

export const COMPLIANCE_CHANGED_EVENT = "compliance-status-changed";

/**
 * The domain's compliance status from its latest scan and the organisation's
 * vendor records. Null while loading or when either can't be read, because
 * missing vendor records would otherwise look like missing DPAs.
 */
export default function useDomainCompliance(domain) {
    const [status, setStatus] = useState(null);
    const [version, setVersion] = useState(0);

    useEffect(() => {
        const refresh = () => setVersion((v) => v + 1);
        window.addEventListener(COMPLIANCE_CHANGED_EVENT, refresh);
        return () => window.removeEventListener(COMPLIANCE_CHANGED_EVENT, refresh);
    }, []);

    useEffect(() => {
        const api = API[localStorage.getItem("platform") || "gdpr"];
        if (!api?.getPreConsentTransfers || !api?.vendorCompliance || isCombinedOrClearDomain(domain)) { setStatus(null); return undefined; }
        const ac = new AbortController();
        const options = (cfg) => ({ headers: { ...cfg.headers }, signal: ac.signal });
        Promise.all([
            fetch(`${api.getPreConsentTransfers.url}?domain=${encodeURIComponent(domain)}`, options(api.getPreConsentTransfers)).then((r) => r.json()),
            fetch(api.vendorCompliance.url, options(api.vendorCompliance)).then((r) => (r.ok ? r.json() : Promise.reject(new Error("vendor records")))),
        ])
            .then(([scan, data]) => setStatus(scanCompliance(scan, data?.records || {})))
            .catch((e) => { if (e.name !== "AbortError") setStatus(null); });
        return () => ac.abort();
    }, [domain, version]);

    return status;
}
