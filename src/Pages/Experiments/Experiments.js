import Authentication from "../../Authentication/Auth";
import StickyPageTitle from "../../Components/Header/Sticky";
import API from "../../API/api";
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from "chart.js";
import { Doughnut } from "react-chartjs-2";
import experimentsIcon from "../../Components/Header/icons/experiment.svg";
import ExperimentBuilder from "./ExperimentBuilder.js";
import { getChannelById } from "./marketingChannels.js";
import { DomainContext } from "../../App.js";

import "./Experiments.css";

const { useState, useEffect, useMemo, useContext } = React;

/*
 * Sentinel id used for rows that carry no `channel` field — i.e.
 * experiments that aren't audience-targeted (the snippet has no
 * `experiment.channel` property and is shown to every visitor). Keeping
 * a sentinel rather than null lets the filter bar treat untargeted
 * variants as a first-class bucket the user can pivot to.
 */
const UNTARGETED_CHANNEL_ID = "__untargeted__";

function prettifyChannelId(id) {
    if (!id) return "";
    return String(id)
        .replace(/[_-]+/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase())
        .trim();
}

/*
 * Resolve whatever the API hands us in `row.channel` into a stable
 * { id, label } pair the UI can render. The API may shape it as:
 *   - a string id      ("google_ads")
 *   - a string label   ("Google Ads")
 *   - the full object  ({ id: "google_ads", label: "Google Ads", match: …})
 *   - omitted entirely (untargeted experiment)
 *
 * For known IDs we prefer the registered label from `KNOWN_CHANNELS`
 * over whatever the API returned, so "google_ads" displays as
 * "Google Ads" without each callsite having to know the mapping.
 */
function getChannelInfo(row) {
    const ch = row && row.channel;
    if (ch == null || ch === "") {
        return { id: UNTARGETED_CHANNEL_ID, label: "Untargeted (all visitors)" };
    }
    if (typeof ch === "string") {
        const known = getChannelById(ch);
        if (known) return { id: known.id, label: known.label };
        return { id: ch, label: prettifyChannelId(ch) || ch };
    }
    if (typeof ch === "object") {
        const id = ch.id || ch.channelId || "";
        const known = id ? getChannelById(id) : null;
        const label =
            ch.label ||
            (known ? known.label : null) ||
            prettifyChannelId(id) ||
            id ||
            "Untargeted (all visitors)";
        return {
            id: id || UNTARGETED_CHANNEL_ID,
            label,
        };
    }
    return { id: UNTARGETED_CHANNEL_ID, label: "Untargeted (all visitors)" };
}
const useParams = window.ReactRouterDOM.useParams;
const useHistory = window.ReactRouterDOM.useHistory;

/*
 * Pull a stable experiment id off a row regardless of casing. The
 * backend currently emits `experimentid` (one word) but we accept the
 * snake_case and camelCase spellings too so the page doesn't silently
 * drop rows if the field name is later normalised.
 */
function getRowExperimentId(row) {
    if (!row) return null;
    return (
        row.experimentid ||
        row.experiment_id ||
        row.experimentID ||
        row.experimentName ||
        null
    );
}

ChartJS.register(ArcElement, Tooltip, Legend);

const CONVERSION_COLORS = {
    accepted: "rgba(76, 175, 80, 0.9)",
    rejected: "rgba(244, 67, 54, 0.9)",
    undecided: "rgba(158, 158, 158, 0.9)",
};

function buildConversionChartData(row) {
    const u = row.unique_user_conversion_performance || {};
    const accepted = u.users_final_accepted ?? 0;
    const rejected = u.users_final_rejected ?? 0;
    const undecided = u.undecided_users ?? 0;
    const total = accepted + rejected + undecided;
    if (total === 0) {
        return { labels: ["No data"], datasets: [{ data: [1], backgroundColor: ["rgba(128,128,128,0.3)"], borderWidth: 0 }] };
    }
    return {
        labels: ["Accepted", "Rejected", "Undecided"],
        datasets: [{
            data: [accepted, rejected, undecided],
            backgroundColor: [CONVERSION_COLORS.accepted, CONVERSION_COLORS.rejected, CONVERSION_COLORS.undecided],
            borderColor: ["rgba(255,255,255,0.2)"],
            borderWidth: 1,
        }],
    };
}

function buildDecisionChangeChartData(row) {
    const d = row.decision_event_behavior_dynamics || {};
    const total = d.decision_events_total ?? 0;
    const changes = d.decision_changes ?? 0;
    const unchanged = Math.max(0, total - changes);
    if (total === 0) {
        return { labels: ["No data"], datasets: [{ data: [1], backgroundColor: ["rgba(128,128,128,0.3)"], borderWidth: 0 }] };
    }
    return {
        labels: ["Changed mind", "No change"],
        datasets: [{
            data: [changes, unchanged],
            backgroundColor: ["rgba(255, 152, 0, 0.9)", "rgba(96, 125, 139, 0.7)"],
            borderColor: ["rgba(255,255,255,0.2)"],
            borderWidth: 1,
        }],
    };
}

const chartOptions = {
    responsive: true,
    maintainAspectRatio: true,
    plugins: {
        legend: { display: false },
        tooltip: {
            backgroundColor: "rgba(22, 22, 26, 0.96)",
            titleColor: "#ececec",
            bodyColor: "#c4c4c4",
            borderColor: "rgba(192, 159, 83, 0.35)",
            borderWidth: 1,
            padding: 10,
            cornerRadius: 8,
            callbacks: {
                label: (ctx) => {
                    const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
                    const pct = total ? Math.round((ctx.raw / total) * 100) : 0;
                    return `${ctx.label}: ${ctx.raw} (${pct}%)`;
                },
            },
        },
    },
    cutout: "62%",
};

