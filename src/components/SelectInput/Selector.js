const { useState, useEffect, useRef } = React;
import "./Style.css";

export default function Select(props) {
    const [isOpen, setIsOpen] = useState(false);
    const align = props.align || "left";
    const containerRef = useRef(null);
    const listRef = useRef(null);
    const searchInput = useRef(null);

    function searchItems(query) {
        const root = listRef.current;
        if (!root) return;
        root.querySelectorAll("[data-dropdown-item]").forEach((item) => {
            const text = (item.textContent || "").toLowerCase();
            item.hidden = query.trim() !== "" && !text.includes(query.toLowerCase());
        });
    }

    function isJson(str) {
        try {
            JSON.parse(str);
        } catch (e) {
            return false;
        }
        return true;
    }

    function openMenu() {
        setIsOpen((open) => !open);
    }

    function pick(fn) {
        return () => {
            setIsOpen(false);
            fn();
        };
    }

    function clickOutside(e) {
        if (containerRef.current && !containerRef.current.contains(e.target)) {
            setIsOpen(false);
        }
    }

    useEffect(() => {
        document.addEventListener("click", clickOutside, true);
        return () => document.removeEventListener("click", clickOutside, true);
    }, []);

    useEffect(() => {
        if (isOpen && listRef.current) {
            listRef.current.querySelectorAll("[data-dropdown-item]").forEach((item) => {
                item.hidden = false;
            });
            if (searchInput.current) {
                searchInput.current.value = "";
            }
        }
    }, [isOpen]);

    const menuAlignClass =
        align === "right" ? "dropdown-menu--align-right" : "dropdown-menu--align-left";

    return (
        <div ref={containerRef} className="selectorContianer selector-container" style={props.style}>
            <div className="selector">
                {props.icon ? <i className={props.icon}></i> : null}
                <button
                    type="button"
                    className="dropdown-menu-button"
                    style={props?.style2}
                    onClick={(e) => {
                        e.stopPropagation();
                        openMenu();
                    }}
                    aria-expanded={isOpen}
                    aria-haspopup="listbox"
                >
                    {isJson(props.defaultValue) ? (
                        <>
                            {JSON.parse(props.defaultValue).icon ? (
                                <img
                                    className="company-logo"
                                    src={JSON.parse(props.defaultValue).icon}
                                    alt=""
                                />
                            ) : null}
                            <span className="dropdown-menu-button__label">
                                {JSON.parse(props.defaultValue).name}
                            </span>
                        </>
                    ) : (
                        <span className="dropdown-menu-button__label">{props.defaultValue}</span>
                    )}
                </button>
                {isOpen ? (
                    <div className={`dropdown-menu ${menuAlignClass}`}>
                        <div className="dropdown-menu__panel">
                            <div className="search-box">
                                <input
                                    ref={searchInput}
                                    className="search-input"
                                    type="search"
                                    name="q"
                                    placeholder="Search…"
                                    autoComplete="off"
                                    onChange={(e) => searchItems(e.target.value)}
                                    onClick={(e) => e.stopPropagation()}
                                />
                            </div>
                            <ul ref={listRef} className="dropdown-menu__content" role="listbox">
                                {props?.items?.map((item, key) => {
                                    if (isJson(item)) {
                                        const parsed = JSON.parse(item);
                                        return (
                                            <li
                                                key={parsed.id ?? key}
                                                data-dropdown-item
                                                role="option"
                                                onClick={pick(() =>
                                                    props.onChange(JSON.stringify({ id: parsed.id, name: parsed.name }))
                                                )}
                                            >
                                                {parsed.icon ? <img src={parsed.icon} alt="" /> : null}
                                                {props?.labels ? props?.labels[key] : parsed.name}
                                            </li>
                                        );
                                    }
                                    if (typeof item === "object" && item?.uri) {
                                        return (
                                            <li
                                                key={item.uri}
                                                data-dropdown-item
                                                role="option"
                                                onClick={pick(() =>
                                                    props.onChange(
                                                        JSON.stringify({
                                                            name: item.type,
                                                            uri: item.uri,
                                                        })
                                                    )
                                                )}
                                            >
                                                {item.icon ? <img src={item.icon} alt="" /> : null}
                                                {props?.labels ? props?.labels[key] : item.type}
                                            </li>
                                        );
                                    }
                                    if (typeof item === "object") {
                                        // Handle separator items
                                        if (item.disabled || item.type === "separator") {
                                            return (
                                                <li
                                                    key={key}
                                                    className="dropdown-menu__separator"
                                                    role="separator"
                                                    aria-disabled="true"
                                                >
                                                    {item.name || item.label}
                                                </li>
                                            );
                                        }
                                        // Handle workspace items
                                        if (item.type === "workspace") {
                                            return (
                                                <li
                                                    key={item.workspaceId ?? key}
                                                    data-dropdown-item
                                                    role="option"
                                                    className="dropdown-menu__item--workspace"
                                                    onClick={() =>
                                                        props.onChange(
                                                            JSON.stringify({
                                                                id: item.workspaceId,
                                                                name: item.name,
                                                                type: "workspace",
                                                            })
                                                        )
                                                    }
                                                >
                                                    <span className="dropdown-menu__workspace-icon" aria-hidden="true">W</span>
                                                    <span className="dropdown-menu__workspace-info">
                                                        <span className="dropdown-menu__workspace-name">{item.label || item.name}</span>
                                                        <span className="dropdown-menu__workspace-domain">{item.name}</span>
                                                    </span>
                                                </li>
                                            );
                                        }
                                        return (
                                            <li
                                                key={item.id ?? key}
                                                data-dropdown-item
                                                role="option"
                                                className="dropdown-menu__item--with-icon"
                                                onClick={() =>
                                                    props.onChange(
                                                        JSON.stringify({
                                                            id: item.id,
                                                            name: item.name,
                                                            access: item.access,
                                                        })
                                                    )
                                                }
                                            >
                                                {item.icon && item.icon !== "undefined" ? (
                                                    <img className="company-logo" src={item.icon} alt="" />
                                                ) : null}
                                                {props?.labels ? props?.labels[key] : item.name}
                                            </li>
                                        );
                                    }
                                    return (
                                        <li
                                            key={String(item)}
                                            data-dropdown-item
                                            role="option"
                                            onClick={(e) => {
                                                setIsOpen(false);
                                                props.onChange(
                                                    props.labels ? item : e.currentTarget.textContent
                                                );
                                            }}
                                        >
                                            {item?.icon ? <img src={item.icon} alt="" /> : null}
                                            {props?.labels ? props?.labels[key] : item}
                                        </li>
                                    );
                                })}
                            </ul>
                        </div>
                    </div>
                ) : null}
            </div>
        </div>
    );
}
