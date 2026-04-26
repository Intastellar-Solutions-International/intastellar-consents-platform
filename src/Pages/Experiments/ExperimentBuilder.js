/*
 * --- ExperimentBuilder ------------------------------------------------
 *
 * Pure client-side form that emits a window.INTA.experiment object the
 * user can paste into their site. There's no API call here — banner
 * config still lives on the customer's page; the platform's job is to
 * help authors compose a valid experiment definition and ship it to
 * their site without hand-writing JSON.
 *
 * The output shape is fixed:
 *
 *   {
 *     id: "asa-banner-design",
 *     variants: {
 *       control: { weight: 25 },
 *       variant: {
 *         weight: 50,
 *         settings: { design: 'overlay', color: '#1c6084' }
 *       },
 *       ...
 *     }
 *   }
 *
 * Design notes
 *  - Each variant carries an internal `rowId` so React keys are stable
 *    even if the user renames a variant mid-edit. The output object
 *    keys come from `variant.key` (the user-typed name).
 *  - "Use existing banner" toggles a variant into a control: settings
 *    are dropped from the output, signalling the banner runtime to
 *    leave its existing config alone for that bucket.
 *  - Weights are relative; we display the normalised split below the
 *    form so authors can sanity-check their assignment without doing
 *    arithmetic.
 *  - Validation runs on every render and the Copy button is disabled
 *    when errors exist. Cheap and accurate beats deferred submit-time
 *    validation here — the form is small.
 */

const { useState, useMemo } = React;

const KNOWN_DESIGNS = ["overlay", "banner", "popover", "modal", "drawer"];
const ID_PATTERN = /^[a-z][a-z0-9-]*$/;
const VARIANT_KEY_PATTERN = /^[A-Za-z][A-Za-z0-9_-]*$/;

let _rowSeq = 0;
function uid(prefix) {
    _rowSeq += 1;
    return `${prefix}-${_rowSeq}`;
}

