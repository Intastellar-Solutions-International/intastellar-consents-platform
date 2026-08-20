const { useState, useEffect, useContext, useMemo, useCallback } = React;
const useParams = window.ReactRouterDOM.useParams;
const Link = window.ReactRouterDOM.Link;
import { DomainContext } from "../../App.js";
import { useSyncDomainFromRoute, isCombinedOrClearDomain, analyticsRecordingsPath } from "../../Functions/domainPathSegments.js";
import { ScannerHost } from "../../API/host.js";
import StickyPageTitle from "../../Components/Header/Sticky/index.js";
import { authHeaders, useAnalyticsPageChrome } from "./_shared.js";
import { IconVideo } from "./Icons.js";
import RecordingPlayer from "./RecordingPlayer.js";
import "./Analytics.css";

const RECORDINGS_URL = `${ScannerHost}/api/analytics-recordings`;
const SITE_URL       = `${ScannerHost}/api/analytics-site`;

function fmtDuration(sec) {
    if (!sec && sec !== 0) return "—";
    const m = Math.floor(sec / 60), s = sec % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
}

function useRecordingList(domain, fromIso, toIso, tick = 0) {
    const [data,    setData]    = useState(null);
    const [loading, setLoading] = useState(false);
    const [error,   setError]   = useState(null);

    useEffect(() => {
        if (!domain) { setData(null); return; }
        setLoading(true);
        setError(null);
        const qs = new URLSearchParams({ domain, from: fromIso, to: toIso, limit: "50" }).toString();
        fetch(`${RECORDINGS_URL}?${qs}`, { headers: authHeaders() })
            .then(async r => {
                if (!r.ok) throw new Error(r.status);
                setData(await r.json());
            })
            .catch(() => setError("Could not load recordings."))
            .finally(() => setLoading(false));
    }, [domain, fromIso, toIso, tick]); // eslint-disable-line react-hooks/exhaustive-deps

    return { data, loading, error };
}

function EnableRecordingCard({ domain, onEnabled }) {
    const [saving,      setSaving]      = useState(false);
    const [justEnabled, setJustEnabled] = useState(false);
    const [error,       setError]       = useState(null);

    const enable = useCallback(async () => {
        setSaving(true);
        setError(null);
        const r = await fetch(`${SITE_URL}?domain=${encodeURIComponent(domain)}`, {
            method: "PATCH",
            headers: authHeaders(),
            body: JSON.stringify({ recordingEnabled: true }),
        }).catch(() => null);
        setSaving(false);
        if (r?.ok) {
            setJustEnabled(true);
            onEnabled?.();
        } else {
            setError("Could not enable recording — please try again.");
        }
    }, [domain, onEnabled]);

    if (justEnabled) {
        return (
            <div className="sa-setup">
                <div className="sa-setup__icon"><IconVideo /></div>
                <h3 className="sa-setup__title">Recording enabled for <strong>{domain}</strong></h3>
                <p className="sa-setup__body">
                    New consented visits will now be sampled in for recording. Recordings
                    appear here once a session finishes — this can take a few minutes.
                </p>
            </div>
        );
    }

    return (
        <div className="sa-setup">
            <div className="sa-setup__icon"><IconVideo /></div>
            <h3 className="sa-setup__title">Recording is off for <strong>{domain}</strong></h3>
            <p className="sa-setup__body">
                Once enabled, a sample of consented visits will be recorded (DOM-based
                replay, not a video) so you can watch exactly what visitors did.
                Passwords and payment fields are always masked.
            </p>
            <button type="button" className="sa-setup__gen-btn" onClick={enable} disabled={saving}>
                {saving ? "Enabling…" : "Enable recording"}
            </button>
            {error && <p className="sa-notice sa-notice--error" style={{ marginTop: 12 }}>{error}</p>}
        </div>
    );
}

