// The Home KPIs: how each is totalled, plotted per day and formatted.
// Shared by the Home tiles and each metric's detail screen.
import { STATISTICS_CONSENT } from "../../../../src/Functions/consentMetrics.js";
import { formatNumber, formatPercent } from "./format.js";

export const METRICS = {
    users: {
        label: "Active users",
        about: "Visitors with statistics consent who engaged: stayed 10 seconds or more, clicked, or viewed 2+ pages.",
        total: (t) => t.engagedUsers,
        daily: (d) => d.engaged || 0,
        format: (n) => formatNumber(n),
    },
    events: {
        label: "Total events",
        about: "Every page view and tracked event — with or without consent. Visitors without consent are counted anonymously.",
        total: (t) => t.total,
        daily: (d) => (d.minimal || 0) + (d.full || 0),
        format: (n) => formatNumber(n),
    },
    sessions: {
        label: "Unique sessions",
        about: "Visits by people with statistics consent — only they have a session.",
        total: (t) => t.uniqueSessions,
        daily: (d) => d.uniqueSessions || 0,
        format: (n) => formatNumber(n),
    },
    consent: {
        label: STATISTICS_CONSENT.label,
        about: STATISTICS_CONSENT.hint,
        rate: true,
        total: (t) => t.consentRate,
        base: (t) => t.total,
        daily: (d) => { const all = (d.minimal || 0) + (d.full || 0); return all > 0 ? ((d.full || 0) / all) * 100 : 0; },
        format: (n) => formatPercent(n),
        max: 100,
    },
};

export const METRIC_ORDER = ["users", "events", "sessions", "consent"];
