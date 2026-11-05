import Fetch from "../../Functions/fetch";
import API from "../../API/api";
import appStorage from "../../Functions/storage.js";
import { fetchUserOrganisations, storeUserOrganisations } from "../../Functions/organisations.js";
import "./Onboarding.css";

const { useState } = React;

/*
 * Shown instead of the dashboard when the signed-in account belongs to no
 * organisation (a fresh sign-up). Domains, billing and analytics are all
 * scoped to an organisation, so nothing else works until one exists. The
 * account becomes its admin; once the organisation shows up in the lookup
 * it is stored like a normal login and the app reloads into the dashboard.
 */
export default function CreateFirstOrganisation() {
    document.title = "Create your organisation | Intastellar Consents";
    const account = (() => {
        try { return JSON.parse(appStorage.getItem("globals")) || {}; } catch { return {}; }
    })();
    const email = account?.user?.email;

    const [name, setName] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);

    const create = async (e) => {
        e.preventDefault();
        if (!name.trim() || busy) return;
        setBusy(true);
        setError(null);
        try {
            const re = await Fetch(
                API.settings.createOrganisation.url,
                API.settings.createOrganisation.method,
                API.settings.createOrganisation.headers,
                JSON.stringify({ organisationName: name.trim(), organisationMember: email })
            );
            if (re === "Err_Login_Expired") {
                appStorage.removeItem("globals");
                window.location.href = "/login";
                return;
            }
            if (typeof re === "string" && /^(ERR|Err)_/.test(re)) throw new Error(re);

            const organisations = await fetchUserOrganisations(email);
            if (organisations.length === 0) throw new Error("organisation not found after create");
            storeUserOrganisations(account, organisations);
            window.location.reload();
        } catch {
            setError("We couldn't create your organisation. Please try again in a moment.");
            setBusy(false);
        }
    };

    return (
        <section className="onboarding">
            <form className="onboarding__card" onSubmit={create} noValidate>
                <span className="onboarding__badge" aria-hidden="true">
                    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 21h18" />
                        <path d="M5 21V7l7-4 7 4v14" />
                        <path d="M9 21v-5h6v5" />
                        <path d="M9 10h.01M15 10h.01" />
                    </svg>
                </span>
                <h1 className="onboarding__title">Create your organisation</h1>
                <p className="onboarding__intro">
                    Your domains, banner settings, analytics and billing all belong to an organisation.
                    Name yours to get started — you can invite your team afterwards.
                </p>

                {error ? <p className="onboarding__error" role="alert">{error}</p> : null}

                <label className="onboarding__label" htmlFor="onboarding-organisation-name">Organisation name</label>
                <input
                    id="onboarding-organisation-name"
                    className="onboarding__input"
                    type="text"
                    autoComplete="organization"
                    placeholder="Company or team name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    autoFocus
                    required
                />

                {email ? (
                    <p className="onboarding__admin">
                        <span className="onboarding__admin-role">Admin</span>
                        <span className="onboarding__admin-email">{email}</span>
                    </p>
                ) : null}

                <button type="submit" className="onboarding__submit" disabled={busy || !name.trim()} aria-busy={busy}>
                    {busy ? <span className="onboarding__spinner" aria-hidden="true" /> : null}
                    {busy ? "Creating…" : "Create organisation"}
                </button>
                <a className="onboarding__switch" href="/login" onClick={() => appStorage.removeItem("globals")}>
                    Use a different account
                </a>
            </form>
        </section>
    );
}
