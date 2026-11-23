import { ScannerHost } from "../../API/host.js";
import appStorage from "../../Functions/storage.js";
import { fetchUserOrganisations, storeUserOrganisations } from "../../Functions/organisations.js";
import { isSafeReturnPath } from "../../Functions/session.js";
import { Icon } from "../../Components/ui/icons.js";
import { t } from "../../i18n/index.js";

const { useEffect, useState } = React;

/**
 * /app-handoff?code=…&to=/analytics/… — opened by the mobile app so the web
 * dashboard starts signed in as the same account (api/app-handoff.js).
 * Rendered by index.js before <App />, so the sign-in gate never sees it.
 */
export default function AppHandoff() {
    const [failed, setFailed] = useState(null);

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const code = params.get("code");
        const to = params.get("to");
        // The code is single-use, but keep it out of the history anyway.
        window.history.replaceState(null, "", "/app-handoff");

        (async () => {
            const res = await fetch(`${ScannerHost}/api/app-handoff`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "redeem", code }),
            });
            const body = await res.json().catch(() => null);
            if (!res.ok || !body?.token) throw new Error(body?.error || "expired");

            // Same session shape the normal login stores (Login.js → handleLogin).
            const account = { token: body.token, user: { ...body.user, email: body.email } };
            const organisations = await fetchUserOrganisations(body.email);
            storeUserOrganisations(account, organisations);
            const chosen = organisations.find((o) => Number(o.id) === Number(body.organisationId));
            if (chosen) appStorage.setItem("organisation", JSON.stringify(chosen));
            if (!localStorage.getItem("platform")) localStorage.setItem("platform", "gdpr");

            window.location.replace(isSafeReturnPath(to) ? to : "/analytics");
        })().catch(() => setFailed(true));
    }, []);

    return (
        <main className="tw-min-h-screen tw-flex tw-items-center tw-justify-center tw-p-6 tw-bg-bg-base">
            <div className="tw-max-w-sm tw-w-full tw-flex tw-flex-col tw-items-center tw-gap-4 tw-text-center" role="status" aria-live="polite">
                {failed ? (
                    <>
                        <Icon name="alert-triangle" size={28} className="tw-text-warning" />
                        <h1 className="tw-m-0 tw-text-lg tw-font-semibold tw-text-text-primary">{t("This link has expired")}</h1>
                        <p className="tw-m-0 tw-text-sm tw-text-text-secondary">{t("Open the page again from the app, or sign in here.")}</p>
                        <a href="/login" className="tw-inline-flex tw-items-center tw-h-10 tw-px-4 tw-rounded-md tw-bg-accent tw-text-text-inverse tw-font-semibold tw-no-underline">{t("Sign in")}</a>
                    </>
                ) : (
                    <>
                        <span className="tw-w-8 tw-h-8 tw-rounded-full tw-border-2 tw-border-solid tw-border-border tw-border-t-accent tw-animate-spin" aria-hidden="true" />
                        <p className="tw-m-0 tw-text-sm tw-text-text-secondary">{t("Signing in…")}</p>
                    </>
                )}
            </div>
        </main>
    );
}
