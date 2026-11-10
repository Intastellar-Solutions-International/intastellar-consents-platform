/**
 * The CMP dashboard's single SVG icon set — 24×24, 1.8px stroke, same style
 * as src/Pages/Analytics/Icons.js. Use instead of Unicode glyphs or emoji.
 *
 *   <Icon name="cookie" />                       decorative (hidden from AT)
 *   <Icon name="alert-triangle" label="High risk" />   meaningful (role="img")
 *
 * Give `label` whenever the icon carries meaning that isn't also in nearby
 * text — e.g. an icon-only status or a risk level.
 */
const PATHS = {
    "check": <path d="m5 12.5 4.5 4.5L19 7.5" />,
    "check-circle": <><circle cx="12" cy="12" r="9" /><path d="m8.5 12.3 2.2 2.2 4.8-4.8" /></>,
    "x": <path d="M6 6l12 12M18 6 6 18" />,
    "x-circle": <><circle cx="12" cy="12" r="9" /><path d="m9 9 6 6M15 9l-6 6" /></>,
    "alert-triangle": <><path d="M12 3 2 20h20L12 3Z" /><path d="M12 10v4" /><circle cx="12" cy="17.3" r="0.6" fill="currentColor" stroke="none" /></>,
    "alert-octagon": <><path d="M8 2h8l6 6v8l-6 6H8l-6-6V8l6-6Z" /><path d="M12 7v6" /><circle cx="12" cy="16.5" r="0.6" fill="currentColor" stroke="none" /></>,
    "plus": <><path d="M12 5v14" /><path d="M5 12h14" /></>,
    "upload": <><path d="M12 16V4" /><path d="m7 9 5-5 5 5" /><path d="M4 20h16" /></>,
    "info": <><circle cx="12" cy="12" r="9" /><path d="M12 11v5" /><circle cx="12" cy="8" r="0.6" fill="currentColor" stroke="none" /></>,
    "minus-circle": <><circle cx="12" cy="12" r="9" /><path d="M8 12h8" /></>,
    "chevron-down": <path d="m6 9 6 6 6-6" />,
    "chevron-up": <path d="m6 15 6-6 6 6" />,
    "chevron-right": <path d="m9 6 6 6-6 6" />,
    "chevron-left": <path d="m15 6-6 6 6 6" />,
    "arrow-up": <path d="M12 19V5M6 11l6-6 6 6" />,
    "arrow-down": <path d="M12 5v14M6 13l6 6 6-6" />,
    "refresh": <><path d="M20 11a8 8 0 0 0-14.7-4.3L3 9" /><path d="M3 4v5h5" /><path d="M4 13a8 8 0 0 0 14.7 4.3L21 15" /><path d="M21 20v-5h-5" /></>,
    "search": <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>,
    "filter": <path d="M3 5h18l-7 8.5V19l-4 2v-7.5L3 5Z" />,
    "external-link": <><path d="M14 4h6v6" /><path d="M20 4 10 14" /><path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5" /></>,
    "menu": <path d="M4 6h16M4 12h16M4 18h16" />,
    "panel-left": <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16" /></>,
    "home": <><path d="M3 11 12 3l9 8" /><path d="M5 10v10h14V10" /></>,
    "settings": <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.6 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" /></>,
    "file-text": <><path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8l-5-5Z" /><path d="M14 3v5h5M9 13h6M9 17h6" /></>,
    "calendar": <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></>,
    "clock": <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    "inbox": <><path d="M3 13h5l1.5 3h5L16 13h5" /><path d="M5 5h14l2 8v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-6l2-8Z" /></>,
    "database": <><ellipse cx="12" cy="5" rx="8" ry="3" /><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5" /><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" /></>,
    "flask": <><path d="M9 3h6M10 3v6L4.5 19a1.3 1.3 0 0 0 1.2 2h12.6a1.3 1.3 0 0 0 1.2-2L14 9V3" /><path d="M7 15h10" /></>,
    "trending-up": <><path d="m3 17 6-6 4 4 8-8" /><path d="M15 7h6v6" /></>,
    "globe": <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" /></>,
    "shield-check": <><path d="M12 2 4 5v6c0 5 3.5 8.5 8 10 4.5-1.5 8-5 8-10V5l-8-3Z" /><path d="m9 12 2 2 4-4" /></>,
    // Cookie categories (Compliance)
    "cookie": <><path d="M21 12.5A9 9 0 1 1 11.5 3a3 3 0 0 0 3.5 3.5 3 3 0 0 0 3.5 3.5 3 3 0 0 0 2.5 2.5Z" /><circle cx="8.5" cy="10" r="0.9" fill="currentColor" stroke="none" /><circle cx="9" cy="15.5" r="0.9" fill="currentColor" stroke="none" /><circle cx="14.5" cy="14.5" r="0.9" fill="currentColor" stroke="none" /></>,
    "megaphone": <><path d="M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1Z" /><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" /></>,
    "fingerprint": <><path d="M6.5 7.5A7 7 0 0 1 19 12v1.5" /><path d="M5 12a7 7 0 0 1 .4-2.3M5 15.5V12" /><path d="M9 20.5c-.6-1.4-1-3-1-4.5v-4a4 4 0 0 1 8 0v2" /><path d="M12 12v3.5c0 2 .6 3.8 1.6 5.4" /><path d="M16 17.5c.1 1 .4 2 .8 3" /></>,
    "bar-chart": <path d="M4 20V13M12 20V8M20 20V4" />,
    "share": <><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4" /></>,
    "sliders": <><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0" /><circle cx="16" cy="6" r="2" /><circle cx="10" cy="12" r="2" /><circle cx="18" cy="18" r="2" /></>,
    "help-circle": <><circle cx="12" cy="12" r="9" /><path d="M9.5 9.3a2.6 2.6 0 0 1 5 .9c0 1.7-2.5 2.3-2.5 3.8" /><path d="M12 17h.01" /></>,
    "bell": <><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></>,
    "layers": <><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="m3 12.5 9 5 9-5" /><path d="m3 17 9 5 9-5" /></>,
    "server": <><rect x="3" y="4" width="18" height="7" rx="1.5" /><rect x="3" y="13" width="18" height="7" rx="1.5" /><path d="M7 7.5h.01M7 16.5h.01" /></>,
    "link": <><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></>,
};

export const ICON_NAMES = Object.keys(PATHS);

export function Icon({ name, label, size = 16, className = "", ...rest }) {
    const shape = PATHS[name];
    if (!shape) {
        if (typeof console !== "undefined") console.warn(`[Icon] unknown icon "${name}"`);
        return null;
    }
    const a11y = label ? { role: "img", "aria-label": label } : { "aria-hidden": "true" };
    return (
        <svg
            viewBox="0 0 24 24"
            width={size}
            height={size}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            focusable="false"
            className={"tw-shrink-0 " + className}
            {...a11y}
            {...rest}
        >
            {label ? <title>{label}</title> : null}
            {shape}
        </svg>
    );
}

export default Icon;
