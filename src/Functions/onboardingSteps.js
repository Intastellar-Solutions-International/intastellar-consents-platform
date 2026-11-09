/**
 * The platform's getting-started checklist. Each step is done when the
 * account's own data shows it, so it can't be ticked off by mistake.
 * facts: { domains, records, verified, scans, reports } as counts.
 */
export function onboardingSteps(facts, platform) {
    const steps = [
        { id: "domain", title: "Add your domain", description: "Tell us which website the consent banner is for.", action: "Add a domain", to: "/settings/add-domain", done: facts.domains > 0 },
        { id: "banner", title: "Install the cookie banner", description: "Add the banner's script tag to your website. This step completes once the first consent is recorded.", action: "Get the install code", to: "/settings/add-domain", done: facts.records > 0 },
        { id: "verify", title: "Verify that you own the domain", description: "Verification makes sure consent records are attributed to your account.", action: "Verify a domain", to: "/settings/workspaces", done: facts.verified > 0 },
        { id: "scan", title: "Run your first cookie scan", description: "See which cookies and vendors load on your site, and which load before consent.", action: "Open Compliance", to: `/${platform}/reports/compliance`, done: facts.scans > 0 },
        { id: "report", title: "Create your first report", description: "Generate a consent audit you can keep for your records or share with an auditor.", action: "Go to Quick report", to: `/${platform}/dashboard`, done: facts.reports > 0 },
    ];
    const next = steps.find((s) => !s.done);
    return { steps: steps.map((s) => ({ ...s, next: s === next })), completed: steps.filter((s) => s.done).length, total: steps.length };
}
