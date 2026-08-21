// Predefined report templates — shown in the My Reports page and used to
// pre-populate the ReportBuilder when ?tpl=<key> is present in the URL.

export const REPORT_TEMPLATES = [
    {
        key: "traffic_overview",
        name: "Traffic Overview",
        description: "Daily sessions trend so you can spot spikes, dips, and seasonal patterns at a glance.",
        chartType: "line",
        metrics: ["sessions", "pageViews"],
        breakdown: "date",
        filters: [],
        dateRangeDays: 30,
        category: "Audience",
    },
    {
        key: "acquisition_channels",
        name: "Acquisition by Channel",
        description: "Sessions broken down by marketing channel — organic, paid, referral, direct, and more.",
        chartType: "bar",
        metrics: ["sessions"],
        breakdown: "channel",
        filters: [],
        dateRangeDays: 30,
        category: "Acquisition",
    },
    {
        key: "utm_performance",
        name: "UTM Source Performance",
        description: "Which UTM sources drive the most traffic. Essential for campaign attribution.",
        chartType: "table",
        metrics: ["sessions"],
        breakdown: "utmSource",
        filters: [],
        dateRangeDays: 30,
        category: "Acquisition",
    },
    {
        key: "device_breakdown",
        name: "Device Breakdown",
        description: "How your audience splits across desktop, mobile, and tablet.",
        chartType: "donut",
        metrics: ["sessions"],
        breakdown: "device",
        filters: [],
        dateRangeDays: 30,
        category: "Audience",
    },
    {
        key: "top_countries",
        name: "Top Countries",
        description: "Geographic breakdown of your traffic — useful for localisation and compliance decisions.",
        chartType: "bar",
        metrics: ["sessions"],
        breakdown: "country",
        filters: [],
        dateRangeDays: 30,
        category: "Audience",
    },
    {
        key: "conversion_trend",
        name: "Conversion Trend",
        description: "Tracks conversions and conversion rate over time. Pair with the acquisition reports to find what drives results.",
        chartType: "line",
        metrics: ["conversions", "conversionRate"],
        breakdown: "date",
        filters: [],
        dateRangeDays: 30,
        category: "Conversions",
    },
    {
        key: "conversion_by_channel",
        name: "Conversions by Channel",
        description: "Which channels actually convert — not just send traffic.",
        chartType: "bar",
        metrics: ["conversions"],
        breakdown: "channel",
        filters: [],
        dateRangeDays: 30,
        category: "Conversions",
    },
    {
        key: "consent_health",
        name: "Consent Rate Trend",
        description: "Tracks the percentage of visitors granting full consent. Drop here = data quality issue.",
        chartType: "line",
        metrics: ["consentRate"],
        breakdown: "date",
        filters: [],
        dateRangeDays: 30,
        category: "Consent",
    },
    {
        key: "consent_by_device",
        name: "Consent by Device",
        description: "Consent rates differ by device — mobile users often accept less. Use to tune your banner UX.",
        chartType: "donut",
        metrics: ["consentRate"],
        breakdown: "device",
        filters: [],
        dateRangeDays: 30,
        category: "Consent",
    },
    {
        key: "kpi_summary",
        name: "Executive KPI Summary",
        description: "All your key numbers in one view — sessions, conversions, conversion rate, and consent rate.",
        chartType: "kpi",
        metrics: ["sessions", "conversions", "conversionRate", "consentRate"],
        breakdown: "none",
        filters: [],
        dateRangeDays: 30,
        category: "Overview",
    },
    {
        key: "new_users",
        name: "New User Acquisition",
        description: "How many new users your site attracts over time vs returning visitors.",
        chartType: "line",
        metrics: ["newUsers", "sessions"],
        breakdown: "date",
        filters: [],
        dateRangeDays: 30,
        category: "Audience",
    },
    {
        key: "browser_share",
        name: "Browser Share",
        description: "Traffic by browser family — useful for front-end compatibility decisions.",
        chartType: "donut",
        metrics: ["sessions"],
        breakdown: "browser",
        filters: [],
        dateRangeDays: 30,
        category: "Audience",
    },
];

export const CATEGORY_ORDER = ["Overview", "Audience", "Acquisition", "Conversions", "Consent"];

// Chart type → SVG icon (same style as the builder's CT_SVG)
export const CT_SVG = {
    line: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
            <polyline points="3 17 8 11 13 14 21 6" /><line x1="3" y1="21" x2="21" y2="21" />
        </svg>
    ),
    bar: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
            <rect x="3" y="12" width="4" height="9" rx="1" /><rect x="10" y="7" width="4" height="14" rx="1" /><rect x="17" y="3" width="4" height="18" rx="1" />
        </svg>
    ),
    table: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
            <rect x="3" y="3" width="18" height="18" rx="2" /><line x1="3" y1="9" x2="21" y2="9" /><line x1="3" y1="15" x2="21" y2="15" /><line x1="9" y1="9" x2="9" y2="21" />
        </svg>
    ),
    kpi: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
            <rect x="3" y="4" width="7" height="7" rx="1.5" /><rect x="14" y="4" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" />
        </svg>
    ),
    donut: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
            <circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4" /><line x1="12" y1="3" x2="12" y2="8" /><line x1="20.5" y1="7" x2="16.1" y2="9.5" />
        </svg>
    ),
};

export const METRIC_LABELS = {
    sessions: "Sessions", pageViews: "Page views", conversions: "Conversions",
    conversionRate: "Conversion rate", consentRate: "Consent rate", newUsers: "New users",
};

export const CATEGORY_COLOR = {
    Overview:     "rgba(192,159,83,0.7)",
    Audience:     "rgba(99,179,237,0.7)",
    Acquisition:  "rgba(167,139,250,0.7)",
    Conversions:  "rgba(74,222,128,0.7)",
    Consent:      "rgba(251,146,60,0.7)",
};