function formatPct(n) {
    if (n == null || Number.isNaN(n)) return "—";
    return Math.round(Number(n)) + "%";
}
function formatMs(ms) {
    if (ms == null || Number.isNaN(ms)) return "—";
    return Math.round(Number(ms)) + " ms";
}

function formatInt(n) {
    if (n == null || Number.isNaN(n)) return "—";
    return Math.round(Number(n)).toLocaleString("de-DE");
}

function formatSignedPp(pp, digits = 1) {
    if (pp == null || Number.isNaN(pp)) return "—";
    const sign = pp > 0 ? "+" : "";
    return `${sign}${pp.toFixed(digits)} pp`;
}

/*
 * Helpers to pull the headline counts off a row regardless of whether
 * the API already filled in a percentage or only the raw counts. We
 * recompute the rate from counts when both are present so a control's
 * 1/2 = 50% never disagrees with whatever rounding the backend used.
 */
function getUsersAssigned(row) {
    return Number(row?.unique_user_conversion_performance?.users_assigned ?? 0);
}
function getUsersAccepted(row) {
    return Number(row?.unique_user_conversion_performance?.users_final_accepted ?? 0);
}
function getUsersRejected(row) {
    return Number(row?.unique_user_conversion_performance?.users_final_rejected ?? 0);
}
function getAcceptRate(row) {
    const n = getUsersAssigned(row);
    if (!n) return null;
    return getUsersAccepted(row) / n;
}
function getDecisionEventsTotal(row) {
    return Number(row?.decision_event_behavior_dynamics?.decision_events_total ?? 0);
}
function getChangeRate(row) {
    const v = row?.decision_event_behavior_dynamics?.change_rate_pct;
    return v == null ? null : Number(v) / 100;
}

/*
 * Abramowitz & Stegun 26.2.17 approximation of the standard normal
 * CDF. Accuracy ~7.5e-8 — far better than we need for confidence
 * surfacing, and avoids pulling in a stats library.
 */
function normalCdf(z) {
    const sign = z < 0 ? -1 : 1;
    const x = Math.abs(z) / Math.SQRT2;
    const t = 1 / (1 + 0.3275911 * x);
    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;
    const erf =
        1 -
        ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
    return 0.5 * (1 + sign * erf);
}

/*
 * Two-proportion z-test. We pool the variance under H0 (rates equal),
 * which is the standard test marketers will see in tools like Optimizely
 * or VWO. A negative z just flips the lift sign — confidence is
 * always reported as |1 − pValue|.
 */
function twoProportionZ({ x1, n1, x2, n2 }) {
    if (!n1 || !n2) return null;
    const p1 = x1 / n1;
    const p2 = x2 / n2;
    const pooled = (x1 + x2) / (n1 + n2);
    const se = Math.sqrt(pooled * (1 - pooled) * (1 / n1 + 1 / n2));
    if (!se) return null;
    const z = (p2 - p1) / se;
    const pValue = 2 * (1 - normalCdf(Math.abs(z)));
    return {
        z,
        pValue,
        liftPp: (p2 - p1) * 100,
        confidencePct: Math.max(0, Math.min(100, (1 - pValue) * 100)),
    };
}

/*
 * Map confidence into a UI status. Thresholds mirror what most A/B
 * tools surface: 95% = trustworthy result, 80–95% = directional, < 80%
 * = noise. We only flag "winning" / "losing" once we cross 90%, so
 * marketers don't ship variants on the basis of a coin flip.
 */
function classifySignificance(stat) {
    if (!stat) return { label: "Need control sample", tone: "neutral" };
    const c = stat.confidencePct;
    if (c >= 95) {
        return {
            label: `${Math.round(c)}% confident · ${stat.liftPp >= 0 ? "winning" : "losing"}`,
            tone: stat.liftPp >= 0 ? "win" : "loss",
        };
    }
    if (c >= 90) {
        return {
            label: `${Math.round(c)}% confident · directional`,
            tone: "warn",
        };
    }
    if (c >= 80) {
        return { label: `${Math.round(c)}% confident · weak signal`, tone: "soft" };
    }
    return { label: "Not yet significant · need more samples", tone: "neutral" };
}

/*
 * Pick the control row from a list of variants. We prefer an explicit
 * "control" name (case-insensitive) because that's the convention the
 * builder steers users toward. When no variant is named control we
 * fall back to the first row in the API response — backends usually
 * order by users_assigned or by the order variants were created, both
 * of which keep the original/control variant first in practice.
 */
function findControlRow(rows) {
    if (!rows || rows.length === 0) return null;
    const named = rows.find(
        (r) => String(r.experiment_variant || "").toLowerCase().trim() === "control"
    );
    return named || rows[0];
}

