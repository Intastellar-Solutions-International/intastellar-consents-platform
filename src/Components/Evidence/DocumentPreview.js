import { Drawer, Button, Badge, ErrorState } from "../ui";
import { evidenceObjectUrl, downloadEvidence, formatBytes, formatDay } from "../../Functions/evidenceClient.js";

const { useState, useEffect } = React;

/** A document from the evidence catalog, shown in place: PDFs in the browser's viewer, images as they are. */
export default function DocumentPreview({ doc, typeLabel, onClose }) {
    const [url, setUrl] = useState(null);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!doc) return undefined;
        let objectUrl = null;
        let cancelled = false;
        setUrl(null);
        setError(null);
        evidenceObjectUrl(doc.id)
            .then((u) => { objectUrl = u; if (!cancelled) setUrl(u); else URL.revokeObjectURL(u); })
            .catch((e) => !cancelled && setError(e.message));
        return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
    }, [doc?.id]);

    // A portal, so it opens over the vendor drawer on the Compliance page instead of inside it.
    return window.ReactDOM.createPortal(
        <Drawer open={Boolean(doc)} onClose={onClose} title={doc?.title || ""} width="lg"
            footer={doc && <Button variant="secondary" size="sm" onClick={() => downloadEvidence(doc).catch((e) => setError(e.message))}>Download</Button>}>
            {doc && (
                <div className="tw-flex tw-flex-col tw-gap-3 tw-h-full">
                    <div className="tw-flex tw-flex-wrap tw-items-center tw-gap-2 tw-text-xs tw-text-text-muted">
                        <Badge tone="neutral" icon="file-text">{typeLabel}</Badge>
                        {doc.vendor && <span>{doc.vendor}</span>}
                        <span>{doc.filename} {formatBytes(doc.size_bytes)}</span>
                        <span>Uploaded {formatDay(doc.uploaded_at)}{doc.uploaded_by ? ` by ${doc.uploaded_by}` : ""}</span>
                        {doc.superseded_at && <Badge tone="warning" icon="clock">Replaced {formatDay(doc.superseded_at)}</Badge>}
                    </div>
                    {error && <ErrorState title="Couldn't open the document" message={error} />}
                    {!error && !url && <p className="tw-m-0 tw-text-sm tw-text-text-muted" role="status">Loading the preview…</p>}
                    {url && doc.content_type === "application/pdf" && (
                        <iframe src={url} title={doc.title} className="tw-w-full tw-flex-1 tw-rounded-md tw-border tw-border-solid tw-border-border tw-bg-white" style={{ minHeight: "70vh" }} />
                    )}
                    {url && doc.content_type !== "application/pdf" && (
                        <img src={url} alt={doc.title} className="tw-max-w-full tw-rounded-md tw-border tw-border-solid tw-border-border" />
                    )}
                </div>
            )}
        </Drawer>,
        document.body
    );
}
