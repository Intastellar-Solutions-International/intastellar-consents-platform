// Loads data for a screen: { data, error, loading, refreshing, refresh }.
// `key` identifies the inputs (e.g. "org|domain|from"): results are kept
// per key, so a new key shows loading instead of the previous domain's
// numbers, and answers that arrive for an old key are ignored. Stays quiet
// on SessionExpiredError (the session is already signing out).
import { useCallback, useEffect, useRef, useState } from "react";
import { SessionExpiredError } from "./api.js";

export function useRequest(load, key, { enabled = true, intervalMs } = {}) {
    const [state, setState] = useState({ key: null, data: null, error: null, fetchedAt: null });
    const [refreshing, setRefreshing] = useState(false);
    const loadRef = useRef(load);
    useEffect(() => { loadRef.current = load; });
    const run = useRef(0);

    const fetchFor = useCallback(async (forKey, { fresh = false } = {}) => {
        const id = ++run.current;
        try {
            const data = await loadRef.current({ fresh });
            if (id === run.current) setState({ key: forKey, data, error: null, fetchedAt: Date.now() });
        } catch (error) {
            if (id !== run.current || error instanceof SessionExpiredError) return;
            setState((s) => ({ key: forKey, data: s.key === forKey ? s.data : null, error, fetchedAt: s.key === forKey ? s.fetchedAt : null }));
        } finally {
            if (id === run.current) setRefreshing(false);
        }
    }, []);

    useEffect(() => {
        if (!enabled) return undefined;
        fetchFor(key);
        if (!intervalMs) return undefined;
        const timer = setInterval(() => fetchFor(key), intervalMs);
        return () => clearInterval(timer);
    }, [key, enabled, intervalMs, fetchFor]);

    const current = state.key === key;
    return {
        data: current ? state.data : null,
        error: current ? state.error : null,
        loading: enabled && !current,
        refreshing,
        fetchedAt: current ? state.fetchedAt : null,
        refresh: () => { setRefreshing(true); fetchFor(key, { fresh: true }); },
        retry: () => { setState((s) => ({ ...s, key: null })); fetchFor(key); },
    };
}
