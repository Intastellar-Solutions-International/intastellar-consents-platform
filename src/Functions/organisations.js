import API from "../API/api";
import appStorage from "./storage.js";

/*
 * Shared by Login and the first-run organisation setup so both store a
 * user's organisations the same way: `organisation` holds the active one
 * (removed, not "undefined", when there is none) and `globals` carries the
 * per-organisation roles Authentication reads.
 */

/** The organisations `email` belongs to, or throws when the lookup is rejected. */
export async function fetchUserOrganisations(email, signal) {
    const response = await fetch(API.OrganisationData.url, {
        signal,
        method: "POST",
        headers: {
            LoginType: "oauth",
            "Content-Type": "application/json; charset=utf-8",
        },
        body: JSON.stringify({ organisationMember: email }),
    }).then((r) => r.json());

    if (response === "Err_Logon_Fail" || !Array.isArray(response)) {
        throw new Error("organisation lookup rejected");
    }
    return response.filter(Boolean);
}

/** Persist `organisations` for `account` (the globals object) and make the first one active. */
export function storeUserOrganisations(account, organisations) {
    if (organisations[0]) {
        appStorage.setItem("organisation", JSON.stringify(organisations[0]));
    } else {
        appStorage.removeItem("organisation");
    }

    appStorage.setItem(
        "globals",
        JSON.stringify({
            ...account,
            organisation_access: organisations.map((organisation) => ({
                organisation_id: organisation.id,
                organisation_name: organisation.name,
                organisation_access: organisation.users?.find(
                    (user) => user.email === account?.user?.email
                )?.role,
            })),
        })
    );
}
