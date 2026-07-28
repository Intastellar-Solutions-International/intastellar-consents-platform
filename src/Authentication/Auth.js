import appStorage from '../Functions/storage.js';
let DemoMode = false;
const listeners = [];
const Authentication = {
    oAuthCallback: function (e) {
        const url = window.location.href;
    },
    DemoMode: (localStorage.getItem("demoMode") === "true") ? true : false,
    SetDemoMode: function (mode) {
        localStorage.setItem("demoMode", mode);
        DemoMode = mode;
        listeners.forEach(fn => fn(DemoMode));
        this.DemoMode = mode;
    },
    onDemoModeChange(fn) {
        listeners.push(fn);
        // Optionally return unsubscribe function
        return () => {
            const idx = listeners.indexOf(fn);
            if (idx > -1) listeners.splice(idx, 1);
        };
    },
    Login: function (url, email, password, type, setErrorMessage, setLoading) {
        setLoading(true);
        fetch(url, {
            withCredentials: false,
            method: "POST",
            headers: {
                'LoginType': 'employee',
                'Content-Type': 'application/json; charset=utf-8'
            },
            body: JSON.stringify({
                email: email,
                password: password,
                type: type
            })
        }).then((response) => {
            return response.json();
        }).then(response => {
            if (response === "Err_Logon_Fail") {
                setErrorMessage("We having trouble to log you in");
                setLoading(false);
                return;
            }

            if (response === "Err_Logon_Fail_Wrong_Password_Or_Email") {
                setErrorMessage("Wrong password or email");
                setLoading(false);
                return;
            }

            if (response === "Err_Logon_Deny") {
                setErrorMessage("Your account has been locked due to too many incorrect password attempts – please contact your Intastellar Account Manager for assistance");
                setLoading(false);
                return;
            }

            setLoading(false);

            appStorage.setItem("organisation", response.organisation);
            appStorage.setItem("globals", JSON.stringify(response));

            if (localStorage.getItem("platform") === null || localStorage.getItem("platform") === undefined) {
                window.location.href = "/dashboard";
            } else {
                window.location.href = "/" + localStorage.getItem("platform") + "/dashboard";
            }

        })
    },
    Logout: function () {
        appStorage.removeItem("globals");
        appStorage.removeItem("organisation");
        localStorage.removeItem("domains");
        document.cookie = "inta_acc=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
        window.location.href = "/";
    },
    getToken: function () {
        // Get token from query string
        const urlParams = new URLSearchParams(window.location.search);
        const tokenFromUrl = urlParams.get('token');

        const token = (JSON.parse(appStorage.getItem("globals"))?.token) ? "Bearer " + JSON.parse(appStorage.getItem("globals"))?.token : tokenFromUrl ? tokenFromUrl : null;
        return token;
    },
    getUserId: function () {
        const email = (JSON.parse(appStorage.getItem("globals"))?.user?.email) ? JSON.parse(appStorage.getItem("globals"))?.user?.email : undefined;
        return email;
    },
    getOrganisation: function () {
        const raw = appStorage.getItem("organisation");
        if (raw == null || raw === undefined) return undefined;
        try {
            return JSON.parse(raw)?.id;
        } catch {
            return undefined;
        }
    },
    SignUp: function (url, email, password, firstname, lastname, type, companyName, setErrorMessage, setLoading) {
        setLoading(true);
        fetch(url, {
            withCredentials: false,
            method: "POST",
            headers: {
                'LoginType': 'employee',
                'Content-Type': 'application/json; charset=utf-8'
            },
            body: JSON.stringify({
                email: email,
                password: password,
                type: type,
                firstname: firstname,
                lastname: lastname,
                companyName: companyName
            })
        }).then((response) => {
            return response.json();
        }).then(response => {
            if (response === "Err_Logon_Fail") {
                setErrorMessage("We having trouble to log you in");
                setLoading(false);
                return;
            }

            if (response === "Err_Logon_Fail_Wrong_Password_Or_Email") {
                setErrorMessage("Wrong password or email");
                setLoading(false);
                return;
            }

            if (response === "Err_Logon_Deny") {
                setErrorMessage("Your account has been locked due to too many incorrect password attempts – please contact your Intastellar Account Manager for assistance");
                setLoading(false);
                return;
            }

            setLoading(false);

            if (response == "Success") {
                window.location.href = "/login";
            }

        })
    },
    /**
     * Role for this user on the given organisation (from globals.organisation_access).
     * Compares ids as strings so "1" and 1 both match.
     */
    getOrganisationAccessStatusForOrganisation: function (organisation_id) {
        if (organisation_id == null || organisation_id === undefined) return undefined;
        const raw = appStorage.getItem("globals");
        if (raw == null || raw === undefined) return undefined;
        let g;
        try {
            g = JSON.parse(raw);
        } catch {
            return undefined;
        }
        const list = g?.organisation_access;
        if (!Array.isArray(list)) return undefined;
        const entry = list.find((o) => String(o.organisation_id) === String(organisation_id));
        return entry?.organisation_access;
    },

    /**
     * Role for the currently selected organisation (localStorage organisation + globals.organisation_access).
     * Falls back to globals.status only when no organisation_access row matches (legacy).
     */
    getCurrentOrganisationRole: function () {
        const orgId = this.getOrganisation();
        const fromAccess = this.getOrganisationAccessStatusForOrganisation(orgId);
        if (fromAccess != null && fromAccess !== "") return fromAccess;
        const raw = appStorage.getItem("globals");
        if (!raw) return null;
        try {
            return JSON.parse(raw)?.status ?? null;
        } catch {
            return null;
        }
    },

    get User() {
        return {
            get Status() {
                return Authentication.getCurrentOrganisationRole();
            },
        };
    },
}

// ── Global 401 handling ──────────────────────────────────────────────────────
// Any request that carried an Authorization header and comes back 401 means
// the token is expired/invalid (or the account was deactivated, or the
// signature no longer validates — 401 is the right universal signal for all
// of those, not just plain expiry) — log the user out immediately rather than
// leaving every page to handle (or silently ignore) it individually.
// Installed once here, patching window.fetch, so it covers every existing
// fetch call across the app plus any new one added later with no per-call-site
// changes needed. Requests without an Authorization header (login, signup)
// are left alone — a 401 there doesn't mean an expired session.
function hasAuthHeader(input, init) {
    const headers = init?.headers || (input && typeof input === "object" ? input.headers : null);
    if (!headers) return false;
    if (typeof Headers !== "undefined" && headers instanceof Headers) return headers.has("Authorization");
    if (Array.isArray(headers)) return headers.some(([k]) => String(k).toLowerCase() === "authorization");
    return Object.keys(headers).some(k => k.toLowerCase() === "authorization");
}

if (typeof window !== "undefined" && window.fetch && !window.fetch.__intaAuthPatched) {
    const originalFetch = window.fetch.bind(window);
    let loggingOut = false;
    const patchedFetch = function (input, init) {
        return originalFetch(input, init).then((response) => {
            if (response && response.status === 401 && hasAuthHeader(input, init) && !loggingOut) {
                loggingOut = true;
                Authentication.Logout();
            }
            return response;
        });
    };
    patchedFetch.__intaAuthPatched = true;
    window.fetch = patchedFetch;
}

export default Authentication;