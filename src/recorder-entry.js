// Standalone session-recording bundle, built separately from the dashboard SPA
// and loaded lazily by the embed script (api/a.js) only for consented,
// sampled-in visits on sites with recording enabled. Not a React component —
// this is injected as a plain <script> tag on customer websites.
//
// Configuration arrives via window.__intaRecCfg, set by the embed script right
// before it injects this bundle's <script> tag: { s, sid, ep, block, mask }.
import { record } from "rrweb";

(function () {
    var cfg = window.__intaRecCfg;
    if (!cfg || !cfg.s || !cfg.sid || !cfg.ep) return;

    var recId = Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
    var pathnames = [location.pathname];
    var buf = [];
    var seq = 0;
    var stopped = false;
    var flushIv = null;

    // Non-negotiable regardless of site config — merged with the site owner's
    // own selectors, never replacing them.
    var blockSelectors = [
        "input[type=\"password\"]",
        "input[autocomplete*=\"cc-\"]",
        "[data-inta-mask]",
    ].concat(Array.isArray(cfg.block) ? cfg.block : []);
    var maskSelectors = Array.isArray(cfg.mask) ? cfg.mask : [];

    function flush(final) {
        if (!buf.length && !final) return;
        var batch = buf.splice(0, buf.length);
        var payload = JSON.stringify({
            s: cfg.s, sid: cfg.sid, recId: recId, seq: seq++,
            final: !!final, pathname: pathnames[pathnames.length - 1],
            pathnames: pathnames, events: batch,
        });
        // fetch+keepalive (not sendBeacon) — see api/a.js's send() for why:
        // sendBeacon's spec-mandated credentialed CORS mode is incompatible
        // with this endpoint's wildcard Access-Control-Allow-Origin, and
        // credentials:'omit' sidesteps the mismatch instead of loosening CORS.
        try {
            fetch(cfg.ep, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: payload,
                keepalive: true,
                credentials: "omit",
            }).catch(function () {});
        } catch (e) {}
    }

    var stopRecording;
    try {
        stopRecording = record({
            emit: function (event) {
                if (stopped) return;
                buf.push(event);
                if (buf.length >= 200) { flush(false); return; }
                try { if (JSON.stringify(buf).length > 50000) flush(false); } catch (e) {}
            },
            maskAllInputs: true,
            blockSelector: blockSelectors.join(","),
            maskTextSelector: maskSelectors.length ? maskSelectors.join(",") : undefined,
            recordCanvas: false,
            collectFonts: false,
            checkoutEveryNms: 60000,
        });
    } catch (e) { return; }

    flushIv = setInterval(function () { flush(false); }, 10000);

    function finalize() {
        if (stopped) return;
        stopped = true;
        if (flushIv) { clearInterval(flushIv); flushIv = null; }
        try { stopRecording && stopRecording(); } catch (e) {}
        flush(true);
    }

    document.addEventListener("visibilitychange", function () {
        if (document.visibilityState === "hidden") finalize();
    });
    window.addEventListener("pagehide", finalize);

    // Called by the embed script (api/a.js) if consent is revoked mid-session.
    window.__intaRecStop = finalize;
})();
