/**
 * Intastellar Cookie Table — v1
 * Drop-in embed for privacy / cookie policy pages.
 *
 * Usage:
 *   <div data-intastellar-cookies data-domain="example.com"></div>
 *   <script src="https://www.intastellarconsents.com/cookie-table.js" defer></script>
 *
 * The div is replaced with a live, auto-grouped cookie table sourced from the
 * most recent scan of the specified domain.
 *
 * Optional attributes on the div:
 *   data-lang="de"   — "en" (default) or "de"
 */
(function () {
    'use strict';

    // Capture base URL before any async work (currentScript is null after DOMContentLoaded)
    var BASE = (function () {
        var s = document.currentScript;
        if (s && s.src) {
            try { return new URL(s.src).origin; } catch (_) {}
        }
        return 'https://www.intastellarconsents.com';
    })();

    var STYLE_ID = 'ics-ct-styles';

    var LABELS = {
        en: {
            necessary:  'Necessary',
            analytics:  'Analytics',
            marketing:  'Marketing',
            functional: 'Functional',
            colName:        'Cookie name',
            colDomain:      'Domain',
            colProvider:    'Provider',
            colLifetime:    'Lifetime',
            colDescription: 'Description',
            session:    'Session',
            persistent: 'Persistent',
            loading:    'Loading cookie list…',
            retrying:   'Scan in progress — please reload in ~30 s.',
            error:      'Could not load the cookie list. Please try again later.',
            noCookies:  'No cookies detected for this category.',
            updated:    'Last updated:',
        },
        de: {
            necessary:  'Notwendig',
            analytics:  'Analyse',
            marketing:  'Marketing',
            functional: 'Funktional',
            colName:        'Cookie-Name',
            colDomain:      'Domain',
            colProvider:    'Anbieter',
            colLifetime:    'Lebensdauer',
            colDescription: 'Beschreibung',
            session:    'Sitzung',
            persistent: 'Dauerhaft',
            loading:    'Cookie-Liste wird geladen…',
            retrying:   'Scan läuft — bitte in ~30 s neu laden.',
            error:      'Cookie-Liste konnte nicht geladen werden.',
            noCookies:  'Keine Cookies für diese Kategorie erkannt.',
            updated:    'Zuletzt aktualisiert:',
        },
    };

    var CAT_ORDER = ['necessary', 'analytics', 'marketing', 'functional'];

    function injectStyles() {
        if (document.getElementById(STYLE_ID)) return;
        var el = document.createElement('style');
        el.id = STYLE_ID;
        el.textContent = [
            '.ics-ct{font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;font-size:14px;color:inherit;line-height:1.5}',
            '.ics-ct-group{margin-bottom:28px}',
            '.ics-ct-group-label{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#888;margin-bottom:8px}',
            '.ics-ct-table{width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:6px;overflow:hidden}',
            '.ics-ct-table th,.ics-ct-table td{text-align:left;padding:9px 12px;border-bottom:1px solid #e5e7eb;vertical-align:top}',
            '.ics-ct-table th{background:#f9fafb;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.04em}',
            '.ics-ct-table tr:last-child td{border-bottom:none}',
            '.ics-ct-table td:first-child{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;color:#111;word-break:break-all}',
            '.ics-ct-table td{font-size:13px;color:#374151}',
            '.ics-ct-meta{font-size:12px;color:#9ca3af;margin-top:12px}',
            '.ics-ct-msg{font-size:13px;padding:12px 0;color:#9ca3af}',
            '.ics-ct-err{color:#dc2626}',
        ].join('');
        (document.head || document.documentElement).appendChild(el);
    }

    function esc(s) {
        return String(s || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function renderCategories(container, data, L) {
        var cats = data.categories || {};
        var scannedAt = data.scanned_at;
        var html = '<div class="ics-ct">';

        CAT_ORDER.forEach(function (cat) {
            var group = cats[cat];
            if (!group || !group.cookies || !group.cookies.length) return;

            html += '<div class="ics-ct-group">';
            html += '<div class="ics-ct-group-label">' + esc(L[cat] || cat) + ' (' + group.cookies.length + ')</div>';
            html += '<table class="ics-ct-table"><thead><tr>';
            html += '<th>' + L.colName + '</th>';
            html += '<th>' + L.colDomain + '</th>';
            html += '<th>' + L.colProvider + '</th>';
            html += '<th>' + L.colLifetime + '</th>';
            html += '<th>' + L.colDescription + '</th>';
            html += '</tr></thead><tbody>';

            group.cookies.forEach(function (c) {
                var provider = '';
                if (group.vendors) {
                    group.vendors.forEach(function (v) {
                        if (v.cookies && v.cookies.some(function (vc) { return vc.name === c.name; })) {
                            provider = v.service || '';
                        }
                    });
                }
                html += '<tr>';
                html += '<td>' + esc(c.name) + '</td>';
                html += '<td>' + esc(c.domain) + '</td>';
                html += '<td>' + esc(provider) + '</td>';
                html += '<td>' + (c.session ? L.session : L.persistent) + '</td>';
                html += '<td>' + esc(c.description || '') + '</td>';
                html += '</tr>';
            });

            html += '</tbody></table></div>';
        });

        if (scannedAt) {
            var d = new Date(scannedAt);
            var formatted = isNaN(d.getTime()) ? scannedAt : d.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
            html += '<p class="ics-ct-meta">' + esc(L.updated) + ' ' + esc(formatted) + '</p>';
        }

        html += '</div>';
        container.innerHTML = html;
    }

    function loadContainer(container) {
        var domain = (container.getAttribute('data-domain') || '').trim();
        var lang   = (container.getAttribute('data-lang')   || 'en').trim().toLowerCase();
        var L = LABELS[lang] || LABELS.en;

        if (!domain) {
            container.innerHTML = '<p class="ics-ct-msg ics-ct-err">data-domain attribute is required.</p>';
            return;
        }

        container.innerHTML = '<p class="ics-ct-msg">' + L.loading + '</p>';

        var url = BASE + '/api/cookie-banner?domain=' + encodeURIComponent(domain);

        fetch(url)
            .then(function (r) { return r.json(); })
            .then(function (data) {
                if (data.status === 'scan_in_progress' || data.status === 'scan_queued') {
                    container.innerHTML = '<p class="ics-ct-msg">' + L.retrying + '</p>';
                    return;
                }
                if (data.error && !data.categories) {
                    container.innerHTML = '<p class="ics-ct-msg ics-ct-err">' + L.error + '</p>';
                    return;
                }
                renderCategories(container, data, L);
            })
            .catch(function () {
                container.innerHTML = '<p class="ics-ct-msg ics-ct-err">' + L.error + '</p>';
            });
    }

    function init() {
        injectStyles();
        var containers = document.querySelectorAll('[data-intastellar-cookies]');
        for (var i = 0; i < containers.length; i++) {
            loadContainer(containers[i]);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
