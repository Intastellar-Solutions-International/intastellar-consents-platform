import API from "../../API/api";
import Fetch from "../../Functions/fetch";
import { getOrg } from "../../Functions/storage.js";
import "./AddDomain.css";

const { useState, useRef } = React;

const DOCS_URL = "https://inta.dev/docs/cookie-banner/v1";
const DEFAULT_COLOR = "#003399"; // the banner's own default, rgba(0, 51, 153, 1)
const CORE_SCRIPT = "https://consents.cdn.intastellarsolutions.com/uc.js";
const configScript = (domain) => `https://downloads.intastellarsolutions.com/cookieconsents/${domain}/config.js`;

// settings.design values the banner understands ("overlay" is its default).
// Names and looks follow the gallery at intastellar.eu/cookie-banners.
const DESIGNS = [
    { id: "overlay", name: "Popup", layout: "popup", description: "Compact card bottom-centre — the most familiar consent pattern" },
    { id: "banner", name: "Wide", layout: "wide", description: "Full-width bar with logo and buttons in a side panel" },
    { id: "bannerV2", name: "Wide V2", layout: "wide", description: "Updated full-width bar with a side panel" },
    { id: "nova", name: "Nova", layout: "nova", fixedPalette: true, description: "Navy and gold card with a floating cookie badge" },
    { id: "premium", name: "Premium", layout: "premium", fixedPalette: true, description: "Plain, neutral card that stays out of the way" },
];
const designById = (id) => DESIGNS.find((d) => d.id === id) || DESIGNS[0];

/*
 * `arrange` means different things per layout in the banner: wide bars move
 * their side panel (rtl → left), corner cards change corner (ltr → left).
 * Leaving it out keeps the banner's default side, so only the alternative
 * side is ever written. The popup is always centred.
 */
const POSITIONS = {
    wide: { label: "Logo & buttons", alt: "rtl", options: [["default", "Right"], ["alt", "Left"]] },
    nova: { label: "Corner", alt: "ltr", options: [["default", "Bottom right"], ["alt", "Bottom left"]] },
    premium: { label: "Corner", alt: "ltr", options: [["default", "Bottom right"], ["alt", "Bottom left"]] },
};
const arrangeFor = (design, side) => (side === "alt" ? POSITIONS[designById(design).layout]?.alt : undefined);

/** Readable text on `hex` — same luminance rule as the demo at intastellar.eu/demo. */
function textOn(hex) {
    const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(hex || "");
    if (!m) return "#ffffff";
    const [r, g, b] = m.slice(1).map((h) => parseInt(h, 16));
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.45 ? "#111827" : "#ffffff";
}

// One label per DNS segment, Unicode allowed (IDNs are punycoded server-side).
const DOMAIN_RE = /^(?:[\p{L}\p{N}](?:[\p{L}\p{N}-]{0,61}[\p{L}\p{N}])?\.)+\p{L}{2,63}$/u;
const COOKIE_RE = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;

