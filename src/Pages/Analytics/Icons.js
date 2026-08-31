import { siGooglechrome, siFirefoxbrowser, siSafari, siOpera } from "simple-icons";

const svgProps = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.8",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": "true",
    focusable: "false",
};

export function IconBarChart(props) {
    return (
        <svg {...svgProps} {...props}>
            <path d="M4 20V13M12 20V8M20 20V4" />
        </svg>
    );
}

export function IconUsers(props) {
    return (
        <svg {...svgProps} {...props}>
            <circle cx="9" cy="7" r="4" />
            <path d="M2 21v-2a4 4 0 0 1 4-4h6a4 4 0 0 1 4 4v2" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
        </svg>
    );
}

export function IconShieldCheck(props) {
    return (
        <svg {...svgProps} {...props}>
            <path d="M12 2 4 5v6c0 5 3.5 8.5 8 10 4.5-1.5 8-5 8-10V5l-8-3Z" />
            <path d="m9 12 2 2 4-4" />
        </svg>
    );
}

export function IconGlobe(props) {
    return (
        <svg {...svgProps} {...props}>
            <circle cx="12" cy="12" r="9" />
            <path d="M3 12h18" />
            <path d="M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18Z" />
        </svg>
    );
}

export function IconTrendingUp(props) {
    return (
        <svg {...svgProps} {...props}>
            <path d="m3 17 6-6 4 4 8-8" />
            <path d="M15 7h6v6" />
        </svg>
    );
}

export function IconDocument(props) {
    return (
        <svg {...svgProps} {...props}>
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
            <path d="M14 2v6h6" />
            <path d="M8 13h8M8 17h8M8 9h2" />
        </svg>
    );
}

export function IconLock(props) {
    return (
        <svg {...svgProps} {...props}>
            <rect x="4" y="11" width="16" height="10" rx="2" />
            <path d="M8 11V7a4 4 0 0 1 8 0v4" />
        </svg>
    );
}

export function IconMegaphone(props) {
    return (
        <svg {...svgProps} {...props}>
            <path d="M3 10v4a1 1 0 0 0 1 1h2l5 4V5L6 9H4a1 1 0 0 0-1 1Z" />
            <path d="M15 8a4 4 0 0 1 0 8" />
            <path d="M18 5a8 8 0 0 1 0 14" />
        </svg>
    );
}

export function IconRadio(props) {
    return (
        <svg {...svgProps} {...props}>
            <circle cx="12" cy="12" r="2" />
            <path d="M8.5 15.5a5 5 0 0 1 0-7" />
            <path d="M15.5 8.5a5 5 0 0 1 0 7" />
            <path d="M5.5 18.5a9 9 0 0 1 0-13" />
            <path d="M18.5 5.5a9 9 0 0 1 0 13" />
        </svg>
    );
}

export function IconCash(props) {
    return (
        <svg {...svgProps} {...props}>
            <circle cx="12" cy="12" r="9" />
            <path d="M9.5 15a2.5 2.2 0 0 0 2.5 2c1.5 0 2.5-.8 2.5-2s-1-1.6-2.5-2-2.5-.7-2.5-2 1-2 2.5-2a2.5 2.2 0 0 1 2.5 2" />
            <path d="M12 7v1M12 16v1" />
        </svg>
    );
}

export function IconCursorClick(props) {
    return (
        <svg {...svgProps} {...props}>
            <path d="M9.5 9.5 20 13l-4.6 1.9L13 20l-3.5-10.5Z" />
            <path d="M9 4v1.5M4.5 5.6l1.1 1.1M4 10.5H5.5" />
        </svg>
    );
}

export function IconTarget(props) {
    return (
        <svg {...svgProps} {...props}>
            <circle cx="12" cy="12" r="9" />
            <circle cx="12" cy="12" r="5" />
            <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" />
        </svg>
    );
}

export function IconPlus(props) {
    return (
        <svg {...svgProps} {...props}>
            <path d="M12 5v14M5 12h14" />
        </svg>
    );
}

export function IconTrash(props) {
    return (
        <svg {...svgProps} {...props}>
            <path d="M4 7h16" />
            <path d="M9 7V4h6v3" />
            <path d="M6 7l1 13h10l1-13" />
        </svg>
    );
}

