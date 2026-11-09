import "./BugReport.css";
import API from "../../API/api";
import appStorage from "../../Functions/storage.js";
import Drawer from "../ui/Drawer.js";
import Button from "../ui/Button.js";
import { Icon } from "../ui/icons.js";

const { useState, useEffect } = React;

const TYPES = [
    { value: "bug",      label: "Bug",     icon: "alert-triangle", githubLabel: "bug" },
    { value: "feature",  label: "Feature", icon: "trending-up", githubLabel: "enhancement" },
    { value: "question", label: "Question",icon: "help-circle", githubLabel: "question" },
];

function buildIssueBody({ type, description, steps, expected, email, orgName, url, ua }) {
    const lines = [];
    lines.push("### Reporter");
    lines.push(`- **Email:** ${email || "unknown"}`);
    if (orgName) lines.push(`- **Organisation:** ${orgName}`);
    lines.push(`- **Page:** \`${url}\``);
    lines.push(`- **Reported at:** ${new Date().toUTCString()}`);
    lines.push(`- **Browser:** ${ua}`);
    lines.push("");
    lines.push("---");
    lines.push("");
    lines.push("### Description");
    lines.push(description);
    if (type === "bug") {
        lines.push("");
        lines.push("### Steps to reproduce");
        lines.push(steps?.trim() || "_Not provided._");
        lines.push("");
        lines.push("### Expected behaviour");
        lines.push(expected?.trim() || "_Not provided._");
    }
    return lines.join("\n");
}

const FORM_ID = "feedback-form";
const CONTROL = "tw-block tw-w-full tw-px-3 tw-py-2 tw-bg-bg-sunken tw-text-text-primary tw-border tw-border-solid tw-border-border tw-rounded-md tw-font-sans tw-text-sm tw-box-border placeholder:tw-text-text-muted focus-visible:tw-outline-none focus-visible:tw-shadow-focus";

function Field({ id, label, optional = false, children }) {
    return (
        <div className="tw-flex tw-flex-col tw-gap-1">
            <label htmlFor={id} className="tw-text-sm tw-text-text-primary">
                {label}{optional && <span className="tw-ml-2 tw-text-xs tw-text-text-muted">Optional</span>}
            </label>
            {children}
        </div>
    );
}

