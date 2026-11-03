import { Icon } from "../ui/icons.js";
import Button from "../ui/Button.js";
import { SkeletonText } from "../ui/Skeleton.js";

const Link = window.ReactRouterDOM.Link;

/**
 * "Needs attention" — the problems on this page worth acting on, worst first.
 * items: [{ id, severity: "danger" | "warning" | "info", title, description,
 *           action?: { label, to | href | onClick } }]
 * Severity is always icon + word, never colour alone. With no items it says
 * so instead of disappearing, so "nothing to fix" is a visible state.
 */
const SEVERITY = {
    danger: { icon: "alert-octagon", word: "Action needed", text: "tw-text-danger-text", border: "tw-border-danger/40", bg: "tw-bg-danger/10" },
    warning: { icon: "alert-triangle", word: "Check", text: "tw-text-warning", border: "tw-border-warning/40", bg: "tw-bg-warning/10" },
    info: { icon: "info", word: "Info", text: "tw-text-info-text", border: "tw-border-info/40", bg: "tw-bg-info/10" },
};
const ORDER = { danger: 0, warning: 1, info: 2 };

export default function AttentionPanel({ items, loading = false, title = "Needs attention" }) {
    const sorted = [...(items || [])].sort((a, b) => ORDER[a.severity] - ORDER[b.severity]);
    return (
        <section aria-labelledby="attention-title" className="tw-flex tw-flex-col tw-gap-3">
            <h2 id="attention-title" className="tw-m-0 tw-text-base tw-font-semibold tw-text-text-primary">
                {title}{!loading && sorted.length > 0 && <span className="tw-ml-2 tw-text-sm tw-font-normal tw-text-text-muted">{sorted.length}</span>}
            </h2>
            {loading ? <SkeletonText lines={2} label="Checking what needs attention…" /> : sorted.length === 0 ? (
                <p className="tw-m-0 tw-flex tw-items-center tw-gap-2 tw-text-sm tw-text-success">
                    <Icon name="check-circle" size={16} /> Nothing needs attention right now.
                </p>
            ) : (
                <ul className="tw-m-0 tw-p-0 tw-list-none tw-flex tw-flex-col tw-gap-2">
                    {sorted.map((item) => {
                        const s = SEVERITY[item.severity] || SEVERITY.info;
                        const a = item.action;
                        return (
                            <li key={item.id} className={`tw-flex tw-flex-wrap tw-items-center tw-gap-3 tw-px-4 tw-py-3 tw-rounded-lg tw-border tw-border-solid ${s.border} ${s.bg}`}>
                                <span className={`tw-flex tw-items-center tw-gap-1 tw-text-xs tw-font-semibold tw-uppercase tw-tracking-wide ${s.text}`}>
                                    <Icon name={s.icon} size={16} />{s.word}
                                </span>
                                <div className="tw-flex-1 tw-basis-24 tw-min-w-0">
                                    <p className="tw-m-0 tw-text-sm tw-font-semibold tw-text-text-primary">{item.title}</p>
                                    {item.description && <p className="tw-m-0 tw-text-sm tw-text-text-secondary">{item.description}</p>}
                                </div>
                                {a && (a.to
                                    ? <Link to={a.to} className="tw-text-sm tw-font-semibold tw-text-accent-strong focus-visible:tw-outline-none focus-visible:tw-shadow-focus tw-rounded-sm">{a.label}</Link>
                                    : <Button size="sm" variant="secondary" href={a.href} onClick={a.onClick}>{a.label}</Button>)}
                            </li>
                        );
                    })}
                </ul>
            )}
        </section>
    );
}
