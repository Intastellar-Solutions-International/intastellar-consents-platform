import { Icon } from "../ui/icons.js";
import { formatRelativeTime } from "../../Functions/format.js";
import { openHelp } from "../Help/index.js";
import { t } from "../../i18n/index.js";

const { useState, useEffect } = React;

/**
 * One quiet line under a block of numbers: where they come from, which
 * filters apply, and how fresh they are — e.g.
 * "Consent records · Suspected bots excluded · Updated 3 minutes ago".
 *
 * Trust comes from never leaving people to guess what was counted (the
 * "0 users while visitors are on the site" moment). Filters are stated, not
 * implied: pass only what is actually applied.
 */
export default function DataSource({ source, filters = [], fetchedAt, action, helpArticle, className = "" }) {
    // Re-render every 30s so "Updated …" keeps moving.
    const [, setNow] = useState(0);
    useEffect(() => {
        if (!fetchedAt) return undefined;
        const id = setInterval(() => setNow((n) => n + 1), 30000);
        return () => clearInterval(id);
    }, [fetchedAt]);

    const parts = [source, ...filters.filter(Boolean)];
    if (fetchedAt) parts.push(t("Updated {time}", { time: formatRelativeTime(fetchedAt) }));
    return (
        <p className={`data-source tw-m-0 tw-flex tw-items-center tw-gap-2 tw-text-xs tw-text-text-muted ${className}`}>
            <Icon name="database" size={13} />
            <span>{parts.join(" · ")}</span>
            {action}
            {helpArticle && (
                <button type="button" onClick={() => openHelp(helpArticle)} aria-label={t("How to read these numbers")}
                    title={t("How to read these numbers")}
                    className="tw-inline-flex tw-items-center tw-p-0 tw-border-0 tw-bg-transparent tw-text-text-muted tw-cursor-pointer hover:tw-text-text-primary focus-visible:tw-outline-none focus-visible:tw-shadow-focus tw-rounded-sm">
                    <Icon name="help-circle" size={14} />
                </button>
            )}
        </p>
    );
}
