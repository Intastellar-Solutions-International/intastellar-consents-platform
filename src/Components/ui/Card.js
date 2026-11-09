/**
 * Card — a surface for one block of content.
 *
 * title / description / actions: optional header row (actions on the right)
 * padding: "sm" | "md" | "lg" | "none" (for tables that run edge to edge)
 * as: the element (default "section"); give it a title so the region is named.
 * Neutral border only — cards are never framed in gold.
 */
const PADDING = { none: "", sm: "tw-p-3", md: "tw-p-5", lg: "tw-p-6" };

export default function Card({ title, description, actions, padding = "md", as: Tag = "section", className = "", children, ...rest }) {
    const titleId = rest.id ? `${rest.id}-title` : undefined;
    return (
        <Tag
            className={`tw-bg-bg-raised tw-border tw-border-solid tw-border-border-subtle tw-rounded-xl tw-shadow-md tw-text-text-secondary tw-min-w-0 ${className}`}
            aria-labelledby={title && titleId ? titleId : undefined}
            {...rest}
        >
            {(title || actions) && (
                <header className={`tw-flex tw-flex-wrap tw-items-start tw-justify-between tw-gap-4 ${padding === "none" ? "tw-p-5 tw-pb-3" : PADDING[padding] + " tw-pb-0"}`}>
                    <div className="tw-min-w-0">
                        {title && <h2 id={titleId} className="tw-m-0 tw-text-base tw-font-semibold tw-text-text-primary">{title}</h2>}
                        {description && <p className="tw-m-0 tw-mt-1 tw-text-sm tw-text-text-muted">{description}</p>}
                    </div>
                    {actions && <div className="tw-flex tw-items-center tw-gap-2 tw-shrink-0">{actions}</div>}
                </header>
            )}
            <div className={PADDING[padding]}>{children}</div>
        </Tag>
    );
}
