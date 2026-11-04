import { Icon } from "./icons.js";
import { LANGUAGES } from "../../i18n/index.js";
import "./LanguageMenu.css";

const { useState, useRef, useEffect, useId } = React;

/**
 * LanguageMenu — language picker styled like the page (a native <select>'s
 * option list is drawn by the browser and can't be themed).
 *
 * value: language code; onChange(code); label: accessible name ("Language").
 * inline: the list opens in the page flow instead of floating — for places
 *         that clip overflow, like the scrolling user menu.
 * align:  "right" (default) or "left" edge of a floating list.
 *
 * Keyboard (listbox pattern): Enter/Space/↓/↑ open; ↑/↓, Home/End and a
 * letter move; Enter/Space pick; Escape closes back to the button; Tab closes.
 */
export default function LanguageMenu({ value, onChange, label, inline = false, align = "right", className = "" }) {
    const [open, setOpen] = useState(false);
    const [active, setActive] = useState(0);
    const button = useRef(null);
    const list = useRef(null);
    const root = useRef(null);
    const id = useId();

    const currentIndex = Math.max(0, LANGUAGES.findIndex((l) => l.code === value));
    const current = LANGUAGES[currentIndex];

    const openAt = (index) => { setActive(index); setOpen(true); };
    const close = (refocus) => {
        setOpen(false);
        if (refocus) button.current?.focus();
    };
    const pick = (index) => {
        close(true);
        if (LANGUAGES[index].code !== value) onChange(LANGUAGES[index].code);
    };

    useEffect(() => {
        if (!open) return undefined;
        list.current?.focus();
        const outside = (e) => { if (!root.current?.contains(e.target)) close(false); };
        document.addEventListener("mousedown", outside);
        return () => document.removeEventListener("mousedown", outside);
    }, [open]);

    useEffect(() => {
        if (open) document.getElementById(`${id}-${active}`)?.scrollIntoView({ block: "nearest" });
    }, [open, active]);

    const onButtonKey = (e) => {
        if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
            e.preventDefault();
            openAt(currentIndex);
        }
    };

    const onListKey = (e) => {
        const last = LANGUAGES.length - 1;
        if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => Math.min(last, i + 1)); }
        else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(0, i - 1)); }
        else if (e.key === "Home") { e.preventDefault(); setActive(0); }
        else if (e.key === "End") { e.preventDefault(); setActive(last); }
        else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(active); }
        else if (e.key === "Escape") { e.preventDefault(); close(true); }
        else if (e.key === "Tab") close(false);
        else if (e.key.length === 1) {
            // Type-ahead: next language starting with that letter.
            const letter = e.key.toLowerCase();
            const order = [...LANGUAGES.keys()].map((n) => (active + 1 + n) % LANGUAGES.length);
            const hit = order.find((n) => LANGUAGES[n].name.toLowerCase().startsWith(letter));
            if (hit !== undefined) setActive(hit);
        }
    };

    return (
        <div ref={root} className={`lang-menu${inline ? " lang-menu--inline" : ""} lang-menu--${align} ${className}`}>
            <button
                ref={button}
                type="button"
                className="lang-menu__button"
                aria-haspopup="listbox"
                aria-expanded={open}
                aria-controls={open ? `${id}-list` : undefined}
                aria-label={`${label}: ${current.name}`}
                onClick={() => (open ? close(false) : openAt(currentIndex))}
                onKeyDown={onButtonKey}
            >
                <Icon name="globe" size={16} />
                <span className="lang-menu__current" lang={current.code}>{current.name}</span>
                <Icon name="chevron-down" size={14} className="lang-menu__chevron" />
            </button>

            {open && (
                <ul
                    ref={list}
                    id={`${id}-list`}
                    className="lang-menu__list"
                    role="listbox"
                    tabIndex={-1}
                    aria-label={label}
                    aria-activedescendant={`${id}-${active}`}
                    onKeyDown={onListKey}
                >
                    {LANGUAGES.map((l, i) => (
                        <li
                            key={l.code}
                            id={`${id}-${i}`}
                            role="option"
                            lang={l.code}
                            aria-selected={l.code === value}
                            className={`lang-menu__option${i === active ? " lang-menu__option--active" : ""}`}
                            onMouseMove={() => setActive(i)}
                            onClick={() => pick(i)}
                        >
                            <span>{l.name}</span>
                            {l.code === value && <Icon name="check" size={16} className="lang-menu__check" />}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
