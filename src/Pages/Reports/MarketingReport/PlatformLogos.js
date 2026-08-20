// Brand marks for the "Ad connections" cards — simplified inline
// reproductions (not the exact vector trademarks) so the card grid reads at
// a glance without depending on external logo assets. Each is a plain
// function component returning an SVG sized to fill its 22x22 slot.

export function GoogleLogo() {
    return (
        <svg viewBox="0 0 48 48" width="22" height="22" aria-hidden="true">
            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
        </svg>
    );
}

export function GA4Logo() {
    return (
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
            <rect x="3" y="13" width="4.5" height="8" rx="1.6" fill="#F9AB00" />
            <rect x="9.75" y="8" width="4.5" height="13" rx="1.6" fill="#E37400" />
            <rect x="16.5" y="3" width="4.5" height="18" rx="1.6" fill="#F9AB00" />
        </svg>
    );
}

export function SearchConsoleLogo() {
    return (
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
            <circle cx="10" cy="10" r="6.25" fill="none" stroke="#34A853" strokeWidth="2.3" />
            <circle cx="10" cy="10" r="2.6" fill="#4285F4" />
            <line x1="14.6" y1="14.6" x2="20.2" y2="20.2" stroke="#EA4335" strokeWidth="2.3" strokeLinecap="round" />
        </svg>
    );
}

export function MetaLogo() {
    return (
        <svg viewBox="0 0 36 24" width="24" height="16" aria-hidden="true">
            <defs>
                <linearGradient id="metaLogoGradient" x1="0" x2="1">
                    <stop offset="0%" stopColor="#0064E1" />
                    <stop offset="50%" stopColor="#0081FB" />
                    <stop offset="100%" stopColor="#0064E1" />
                </linearGradient>
            </defs>
            <path
                d="M9 3C4 3 1 8 1 12s3 9 8 9c3.5 0 6-2.5 9-7 3 4.5 5.5 7 9 7 5 0 8-5 8-9s-3-9-8-9c-3.5 0-6 2.5-9 7-3-4.5-5.5-7-9-7z"
                fill="none" stroke="url(#metaLogoGradient)" strokeWidth="3.4"
            />
        </svg>
    );
}

export function LinkedInLogo() {
    return (
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
            <rect width="24" height="24" rx="4" fill="#0A66C2" />
            <path fill="#fff" d="M7.5 9.5h2.7v8.3H7.5V9.5zm1.35-4.3a1.57 1.57 0 1 1 0 3.14 1.57 1.57 0 0 1 0-3.14zM12 9.5h2.6v1.14h.04c.36-.68 1.24-1.4 2.56-1.4 2.74 0 3.25 1.8 3.25 4.15v4.4h-2.7v-3.9c0-.93-.02-2.13-1.3-2.13-1.3 0-1.5 1.02-1.5 2.06v3.97H12V9.5z" />
        </svg>
    );
}

export function MicrosoftLogo() {
    return (
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
            <rect x="1" y="1" width="10" height="10" fill="#F25022" />
            <rect x="13" y="1" width="10" height="10" fill="#7FBA00" />
            <rect x="1" y="13" width="10" height="10" fill="#00A4EF" />
            <rect x="13" y="13" width="10" height="10" fill="#FFB900" />
        </svg>
    );
}
