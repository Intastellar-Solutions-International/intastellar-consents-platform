const Link = window.ReactRouterDOM.Link;

/**
 * Settings page template: section nav on the left, content on the right.
 * sections: [{ id, label, to }] — `to` routes to a settings page; without it
 * the nav links to #id on the same page. activeId marks aria-current.
 * The nav is sticky on wide screens and stacks above the content on narrow ones.
 */
export default function SettingsTemplate({ sections, activeId, navLabel = "Settings sections", children }) {
    const item = (active) => `tw-block tw-px-3 tw-py-2 tw-rounded-md tw-text-sm tw-no-underline focus-visible:tw-outline-none focus-visible:tw-shadow-focus ${active
        ? "tw-bg-accent-subtle tw-text-text-primary tw-font-semibold tw-shadow-active"
        : "tw-text-text-secondary hover:tw-bg-white/5 hover:tw-text-text-primary"}`;
    return (
        <div className="settings-template tw-grid tw-gap-6 tw-w-full tw-min-w-0">
            <nav aria-label={navLabel} className="settings-template__nav">
                <ul className="tw-m-0 tw-p-0 tw-list-none tw-flex tw-flex-col tw-gap-0.5">
                    {sections.map((s) => {
                        const active = s.id === activeId;
                        return (
                            <li key={s.id}>
                                {s.to
                                    ? <Link to={s.to} aria-current={active ? "page" : undefined} className={item(active)}>{s.label}</Link>
                                    : <a href={`#${s.id}`} aria-current={active ? "true" : undefined} className={item(active)}>{s.label}</a>}
                            </li>
                        );
                    })}
                </ul>
            </nav>
            <div className="tw-min-w-0 tw-flex tw-flex-col tw-gap-6">{children}</div>
        </div>
    );
}
