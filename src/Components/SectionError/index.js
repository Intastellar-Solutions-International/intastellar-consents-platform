import "./Style.css";

/** Inline "couldn't load" state for one dashboard section, with Retry. */
export default function SectionError({ title = "Couldn't load this section", message, onRetry, compact = false }) {
    return (
        <div className={"section-error" + (compact ? " section-error--compact" : "")} role="alert">
            <div className="section-error__text">
                <strong className="section-error__title">{title}</strong>
                {message && <span className="section-error__message">{message}</span>}
            </div>
            {onRetry && (
                <button type="button" className="section-error__retry" onClick={onRetry}>Retry</button>
            )}
        </div>
    );
}
