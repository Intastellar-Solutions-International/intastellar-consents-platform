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
            security:   'Security',
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
            retrying:   'Scan in progress — please reload in ~30 s.',
            error:      'Could not load the cookie list. Please try again later.',
            noCookies:  'No cookies detected for this category.',
            updated:    'Last updated:',
            intro:      'Cookies are small text files placed on your device when you visit a website. They may contain an anonymous unique identifier and are used to remember your preferences or track your behaviour across visits. In addition to cookies, we may use other tracking technologies such as web beacons, tags, and scripts to collect and analyse information about your use of this service. The table below lists all cookies and trackers currently in use on this website, grouped by purpose.',
            catDesc: {
                necessary:  'These cookies are essential for the website to function correctly. They enable core features such as page navigation, security, and access to protected areas. Without them, the website cannot operate as intended and they cannot be switched off.',
                security:   'These cookies help us detect and prevent malicious activity, bots, and fraudulent behaviour. They do not store any personally identifiable information.',
                analytics:  'These cookies help us understand how visitors interact with our website by collecting and reporting information anonymously. They allow us to measure traffic, identify popular content, and improve the overall user experience.',
                marketing:  'These cookies track your browsing activity across websites to deliver personalised and relevant advertising. They are typically set by our advertising partners and allow those partners to build a profile of your interests.',
                functional: 'These cookies enable enhanced features and personalisation such as live chat widgets, embedded videos, and social media integrations. Disabling them may reduce the functionality of certain parts of the website.',
            },
        },
        de: {
            necessary:  'Notwendig',
            security:   'Sicherheit',
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
            retrying:   'Scan läuft — bitte in ~30 s neu laden.',
            error:      'Cookie-Liste konnte nicht geladen werden.',
            noCookies:  'Keine Cookies für diese Kategorie erkannt.',
            updated:    'Zuletzt aktualisiert:',
            intro:      'Cookies sind kleine Textdateien, die auf Ihrem Gerät gespeichert werden, wenn Sie eine Website besuchen. Sie können eine anonyme eindeutige Kennung enthalten und werden verwendet, um Ihre Einstellungen zu speichern oder Ihr Verhalten über mehrere Besuche hinweg zu verfolgen. Neben Cookies können wir auch andere Tracking-Technologien wie Web-Beacons, Tags und Skripte einsetzen, um Informationen über Ihre Nutzung dieses Dienstes zu erfassen und zu analysieren. Die nachstehende Tabelle listet alle Cookies und Tracker auf, die derzeit auf dieser Website verwendet werden, geordnet nach Zweck.',
            catDesc: {
                necessary:  'Diese Cookies sind für den ordnungsgemäßen Betrieb der Website unentbehrlich. Sie ermöglichen grundlegende Funktionen wie Navigation, Sicherheit und den Zugriff auf geschützte Bereiche. Ohne sie kann die Website nicht wie vorgesehen funktionieren und sie können nicht deaktiviert werden.',
                security:   'Diese Cookies helfen uns, böswillige Aktivitäten, Bots und betrügerisches Verhalten zu erkennen und zu verhindern. Sie speichern keine personenbezogenen Daten.',
                analytics:  'Diese Cookies helfen uns zu verstehen, wie Besucher mit unserer Website interagieren, indem sie Informationen anonym erfassen und auswerten. Sie ermöglichen es uns, den Datenverkehr zu messen, beliebte Inhalte zu identifizieren und die allgemeine Nutzererfahrung zu verbessern.',
                marketing:  'Diese Cookies verfolgen Ihre Surfaktivitäten auf verschiedenen Websites, um Ihnen personalisierte und relevante Werbung anzuzeigen. Sie werden in der Regel von unseren Werbepartnern gesetzt und ermöglichen diesen, ein Profil Ihrer Interessen aufzubauen.',
                functional: 'Diese Cookies ermöglichen erweiterte Funktionen und Personalisierung, wie z. B. Live-Chat-Widgets, eingebettete Videos und Social-Media-Integrationen. Das Deaktivieren dieser Cookies kann die Funktionalität bestimmter Teile der Website einschränken.',
            },
        },
    };

    var CAT_ORDER = ['necessary', 'security', 'analytics', 'marketing', 'functional'];

    function groupCookiesByName(rawCookies) {
        var map = {};
        rawCookies.forEach(function (c) {
            if (!map[c.name]) {
                map[c.name] = Object.assign({}, c, { domains: [c.domain] });
            } else {
                var g = map[c.name];
                if (g.domains.indexOf(c.domain) === -1) g.domains.push(c.domain);
                if (!g.session && c.expires && (!g.expires || c.expires > g.expires)) {
                    g.expires = c.expires;
                }
            }
        });
        return Object.values(map);
    }

    function injectStyles() {
        if (document.getElementById(STYLE_ID)) return;
        var el = document.createElement('style');
        el.id = STYLE_ID;
        el.textContent = [
            '.ics-ct{font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;font-size:14px;color:inherit;line-height:1.5}',
            '.ics-ct-intro{font-size:14px;color:#374151;line-height:1.6;margin-bottom:24px}',
            '.ics-ct-group{margin-bottom:28px}',
            '.ics-ct-group-label{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#888;margin-bottom:4px}',
            '.ics-ct-group-desc{font-size:13px;color:#6b7280;margin:0 0 10px}',
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

        html += '<p class="ics-ct-intro">' + esc(L.intro) + '</p>';

        CAT_ORDER.forEach(function (cat) {
            var group = cats[cat];
            if (!group || !group.cookies || !group.cookies.length) return;

            var grouped = groupCookiesByName(group.cookies);
            var desc = L.catDesc && L.catDesc[cat] ? L.catDesc[cat] : '';
            html += '<div class="ics-ct-group">';
            html += '<div class="ics-ct-group-label">' + esc(L[cat] || cat) + ' (' + grouped.length + ')</div>';
            if (desc) html += '<p class="ics-ct-group-desc">' + esc(desc) + '</p>';
            html += '<table class="ics-ct-table"><thead><tr>';
            html += '<th>' + L.colName + '</th>';
            html += '<th>' + L.colDomain + '</th>';
            html += '<th>' + L.colProvider + '</th>';
            html += '<th>' + L.colLifetime + '</th>';
            html += '<th>' + L.colDescription + '</th>';
            html += '</tr></thead><tbody>';

            grouped.forEach(function (c) {
                var provider = '';
                if (group.vendors) {
                    group.vendors.forEach(function (v) {
                        if (v.cookies && v.cookies.some(function (vc) { return vc.name === c.name; })) {
                            provider = v.service || '';
                        }
                    });
                }
                if (!provider) provider = c.provider || '';
                html += '<tr>';
                html += '<td>' + esc(c.name) + '</td>';
                html += '<td>' + esc(c.domains.join(', ')) + '</td>';
                html += '<td>' + esc(provider) + '</td>';
                var lifetime = c.session
                    ? L.session
                    : (c.expires ? new Date(c.expires * 1000).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : L.persistent);
                html += '<td>' + esc(lifetime) + '</td>';
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
