const { useState, useEffect, useCallback } = window.React;
import Authentication from "../../../Authentication/Auth.js";
import SideNav from "../../../Components/Header/SideNav.js";
import { reportsLinks } from "../../../Components/Header/SideNavLinks/index.js";
import StickyPageTitle from "../../../Components/Header/Sticky/index.js";
import { ScannerHost } from "../../../API/host.js";
import "../Style.css";

const INGEST_URL = "https://app.intastellarconsents.com/api/a";

function readCachedDomains() {
    try {
        const raw = localStorage.getItem("domains");
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed.filter(d => d && typeof d === "string" && d !== "combined view");
    } catch { return []; }
}

function CopyButton({ text, label = "Copy" }) {
    const [copied, setCopied] = useState(false);
    const copy = useCallback(() => {
        navigator.clipboard.writeText(text).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }).catch(() => {
            const ta = document.createElement("textarea");
            ta.value = text;
            ta.style.position = "fixed";
            ta.style.opacity = "0";
            document.body.appendChild(ta);
            ta.select();
            document.execCommand("copy");
            document.body.removeChild(ta);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    }, [text]);
    return (
        <button
            type="button"
            className={"as-copy-btn" + (copied ? " as-copy-btn--done" : "")}
            onClick={copy}
            aria-label={copied ? "Copied!" : label}
        >
            {copied ? "Copied!" : label}
        </button>
    );
}

function SnippetBox({ siteKey }) {
    const snippet = `<script src="${INGEST_URL}" data-site="${siteKey}" async defer></script>`;
    return (
        <div className="as-snippet">
            <div className="as-snippet__header">
                <span className="as-snippet__label">Embed snippet</span>
                <CopyButton text={snippet} label="Copy snippet" />
            </div>
            <pre className="as-snippet__code">{snippet}</pre>
            <p className="as-snippet__hint">
                Paste this into the <code>&lt;head&gt;</code> of every page. The script is a no-op until
                the visitor accepts <strong>statisticCookies</strong> in your Intastellar banner.
            </p>
        </div>
    );
}

export default function AnalyticsScript() {
    document.title = "Analytics Script | Settings | Intastellar Consents";

    const domains = readCachedDomains();
    const [domain, setDomain] = useState(domains[0] || "");
    const [siteData, setSiteData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [generating, setGenerating] = useState(false);
    const [error, setError] = useState(null);

    const authHeaders = {
        Authorization: Authentication.getToken(),
        Organisation: String(Authentication.getOrganisation()),
        "Content-Type": "application/json",
    };

    const loadSiteKey = useCallback(async (d) => {
        if (!d) { setSiteData(null); return; }
        setLoading(true);
        setError(null);
        try {
            const r = await fetch(
                `${ScannerHost}/api/analytics-site?domain=${encodeURIComponent(d)}`,
                { headers: authHeaders }
            );
            if (r.status === 404) { setSiteData(null); }
            else if (r.ok) { setSiteData(await r.json()); }
            else { setError("Failed to load site key."); }
        } catch { setError("Network error."); }
        finally { setLoading(false); }
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => { loadSiteKey(domain); }, [domain]); // eslint-disable-line react-hooks/exhaustive-deps

    const generateKey = async () => {
        if (!domain) return;
        setGenerating(true);
        setError(null);
        try {
            const r = await fetch(`${ScannerHost}/api/analytics-site`, {
                method: "POST",
                headers: authHeaders,
                body: JSON.stringify({ domain }),
            });
            if (r.ok) { setSiteData(await r.json()); }
            else { setError("Failed to generate site key."); }
        } catch { setError("Network error."); }
        finally { setGenerating(false); }
    };

    return (
        <>
            <SideNav links={reportsLinks} title="Settings" />
            <div className="dashboard-content">
                <StickyPageTitle title="Analytics Script" />
                <div className="settings-section">
                    <div className="as-intro">
                        <p>
                            Embed this lightweight script on your website to collect first-party, consent-gated
                            analytics. The script reads your Intastellar banner cookie and only activates when the
                            visitor has accepted <strong>statisticCookies</strong> — no consent, no data.
                        </p>
                    </div>

                    {domains.length > 0 && (
                        <div className="as-domain-row">
                            <label className="as-label" htmlFor="as-domain-select">Domain</label>
                            <select
                                id="as-domain-select"
                                className="as-select"
                                value={domain}
                                onChange={e => setDomain(e.target.value)}
                            >
                                {domains.map(d => <option key={d} value={d}>{d}</option>)}
                            </select>
                        </div>
                    )}

                    {error && <p className="as-error">{error}</p>}

                    {loading && <p className="as-loading">Loading&hellip;</p>}

                    {!loading && domain && !siteData && (
                        <div className="as-empty">
                            <p>No site key yet for <strong>{domain}</strong>.</p>
                            <button
                                type="button"
                                className="as-generate-btn"
                                onClick={generateKey}
                                disabled={generating}
                            >
                                {generating ? "Generating…" : "Generate site key"}
                            </button>
                        </div>
                    )}

                    {!loading && siteData && (
                        <div className="as-card">
                            <div className="as-key-row">
                                <div>
                                    <span className="as-label">Site key</span>
                                    <span className="as-key-value">{siteData.id}</span>
                                </div>
                                <div className="as-key-actions">
                                    <span className={"as-status" + (siteData.active ? " as-status--active" : " as-status--inactive")}>
                                        {siteData.active ? "Active" : "Inactive"}
                                    </span>
                                    <CopyButton text={siteData.id} label="Copy key" />
                                </div>
                            </div>

                            <SnippetBox siteKey={siteData.id} />

                            <div className="as-privacy-note">
                                <h4 className="as-privacy-note__title">What we collect</h4>
                                <div className="as-privacy-note__cols">
                                    <ul className="as-privacy-note__list as-privacy-note__list--yes">
                                        <li>Page path &amp; query string</li>
                                        <li>Page title</li>
                                        <li>Referrer hostname</li>
                                        <li>UTM parameters</li>
                                        <li>Device type, screen dimensions</li>
                                        <li>Browser &amp; OS family</li>
                                        <li>Country code (from IP — IP discarded)</li>
                                        <li>Tab-scoped session ID (cleared on tab close)</li>
                                        <li>Time on page</li>
                                    </ul>
                                    <ul className="as-privacy-note__list as-privacy-note__list--no">
                                        <li>IP addresses</li>
                                        <li>Full referrer URLs</li>
                                        <li>User identifiers or email</li>
                                        <li>Cross-session or cross-device tracking</li>
                                        <li>Data without explicit statisticCookies consent</li>
                                    </ul>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </>
    );
}