function slugify(value) {
    return String(value || "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 60);
}

/**
 * Build the initial draft. When the page is opened from a deep link in
 * the marketing suggestions strip we'll have either a channel scope
 * ("channel:Google Ads") or a hypothesis tag ("essential-only-copy") —
 * both translate cleanly into a starter ID so the user doesn't face an
 * empty form on arrival.
 */
function makeDefaultDraft({ idHint = "", scopeHint = "", hypothesisHint = "" } = {}) {
    let suggestedId = idHint;
    if (!suggestedId && scopeHint) {
        const channel = scopeHint.startsWith("channel:")
            ? scopeHint.slice("channel:".length)
            : scopeHint;
        const slug = slugify(channel);
        if (slug) suggestedId = `${slug}-banner-test`;
    }
    if (!suggestedId && hypothesisHint) {
        const slug = slugify(hypothesisHint);
        if (slug) suggestedId = `${slug}-test`;
    }
    return {
        id: suggestedId || "",
        variants: [
            {
                rowId: uid("v"),
                key: "control",
                weight: 50,
                isControl: true,
                settings: { design: "", color: "", textOverridePresetId: "" },
            },
            {
                rowId: uid("v"),
                key: "variant",
                weight: 50,
                isControl: false,
                settings: { design: "banner", color: "", textOverridePresetId: "" },
            },
        ],
    };
}

function buildExperimentObject(draft) {
    const variants = {};
    for (const v of draft.variants || []) {
        const key = String(v.key || "").trim();
        if (!key) continue;
        const weight = Number(v.weight);
        const safeWeight = Number.isFinite(weight) && weight > 0 ? weight : 0;
        const out = { weight: safeWeight };
        if (!v.isControl && v.settings) {
            const settings = {};
            const design = String(v.settings.design || "").trim();
            const color = String(v.settings.color || "").trim();
            const preset = String(v.settings.textOverridePresetId || "").trim();
            if (design) settings.design = design;
            if (color) settings.color = color;
            if (preset) settings.textOverridePresetId = preset;
            if (Object.keys(settings).length > 0) {
                out.settings = settings;
            }
        }
        variants[key] = out;
    }
    return { id: String(draft.id || "").trim(), variants };
}

function formatSnippet(experiment) {
    const json = JSON.stringify(experiment, null, 4);
    return `window.INTA = window.INTA || {};\nwindow.INTA.experiment = ${json};`;
}

function validateDraft(draft) {
    const errors = [];
    const id = String(draft.id || "").trim();
    if (!id) {
        errors.push("Experiment ID is required.");
    } else if (!ID_PATTERN.test(id)) {
        errors.push(
            "ID must be lowercase letters, digits, and dashes (e.g. asa-banner-design)."
        );
    }

    const seen = new Set();
    let validKeyCount = 0;
    let totalWeight = 0;
    let hasDuplicate = false;
    let hasInvalidKey = false;
    for (const v of draft.variants || []) {
        const k = String(v.key || "").trim();
        if (!k) continue;
        validKeyCount += 1;
        if (seen.has(k)) hasDuplicate = true;
        seen.add(k);
        if (!VARIANT_KEY_PATTERN.test(k)) hasInvalidKey = true;
        const w = Number(v.weight);
        if (Number.isFinite(w) && w > 0) totalWeight += w;
    }
    if (validKeyCount < 2) {
        errors.push(
            "Add at least two variants — typically one control and one test variant."
        );
    }
    if (hasDuplicate) errors.push("Variant names must be unique.");
    if (hasInvalidKey) {
        errors.push(
            "Variant names must start with a letter and use only letters, digits, _ and -."
        );
    }
    if (totalWeight <= 0) {
        errors.push("At least one variant needs a positive weight.");
    }
    return errors;
}

async function copyToClipboard(text) {
    if (typeof navigator !== "undefined" && navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        return;
    }
    // Fallback for older browsers or non-secure contexts where the modern
    // clipboard API isn't available. Synchronous, but the caller still
    // awaits the promise so behaviour is identical from their side.
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    try {
        document.execCommand("copy");
    } finally {
        document.body.removeChild(ta);
    }
}

export default function ExperimentBuilder({
    initialIdHint,
    initialScopeHint,
    initialHypothesisHint,
    onClose,
}) {
    const [draft, setDraft] = useState(() =>
        makeDefaultDraft({
            idHint: initialIdHint,
            scopeHint: initialScopeHint,
            hypothesisHint: initialHypothesisHint,
        })
    );
    const [copyState, setCopyState] = useState("idle");

    const errors = useMemo(() => validateDraft(draft), [draft]);
    const hasErrors = errors.length > 0;
    const built = useMemo(() => buildExperimentObject(draft), [draft]);
    const snippet = useMemo(() => formatSnippet(built), [built]);

    const totalWeight = draft.variants.reduce((sum, v) => {
        const w = Number(v.weight);
        return sum + (Number.isFinite(w) && w > 0 ? w : 0);
    }, 0);

    const splits = draft.variants
        .filter((v) => String(v.key || "").trim())
        .map((v) => {
            const w = Number(v.weight);
            const safe = Number.isFinite(w) && w > 0 ? w : 0;
            return {
                rowId: v.rowId,
                key: v.key,
                pct: totalWeight > 0 ? (safe / totalWeight) * 100 : 0,
            };
        });

    const updateField = (key, value) =>
        setDraft((d) => ({ ...d, [key]: value }));

    const updateVariant = (rowId, patch) =>
        setDraft((d) => ({
            ...d,
            variants: d.variants.map((v) =>
                v.rowId === rowId ? { ...v, ...patch } : v
            ),
        }));

    const updateSetting = (rowId, settingKey, value) =>
        setDraft((d) => ({
            ...d,
            variants: d.variants.map((v) =>
                v.rowId === rowId
                    ? { ...v, settings: { ...v.settings, [settingKey]: value } }
                    : v
            ),
        }));

    const addVariant = () =>
        setDraft((d) => ({
            ...d,
            variants: [
                ...d.variants,
                {
                    rowId: uid("v"),
                    key: `variant${d.variants.length}`,
                    weight: 50,
                    isControl: false,
                    settings: { design: "banner", color: "", textOverridePresetId: "" },
                },
            ],
        }));

    const removeVariant = (rowId) =>
        setDraft((d) => ({
            ...d,
            variants: d.variants.filter((v) => v.rowId !== rowId),
        }));

    const onCopy = async () => {
        try {
            await copyToClipboard(snippet);
            setCopyState("ok");
            setTimeout(() => setCopyState("idle"), 1800);
        } catch (e) {
            setCopyState("err");
            setTimeout(() => setCopyState("idle"), 2400);
        }
    };

    return (
        <section
            className="experiment-builder"
            aria-labelledby="experiment-builder-heading"
        >
            <header className="experiment-builder__head">
                <h2 id="experiment-builder-heading" className="experiment-builder__title">
                    Create experiment
                </h2>
                <p className="experiment-builder__intro">
                    Build a <code>window.INTA.experiment</code> object, then paste it on
                    your site next to where you load the consent banner. Each visitor is
                    randomly assigned a variant by weight, and the variant's settings
                    override your default banner.
                </p>
                {onClose ? (
                    <button
                        type="button"
                        className="experiment-builder__close"
                        onClick={onClose}
                        aria-label="Close experiment builder"
                    >
                        ×
                    </button>
                ) : null}
            </header>

            <div className="experiment-builder__field">
                <label htmlFor="exp-builder-id" className="experiment-builder__label">
                    Experiment ID
                </label>
                <input
                    id="exp-builder-id"
                    className="experiment-builder__input"
                    type="text"
                    value={draft.id}
                    onChange={(e) => updateField("id", e.target.value)}
                    placeholder="asa-banner-design"
                    autoComplete="off"
                    spellCheck="false"
                />
                <p className="experiment-builder__hint">
                    Lowercase, kebab-case. Used as <code>experiment.id</code> and as the
                    stable handle in your reports — pick something descriptive and don't
                    rename it once data starts flowing.
                </p>
            </div>

            <div className="experiment-builder__variants">
                <div className="experiment-builder__variants-head">
                    <h3 className="experiment-builder__subtitle">Variants</h3>
                    <p className="experiment-builder__hint">
                        Mark one variant as <em>Use existing banner</em> — that's your
                        control bucket and shows the banner unchanged. Add at least one
                        test variant with the settings you want to compare against.
                    </p>
                </div>
                <ul className="experiment-builder__variant-list">
                    {draft.variants.map((v) => (
                        <li key={v.rowId} className="experiment-builder__variant">
                            <div className="experiment-builder__variant-row">
                                <label className="experiment-builder__variant-field">
                                    <span className="experiment-builder__field-key">Name</span>
                                    <input
                                        className="experiment-builder__input"
                                        type="text"
                                        value={v.key}
                                        onChange={(e) =>
                                            updateVariant(v.rowId, { key: e.target.value })
                                        }
                                        placeholder="control"
                                        autoComplete="off"
                                        spellCheck="false"
                                    />
                                </label>
                                <label className="experiment-builder__variant-field experiment-builder__variant-field--narrow">
                                    <span className="experiment-builder__field-key">Weight</span>
                                    <input
                                        className="experiment-builder__input"
                                        type="number"
                                        min="0"
                                        step="1"
                                        value={v.weight}
                                        onChange={(e) =>
                                            updateVariant(v.rowId, {
                                                weight: Number(e.target.value),
                                            })
                                        }
                                    />
                                </label>
                                <label className="experiment-builder__checkbox">
                                    <input
                                        type="checkbox"
                                        checked={v.isControl}
                                        onChange={(e) =>
                                            updateVariant(v.rowId, {
                                                isControl: e.target.checked,
                                            })
                                        }
                                    />
                                    <span>Use existing banner (no overrides)</span>
                                </label>
                                <button
                                    type="button"
                                    className="experiment-builder__remove"
                                    onClick={() => removeVariant(v.rowId)}
                                    disabled={draft.variants.length <= 1}
                                    aria-label={`Remove variant ${v.key || ""}`}
                                >
                                    Remove
                                </button>
                            </div>
                            {!v.isControl ? (
                                <div className="experiment-builder__variant-settings">
                                    <label className="experiment-builder__variant-field">
                                        <span className="experiment-builder__field-key">
                                            Design
                                        </span>
                                        <input
                                            className="experiment-builder__input"
                                            type="text"
                                            value={v.settings.design}
                                            onChange={(e) =>
                                                updateSetting(
                                                    v.rowId,
                                                    "design",
                                                    e.target.value
                                                )
                                            }
                                            list={`design-options-${v.rowId}`}
                                            placeholder="banner"
                                            autoComplete="off"
                                            spellCheck="false"
                                        />
                                        <datalist id={`design-options-${v.rowId}`}>
                                            {KNOWN_DESIGNS.map((d) => (
                                                <option key={d} value={d} />
                                            ))}
                                        </datalist>
                                    </label>
                                    <label className="experiment-builder__variant-field experiment-builder__variant-field--color">
                                        <span className="experiment-builder__field-key">
                                            Color
                                        </span>
                                        <span className="experiment-builder__color-row">
                                            <input
                                                className="experiment-builder__color-picker"
                                                type="color"
                                                value={
                                                    /^#[0-9a-fA-F]{6}$/.test(v.settings.color)
                                                        ? v.settings.color
                                                        : "#1c6084"
                                                }
                                                onChange={(e) =>
                                                    updateSetting(
                                                        v.rowId,
                                                        "color",
                                                        e.target.value
                                                    )
                                                }
                                                aria-label={`Color picker for ${v.key}`}
                                            />
                                            <input
                                                className="experiment-builder__input"
                                                type="text"
                                                value={v.settings.color}
                                                onChange={(e) =>
                                                    updateSetting(
                                                        v.rowId,
                                                        "color",
                                                        e.target.value
                                                    )
                                                }
                                                placeholder="#1c6084"
                                                autoComplete="off"
                                                spellCheck="false"
                                            />
                                        </span>
                                    </label>
                                    <label className="experiment-builder__variant-field">
                                        <span className="experiment-builder__field-key">
                                            Text override preset
                                        </span>
                                        <input
                                            className="experiment-builder__input"
                                            type="text"
                                            value={v.settings.textOverridePresetId}
                                            onChange={(e) =>
                                                updateSetting(
                                                    v.rowId,
                                                    "textOverridePresetId",
                                                    e.target.value
                                                )
                                            }
                                            placeholder="copy-b2b-professional"
                                            autoComplete="off"
                                            spellCheck="false"
                                        />
                                    </label>
                                </div>
                            ) : null}
                        </li>
                    ))}
                </ul>
                <button
                    type="button"
                    className="experiment-builder__add"
                    onClick={addVariant}
                >
                    + Add variant
                </button>
            </div>

            {totalWeight > 0 && splits.length > 0 ? (
                <div className="experiment-builder__split">
                    <h4 className="experiment-builder__subtitle experiment-builder__subtitle--small">
                        Effective traffic split
                    </h4>
                    <ul className="experiment-builder__split-list">
                        {splits.map((s) => (
                            <li key={s.rowId}>
                                <code>{s.key}</code>
                                <span>{s.pct.toFixed(1)}%</span>
                            </li>
                        ))}
                    </ul>
                    <p className="experiment-builder__hint">
                        Weights are relative — they don't have to sum to 100. We normalise
                        them when assigning visitors.
                    </p>
                </div>
            ) : null}

            {hasErrors ? (
                <div className="experiment-builder__errors" role="alert">
                    <strong>Fix before copying:</strong>
                    <ul>
                        {errors.map((err) => (
                            <li key={err}>{err}</li>
                        ))}
                    </ul>
                </div>
            ) : null}

            <div className="experiment-builder__output">
                <div className="experiment-builder__output-head">
                    <h4 className="experiment-builder__subtitle experiment-builder__subtitle--small">
                        Snippet
                    </h4>
                    <button
                        type="button"
                        className={`experiment-builder__copy experiment-builder__copy--${copyState}`}
                        onClick={onCopy}
                        disabled={hasErrors}
                    >
                        {copyState === "ok"
                            ? "Copied!"
                            : copyState === "err"
                            ? "Copy failed"
                            : "Copy snippet"}
                    </button>
                </div>
                <pre className="experiment-builder__snippet" aria-live="polite">
                    <code>{snippet}</code>
                </pre>
                <p className="experiment-builder__hint">
                    Paste this just before the script tag that loads your consent banner.
                    On each page load the banner reads <code>window.INTA.experiment</code>,
                    picks a variant, and applies its <code>settings</code>.
                </p>
            </div>
        </section>
    );
}

export const __TEST__ = {
    buildExperimentObject,
    formatSnippet,
    validateDraft,
    makeDefaultDraft,
};