/** "https://www.Example.com/path?x" → "example.com"; null when it isn't a domain. */
function normaliseDomain(raw) {
    const host = raw.trim().toLowerCase()
        .replace(/^[a-z][a-z0-9+.-]*:\/\//, "")
        .split(/[/?#]/)[0]
        .replace(/:\d+$/, "")
        .replace(/^www\./, "")
        .replace(/\.$/, "");
    return DOMAIN_RE.test(host) ? host : null;
}

const parseDomain = (raw) => {
    const domain = normaliseDomain(raw);
    return domain ? { value: domain } : { error: `“${raw.trim()}” isn't a valid domain — use e.g. example.com` };
};

const parseCookie = (raw) => {
    const name = raw.trim();
    return COOKIE_RE.test(name) ? { value: name } : { error: `“${name}” isn't a valid cookie name` };
};

/*
 * The config the banner reads (same shape as gdpr-consents.config.js in
 * intastellar-cookie-solutions). The backend stores it as the domain's
 * config.js, so it is sent as a ready-to-serve script. `<` is escaped so a
 * value can never close the script tag.
 */
function buildConfigScript(s) {
    const config = {
        policy_link: s.policyUrl ? { url: s.policyUrl, target: "_blank" } : undefined,
        settings: {
            company: s.company || undefined,
            design: s.design,
            color: s.color,
            arrange: s.arrange,
            logo: s.logo || undefined,
            requiredCookies: s.requiredCookies.map((cookie) => ({ cookie })),
            partnerDomain: s.partnerDomains,
        },
    };
    const json = JSON.stringify(config, null, 4).replace(/</g, "\\u003c");
    return `<script>\nwindow.INTA = ${json};\n</script>`;
}

/*
 * Chips input: Enter, comma or paste commits (a pasted list is split on
 * commas, spaces and newlines), Backspace on an empty field removes the last
 * chip. Invalid entries stay in the field with an inline error.
 */
function TagInput({ id, label, hint, values, onChange, parse, placeholder, addLabel, large }) {
    const [draft, setDraft] = useState("");
    const [error, setError] = useState(null);
    const inputRef = useRef(null);

    function commit(text) {
        const parts = text.split(/[\s,;]+/).filter(Boolean);
        if (parts.length === 0) return;
        const next = [...values];
        const rejected = [];
        let firstError = null;
        for (const part of parts) {
            const { value, error: err } = parse(part);
            if (err) { rejected.push(part); firstError = firstError || err; continue; }
            if (!next.includes(value)) next.push(value);
        }
        if (next.length !== values.length) onChange(next);
        setDraft(rejected.join(", "));
        setError(firstError);
    }

    function onKeyDown(e) {
        if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            commit(draft);
        } else if (e.key === "Backspace" && draft === "" && values.length > 0) {
            onChange(values.slice(0, -1));
        }
    }

    function onPaste(e) {
        const text = e.clipboardData.getData("text");
        if (!/[\s,;]/.test(text.trim())) return; // a single value pastes normally
        e.preventDefault();
        commit(draft + text);
    }

    return (
        <div className="ad-field">
            <label className="ad-label" htmlFor={id}>{label}</label>
            {hint ? <p className="ad-hint" id={`${id}-hint`}>{hint}</p> : null}
            <div className={"ad-tags" + (large ? " ad-tags--large" : "") + (error ? " ad-tags--invalid" : "")}>
                <div className="ad-tags__box" onClick={() => inputRef.current?.focus()}>
                    {values.map((v) => (
                        <span className="ad-chip" key={v}>
                            <span className="ad-chip__text">{v}</span>
                            <button
                                type="button"
                                className="ad-chip__remove"
                                aria-label={`Remove ${v}`}
                                onClick={(e) => { e.stopPropagation(); onChange(values.filter((x) => x !== v)); }}
                            >
                                ×
                            </button>
                        </span>
                    ))}
                    <input
                        ref={inputRef}
                        id={id}
                        className="ad-tags__input"
                        value={draft}
                        placeholder={values.length === 0 ? placeholder : ""}
                        aria-describedby={hint ? `${id}-hint` : undefined}
                        aria-invalid={error ? true : undefined}
                        autoComplete="off"
                        spellCheck={false}
                        onChange={(e) => { setDraft(e.target.value); if (error) setError(null); }}
                        onKeyDown={onKeyDown}
                        onPaste={onPaste}
                        onBlur={() => commit(draft)}
                    />
                </div>
                {addLabel ? (
                    <button type="button" className="ad-btn ad-btn--secondary" disabled={!draft.trim()} onClick={() => commit(draft)}>
                        {addLabel}
                    </button>
                ) : null}
            </div>
            {error ? <p className="ad-error" role="alert">{error}</p> : null}
        </div>
    );
}

function CopyButton({ text }) {
    const [copied, setCopied] = useState(false);
    return (
        <button
            type="button"
            className={"ad-btn ad-btn--copy" + (copied ? " ad-btn--copied" : "")}
            onClick={() => {
                navigator.clipboard?.writeText(text).then(() => {
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                });
            }}
        >
            {copied ? "Copied" : "Copy"}
        </button>
    );
}

const PlanetMark = () => (
    <svg viewBox="0 0 40 40" fill="none" width="100%" height="100%">
        <circle cx="20" cy="20" r="8" fill="currentColor" opacity=".9" />
        <ellipse cx="20" cy="20" rx="18" ry="5" stroke="currentColor" strokeWidth="2" fill="none" opacity=".5" transform="rotate(-20 20 20)" />
    </svg>
);

function PreviewLogo({ logo, className }) {
    const [broken, setBroken] = useState(false);
    return (
        <span className={"bp__logo " + className}>
            {logo && !broken ? <img src={logo} alt="" onError={() => setBroken(true)} /> : <PlanetMark />}
        </span>
    );
}

/* Picker thumbnail — the gallery's mini layout for each design. */
function DesignThumb({ design, color, side }) {
    const { layout } = designById(design);
    const alt = side === "alt" && POSITIONS[layout];
    return (
        <span className={"dt dt--" + layout + (alt ? " dt--alt" : "")} style={{ "--ad-brand": color }} aria-hidden="true">
            <span className="dt__line dt__line--wide" />
            <span className="dt__line" />
            <span className="dt__shape">
                <span className="dt__a" />
                <span className="dt__b" />
            </span>
            {layout === "nova" ? <span className="dt__badge" /> : null}
        </span>
    );
}

/*
 * Visual preview of the chosen design, modelled on the live demo at
 * intastellar.eu/demo — layout, palette and copy, not the real banner script.
 */
function BannerPreview({ design, color, side, logo, company, domain }) {
    const { layout } = designById(design);
    const alt = side === "alt" && POSITIONS[layout];
    const brandText = textOn(color);
    const name = company || domain || "yourdomain.com";

    return (
        <div className="ad-preview" aria-hidden="true">
            <div className="ad-preview__chrome">
                <span className="ad-preview__dots"><i /><i /><i /></span>
                <span className="ad-preview__url">{domain || "yourdomain.com"}</span>
            </div>
            <div className="ad-preview__page">
                <div className="ad-preview__nav" />
                <div className="ad-preview__hero" />
                <div className="ad-preview__line ad-preview__line--wide" />
                <div className="ad-preview__line" />
                <div className="ad-preview__cards"><span /><span /><span /></div>

                <div className={"bp-stage bp-stage--" + layout + (alt ? " bp-stage--alt" : "")}>
                    <div
                        className={"bp bp--" + layout + (alt ? " bp--alt" : "")}
                        style={{ "--ad-brand": color, "--ad-brand-text": brandText }}
                    >
                        <div className="bp__main">
                            <div className="bp__content">
                                {layout === "popup" || layout === "nova" ? <PreviewLogo logo={logo} className="bp__logo--content" /> : null}
                                <strong className="bp__title">You're in control</strong>
                                <span className="bp__body">
                                    {name} uses cookies for functionality, analytics and advertising. Choose what you're happy with.
                                </span>
                                {layout !== "nova" ? <span className="bp__policy">{name} privacy policy</span> : null}
                            </div>
                            <div className="bp__actions">
                                {layout === "wide" ? <PreviewLogo logo={logo} className="bp__logo--side" /> : null}
                                <span className="bp__accept">ACCEPT</span>
                                {layout !== "nova" ? <span className="bp__decline">DECLINE ALL</span> : null}
                                <span className="bp__links">
                                    <span className="bp__details">{layout === "premium" ? "Manage Settings" : "Show details"}</span>
                                    {layout === "popup" || layout === "wide" ? <span>Vendor list</span> : null}
                                </span>
                            </div>
                        </div>
                    </div>
                    {layout === "nova" ? <span className="bp__badge"><span /></span> : null}
                </div>
            </div>
        </div>
    );
}

function InstallInstructions({ domains, embedded, onAddMore }) {
    const [active, setActive] = useState(domains[0]);
    const snippet = `<script src="${configScript(active)}"></script>\n<script src="${CORE_SCRIPT}"></script>`;

    return (
        <section className="ad-card ad-success">
            <span className="ad-success__icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
            </span>
            <h2 className="ad-card__title">
                {domains.length === 1 ? `${domains[0]} was added` : `${domains.length} domains were added`}
            </h2>
            <p className="ad-card__intro">
                Add these two lines to the <code>&lt;head&gt;</code> of {domains.length === 1 ? "your website" : "each website"}, before any other script that sets cookies.
            </p>

            {domains.length > 1 ? (
                <div className="ad-segmented ad-segmented--wrap" role="tablist" aria-label="Domain">
                    {domains.map((d) => (
                        <button
                            key={d}
                            type="button"
                            role="tab"
                            aria-selected={d === active}
                            className={"ad-segmented__option" + (d === active ? " ad-segmented__option--active" : "")}
                            onClick={() => setActive(d)}
                        >
                            {d}
                        </button>
                    ))}
                </div>
            ) : null}

            <div className="ad-code">
                <CopyButton text={snippet} />
                <pre><code>{snippet}</code></pre>
            </div>

            <p className="ad-hint">
                Need a different setup (Google Tag Manager, WordPress, Shopify)? See the{" "}
                <a href={DOCS_URL} target="_blank" rel="noopener noreferrer">cookie banner documentation</a>.
            </p>

            <div className="ad-actions">
                {embedded ? (
                    <button type="button" className="ad-btn ad-btn--secondary" onClick={onAddMore}>Add more domains</button>
                ) : (
                    // The app only learns about the new domains on load.
                    <button type="button" className="ad-btn ad-btn--primary" onClick={() => window.location.reload()}>Go to dashboard</button>
                )}
            </div>
        </section>
    );
}

export default function AddDomain({ embedded }) {
    const organisation = getOrg();

    const [domains, setDomains] = useState([]);
    const [policyUrl, setPolicyUrl] = useState(null); // null = follow the first domain
    const [company, setCompany] = useState(organisation?.name ?? "");
    const [design, setDesign] = useState("overlay");
    const [color, setColor] = useState(DEFAULT_COLOR);
    const [side, setSide] = useState("default"); // see POSITIONS
    const [logo, setLogo] = useState("");
    const [requiredCookies, setRequiredCookies] = useState([]);
    const [partnerDomains, setPartnerDomains] = useState([]);
    const [status, setStatus] = useState("idle"); // idle | saving | error
    const [savedDomains, setSavedDomains] = useState(null);

    const effectivePolicyUrl = policyUrl ?? (domains[0] ? `https://${domains[0]}/privacy-policy` : "");
    const currentDesign = designById(design);
    const position = POSITIONS[currentDesign.layout];

    function reset() {
        setDomains([]);
        setPolicyUrl(null);
        setSavedDomains(null);
        setStatus("idle");
    }

    async function save(e) {
        e.preventDefault();
        if (domains.length === 0 || status === "saving") return;
        setStatus("saving");
        try {
            const re = await Fetch(
                API.settings.addDomain.url,
                API.settings.addDomain.method,
                API.settings.addDomain.headers,
                JSON.stringify({
                    organisationId: organisation?.id ?? null,
                    domains,
                    settings: buildConfigScript({
                        policyUrl: effectivePolicyUrl.trim(),
                        company: company.trim(),
                        design,
                        color,
                        arrange: arrangeFor(design, side),
                        logo: logo.trim(),
                        requiredCookies,
                        partnerDomains,
                    }),
                })
            );
            if (re !== "success") throw new Error(String(re));
            setSavedDomains(domains);
            setStatus("idle");
        } catch {
            setStatus("error");
        }
    }

    const header = !embedded ? (
        <header className="ad-header">
            <h1 className="ad-header__title">Add your first domain</h1>
            <p className="ad-header__intro">
                Add the websites you want Intastellar Consents to manage, choose how the cookie banner
                looks, and we'll give you the code to install it.
            </p>
        </header>
    ) : null;

    if (savedDomains) {
        return (
            <div className={"add-domain" + (embedded ? " add-domain--embedded" : "")}>
                {header}
                <InstallInstructions domains={savedDomains} embedded={embedded} onAddMore={reset} />
            </div>
        );
    }

    return (
        <div className={"add-domain" + (embedded ? " add-domain--embedded" : "")}>
            {header}
            <form className="ad-layout" onSubmit={save} noValidate>
                <div className="ad-main">
                    <section className="ad-card">
                        <div className="ad-card__head">
                            <span className="ad-step">1</span>
                            <div>
                                <h2 className="ad-card__title">Domains</h2>
                                <p className="ad-card__intro">Root domains only — subdomains are covered automatically.</p>
                            </div>
                        </div>
                        <TagInput
                            id="ad-domains"
                            label="Website domain"
                            hint="Press Enter to add. You can paste several at once."
                            values={domains}
                            onChange={setDomains}
                            parse={parseDomain}
                            placeholder="example.com"
                            addLabel="Add"
                            large
                        />
                    </section>

                    <section className="ad-card">
                        <div className="ad-card__head">
                            <span className="ad-step">2</span>
                            <div>
                                <h2 className="ad-card__title">Banner settings</h2>
                                <p className="ad-card__intro">Applies to every domain above. You can change all of this later.</p>
                            </div>
                        </div>

                        <div className="ad-grid">
                            <div className="ad-field ad-field--full">
                                <span className="ad-label" id="ad-design-label">Design</span>
                                <div className="ad-designs" role="radiogroup" aria-labelledby="ad-design-label">
                                    {DESIGNS.map((d) => (
                                        <button
                                            key={d.id}
                                            type="button"
                                            role="radio"
                                            aria-checked={design === d.id}
                                            className={"ad-design" + (design === d.id ? " ad-design--active" : "")}
                                            onClick={() => setDesign(d.id)}
                                        >
                                            <DesignThumb design={d.id} color={color} side={side} />
                                            <span className="ad-design__name">
                                                {d.name}
                                                {d.id === "overlay" ? <span className="ad-design__tag">Default</span> : null}
                                            </span>
                                            <span className="ad-design__description">{d.description}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="ad-field ad-field--full">
                                <label className="ad-label" htmlFor="ad-policy">Privacy policy URL</label>
                                <input
                                    id="ad-policy"
                                    className="ad-input"
                                    type="url"
                                    placeholder="https://example.com/privacy-policy"
                                    value={effectivePolicyUrl}
                                    onChange={(e) => setPolicyUrl(e.target.value)}
                                />
                            </div>

                            <div className="ad-field">
                                <label className="ad-label" htmlFor="ad-company">Company name</label>
                                <input
                                    id="ad-company"
                                    className="ad-input"
                                    type="text"
                                    autoComplete="organization"
                                    value={company}
                                    onChange={(e) => setCompany(e.target.value)}
                                />
                            </div>

                            <div className="ad-field">
                                <label className="ad-label" htmlFor="ad-logo">Logo URL <span className="ad-optional">optional</span></label>
                                <input
                                    id="ad-logo"
                                    className="ad-input"
                                    type="url"
                                    placeholder="https://example.com/logo.svg"
                                    value={logo}
                                    onChange={(e) => setLogo(e.target.value)}
                                />
                            </div>

                            <div className="ad-field">
                                <label className="ad-label" htmlFor="ad-color">
                                    Brand colour
                                    {currentDesign.fixedPalette ? <span className="ad-optional">not used by {currentDesign.name}</span> : null}
                                </label>
                                <div className={"ad-color" + (currentDesign.fixedPalette ? " ad-color--muted" : "")}>
                                    <input
                                        className="ad-color__swatch"
                                        type="color"
                                        aria-label="Pick brand colour"
                                        value={/^#[0-9a-f]{6}$/i.test(color) ? color : DEFAULT_COLOR}
                                        onChange={(e) => setColor(e.target.value)}
                                    />
                                    <input
                                        id="ad-color"
                                        className="ad-input ad-input--mono"
                                        type="text"
                                        spellCheck={false}
                                        value={color}
                                        onChange={(e) => setColor(e.target.value)}
                                    />
                                </div>
                            </div>

                            {position ? (
                                <div className="ad-field">
                                    <span className="ad-label" id="ad-arrange-label">{position.label}</span>
                                    <div className="ad-segmented" role="radiogroup" aria-labelledby="ad-arrange-label">
                                        {position.options.map(([value, label]) => (
                                            <button
                                                key={value}
                                                type="button"
                                                role="radio"
                                                aria-checked={side === value}
                                                className={"ad-segmented__option" + (side === value ? " ad-segmented__option--active" : "")}
                                                onClick={() => setSide(value)}
                                            >
                                                {label}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            ) : null}
                        </div>

                        <details className="ad-advanced">
                            <summary>Advanced</summary>
                            <div className="ad-grid">
                                <TagInput
                                    id="ad-required"
                                    label="Required cookies"
                                    hint="Strictly necessary cookies that are always allowed, e.g. a session cookie."
                                    values={requiredCookies}
                                    onChange={setRequiredCookies}
                                    parse={parseCookie}
                                    placeholder="PHPSESSID"
                                />
                                <TagInput
                                    id="ad-partners"
                                    label="Partner domains"
                                    hint="Other domains you own that should share the visitor's consent."
                                    values={partnerDomains}
                                    onChange={setPartnerDomains}
                                    parse={parseDomain}
                                    placeholder="partner.com"
                                />
                            </div>
                        </details>
                    </section>
                </div>

                <aside className="ad-aside">
                    <section className="ad-card ad-card--sticky">
                        <h2 className="ad-card__title">Preview</h2>
                        <BannerPreview design={design} color={color} side={side} logo={logo} company={company} domain={domains[0]} />
                        <dl className="ad-summary">
                            <div><dt>Design</dt><dd>{currentDesign.name}</dd></div>
                            <div><dt>Domains</dt><dd>{domains.length || "None yet"}</dd></div>
                            {organisation?.name ? <div><dt>Organisation</dt><dd>{organisation.name}</dd></div> : null}
                        </dl>
                        {status === "error" ? (
                            <p className="ad-error ad-error--box" role="alert">We couldn't save your domains. Please try again in a moment.</p>
                        ) : null}
                        <button
                            type="submit"
                            className="ad-btn ad-btn--primary ad-btn--block"
                            disabled={domains.length === 0 || status === "saving"}
                            aria-busy={status === "saving"}
                        >
                            {status === "saving" ? <span className="ad-spinner" aria-hidden="true" /> : null}
                            {status === "saving"
                                ? "Saving…"
                                : domains.length > 1 ? `Add ${domains.length} domains` : "Add domain"}
                        </button>
                        <p className="ad-hint ad-hint--center">
                            <a href={DOCS_URL} target="_blank" rel="noopener noreferrer">Read the documentation</a>
                        </p>
                    </section>
                </aside>
            </form>
        </div>
    );
}