export default function Experiments() {
    document.title = "A/B Testing | Intastellar Consents";
    const { experimentId: urlExperimentId } = useParams();
    const history = useHistory();
    /*
     * Read the global domain from context — the header's domain
     * dropdown writes here, so reusing the context keeps the page in
     * sync with whatever the user picked elsewhere. Falls back to
     * "combined view" (the same default the rest of the app uses) when
     * the provider is missing during an isolated render.
     */
    const domainCtx = useContext(DomainContext);
    const currentDomain = (domainCtx && domainCtx[0]) || "combined view";
    const [activeData, setActiveData] = useState(null);
    const [listData, setListData] = useState(null);
    const today = new Date();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const isListView = !urlExperimentId;
    const effectiveExperimentId = urlExperimentId || null;

    /*
     * Marketing-suggestions deep links land here with ?new=1 and an
     * optional scope= or hypothesis= prefill. Read the params once on
     * mount; subsequent open/close is driven by component state so we
     * don't have to keep the URL and the UI in sync.
     */
    const initialBuilderHints = useState(() => {
        if (typeof window === "undefined") {
            return { open: false, scope: "", hypothesis: "" };
        }
        const params = new URLSearchParams(window.location.search);
        return {
            open: params.get("new") === "1",
            scope: params.get("scope") || "",
            hypothesis: params.get("hypothesis") || "",
        };
    })[0];
    const [showBuilder, setShowBuilder] = useState(initialBuilderHints.open);

    API.experiments.getExperiments.headers.Organisation = Authentication.getOrganisation();
    API.experiments.getExperiments.headers.FromDate = today.toISOString();
    API.experiments.getExperiments.headers.ToDate = today.toISOString();

    /*
     * Detail view fetch — single experiment scoped to the current
     * domain. Cleared whenever we switch back to the list view so
     * stale variants from a previous experiment don't briefly flash
     * before the list-view fetch resolves.
     */
    useEffect(() => {
        if (isListView || !effectiveExperimentId) {
            setActiveData(null);
            return;
        }
        setLoading(true);
        setError(null);
        const headers = { ...API.experiments.getExperiments.headers };
        headers.Organisation = Authentication.getOrganisation();
        headers.Domains = currentDomain || "combined view";
        headers.ExperimentID = effectiveExperimentId;
        fetch(API.experiments.getExperiments.url, {
            method: API.experiments.getExperiments.method,
            headers,
        }).then((response) => response.json()).then((data) => {
            setActiveData(
                Array.isArray(data) ? data : data?.experiments ?? data?.variants ?? []
            );
        }).catch((err) => {
            setError(err);
        }).finally(() => {
            setLoading(false);
        });
    }, [currentDomain, effectiveExperimentId, isListView]);

    /*
     * List view fetch — two-phase, matching the backend contract:
     *
     *   1. With no `ExperimentID` header the endpoint returns a flat
     *      array of experiment-id strings, e.g. ["asa-banner-design",
     *      "banner-test"]. When there are no experiments it returns
     *      `{"error": "No data found"}` — we treat that as empty.
     *
     *   2. To populate the summary cards we then issue one detail
     *      fetch per id, in parallel, and merge the variant rows.
     *      The detail rows carry `experiment_variant` and metrics but
     *      *not* an `experimentid` field, so we inject it client-side
     *      so the grouping memo below has something to key on.
     *
     * We also synthesise a placeholder row for any id whose detail
     * call returns nothing, so the user still sees the experiment in
     * the list (with zeroed metrics) instead of it silently vanishing.
     *
     * `cancelled` guards against the user switching domains mid-load
     * — without it, a stale resolution would clobber the new domain's
     * data.
     */
    useEffect(() => {
        if (!isListView) {
            setListData(null);
            return undefined;
        }
        let cancelled = false;
        setLoading(true);
        setError(null);

        const buildBaseHeaders = () => {
            const h = { ...API.experiments.getExperiments.headers };
            h.Organisation = Authentication.getOrganisation();
            h.FromDate = today.toISOString();
            h.ToDate = today.toISOString();
            h.Domains = currentDomain || "combined view";
            return h;
        };

        (async () => {
            try {
                const idsHeaders = buildBaseHeaders();
                delete idsHeaders.ExperimentID;
                const idsResp = await fetch(API.experiments.getExperiments.url, {
                    method: API.experiments.getExperiments.method,
                    headers: idsHeaders,
                });
                const idsJson = await idsResp.json();
                if (cancelled) return;

                const ids = Array.isArray(idsJson)
                    ? idsJson.filter((x) => typeof x === "string" && x.length > 0)
                    : [];

                if (ids.length === 0) {
                    setListData([]);
                    return;
                }

                const detailGroups = await Promise.all(
                    ids.map(async (id) => {
                        try {
                            const detailHeaders = buildBaseHeaders();
                            detailHeaders.ExperimentID = id;
                            const resp = await fetch(API.experiments.getExperiments.url, {
                                method: API.experiments.getExperiments.method,
                                headers: detailHeaders,
                            });
                            const json = await resp.json();
                            const rows = Array.isArray(json) ? json : [];
                            return rows.map((row) => ({ ...row, experimentid: id }));
                        } catch {
                            return [];
                        }
                    })
                );
                if (cancelled) return;

                const flat = detailGroups.flat();
                const seen = new Set(flat.map((r) => r.experimentid));
                for (const id of ids) {
                    if (!seen.has(id)) flat.push({ experimentid: id });
                }
                setListData(flat);
            } catch (err) {
                if (!cancelled) setError(err);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [currentDomain, isListView]);

    const experiments = activeData ?? [];

    /*
     * Channel filter state. We compute it from the loaded rows rather
     * than hardcoding the known list because (a) experiments can target
     * a custom channel the platform doesn't know about, and (b) we want
     * to surface a count next to each chip so the marketer can see at a
     * glance which audience contributed how many variants.
     */
    const [channelFilter, setChannelFilter] = useState("__all__");

    const channelInfoByRow = useMemo(
        () => experiments.map(getChannelInfo),
        [experiments]
    );

    /*
     * `Map` preserves insertion order, so the filter chip order matches
     * the order channels first appear in the API response — typically
     * largest-first if the backend orders by users_assigned, which is
     * also the order users want to see chips in.
     */
    const distinctChannels = useMemo(() => {
        const map = new Map();
        for (const info of channelInfoByRow) {
            if (!map.has(info.id)) {
                map.set(info.id, { id: info.id, label: info.label, count: 0 });
            }
            map.get(info.id).count += 1;
        }
        return Array.from(map.values());
    }, [channelInfoByRow]);

    const filteredExperiments = useMemo(() => {
        if (channelFilter === "__all__") return experiments;
        return experiments.filter(
            (_row, i) => channelInfoByRow[i].id === channelFilter
        );
    }, [experiments, channelInfoByRow, channelFilter]);

    /*
     * Show the filter bar whenever at least one row carries a real
     * channel — even a single-audience experiment benefits from the bar
     * acting as an "Audience: Google Ads" context indicator next to its
     * variant cards. We only hide the bar when every row is untargeted,
     * because in that case it would just say "All / Untargeted" and
     * waste vertical space.
     */
    const hasAnyTargetedChannel = useMemo(
        () => distinctChannels.some((c) => c.id !== UNTARGETED_CHANNEL_ID),
        [distinctChannels]
    );

    /*
     * Reset the filter whenever the underlying dataset changes — a
     * stale "Google Ads" selection on a freshly-loaded experiment that
     * targets a different audience would render an empty grid with no
     * obvious cause.
     */
    useEffect(() => {
        setChannelFilter("__all__");
    }, [effectiveExperimentId, currentDomain]);

    /*
     * Sort + view-mode controls. Default to the API order so winning-
     * variant placement mirrors whatever the backend chose, but let the
     * user pivot to performance-based sorting once they want to compare
     * directly. We persist neither — these are ephemeral UI prefs
     * tied to the current breakdown only.
     */
    const [sortKey, setSortKey] = useState("default");
    const [viewMode, setViewMode] = useState("grid");
    useEffect(() => {
        setSortKey("default");
    }, [effectiveExperimentId, currentDomain]);

    /*
     * The control row is computed from the unfiltered set so it stays
     * stable when the user filters by audience — comparing a variant
     * against a phantom control that disappeared from view would be
     * confusing.
     */
    const controlRow = useMemo(() => findControlRow(experiments), [experiments]);

    /*
     * Per-row significance vs control. Pre-computing once here means
     * the card render and the compact table read the same numbers,
     * and the sort-by-lift comparator stays cheap.
     */
    const significanceByVariant = useMemo(() => {
        const map = new Map();
        if (!controlRow) return map;
        const x1 = getUsersAccepted(controlRow);
        const n1 = getUsersAssigned(controlRow);
        for (const row of experiments) {
            if (row === controlRow) {
                map.set(row.experiment_variant, { isControl: true });
                continue;
            }
            const stat = twoProportionZ({
                x1,
                n1,
                x2: getUsersAccepted(row),
                n2: getUsersAssigned(row),
            });
            map.set(row.experiment_variant, {
                isControl: false,
                stat,
                classification: classifySignificance(stat),
            });
        }
        return map;
    }, [experiments, controlRow]);

    /*
     * Headline summary across the unfiltered set. Filtering changes
     * which cards show; it shouldn't shrink the headline numbers, since
     * "this experiment has 12,400 users" is a fact about the whole
     * experiment, not the current chip selection.
     */
    const summary = useMemo(() => {
        if (!experiments.length) return null;
        let totalUsers = 0;
        let totalDecisions = 0;
        let totalAccepts = 0;
        let leader = null;
        let leaderRate = -1;
        let runnerUpRate = -1;
        for (const row of experiments) {
            const n = getUsersAssigned(row);
            const a = getUsersAccepted(row);
            const rate = n ? a / n : 0;
            totalUsers += n;
            totalAccepts += a;
            totalDecisions += getDecisionEventsTotal(row);
            if (n > 0 && rate > leaderRate) {
                runnerUpRate = leaderRate;
                leaderRate = rate;
                leader = row;
            } else if (n > 0 && rate > runnerUpRate) {
                runnerUpRate = rate;
            }
        }
        const overallAcceptRate = totalUsers ? totalAccepts / totalUsers : null;
        const leaderStat = leader && controlRow && leader !== controlRow
            ? significanceByVariant.get(leader.experiment_variant)?.stat
            : null;
        return {
            totalUsers,
            totalDecisions,
            totalAccepts,
            overallAcceptRate,
            leaderName: leader?.experiment_variant ?? null,
            leaderRate: leaderRate >= 0 ? leaderRate : null,
            liftOverRunnerUp:
                leaderRate >= 0 && runnerUpRate >= 0
                    ? (leaderRate - runnerUpRate) * 100
                    : null,
            leaderConfidence: leaderStat ? leaderStat.confidencePct : null,
            controlName: controlRow?.experiment_variant ?? null,
        };
    }, [experiments, controlRow, significanceByVariant]);

    const sortedExperiments = useMemo(() => {
        if (sortKey === "default") return filteredExperiments;
        const arr = [...filteredExperiments];
        const cmp = {
            accept: (a, b) => (getAcceptRate(b) ?? -1) - (getAcceptRate(a) ?? -1),
            users: (a, b) => getUsersAssigned(b) - getUsersAssigned(a),
            change: (a, b) => (getChangeRate(b) ?? -1) - (getChangeRate(a) ?? -1),
            lift: (a, b) => {
                const la = significanceByVariant.get(a.experiment_variant)?.stat?.liftPp ?? -Infinity;
                const lb = significanceByVariant.get(b.experiment_variant)?.stat?.liftPp ?? -Infinity;
                return lb - la;
            },
        }[sortKey];
        return cmp ? arr.sort(cmp) : arr;
    }, [filteredExperiments, sortKey, significanceByVariant]);

    /*
     * List-view derivation: collapse the flat array of variant rows
     * into one summary entry per experiment. We compute lightweight
     * top-line metrics here so the list cards can show the leader
     * variant + audience + total users without a second round-trip.
     * Rows missing an `experimentid` field are dropped — they
     * shouldn't happen, but guarding keeps the page from crashing if
     * the backend ever emits a malformed row.
     */
    const listExperiments = useMemo(() => {
        if (!isListView || !listData) return [];
        const map = new Map();
        for (const row of listData) {
            const id = getRowExperimentId(row);
            if (!id) continue;
            if (!map.has(id)) {
                map.set(id, {
                    id,
                    rows: [],
                    channelInfo: getChannelInfo(row),
                    domain: row.domain || null,
                });
            }
            map.get(id).rows.push(row);
        }
        return Array.from(map.values()).map((entry) => {
            let totalUsers = 0;
            let totalAccepts = 0;
            let leader = null;
            let leaderRate = -1;
            const channelIds = new Set();
            for (const r of entry.rows) {
                const n = getUsersAssigned(r);
                const a = getUsersAccepted(r);
                const rate = n ? a / n : 0;
                totalUsers += n;
                totalAccepts += a;
                if (n > 0 && rate > leaderRate) {
                    leaderRate = rate;
                    leader = r;
                }
                channelIds.add(getChannelInfo(r).id);
            }
            return {
                ...entry,
                variantCount: entry.rows.length,
                totalUsers,
                overallAcceptRate: totalUsers ? totalAccepts / totalUsers : null,
                leaderName: leader?.experiment_variant ?? null,
                leaderRate: leaderRate >= 0 ? leaderRate : null,
                /*
                 * If every variant in the experiment shares the same
                 * channel we can show a single audience badge; mixed
                 * audiences fall back to an "Mixed" hint instead.
                 */
                hasMixedAudience: channelIds.size > 1,
            };
        });
    }, [isListView, listData]);

    return <>
        <StickyPageTitle>
            <h1 className="experiments-page__title">
                <img
                    src={experimentsIcon}
                    alt=""
                    className="experiments-page__title-icon"
                    width={24}
                    height={24}
                />
                <span>
                    A/B Testing · {isListView ? "All experiments" : effectiveExperimentId}
                </span>
            </h1>
            {!isListView && (
                <button type="button" className="experiments-back" onClick={() => history.push("/experiments")}>
                    ← All experiments
                </button>
            )}
        </StickyPageTitle>
        <div className="dashboard-content experiments-page">
            {isListView ? (
                <div className="experiments-list">
                    <div className="experiments-list-actions">
                        <div className="experiments-list-intro-block">
                            <p className="experiments-list-intro">
                                {currentDomain && currentDomain !== "combined view"
                                    ? `Experiments running on ${currentDomain}.`
                                    : "Experiments across all your domains. Pick a domain in the header to scope this list."}
                            </p>
                            {currentDomain && currentDomain !== "combined view" ? (
                                <span className="experiments-list-domain-pill">
                                    Domain · {currentDomain}
                                </span>
                            ) : null}
                        </div>
                        <button
                            type="button"
                            className="experiments-create-toggle"
                            onClick={() => setShowBuilder((prev) => !prev)}
                            aria-expanded={showBuilder}
                            aria-controls="experiment-builder-panel"
                        >
                            {showBuilder ? "Close builder" : "+ Create experiment"}
                        </button>
                    </div>
                    {showBuilder ? (
                        <div id="experiment-builder-panel">
                            <ExperimentBuilder
                                initialScopeHint={initialBuilderHints.scope}
                                initialHypothesisHint={initialBuilderHints.hypothesis}
                                onClose={() => setShowBuilder(false)}
                            />
                        </div>
                    ) : null}

                    {loading && (
                        <p className="experiments-loading">Loading experiments…</p>
                    )}
                    {error && (
                        <p className="experiments-error">Failed to load experiments.</p>
                    )}
                    {!loading && !error && listExperiments.length === 0 ? (
                        <div className="experiments-list-empty">
                            <p className="experiments-list-empty__title">
                                No experiments yet
                                {currentDomain && currentDomain !== "combined view"
                                    ? ` for ${currentDomain}`
                                    : ""}
                                .
                            </p>
                            <p className="experiments-list-empty__sub">
                                Use <strong>+ Create experiment</strong> above to define one,
                                paste the snippet into your site's <code>window.INTA</code>
                                , and the dashboard will populate as visitors see it.
                            </p>
                        </div>
                    ) : null}

                    {!loading && !error && listExperiments.length > 0 ? (
                        <ul className="experiments-list-grid" role="list">
                            {listExperiments.map((exp) => (
                                <li key={exp.id} className="experiments-list-card-wrap">
                                    <a
                                        href={`/experiments/${exp.id}`}
                                        className="experiments-list-card"
                                        onClick={(e) => {
                                            e.preventDefault();
                                            history.push(`/experiments/${exp.id}`);
                                        }}
                                    >
                                        <div className="experiments-list-card__header">
                                            <h3 className="experiments-list-card__title">
                                                {exp.id}
                                            </h3>
                                            <div className="experiments-list-card__chips">
                                                {exp.hasMixedAudience ? (
                                                    <span className="experiments-list-card__chip experiments-list-card__chip--mixed">
                                                        Mixed audiences
                                                    </span>
                                                ) : exp.channelInfo.id !== UNTARGETED_CHANNEL_ID ? (
                                                    <span className="experiments-list-card__chip experiments-list-card__chip--channel">
                                                        {exp.channelInfo.label}
                                                    </span>
                                                ) : (
                                                    <span className="experiments-list-card__chip experiments-list-card__chip--untargeted">
                                                        Untargeted
                                                    </span>
                                                )}
                                                {exp.domain ? (
                                                    <span className="experiments-list-card__chip experiments-list-card__chip--domain">
                                                        {exp.domain}
                                                    </span>
                                                ) : null}
                                            </div>
                                        </div>
                                        <dl className="experiments-list-card__metrics">
                                            <div>
                                                <dt>Variants</dt>
                                                <dd>{exp.variantCount}</dd>
                                            </div>
                                            <div>
                                                <dt>Users</dt>
                                                <dd>{formatInt(exp.totalUsers)}</dd>
                                            </div>
                                            <div>
                                                <dt>Accept rate</dt>
                                                <dd>
                                                    {exp.overallAcceptRate != null
                                                        ? `${(exp.overallAcceptRate * 100).toFixed(1)}%`
                                                        : "—"}
                                                </dd>
                                            </div>
                                            <div>
                                                <dt>Leader</dt>
                                                <dd>
                                                    {exp.leaderName ? (
                                                        <span className="experiments-list-card__leader">
                                                            {exp.leaderName}
                                                            {exp.leaderRate != null ? (
                                                                <span className="experiments-list-card__leader-rate">
                                                                    {(exp.leaderRate * 100).toFixed(1)}%
                                                                </span>
                                                            ) : null}
                                                        </span>
                                                    ) : (
                                                        "—"
                                                    )}
                                                </dd>
                                            </div>
                                        </dl>
                                        <span className="experiments-list-card__cta" aria-hidden="true">
                                            View breakdown →
                                        </span>
                                    </a>
                                </li>
                            ))}
                        </ul>
                    ) : null}
                </div>
            ) : (
            <>
            {loading && <p className="experiments-loading">Loading experiment data…</p>}
            {error && <p className="experiments-error">Failed to load experiments.</p>}
            {!loading && !error && experiments.length === 0 && (
                <p className="experiments-empty">Currently no experiments are running or no data is available for this domain.</p>
            )}
            {!loading && experiments.length > 0 && hasAnyTargetedChannel ? (
                <div className="experiments-filter-bar">
                    <span className="experiments-filter-bar__label">Audience</span>
                    <div
                        className="experiments-filter-bar__chips"
                        role="group"
                        aria-label="Filter variants by audience channel"
                    >
                        <button
                            type="button"
                            className={`experiments-filter-chip${channelFilter === "__all__" ? " is-active" : ""}`}
                            onClick={() => setChannelFilter("__all__")}
                            aria-pressed={channelFilter === "__all__"}
                        >
                            All
                            <span className="experiments-filter-chip__count">
                                {experiments.length}
                            </span>
                        </button>
                        {distinctChannels.map((c) => (
                            <button
                                type="button"
                                key={c.id}
                                className={`experiments-filter-chip${channelFilter === c.id ? " is-active" : ""}${c.id === UNTARGETED_CHANNEL_ID ? " experiments-filter-chip--untargeted" : ""}`}
                                onClick={() => setChannelFilter(c.id)}
                                aria-pressed={channelFilter === c.id}
                            >
                                {c.id === UNTARGETED_CHANNEL_ID ? "Untargeted" : c.label}
                                <span className="experiments-filter-chip__count">
                                    {c.count}
                                </span>
                            </button>
                        ))}
                    </div>
                </div>
            ) : null}

            {!loading && experiments.length > 0 && summary ? (
                <section
                    className="experiment-summary"
                    aria-label="Experiment summary"
                >
                    <div className="experiment-summary__cell">
                        <span className="experiment-summary__label">Users assigned</span>
                        <span className="experiment-summary__value">
                            {formatInt(summary.totalUsers)}
                        </span>
                        <span className="experiment-summary__sub">
                            across {experiments.length} variant
                            {experiments.length === 1 ? "" : "s"}
                        </span>
                    </div>
                    <div className="experiment-summary__cell">
                        <span className="experiment-summary__label">Overall accept rate</span>
                        <span className="experiment-summary__value">
                            {summary.overallAcceptRate != null
                                ? `${(summary.overallAcceptRate * 100).toFixed(1)}%`
                                : "—"}
                        </span>
                        <span className="experiment-summary__sub">
                            {formatInt(summary.totalAccepts)} accepts
                        </span>
                    </div>
                    <div className="experiment-summary__cell">
                        <span className="experiment-summary__label">Decision events</span>
                        <span className="experiment-summary__value">
                            {formatInt(summary.totalDecisions)}
                        </span>
                        <span className="experiment-summary__sub">
                            recorded across all variants
                        </span>
                    </div>
                    <div className="experiment-summary__cell experiment-summary__cell--leader">
                        <span className="experiment-summary__label">Leading variant</span>
                        {summary.leaderName ? (
                            <>
                                <span className="experiment-summary__value experiment-summary__value--leader">
                                    {summary.leaderName}
                                </span>
                                <span className="experiment-summary__sub">
                                    {summary.leaderRate != null
                                        ? `${(summary.leaderRate * 100).toFixed(1)}% accept`
                                        : ""}
                                    {summary.liftOverRunnerUp != null
                                        ? ` · ${formatSignedPp(summary.liftOverRunnerUp)} vs runner-up`
                                        : ""}
                                </span>
                                {summary.leaderConfidence != null ? (
                                    <span
                                        className={`experiment-summary__confidence experiment-summary__confidence--${
                                            summary.leaderConfidence >= 95
                                                ? "high"
                                                : summary.leaderConfidence >= 90
                                                ? "mid"
                                                : "low"
                                        }`}
                                    >
                                        {summary.leaderConfidence >= 95
                                            ? `${Math.round(summary.leaderConfidence)}% confident vs ${summary.controlName}`
                                            : summary.leaderConfidence >= 90
                                            ? `${Math.round(summary.leaderConfidence)}% confident · directional`
                                            : `Need more samples for confidence`}
                                    </span>
                                ) : null}
                            </>
                        ) : (
                            <span className="experiment-summary__value">—</span>
                        )}
                    </div>
                </section>
            ) : null}

            {!loading && filteredExperiments.length > 1 ? (
                <div className="experiments-toolbar" role="group" aria-label="Experiment view controls">
                    <label className="experiments-toolbar__field">
                        <span className="experiments-toolbar__label">Sort</span>
                        <select
                            className="experiments-toolbar__select"
                            value={sortKey}
                            onChange={(e) => setSortKey(e.target.value)}
                        >
                            <option value="default">Default order</option>
                            <option value="accept">Accept rate (high → low)</option>
                            <option value="lift">Lift vs control</option>
                            <option value="users">Sample size</option>
                            <option value="change">Decision change rate</option>
                        </select>
                    </label>
                    <div className="experiments-toolbar__view" role="group" aria-label="View mode">
                        <button
                            type="button"
                            className={`experiments-toolbar__view-btn${viewMode === "grid" ? " is-active" : ""}`}
                            onClick={() => setViewMode("grid")}
                            aria-pressed={viewMode === "grid"}
                        >
                            Grid
                        </button>
                        <button
                            type="button"
                            className={`experiments-toolbar__view-btn${viewMode === "compact" ? " is-active" : ""}`}
                            onClick={() => setViewMode("compact")}
                            aria-pressed={viewMode === "compact"}
                        >
                            Compact
                        </button>
                    </div>
                </div>
            ) : null}

            {!loading &&
            experiments.length > 0 &&
            filteredExperiments.length === 0 &&
            channelFilter !== "__all__" ? (
                <p className="experiments-empty">
                    No variants in this experiment target the selected audience. Pick
                    another chip above to widen the filter.
                </p>
            ) : null}

            {!loading && sortedExperiments.length > 0 && viewMode === "compact" && (
                <div className="experiments-compact" role="region" aria-label="Variant comparison table">
                    <table className="experiments-compact__table">
                        <thead>
                            <tr>
                                <th scope="col">Variant</th>
                                <th scope="col">Audience</th>
                                <th scope="col" className="experiments-compact__num">Users</th>
                                <th scope="col" className="experiments-compact__num">Accept</th>
                                <th scope="col" className="experiments-compact__num">Reject</th>
                                <th scope="col" className="experiments-compact__num">Accept rate</th>
                                <th scope="col" className="experiments-compact__num">Lift vs control</th>
                                <th scope="col">Significance</th>
                            </tr>
                        </thead>
                        <tbody>
                            {sortedExperiments.map((row, i) => {
                                const sig = significanceByVariant.get(row.experiment_variant);
                                const channelInfo = getChannelInfo(row);
                                const acceptRate = getAcceptRate(row);
                                const isWinning = row.experiment_variant === row.winning_variant;
                                return (
                                    <tr
                                        key={row.experiment_variant + i}
                                        className={`${isWinning ? "experiments-compact__row--winning" : ""}${sig?.isControl ? " experiments-compact__row--control" : ""}`}
                                    >
                                        <td>
                                            <span className="experiments-compact__variant-name">
                                                {row.experiment_variant}
                                            </span>
                                            {sig?.isControl ? (
                                                <span className="experiments-compact__tag">control</span>
                                            ) : null}
                                            {isWinning ? (
                                                <span className="experiments-compact__tag experiments-compact__tag--winning">leading</span>
                                            ) : null}
                                        </td>
                                        <td>
                                            {channelInfo.id === UNTARGETED_CHANNEL_ID
                                                ? "—"
                                                : channelInfo.label}
                                        </td>
                                        <td className="experiments-compact__num">{formatInt(getUsersAssigned(row))}</td>
                                        <td className="experiments-compact__num">{formatInt(getUsersAccepted(row))}</td>
                                        <td className="experiments-compact__num">{formatInt(getUsersRejected(row))}</td>
                                        <td className="experiments-compact__num">
                                            {acceptRate != null ? `${(acceptRate * 100).toFixed(1)}%` : "—"}
                                        </td>
                                        <td className="experiments-compact__num">
                                            {sig?.isControl
                                                ? "—"
                                                : sig?.stat
                                                ? formatSignedPp(sig.stat.liftPp)
                                                : "—"}
                                        </td>
                                        <td>
                                            {sig?.isControl ? (
                                                <span className="experiments-compact__sig experiments-compact__sig--control">
                                                    Reference
                                                </span>
                                            ) : sig?.classification ? (
                                                <span
                                                    className={`experiments-compact__sig experiments-compact__sig--${sig.classification.tone}`}
                                                >
                                                    {sig.classification.label}
                                                </span>
                                            ) : (
                                                <span className="experiments-compact__sig">—</span>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {!loading && sortedExperiments.length > 0 && viewMode === "grid" && (
                <div className="experiments-grid">
                    {sortedExperiments.map((row, i) => {
                        const isWinning = row.experiment_variant === row.winning_variant;
                        const channelInfo = getChannelInfo(row);
                        const sig = significanceByVariant.get(row.experiment_variant);
                        return (
                        <article
                            key={row.experiment_variant + i}
                            className={`experiment-card${isWinning ? " experiment-card--winning" : ""}`}
                        >
                            <header className="experiment-card__header">
                                <div className="experiment-card__title-row">
                                    <h2 className="experiment-card__variant">{row.experiment_variant}</h2>
                                    {sig?.isControl ? (
                                        <span className="experiment-card__control-badge">Control</span>
                                    ) : null}
                                    {isWinning ? (
                                        <span className="experiment-card__winning-badge">Leading variant</span>
                                    ) : null}
                                </div>
                                {!sig?.isControl && sig?.stat ? (
                                    <div className="experiment-card__lift-row" aria-label="Lift vs control">
                                        <span
                                            className={`experiment-card__lift experiment-card__lift--${
                                                sig.stat.liftPp > 0
                                                    ? "up"
                                                    : sig.stat.liftPp < 0
                                                    ? "down"
                                                    : "flat"
                                            }`}
                                        >
                                            {formatSignedPp(sig.stat.liftPp)} vs {summary?.controlName || "control"}
                                        </span>
                                        <span
                                            className={`experiment-card__confidence experiment-card__confidence--${sig.classification.tone}`}
                                        >
                                            {sig.classification.label}
                                        </span>
                                    </div>
                                ) : null}
                                <div className="experiment-card__meta" aria-label="Variant context">
                                    {channelInfo.id !== UNTARGETED_CHANNEL_ID ? (
                                        <span className="experiment-card__chip experiment-card__chip--channel">
                                            <span className="experiment-card__chip-key">Audience</span>
                                            {channelInfo.label}
                                        </span>
                                    ) : null}
                                    {row.design ? (
                                        <span className="experiment-card__chip experiment-card__chip--design">
                                            <span className="experiment-card__chip-key">Design</span>
                                            {row.design}
                                        </span>
                                    ) : null}
                                    {row.domain ? (
                                        <span className="experiment-card__chip experiment-card__chip--domain">
                                            <span className="experiment-card__chip-key">Domain</span>
                                            {row.domain}
                                        </span>
                                    ) : null}
                                    {row.text_override ? (
                                        <span className="experiment-card__chip experiment-card__chip--text-override">
                                            <span className="experiment-card__chip-key">Text override</span>
                                            {row.text_override}
                                        </span>
                                    ) : null}
                                </div>
                            </header>

                            <div className="experiment-card__charts" role="group" aria-label="Variant charts">
                                <div
                                    className="experiment-card__chart-panel"
                                    title="User outcome: Accepted / Rejected / Undecided"
                                >
                                    <div className="experiment-card__chart-inner">
                                        <Doughnut data={buildConversionChartData(row)} options={chartOptions} />
                                    </div>
                                    <span className="experiment-card__chart-caption">User outcome</span>
                                    <span className="experiment-card__chart-hint">Accepted · Rejected · Undecided</span>
                                </div>
                                <div
                                    className="experiment-card__chart-panel"
                                    title="Decision events: Changed mind vs No change"
                                >
                                    <div className="experiment-card__chart-inner">
                                        <Doughnut data={buildDecisionChangeChartData(row)} options={chartOptions} />
                                    </div>
                                    <span className="experiment-card__chart-caption">Decision change</span>
                                    <span className="experiment-card__chart-hint">Mind change vs stable</span>
                                </div>
                            </div>

                            <div className="experiment-card__metrics-grid">
                                <section className="experiment-card__section">
                                    <h3 className="experiment-card__section-title">Unique user conversion</h3>
                                    <ul className="experiment-card__metrics">
                                        <li><span className="metric-label">Users assigned</span> <span className="metric-value">{row.unique_user_conversion_performance?.users_assigned ?? "—"}</span></li>
                                        <li><span className="metric-label">Final accepted</span> <span className="metric-value">{row.unique_user_conversion_performance?.users_final_accepted ?? "—"}</span></li>
                                        <li><span className="metric-label">Final rejected</span> <span className="metric-value">{row.unique_user_conversion_performance?.users_final_rejected ?? "—"}</span></li>
                                        <li><span className="metric-label">Undecided</span> <span className="metric-value">{row.unique_user_conversion_performance?.undecided_users ?? "—"}</span></li>
                                        <li><span className="metric-label">Accept rate (user %)</span> <span className="metric-value">{formatPct(row.unique_user_conversion_performance?.accept_rate_user_pct)}</span></li>
                                        <li><span className="metric-label">Reject rate (user %)</span> <span className="metric-value">{formatPct(row.unique_user_conversion_performance?.reject_rate_user_pct)}</span></li>
                                    </ul>
                                </section>
                                <section className="experiment-card__section">
                                    <h3 className="experiment-card__section-title">Decision event behavior</h3>
                                    <ul className="experiment-card__metrics">
                                        <li><span className="metric-label">Decision events total</span> <span className="metric-value">{row.decision_event_behavior_dynamics?.decision_events_total ?? "—"}</span></li>
                                        <li><span className="metric-label">Decision changes</span> <span className="metric-value">{row.decision_event_behavior_dynamics?.decision_changes ?? "—"}</span></li>
                                        <li><span className="metric-label">Decision time (avg)</span> <span className="metric-value">{formatMs(row.decision_event_behavior_dynamics?.decision_time_avg_ms)}</span></li>
                                        <li><span className="metric-label">Change rate</span> <span className="metric-value">{formatPct(row.decision_event_behavior_dynamics?.change_rate_pct)}</span></li>
                                    </ul>
                                </section>
                            </div>
                        </article>
                    ); })}
                </div>
            )}
            </>
            )}
        </div>
    </>
}