export function IconVideo(props) {
    return (
        <svg {...svgProps} {...props}>
            <rect x="3" y="6" width="13" height="12" rx="2" />
            <path d="M16 10.5 21 7v10l-5-3.5Z" />
        </svg>
    );
}

export function IconChevronDown(props) {
    return (
        <svg {...svgProps} {...props}>
            <path d="m6 9 6 6 6-6" />
        </svg>
    );
}

export function IconClock(props) {
    return (
        <svg {...svgProps} {...props}>
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3.5 2" />
        </svg>
    );
}

export function IconAlertTriangle(props) {
    return (
        <svg {...svgProps} {...props}>
            <path d="M12 3 2 20h20L12 3Z" />
            <path d="M12 10v4" />
            <circle cx="12" cy="17.3" r="0.6" fill="currentColor" stroke="none" />
        </svg>
    );
}

export function IconFunnel(props) {
    return (
        <svg {...svgProps} {...props}>
            <path d="M4 4h16l-6 8v6l-4 2v-8L4 4Z" />
        </svg>
    );
}

export function IconBot(props) {
    return (
        <svg {...svgProps} {...props}>
            <rect x="4" y="8" width="16" height="12" rx="3" />
            <path d="M12 8V4" />
            <circle cx="12" cy="3" r="1" fill="currentColor" stroke="none" />
            <circle cx="9" cy="14" r="1.2" fill="currentColor" stroke="none" />
            <circle cx="15" cy="14" r="1.2" fill="currentColor" stroke="none" />
            <path d="M8 18v1M16 18v1" />
        </svg>
    );
}

export function IconExternalLink(props) {
    return (
        <svg {...svgProps} {...props}>
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
            <polyline points="15 3 21 3 21 9" />
            <line x1="10" y1="14" x2="21" y2="3" />
        </svg>
    );
}

export function IconPhone(props) {
    return (
        <svg {...svgProps} {...props}>
            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.15 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.06 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.09 8.91a16 16 0 0 0 5.97 5.97l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
        </svg>
    );
}

export function IconMail(props) {
    return (
        <svg {...svgProps} {...props}>
            <rect x="2" y="4" width="20" height="16" rx="2" />
            <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
        </svg>
    );
}

export function IconDownload(props) {
    return (
        <svg {...svgProps} {...props}>
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
    );
}

export function IconFormFill(props) {
    return (
        <svg {...svgProps} {...props}>
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <path d="M8 8h8M8 12h8M8 16h4" />
        </svg>
    );
}

export function IconScrollDepth(props) {
    return (
        <svg {...svgProps} {...props}>
            <path d="M12 5v14M5 12l7 7 7-7" />
        </svg>
    );
}

export function IconCopy(props) {
    return (
        <svg {...svgProps} {...props}>
            <rect x="9" y="9" width="13" height="13" rx="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
    );
}

export function IconPrint(props) {
    return (
        <svg {...svgProps} {...props}>
            <path d="M6 9V2h12v7" />
            <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
            <rect x="6" y="14" width="12" height="8" />
        </svg>
    );
}

// ── Official browser logos (simple-icons) ──────────────────────────────────
// Unlike the outline icons above, these render each brand's real mark in its
// official color — that's the point (a monochrome stroke icon isn't
// recognizable as "Chrome" the way the colored logo is). Microsoft withdrew
// Edge's logo from simple-icons over trademark use, so there's no official
// mark to render for it here; callers fall back to something else for Edge.
function BrandIcon({ icon, size = 16, ...props }) {
    return (
        <svg
            viewBox="0 0 24 24"
            width={size}
            height={size}
            role="img"
            aria-label={icon.title}
            focusable="false"
            {...props}
        >
            <path fill={`#${icon.hex}`} d={icon.path} />
        </svg>
    );
}

export function IconBrowserChrome(props) {
    return <BrandIcon icon={siGooglechrome} {...props} />;
}
export function IconBrowserFirefox(props) {
    return <BrandIcon icon={siFirefoxbrowser} {...props} />;
}
export function IconBrowserSafari(props) {
    return <BrandIcon icon={siSafari} {...props} />;
}
export function IconBrowserOpera(props) {
    return <BrandIcon icon={siOpera} {...props} />;
}
