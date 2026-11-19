import { Icon } from "../ui/icons.js";
import { withSharedQuery } from "../../Functions/domainPathSegments.js";

const Link = window.ReactRouterDOM.Link;

// Same product icons as the login chips and the product switch.
const PRODUCTS = {
    cmp: { icon: "shield-check", name: "CMP" },
    analytics: { icon: "bar-chart", name: "Analytics" },
    settings: { icon: "settings", name: "Settings" },
};

/**
 * "Related" row linking a page to the matching pages in the other product —
 * e.g. Ad Spend (Analytics) ⇄ Ad reconciliation (CMP) ⇄ Ad connections.
 * Each link names its product, so crossing over is never a surprise, and
 * keeps the selected date range.
 *
 * links: [{ product: "cmp" | "analytics" | "settings", label, to, hint? }]
 */
export default function RelatedPages({ links, className = "" }) {
    const visible = (links || []).filter((l) => l && l.to);
    if (!visible.length) return null;
    return (
        <nav aria-label="Related pages" className={`tw-flex tw-flex-wrap tw-items-center tw-gap-2 tw-text-sm ${className}`}>
            <span className="tw-text-xs tw-font-semibold tw-text-text-muted">Related</span>
            {visible.map((l) => {
                const product = PRODUCTS[l.product] || PRODUCTS.settings;
                return (
                    <Link
                        key={l.to + l.label}
                        to={withSharedQuery(l.to)}
                        title={l.hint}
                        className="tw-inline-flex tw-items-center tw-gap-2 tw-h-8 tw-px-3 tw-rounded-full tw-border tw-border-solid tw-border-border tw-text-text-secondary tw-no-underline hover:tw-text-text-primary hover:tw-border-border-strong focus-visible:tw-outline-none focus-visible:tw-shadow-focus"
                    >
                        <Icon name={product.icon} size={14} />
                        <span>{l.label}</span>
                        <span className="tw-text-xs tw-text-text-muted">{product.name}</span>
                    </Link>
                );
            })}
        </nav>
    );
}
