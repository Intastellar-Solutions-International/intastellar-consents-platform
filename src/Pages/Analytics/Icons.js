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
