const { useState } = React;

// URLs that failed once this session — skip straight to the letter tile
// instead of flashing a broken image every time a list re-renders.
const failed = new Set();

/**
 * A website's or organisation's icon. Shows the image when it loads; a
 * missing, blocked or broken favicon (common: many sites have none at the
 * URL we store) falls back to the first letter of `name` instead of the
 * browser's broken-image icon.
 */
export default function SiteIcon({ src, name = "", size = 18, className = "" }) {
    if (src === "undefined" || src === "null") src = null; // stored as text by older code
    const [, rerender] = useState(0);
    const broken = !src || failed.has(src);
    const style = { width: size, height: size, flexShrink: 0 };

    if (src && !broken) {
        return (
            <img
                className={`tw-rounded-sm tw-object-contain ${className}`}
                style={style}
                src={src}
                alt=""
                aria-hidden="true"
                onError={() => { failed.add(src); rerender((n) => n + 1); }}
            />
        );
    }

    const letter = String(name).replace(/^(https?:\/\/)?(www\.)?/i, "").trim().charAt(0).toUpperCase() || "?";
    return (
        <span
            aria-hidden="true"
            className={`tw-inline-flex tw-items-center tw-justify-center tw-rounded-sm tw-bg-bg-sunken tw-text-text-secondary tw-font-semibold tw-leading-none tw-select-none ${className}`}
            style={{ ...style, fontSize: Math.round(size * 0.55) }}
        >
            {letter}
        </span>
    );
}
