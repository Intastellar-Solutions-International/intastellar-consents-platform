/**
 * Tailwind theme = the design tokens in src/styles/tokens.css. Every value
 * here points at a CSS variable, so Tailwind classes and plain CSS share one
 * source. The theme *replaces* Tailwind's defaults (only component widths use
 * `extend`) so only the
 * token scale is available.
 *
 * - prefix "tw-": legacy class names (hidden, sticky, container, flex…) are
 *   everywhere in this codebase and must not pick up Tailwind utilities.
 * - preflight off: no global reset, so existing pages render unchanged.
 */
const rgb = (name) => `rgb(var(--c-${name}) / <alpha-value>)`;

module.exports = {
    prefix: "tw-",
    content: ["./src/**/*.{js,html}", "./index.js"],
    corePlugins: { preflight: false },
    theme: {
        colors: {
            transparent: "transparent",
            current: "currentColor",
            white: rgb("white"),
            black: rgb("black"),
            bg: { sunken: rgb("bg-sunken"), base: rgb("bg-base"), raised: rgb("bg-raised") },
            border: {
                subtle: "var(--color-border-subtle)",
                DEFAULT: "var(--color-border)",
                strong: "var(--color-border-strong)",
            },
            text: {
                primary: rgb("text-primary"),
                secondary: rgb("text-secondary"),
                muted: rgb("text-muted"),
                inverse: rgb("text-inverse"),
            },
            accent: { DEFAULT: rgb("accent"), strong: rgb("accent-strong"), subtle: "var(--color-accent-subtle)" },
            success: rgb("success"),
            warning: rgb("warning"),
            danger: { DEFAULT: rgb("danger"), text: rgb("danger-text") },
            info: { DEFAULT: rgb("info"), text: rgb("info-text") },
            data: rgb("data"),
            risk: { high: "var(--color-risk-high)", medium: "var(--color-risk-medium)", low: "var(--color-risk-low)" },
        },
        spacing: {
            0: "0", px: "var(--space-px)", 0.5: "var(--space-0-5)",
            1: "var(--space-1)", 2: "var(--space-2)", 3: "var(--space-3)", 4: "var(--space-4)",
            5: "var(--space-5)", 6: "var(--space-6)", 7: "var(--space-7)", 8: "var(--space-8)",
            10: "var(--space-10)", 12: "var(--space-12)", 14: "var(--space-14)", 16: "var(--space-16)",
            20: "var(--space-20)", 24: "var(--space-24)",
        },
        borderRadius: {
            none: "0", xs: "var(--radius-xs)", sm: "var(--radius-sm)", DEFAULT: "var(--radius-md)", md: "var(--radius-md)",
            lg: "var(--radius-lg)", xl: "var(--radius-xl)", "2xl": "var(--radius-2xl)", full: "var(--radius-full)",
        },
        boxShadow: {
            none: "none", sm: "var(--shadow-sm)", DEFAULT: "var(--shadow-md)", md: "var(--shadow-md)", lg: "var(--shadow-lg)",
            overlay: "var(--shadow-overlay)", inset: "var(--shadow-inset)", focus: "var(--shadow-focus)", active: "var(--shadow-active)",
        },
        fontFamily: { sans: "var(--font-sans)", mono: "var(--font-mono)" },
        fontSize: {
            xs: "var(--text-xs)", sm: "var(--text-sm)", base: "var(--text-base)", lg: "var(--text-lg)", xl: "var(--text-xl)",
            "2xl": "var(--text-2xl)", "3xl": "var(--text-3xl)", "4xl": "var(--text-4xl)", "5xl": "var(--text-5xl)",
        },
        // Component sizes (tokens.css --size-*); added to Tailwind's width scale.
        extend: {
            width: {
                field: "var(--size-field)",
                "drawer-sm": "var(--size-drawer-sm)",
                "drawer-md": "var(--size-drawer-md)",
                "drawer-lg": "var(--size-drawer-lg)",
            },
        },
    },
    plugins: [],
};