export default function AnalyticsRecordings() {
    document.title = "Recordings | Site Analytics";

    const {
        domain, getLastDays, setLastDays, fromDate, setFromDate, toDate, setToDate, fromIso, toIso,
    } = useAnalyticsPageChrome();

    const [tick, setTick] = useState(0);
    const { data, loading, error } = useRecordingList(domain, fromIso, toIso, tick);

    const recordings = data?.recordings || [];
    const recordingIsOn   = !!data?.recordingEnabled;
    const showEnableCard  = !loading && data && !data.noSiteKey && !recordingIsOn;
    const showWaitingEmpty = !loading && data && !data.noSiteKey && recordingIsOn && recordings.length === 0;

    return (
        <div style={{ flex: "1", minWidth: 0 }}>
            <StickyPageTitle
                title="Recordings"
                numberofDays={setLastDays}
                getLastDays={getLastDays}
                fromDate={fromDate}
                toDate={toDate}
                setFromDate={setFromDate}
                setToDate={setToDate}
            />
            <div className="dashboard-content">
                <div className="sa-page">
                    {!domain && (
                        <p className="sa-notice">Select a domain in the header to view recordings.</p>
                    )}
                    {domain && loading && <p className="sa-notice">Loading&hellip;</p>}
                    {domain && error && <p className="sa-notice sa-notice--error">{error}</p>}
                    {domain && !loading && data?.noSiteKey && (
                        <p className="sa-notice">No analytics set up for this domain yet.</p>
                    )}

                    {domain && showEnableCard && (
                        <EnableRecordingCard domain={domain} onEnabled={() => setTick(t => t + 1)} />
                    )}

                    {domain && showWaitingEmpty && (
                        <p className="sa-notice">
                            Recording is enabled for <strong>{domain}</strong> — recordings will
                            appear here once a sampled-in visitor's session finishes.
                        </p>
                    )}

                    {domain && !!recordings.length && (
                        <div className="sa-panel">
                            <h3 className="sa-panel__title"><IconVideo className="sa-icon" /> Session recordings</h3>
                            <table className="sa-table">
                                <thead>
                                    <tr>
                                        <th>Started</th>
                                        <th>Entry page</th>
                                        <th>Device</th>
                                        <th>Browser</th>
                                        <th className="sa-table__num">Duration</th>
                                        <th></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {recordings.map(r => (
                                        <tr key={r.id}>
                                            <td>{new Date(r.startedAt).toLocaleString("de-DE")}</td>
                                            <td className="sa-table__path" title={r.entryPathname}>{r.entryPathname}</td>
                                            <td style={{ textTransform: "capitalize" }}>{r.deviceType || "—"}</td>
                                            <td>{r.browserFamily || "—"}</td>
                                            <td className="sa-table__num">{fmtDuration(r.durationSec)}</td>
                                            <td>
                                                <Link to={`${analyticsRecordingsPath(domain)}/${r.id}`}>
                                                    Watch
                                                </Link>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export function AnalyticsRecordingDetail() {
    document.title = "Recording | Site Analytics";

    const { handle, recordingId } = useParams();
    const [globalDomain, setGlobalDomain] = useContext(DomainContext);
    useSyncDomainFromRoute(handle, setGlobalDomain);

    const domain = useMemo(() => {
        if (isCombinedOrClearDomain(globalDomain)) return null;
        return String(globalDomain || "").trim().toLowerCase();
    }, [globalDomain]);

    const [data,    setData]    = useState(null);
    const [loading, setLoading] = useState(false);
    const [error,   setError]   = useState(null);

    useEffect(() => {
        if (!domain || !recordingId) return;
        setLoading(true);
        setError(null);
        const qs = new URLSearchParams({ domain, id: recordingId }).toString();
        fetch(`${RECORDINGS_URL}?${qs}`, { headers: authHeaders() })
            .then(async r => {
                if (!r.ok) throw new Error(r.status);
                setData(await r.json());
            })
            .catch(() => setError("Could not load this recording."))
            .finally(() => setLoading(false));
    }, [domain, recordingId]);

    return (
        <div style={{ flex: "1", minWidth: 0 }}>
            <StickyPageTitle title="Recording" />
            <div className="dashboard-content">
                <div className="sa-page">
                    <Link to={analyticsRecordingsPath(globalDomain)}>&larr; Back to recordings</Link>
                    {loading && <p className="sa-notice">Loading recording&hellip;</p>}
                    {error && <p className="sa-notice sa-notice--error">{error}</p>}
                    {data && !loading && (
                        <div className="sa-panel" style={{ marginTop: 12 }}>
                            <RecordingPlayer events={data.events} />
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
