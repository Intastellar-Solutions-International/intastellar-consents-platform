/**
 * The getting-started checklist shared by the CMP and Analytics. Each step is
 * done when the account's own data shows it, so it can't be ticked off by
 * mistake.
 *
 * facts (counts): domains, records, verified, scans, reports — CMP;
 *                 analyticsSites, sitesWithEvents, adConnections, conversions — Analytics.
 * opts: { analytics: false } when the plan has no Analytics — its track is
 *       then shown as locked and doesn't count towards progress;
 *       { conversionsPath } the domain's Conversions page (Analytics URLs
 *       carry the domain, which this module doesn't know).
 *
 * Steps carry `track` ("shared" | "consent" | "analytics"); `optional` steps
 * are suggestions and never block "complete".
 */
export function onboardingSteps(facts, platform, opts = {}) {
    const analytics = opts.analytics !== false;
    const f = { domains: 0, records: 0, verified: 0, scans: 0, reports: 0, analyticsSites: 0, sitesWithEvents: 0, adConnections: 0, conversions: 0, ...facts };

    const steps = [
        { id: "domain", track: "shared", title: "Add your domain", description: "Tell us which website you want to manage consent and analytics for.", action: "Add a domain", to: "/settings/add-domain", done: f.domains > 0 },

        { id: "banner", track: "consent", title: "Install the cookie banner", description: "Add the install code below to your website. This step completes once the first consent is recorded.", action: "Show install code", to: "#install", done: f.records > 0 },
        { id: "verify", track: "consent", title: "Verify that you own the domain", description: "Verification makes sure consent records are attributed to your account.", action: "Verify a domain", to: "/settings/workspaces", done: f.verified > 0 },
        { id: "scan", track: "consent", title: "Run your first cookie scan", description: "See which cookies and vendors load on your site, and which load before consent.", action: "Open Compliance", to: `/${platform}/reports/compliance`, done: f.scans > 0 },
        { id: "report", track: "consent", title: "Create your first report", description: "Generate a consent audit you can keep for your records or share with an auditor.", action: "Go to Quick report", to: `/${platform}/dashboard`, done: f.reports > 0 },

        { id: "analytics-enable", track: "analytics", title: "Turn on Analytics for your domain", description: "Creates the site key the tracker reports to. One click — the install code below then includes the tracker.", action: "Turn on Analytics", to: "#enable-analytics", done: f.analyticsSites > 0 },
        { id: "analytics-data", track: "analytics", title: "Receive your first visit", description: "Completes once the tracker sends its first event. Visitors without consent are counted anonymously.", action: "Show install code", to: "#install", done: f.sitesWithEvents > 0 },
        { id: "analytics-ads", track: "analytics", optional: true, title: "Connect an ad platform", description: "See ad spend, cost per click and cost per lead next to your traffic.", action: "Connect ad platform", to: "/settings/ad-connections", done: f.adConnections > 0 },
        { id: "analytics-conversion", track: "analytics", optional: true, title: "Define a conversion", description: "Mark the events that matter (a purchase, a lead form) so Analytics can show where conversions come from.", action: "Set up conversions", to: opts.conversionsPath || "/analytics/conversions", done: f.conversions > 0 },
    ].map((s) => ({ ...s, locked: s.track === "analytics" && !analytics }));

    // Progress counts required, unlocked steps only.
    const counted = steps.filter((s) => !s.optional && !s.locked);
    const next = counted.find((s) => !s.done) || null;
    return {
        steps: steps.map((s) => ({ ...s, next: s === next })),
        completed: counted.filter((s) => s.done).length,
        total: counted.length,
    };
}
