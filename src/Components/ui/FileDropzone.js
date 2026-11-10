import { Icon } from "./icons.js";
import Button from "./Button.js";
import { acceptsFile, formatFileLimit } from "./fileAccept.js";

const { useRef, useState } = React;

/**
 * FileDropzone — drag a file in, or pick one with the button.
 * title, hint, accept (input-style list), maxBytes, buttonLabel, icon
 * preview: replaces the icon, e.g. the current logo; actions: extra controls beside the button
 * onFile(file) gets one file that has already passed accept and maxBytes
 * error: a message from the caller; busy shows progress; compact for tight spaces
 */
export default function FileDropzone({ title, hint, accept, maxBytes, buttonLabel = "Select file", icon = "upload", preview, actions, onFile, error, busy = false, disabled = false, compact = false, className = "" }) {
    const input = useRef(null);
    const [dragging, setDragging] = useState(false);
    const [problem, setProblem] = useState(null);
    const blocked = disabled || busy;

    function take(file) {
        if (!file || blocked) return;
        if (!acceptsFile(file, accept)) { setProblem("That file type isn't supported."); return; }
        if (maxBytes && file.size > maxBytes) { setProblem(`The file must be under ${formatFileLimit(maxBytes)}.`); return; }
        setProblem(null);
        onFile(file);
    }
    const message = problem || error;
    const border = dragging ? "tw-border-accent-strong tw-bg-white/5" : "tw-border-border-strong";

    return (
        <div
            data-dropzone
            className={`tw-flex tw-flex-col tw-items-center tw-text-center tw-gap-2 ${compact ? "tw-p-4" : "tw-p-6"} tw-border tw-border-dashed tw-rounded-lg tw-transition-colors ${border} ${className}`}
            onDragEnter={(e) => { e.preventDefault(); if (!blocked) setDragging(true); }}
            onDragOver={(e) => e.preventDefault()}
            onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDragging(false); }}
            onDrop={(e) => { e.preventDefault(); setDragging(false); take(e.dataTransfer.files[0]); }}
        >
            {preview || (
                <span className="tw-inline-flex tw-items-center tw-justify-center tw-h-12 tw-w-12 tw-rounded-xl tw-bg-white/5 tw-border tw-border-solid tw-border-border tw-text-text-secondary" aria-hidden="true">
                    <Icon name={icon} size={22} />
                </span>
            )}
            <p className="tw-m-0 tw-text-sm tw-font-semibold tw-text-text-primary">{title}</p>
            {hint && <p className="tw-m-0 tw-text-xs tw-text-text-muted">{hint}</p>}
            <div className="tw-flex tw-flex-wrap tw-justify-center tw-items-center tw-gap-2 tw-mt-1">
                <Button size="sm" variant="secondary" loading={busy} disabled={disabled} onClick={() => input.current.click()}>{buttonLabel}</Button>
                {actions}
            </div>
            {message && <p role="alert" className="tw-m-0 tw-text-sm tw-text-danger-text">{message}</p>}
            <input
                ref={input}
                type="file"
                accept={accept}
                className="tw-sr-only"
                tabIndex={-1}
                aria-label={title}
                disabled={blocked}
                onChange={(e) => { const file = e.target.files[0]; e.target.value = ""; take(file); }}
            />
        </div>
    );
}
