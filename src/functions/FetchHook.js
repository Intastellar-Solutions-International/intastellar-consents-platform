const { useState, useEffect } = React;
import Authentication from "../Authentication/Auth";

function ignoreAbortError(err, setError) {
    if (err && (err.name === "AbortError" || err.code === 20)) {
        return;
    }
    setError(err);
}

export default function useFetch(updateInterval, url, method, headers, body, handle) {
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState();
    const [error, setError] = useState();
    const [lastUpdated, setLastUpdated] = useState(Math.floor(Date.now() / 100));
    const [updated, setUpdated] = useState("");
    let id = undefined;

    useEffect(() => {
        const controller = new AbortController();
        setLoading(true);
        setError(undefined);
        setData(undefined);
        fetch(url, { method: method, headers, body, signal: controller.signal })
            .then((res) => {
                if (res.status === 401) {
                    return "Err_Login_Expired";
                } else if (res.status === 403) {
                    return "Err_No_Access";
                } else if (
                    res.status === 404 ||
                    res.status === 500 ||
                    res.status === 502 ||
                    res.status === 503 ||
                    res.status === 504
                ) {
                    return "Err_Server_Error";
                }

                return res.json()
            })
            .then(setData)
            .catch((err) => ignoreAbortError(err, setError))
            .finally(() => {
                setLoading(false);
                setUpdated("Now");
                setLastUpdated(Math.floor(Date.now() / 1000));
            });

        if (typeof (updateInterval) !== 'undefined') {
            const interval1 = setInterval(() => {
                if ((Math.floor(Date.now() / 1000)) - lastUpdated >= 60) {
                    setUpdated(Math.floor(((Math.floor(Date.now() / 1000)) - lastUpdated) / 60) + " minute ago");
                }
            }, 1000);

            id = setInterval(() => {
                fetch(url, { method: method, headers, body, signal: controller.signal })
                    .then((res) => res.json())
                    .then(setData)
                    .catch((err) => ignoreAbortError(err, setError))
                    .finally(() => {
                        setLoading(false);
                        clearInterval(interval1);
                        setUpdated("Now");
                        setLastUpdated(Math.floor(Date.now() / 1000));
                    });
            }, updateInterval * 60 * 1000)
        }

        return () => {
            controller.abort();
            if (typeof (updateInterval) !== 'undefined') {
                clearInterval(id);
            }
        }
    }, [url, handle, headers?.FromDate, headers?.ToDate, headers?.Domains, headers?.Organisation, headers?.SortOrder]);

    if (data == "Err_Login_Expired") {
        localStorage.removeItem("globals");
        window.location.href = "/login";
        return;
    }

    return [loading, data, error, updated, lastUpdated, setUpdated];
}

export function useEventSource(url) {

    const [loading, setLoading] = useState(true);
    const [data, setData] = useState();
    const [error, setError] = useState();
    const [lastUpdated, setLastUpdated] = useState(Math.floor(Date.now() / 100));
    const [updated, setUpdated] = useState("");

    const evtSource = new EventSource(`${url}`, {
        withCredentials: true,
    });

    if (typeof (EventSource) !== "undefined") {
        //console.log("EventSource is supported.");
        evtSource.onmessage = (event) => {
            console.log(event.data);
            setData(JSON.parse(event.data));
            setLoading(false);
            setUpdated("Now");
            setLastUpdated(Math.floor(Date.now() / 1000));
        };

        evtSource.addEventListener("ping", (event) => {
            setData(JSON.parse(event.data));
            setLoading(false);
            setUpdated("Now");
            setLastUpdated(Math.floor(Date.now() / 1000));
        });

        evtSource.onerror = (err) => {
            //console.error("EventSource failed:", err);
        };

        return [loading, data, error, updated, lastUpdated, setUpdated];
    } else {
        //console.log("EventSource is not supported.");
        return [loading, data, error, updated, lastUpdated, setUpdated];
    }
}