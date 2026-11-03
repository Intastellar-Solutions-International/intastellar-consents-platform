import { Icon } from "./icons.js";
import ErrorState from "./ErrorState.js";
import { SkeletonKpiTile } from "./Skeleton.js";

/**
 * KpiTile — one headline number.
 * label, value (pre-formatted string), hint
 * delta: { value: number (percent change), goodWhen: "up"|"down", label: "vs previous period" }
 *        Direction is shown with an arrow icon and a signed number, and the
 *        good/bad colour is backed by visually-hidden text — never colour alone.
 * states: loading (shaped skeleton), error ({ message, onRetry })
 */
export default function KpiTile({ label, value, hint, delta, loading = false, error, className = "" }) {
    if (loading) return <SkeletonKpiTile label={`Loading ${label}`} />;
    if (error) return <ErrorState compact title={`${label} unavailable`} message={error.message} onRetry={error.onRetry} />;
    let deltaEl = null;
    if (delta && Number.isFinite(delta.value)) {
        const up = delta.value > 0, flat = delta.value === 0;
        const good = flat ? null : (delta.goodWhen === "down" ? !up : up);
        const tone = flat ? "tw-text-text-muted" : good ? "tw-text-success" : "tw-text-danger-text";
        deltaEl = (
            <p className={`tw-m-0 tw-flex tw-items-center tw-gap-1 tw-text-sm ${tone}`}>
                {!flat && <Icon name={up ? "arrow-up" : "arrow-down"} size={14} />}
                <span className="tw-tabular-nums">{up ? "+" : ""}{delta.formatted ?? `${delta.value}%`}</span>
                <span className="tw-sr-only">{flat ? "no change" : good ? "(improvement)" : "(worse)"}</span>
                {delta.label && <span className="tw-text-text-muted">{delta.label}</span>}
            </p>
        );
    }
    return (
        <div className={`tw-flex tw-flex-col tw-gap-2 tw-p-5 tw-rounded-xl tw-bg-bg-raised tw-border tw-border-solid tw-border-border-subtle tw-min-w-0 ${className}`}>
            <p className="tw-m-0 tw-text-xs tw-font-semibold tw-uppercase tw-tracking-wide tw-text-text-muted">{label}</p>
            <p className="tw-m-0 tw-text-3xl tw-font-semibold tw-text-text-primary tw-tabular-nums tw-leading-none">{value ?? "—"}</p>
            {deltaEl}
            {hint && <p className="tw-m-0 tw-text-xs tw-text-text-muted">{hint}</p>}
        </div>
    );
}
