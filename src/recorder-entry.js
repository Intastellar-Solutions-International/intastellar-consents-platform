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
            pathnames: pathnames, events: batch, dt: cfg.dt,
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
                // keepalive only for the pagehide/unload final flush — browsers
                // enforce a 64 KB combined-inflight cap on keepalive requests,
                // which a FullSnapshot easily exceeds and silently drops.
                keepalive: !!final,
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
                // The FullSnapshot (rrweb event type 2) is the one event the
                // player can't render anything without, and it's usually the
                // single largest event in the whole recording — flush it out
                // immediately rather than waiting for the thresholds below.
                // Without this, a fast bounce (page small enough to stay
                // under the 50KB/200-event thresholds, gone before the 10s
                // timer) funnels the FullSnapshot through the pagehide-only
                // final flush, which is keepalive-capped at 64KB combined
                // in-flight (see flush()'s keepalive comment) and competes
                // with the main analytics embed's own exit beacon firing at
                // the same instant — silently dropping it and producing a
                // 0s recording with nothing to play back.
                if (event.type === 2) { flush(false); return; }
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

    // "hidden" fires on any backgrounding (tab switch, mobile app-switch,
    // screen lock) — not just genuine page exit, and often within seconds of
    // landing on a page. Treating it as the end of the recording was cutting
    // nearly every session down to a near-zero duration_sec the moment the
    // visitor so much as glanced away, even if they came right back and kept
    // browsing. Flush defensively here instead (a backgrounded mobile tab can
    // be killed by the OS without ever firing pagehide), but only actually
    // finalize on pagehide — the real navigation-away/unload signal. Anything
    // that never gets a final flush (tab killed while backgrounded) is
    // reaped by the 2h staleness sweep in api/cron-cleanup-recordings.js.
    document.addEventListener("visibilitychange", function () {
        if (document.visibilityState === "hidden") flush(false);
    });
    window.addEventListener("pagehide", finalize);

    // Called by the embed script (api/a.js) if consent is revoked mid-session.
    window.__intaRecStop = finalize;
})();
