import { Icon } from "./icons.js";

/**
 * Button — one component for every action.
 *
 * variant: "primary"   gold; the main action of a view (one per view)
 *          "secondary" neutral bordered; everything else
 *          "ghost"     no chrome; toolbars, inline actions
 *          "danger"    destructive actions
 * size:    "sm" (32px) | "md" (40px)
 * states:  disabled, loading (spinner, keeps width, aria-busy), focus-visible
 * icon / iconRight: icon name from ./icons.js
 * iconOnly: renders just the icon — `aria-label` is then required.
 * href:    renders an <a> styled as a button.
 */
const BASE = "tw-inline-flex tw-items-center tw-justify-center tw-gap-2 tw-rounded-md tw-font-sans tw-font-semibold "
    + "tw-whitespace-nowrap tw-no-underline tw-cursor-pointer tw-transition-colors "
    + "focus-visible:tw-outline-none focus-visible:tw-shadow-focus "
    + "disabled:tw-opacity-50 disabled:tw-cursor-not-allowed aria-disabled:tw-opacity-50 aria-disabled:tw-cursor-not-allowed";
const VARIANTS = {
    primary: "tw-border tw-border-solid tw-border-accent tw-bg-accent tw-text-text-inverse hover:tw-bg-accent-strong hover:tw-border-accent-strong",
    secondary: "tw-border tw-border-solid tw-border-border tw-bg-bg-raised tw-text-text-primary hover:tw-border-border-strong hover:tw-bg-white/5",
    ghost: "tw-border tw-border-solid tw-border-transparent tw-bg-transparent tw-text-text-secondary hover:tw-bg-white/5 hover:tw-text-text-primary",
    danger: "tw-border tw-border-solid tw-border-danger/50 tw-bg-transparent tw-text-danger-text hover:tw-bg-danger/10",
};
const SIZES = {
    sm: "tw-h-8 tw-px-3 tw-text-sm",
    md: "tw-h-10 tw-px-4 tw-text-sm",
};
const ICON_ONLY = { sm: "tw-h-8 tw-w-8 tw-px-0", md: "tw-h-10 tw-w-10 tw-px-0" };

export default function Button({
    variant = "secondary", size = "md", icon, iconRight, iconOnly = false, loading = false,
    disabled = false, href, type = "button", className = "", children, ...rest
}) {
    if (iconOnly && !rest["aria-label"] && typeof console !== "undefined") {
        console.warn("[Button] iconOnly buttons need an aria-label");
    }
    const classes = [BASE, VARIANTS[variant] || VARIANTS.secondary, iconOnly ? ICON_ONLY[size] : SIZES[size], className].join(" ");
    const content = (
        <>
            {loading
                ? <Icon name="refresh" size={size === "sm" ? 14 : 16} className="motion-safe:tw-animate-spin" />
                : icon ? <Icon name={icon} size={size === "sm" ? 14 : 16} /> : null}
            {!iconOnly && children}
            {!iconOnly && iconRight && !loading ? <Icon name={iconRight} size={size === "sm" ? 14 : 16} /> : null}
        </>
    );
    if (href) {
        return (
            <a href={disabled ? undefined : href} aria-disabled={disabled || undefined} className={classes} {...rest}>
                {content}
            </a>
        );
    }
    return (
        <button type={type} disabled={disabled || loading} aria-busy={loading || undefined} className={classes} {...rest}>
            {content}
        </button>
    );
}
