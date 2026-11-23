import Authentication from "../../Authentication/Auth";
import { Button, Card } from "../../Components/ui";
import { onboardingSteps } from "../../Functions/onboardingSteps.js";
import { useOnboardingFacts } from "../../Functions/onboardingFacts.js";
import { canAccess } from "../../Functions/tier.js";
import { t } from "../../i18n/index.js";

const useHistory = window.ReactRouterDOM.useHistory;

// Once every required step is done the card never shows again in this
// browser, and Home stops loading the checklist facts. A per-viewer
// convenience only — losing it just means one more check.
const doneKey = () => `ia_setup_done_${Authentication.getOrganisation() ?? "none"}`;
function readDone() { try { return localStorage.getItem(doneKey()) === "1"; } catch { return false; } }
function writeDone() { try { localStorage.setItem(doneKey(), "1"); } catch { /* ignore */ } }

function SetupProgress({ platform, to }) {
    const history = useHistory();
    const { facts, loading } = useOnboardingFacts(platform);
    const plan = onboardingSteps(facts, platform, { analytics: canAccess("starter") });

    if (loading) return null;
    if (plan.completed === plan.total) {
        writeDone();
        return null;
    }
    const next = plan.steps.find((s) => s.next);
    return (
        <Card padding="sm" className="tw-mb-4">
            <div className="tw-flex tw-flex-wrap tw-items-center tw-gap-4">
                <div className="tw-flex-1 tw-min-w-0" style={{ flexBasis: 260 }}>
                    <p className="tw-m-0 tw-text-sm tw-font-semibold tw-text-text-primary tw-tabular-nums">
                        {t("Setup: {done} of {total} steps complete", { done: plan.completed, total: plan.total })}
                    </p>
                    {next && <p className="tw-m-0 tw-text-sm tw-text-text-secondary">{t("Next: {step}", { step: t(next.title) })}</p>}
                    <div className="tw-mt-2 tw-bg-white/10 tw-rounded-full" style={{ height: 6 }} aria-hidden="true">
                        <div className="tw-h-full tw-bg-data tw-rounded-full" style={{ width: `${(plan.completed / plan.total) * 100}%` }} />
                    </div>
                </div>
                <Button variant="primary" size="sm" onClick={() => history.push(to)}>{t("Continue setup")}</Button>
            </div>
        </Card>
    );
}

/**
 * Compact "Setup: 4 of 7" card for the CMP and Analytics Home pages, linking
 * to the shared Getting started checklist. Renders nothing once setup is done.
 */
export default function SetupProgressCard({ platform, to }) {
    if (readDone()) return null;
    return <SetupProgress platform={platform} to={to} />;
}
