/**
 * Turns a fetch Response into its JSON body, or throws an Error whose message
 * is fit to show the user. Treats as failure: a non-2xx status, and a 2xx
 * body that reports one ({ error }, { success: false }, { status: "error" }) —
 * several PHP endpoints answer errors with HTTP 200.
 *
 * Exists so a failed save can't look like a successful one: callers show the
 * thrown message instead of swallowing it with `.catch(() => {})`.
 */
export async function readJsonResult(response, fallbackMessage = "The request failed.") {
    let body = null;
    try { body = await response.json(); } catch { /* empty or non-JSON body */ }

    const bodyError = body && (
        (typeof body.error === "string" && body.error)
        || (body.success === false && (body.message || fallbackMessage))
        || (body.status === "error" && (body.message || fallbackMessage))
    );
    if (!response.ok || bodyError) {
        const message = bodyError
            || (body && typeof body.message === "string" && body.message)
            || `${fallbackMessage} (${response.status})`;
        throw new Error(message);
    }
    return body;
}

// For thrown values of any kind (network TypeError, our Error, strings).
export function errorMessage(err, fallback = "Something went wrong.") {
    if (err && typeof err.message === "string" && err.message) {
        // fetch's network failure reads "Failed to fetch" — say what it means
        return /failed to fetch|networkerror|load failed/i.test(err.message)
            ? "Can't reach the server — check your connection and try again."
            : err.message;
    }
    return typeof err === "string" && err ? err : fallback;
}
