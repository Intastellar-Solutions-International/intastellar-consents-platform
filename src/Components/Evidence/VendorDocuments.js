import { Button, Badge, FileDropzone } from "../ui";
import DocumentPreview from "./DocumentPreview.js";
import {
    uploadEvidence, deleteEvidence, vendorDocuments, formatDay, EVIDENCE_ACCEPT, EVIDENCE_MAX_BYTES,
} from "../../Functions/evidenceClient.js";

const { useState } = React;
const { Link } = window.ReactRouterDOM;

const OTHER_TYPES = [
    { id: "sccs", label: "SCCs" },
    { id: "dpf", label: "DPF certificate" },
    { id: "tia", label: "Transfer impact assessment" },
    { id: "other", label: "Other" },
];
const TYPE_LABEL = Object.fromEntries([["dpa", "DPA"], ...OTHER_TYPES.map((t) => [t.id, t.label])]);
const SELECT = "tw-h-8 tw-px-2 tw-bg-bg-sunken tw-text-text-primary tw-border tw-border-solid tw-border-border-strong tw-rounded-md tw-font-sans tw-text-sm";

function DocumentRow({ doc, onPreview, onRemove, busy }) {
    return (
        <li className="tw-flex tw-flex-wrap tw-items-center tw-gap-2 tw-py-2 tw-border-0 tw-border-t tw-border-solid tw-border-border-subtle">
            <span className="tw-flex-1 tw-min-w-0">
                <span className="tw-block tw-text-sm tw-text-text-primary tw-truncate">{doc.title}</span>
                <span className="tw-block tw-text-xs tw-text-text-muted">{TYPE_LABEL[doc.doc_type] || doc.doc_type} · {formatDay(doc.uploaded_at)}</span>
            </span>
            <Button size="sm" variant="ghost" icon="file-text" onClick={() => onPreview(doc)}>Preview</Button>
            {onRemove && <Button size="sm" variant="ghost" disabled={busy} onClick={() => onRemove(doc)}>Remove</Button>}
        </li>
    );
}

/**
 * One vendor's documents in the evidence catalog: its current DPA (replacing it keeps the old
 * one as history) and other evidence. `documents` is the whole catalog; onChange gets the new one.
 */
export default function VendorDocuments({ vendor, documents, onChange }) {
    const { dpa, history, other } = vendorDocuments(documents, vendor);
    const [otherType, setOtherType] = useState("sccs");
    const [state, setState] = useState(null); // null | "dpa" | "other" | "remove" | error text
    const [preview, setPreview] = useState(null);

    async function run(kind, action) {
        setState(kind);
        try {
            onChange(await action());
            setState(null);
        } catch (e) {
            setState(e.message || "That didn't work. Please try again.");
        }
    }
    const remove = (doc) => {
        if (window.confirm(`Remove “${doc.title}”? Control persons won't see it any more.`)) run("remove", () => deleteEvidence(doc.id));
    };
    const error = state && !["dpa", "other", "remove"].includes(state) ? state : null;

    return (
        <section aria-labelledby={`docs-${vendor}`} className="tw-flex tw-flex-col tw-gap-3 tw-p-4 tw-bg-bg-sunken tw-rounded-lg">
            <div className="tw-flex tw-items-center tw-justify-between tw-gap-2">
                <h3 id={`docs-${vendor}`} className="tw-m-0 tw-text-sm tw-font-semibold tw-text-text-primary">Documents</h3>
                <Link to="/settings/evidence" className="tw-text-xs tw-text-accent-strong">Evidence catalog</Link>
            </div>

            <div>
                <p className="tw-m-0 tw-mb-2 tw-text-xs tw-text-text-muted">Data processing agreement</p>
                {dpa ? (
                    <ul className="tw-m-0 tw-p-0 tw-list-none">
                        <DocumentRow doc={dpa} onPreview={setPreview} onRemove={remove} busy={state === "remove"} />
                    </ul>
                ) : <Badge tone="warning" icon="alert-triangle">No DPA uploaded</Badge>}
                <FileDropzone
                    compact
                    className="tw-mt-2"
                    title={dpa ? "Drop a newer DPA to replace it" : "Drag and drop the signed DPA"}
                    hint={`PDF, PNG or JPEG, up to 3 MB${dpa ? ". The current one is kept as history." : ""}`}
                    accept={EVIDENCE_ACCEPT}
                    maxBytes={EVIDENCE_MAX_BYTES}
                    buttonLabel={dpa ? "Replace DPA" : "Upload DPA"}
                    busy={state === "dpa"}
                    onFile={(file) => run("dpa", () => uploadEvidence({ vendor, docType: "dpa", title: `${vendor} DPA`, file }))}
                />
                {history.length > 0 && (
                    <details className="tw-mt-2 tw-text-xs tw-text-text-muted">
                        <summary className="tw-cursor-pointer">Earlier DPAs ({history.length})</summary>
                        <ul className="tw-m-0 tw-p-0 tw-list-none">
                            {history.map((d) => <DocumentRow key={d.id} doc={{ ...d, title: `${d.title} (replaced ${formatDay(d.superseded_at)})` }} onPreview={setPreview} />)}
                        </ul>
                    </details>
                )}
            </div>

            <div>
                <p className="tw-m-0 tw-mb-2 tw-text-xs tw-text-text-muted">Other evidence</p>
                {other.length > 0 && (
                    <ul className="tw-m-0 tw-mb-2 tw-p-0 tw-list-none">
                        {other.map((d) => <DocumentRow key={d.id} doc={d} onPreview={setPreview} onRemove={remove} busy={state === "remove"} />)}
                    </ul>
                )}
                <div className="tw-grid tw-gap-2 tw-items-start" style={{ gridTemplateColumns: "minmax(140px, 200px) minmax(0, 1fr)" }}>
                    <label className="tw-flex tw-flex-col tw-gap-1 tw-text-xs tw-text-text-muted">
                        Type
                        <select className={SELECT} value={otherType} onChange={(e) => setOtherType(e.target.value)} style={{ colorScheme: "dark" }}>
                            {OTHER_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                        </select>
                    </label>
                    <FileDropzone
                        compact
                        title="Drag and drop evidence"
                        hint="PDF, PNG or JPEG, up to 3 MB"
                        accept={EVIDENCE_ACCEPT}
                        maxBytes={EVIDENCE_MAX_BYTES}
                        busy={state === "other"}
                        onFile={(file) => run("other", () => uploadEvidence({ vendor, docType: otherType, title: `${vendor} ${TYPE_LABEL[otherType]}`, file }))}
                    />
                </div>
            </div>
            {error && <p role="alert" className="tw-m-0 tw-text-xs tw-text-danger-text">{error}</p>}
            <DocumentPreview doc={preview} typeLabel={TYPE_LABEL[preview?.doc_type] || ""} onClose={() => setPreview(null)} />
        </section>
    );
}
