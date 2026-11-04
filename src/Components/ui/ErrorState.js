import { Icon } from "./icons.js";
import Button from "./Button.js";
import { t } from "../../i18n/index.js";

/**
 * ErrorState — a section couldn't load. Says what failed and offers Retry.
 * compact: one-line variant for small sections. Announced via role="alert".
 * In narrow containers the Retry button wraps below the text.
 */
export default function ErrorState({ title = t("Couldn't load this section"), message, onRetry, compact = false, className = "" }) {
    return (
        <div
            role="alert"
            className={`tw-flex tw-flex-wrap tw-items-center tw-gap-4 tw-rounded-lg tw-border tw-border-solid tw-border-danger/40 tw-bg-danger/10 tw-text-text-primary ${compact ? "tw-px-3 tw-py-2" : "tw-px-5 tw-py-4"} ${className}`}
        >
            <span className="tw-text-danger-text"><Icon name="alert-octagon" size={compact ? 16 : 20} /></span>
            <div className="tw-flex-1 tw-basis-24 tw-min-w-0">
                <p className={`tw-m-0 tw-font-semibold ${compact ? "tw-text-sm" : "tw-text-base"}`}>{title}</p>
                {message && <p className="tw-m-0 tw-text-sm tw-text-text-secondary">{message}</p>}
            </div>
            {onRetry && <Button variant="secondary" size="sm" icon="refresh" onClick={onRetry} className="tw-ml-auto">{t("Retry")}</Button>}
        </div>
    );
}
