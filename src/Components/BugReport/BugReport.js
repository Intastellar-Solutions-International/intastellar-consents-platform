import "./BugReport.css";
import API from "../../API/api";
import appStorage from "../../Functions/storage.js";

const { useState, useEffect, useRef } = React;

const TYPES = [
    { value: "bug",      label: "Bug",     icon: "🐛", githubLabel: "bug" },
    { value: "feature",  label: "Feature", icon: "✨", githubLabel: "enhancement" },
    { value: "question", label: "Question",icon: "💬", githubLabel: "question" },
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

export default function BugReport() {
    const [open, setOpen]         = useState(false);
    const [type, setType]         = useState("bug");
    const [title, setTitle]       = useState("");
    const [description, setDesc]  = useState("");
    const [steps, setSteps]       = useState("");
    const [expected, setExpected] = useState("");
    const [status, setStatus]     = useState(null); // null | "sending" | "success" | "error"
    const panelRef = useRef(null);

    // Lock body scroll when open
    useEffect(() => {
        if (open) {
            document.body.style.overflow = "hidden";
        } else {
            document.body.style.overflow = "";
        }
        return () => { document.body.style.overflow = ""; };
    }, [open]);

    // Escape to close
    useEffect(() => {
        if (!open) return;
        const onKey = (e) => { if (e.key === "Escape") handleClose(); };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [open, status]);

    function reset() {
        setType("bug");
        setTitle("");
        setDesc("");
        setSteps("");
        setExpected("");
        setStatus(null);
    }

    function handleClose() {
        setOpen(false);
        if (status === "success") reset();
    }

    function handleBackdropClick(e) {
        if (e.target === e.currentTarget) handleClose();
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
    const canSubmit = title.trim().length > 0 && description.trim().length > 0 && status !== "sending";

    return (
        <>
            {/* Backdrop + centered panel — rendered at document level via sibling, avoids stacking issues */}
            {open && (
                <div className="br-backdrop" onClick={handleBackdropClick} role="presentation">
                    <div
                        className="br-panel"
                        ref={panelRef}
                        role="dialog"
                        aria-modal="true"
                        aria-label="Send feedback"
                    >
                        <div className="br-panel__header">
                            <div className="br-panel__heading">
                                <svg className="br-panel__heading-icon" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                                    <path d="M3 4a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H7l-4 3V4Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
                                </svg>
                                <h2 className="br-panel__title">Send feedback</h2>
                            </div>
                            <button className="br-panel__close" onClick={handleClose} aria-label="Close">×</button>
                        </div>

                        {status === "success" ? (
                            <div className="br-success">
                                <div className="br-success__ring">
                                    <svg className="br-success__icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                        <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                    </svg>
                                </div>
                                <p className="br-success__msg">Issue submitted — thank you!</p>
                                <p className="br-success__sub">It's logged in GitHub and someone from the team will pick it up.</p>
                                <div className="br-actions" style={{ justifyContent: "center", paddingTop: 0 }}>
                                    <button className="br-btn" onClick={handleClose}>Close</button>
                                    <button className="br-btn br-btn--primary" onClick={reset}>Submit another</button>
                                </div>
                            </div>
                        ) : (
                            <form className="br-form" onSubmit={handleSubmit} noValidate>

                                <div className="br-field">
                                    <span className="br-label">Type</span>
                                    <div className="br-type-row">
                                        {TYPES.map(t => (
                                            <button
                                                key={t.value}
                                                type="button"
                                                className={`br-type-btn${type === t.value ? " br-type-btn--active" : ""}`}
                                                onClick={() => setType(t.value)}
                                            >
                                                <span className="br-type-btn__icon" aria-hidden="true">{t.icon}</span>
                                                {t.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div className="br-field">
                                    <label className="br-label" htmlFor="br-title">Title</label>
                                    <input
                                        id="br-title"
                                        className="br-input"
                                        type="text"
                                        placeholder={isBug ? "Short summary of the bug" : "What would you like to request?"}
                                        value={title}
                                        onChange={e => setTitle(e.target.value)}
                                        maxLength={120}
                                        required
                                        autoFocus
                                    />
                                </div>

                                <div className="br-field">
                                    <label className="br-label" htmlFor="br-desc">
                                        {isBug ? "What happened?" : "Description"}
                                    </label>
                                    <textarea
                                        id="br-desc"
                                        className="br-input br-input--textarea"
                                        placeholder={isBug ? "Describe the issue in detail…" : "Tell us more about your request…"}
                                        value={description}
                                        onChange={e => setDesc(e.target.value)}
                                        rows={4}
                                        required
                                    />
                                </div>

                                {isBug && (
                                    <>
                                        <div className="br-field">
                                            <label className="br-label" htmlFor="br-steps">
                                                Steps to reproduce <span className="br-label--opt">optional</span>
                                            </label>
                                            <textarea
                                                id="br-steps"
                                                className="br-input br-input--textarea"
                                                placeholder={"1. Go to…\n2. Click…\n3. See error"}
                                                value={steps}
                                                onChange={e => setSteps(e.target.value)}
                                                rows={3}
                                            />
                                        </div>
                                        <div className="br-field">
                                            <label className="br-label" htmlFor="br-expected">
                                                Expected behaviour <span className="br-label--opt">optional</span>
                                            </label>
                                            <input
                                                id="br-expected"
                                                className="br-input"
                                                type="text"
                                                placeholder="What should have happened instead?"
                                                value={expected}
                                                onChange={e => setExpected(e.target.value)}
                                            />
                                        </div>
                                    </>
                                )}

                                <div className="br-divider" />

                                <p className="br-meta">
                                    Current page URL, browser info, and your account email will be attached automatically.
                                </p>

                                {status === "error" && (
                                    <p className="br-error" role="alert">
                                        Something went wrong — please try again or reach us directly.
                                    </p>
                                )}

                                <div className="br-actions">
                                    <button type="button" className="br-btn" onClick={handleClose}>Cancel</button>
                                    <button
                                        type="submit"
                                        className="br-btn br-btn--primary"
                                        disabled={!canSubmit}
                                        aria-busy={status === "sending"}
                                    >
                                        {status === "sending" ? "Submitting…" : "Submit"}
                                    </button>
                                </div>
                            </form>
                        )}
                    </div>
                </div>
            )}

            {/* Floating trigger — bottom-left, clear of DevTierSwitcher (bottom-right) */}
            <div className="br-root">
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