export default function BugReport() {
    const [open, setOpen]         = useState(false);
    const [type, setType]         = useState("bug");
    const [title, setTitle]       = useState("");
    const [description, setDesc]  = useState("");
    const [steps, setSteps]       = useState("");
    const [expected, setExpected] = useState("");
    const [showDetails, setShowDetails] = useState(false);
    const [status, setStatus]     = useState(null); // null | "sending" | "success" | "error"

    // Lock body scroll when open
    useEffect(() => {
        document.body.style.overflow = open ? "hidden" : "";
        return () => { document.body.style.overflow = ""; };
    }, [open]);

    function reset() {
        setType("bug");
        setTitle("");
        setDesc("");
        setSteps("");
        setExpected("");
        setShowDetails(false);
        setStatus(null);
    }

    function handleClose() {
        setOpen(false);
        if (status === "success") reset();
    }

    async function handleSubmit(e) {
        e.preventDefault();
        if (!title.trim() || !description.trim()) return;
        setStatus("sending");

        const globals = (() => { try { return JSON.parse(appStorage.getItem("globals")); } catch { return null; } })();
        const org     = (() => { try { return JSON.parse(appStorage.getItem("organisation")); } catch { return null; } })();
        const typeObj = TYPES.find(t => t.value === type);

        try {
            const res = await fetch(API.github.createIssue.url, {
                method:  API.github.createIssue.method,
                headers: API.github.createIssue.headers,
                body: JSON.stringify({
                    title:  `[${typeObj.label}] ${title.trim()}`,
                    body:   buildIssueBody({
                        type,
                        description: description.trim(),
                        steps,
                        expected,
                        email:   globals?.user?.email,
                        orgName: org?.name,
                        url:     window.location.href,
                        ua:      navigator.userAgent,
                    }),
                    labels: [typeObj.githubLabel],
                }),
            });
            setStatus(res.status === 201 ? "success" : "error");
        } catch {
            setStatus("error");
        }
    }

    const isBug     = type === "bug";
    const sent      = status === "success";
    const canSubmit = title.trim().length > 0 && description.trim().length > 0 && status !== "sending";

    const footer = sent ? (
        <>
            <Button onClick={handleClose}>Close</Button>
            <Button variant="primary" onClick={reset}>Send another</Button>
        </>
    ) : (
        <>
            <Button onClick={handleClose}>Cancel</Button>
            <Button variant="primary" type="submit" form={FORM_ID} disabled={!canSubmit} loading={status === "sending"}>
                {status === "sending" ? "Sending…" : "Send feedback"}
            </Button>
        </>
    );

    return (
        <>
            <Drawer open={open} onClose={handleClose} title="Send feedback" footer={footer}>
                {sent ? (
                    <div className="tw-flex tw-flex-col tw-items-center tw-gap-2 tw-py-12 tw-text-center">
                        <span className="tw-text-success"><Icon name="check-circle" size={32} /></span>
                        <p className="tw-m-0 tw-text-base tw-font-semibold tw-text-text-primary">Thanks, we've got it</p>
                        <p className="tw-m-0 tw-text-sm tw-text-text-secondary">Your feedback has been sent to the team.</p>
                    </div>
                ) : (
                    <form id={FORM_ID} onSubmit={handleSubmit} noValidate className="tw-flex tw-flex-col tw-gap-4">
                        <div role="group" aria-label="Feedback type" className="tw-grid tw-grid-cols-3 tw-gap-0.5 tw-p-0.5 tw-bg-bg-sunken tw-rounded-md">
                            {TYPES.map((t) => (
                                <button
                                    key={t.value}
                                    type="button"
                                    aria-pressed={type === t.value}
                                    onClick={() => setType(t.value)}
                                    className={`tw-flex tw-items-center tw-justify-center tw-gap-2 tw-h-10 tw-border-0 tw-rounded-sm tw-font-sans tw-text-sm tw-cursor-pointer focus-visible:tw-outline-none focus-visible:tw-shadow-focus ${type === t.value ? "tw-bg-accent-subtle tw-text-text-primary" : "tw-bg-transparent tw-text-text-secondary hover:tw-bg-white/5"}`}
                                >
                                    <Icon name={t.icon} size={16} />{t.label}
                                </button>
                            ))}
                        </div>

                        <Field id="br-title" label="Title">
                            <input id="br-title" className={CONTROL} type="text" required maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)}
                                placeholder={isBug ? "Short summary of the bug" : type === "feature" ? "What would you like to see?" : "What do you need help with?"} />
                        </Field>

                        <Field id="br-desc" label={isBug ? "What happened?" : "Description"}>
                            <textarea id="br-desc" className={CONTROL} rows={5} required value={description} onChange={(e) => setDesc(e.target.value)} style={{ resize: "vertical" }}
                                placeholder={isBug ? "Describe what you saw" : "Tell us a bit more"} />
                        </Field>

                        {isBug && !showDetails && (
                            <div><Button size="sm" variant="ghost" icon="chevron-down" onClick={() => setShowDetails(true)}>Add steps to reproduce</Button></div>
                        )}
                        {isBug && showDetails && (
                            <>
                                <Field id="br-steps" label="Steps to reproduce" optional>
                                    <textarea id="br-steps" className={CONTROL} rows={3} value={steps} onChange={(e) => setSteps(e.target.value)} style={{ resize: "vertical" }} placeholder={"1. Go to…\n2. Click…\n3. See the error"} />
                                </Field>
                                <Field id="br-expected" label="What should have happened?" optional>
                                    <input id="br-expected" className={CONTROL} type="text" value={expected} onChange={(e) => setExpected(e.target.value)} />
                                </Field>
                            </>
                        )}

                        <p className="tw-m-0 tw-flex tw-gap-2 tw-text-xs tw-text-text-muted">
                            <span className="tw-shrink-0"><Icon name="info" size={14} /></span>
                            We'll include this page's address, your browser details and your account email.
                        </p>

                        {status === "error" && (
                            <p role="alert" className="tw-m-0 tw-flex tw-items-center tw-gap-2 tw-text-sm tw-text-danger-text">
                                <Icon name="alert-octagon" size={16} />Your feedback couldn't be sent. Please try again.
                            </p>
                        )}
                    </form>
                )}
            </Drawer>

            {/* Docked edge tab — right edge, vertically centered. See
                BugReport.css for why this replaced the old floating pill
                (docs/design-audit-plan.md Phase 2 item 2). */}
            <div className="br-root" style={open ? { visibility: "hidden" } : undefined}>
                <button
                    className={`br-trigger${open ? " br-trigger--active" : ""}`}
                    onClick={() => setOpen(o => !o)}
                    aria-label="Send feedback"
                    aria-expanded={open}
                >
                    <svg className="br-trigger__icon" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                        <path d="M1.5 2.5a1 1 0 0 1 1-1h11a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H5.5l-4 3V2.5Z" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round"/>
                    </svg>
                    Feedback
                </button>
            </div>
        </>
    );
}
