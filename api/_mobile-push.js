import { getPool } from "./_db.js";

/*
 * Push notifications to the mobile app (apps/mobile) via Expo's push service.
 *
 * A phone opts in by registering its Expo push token from the app; from then
 * on it receives every alert that fires for its organisation (analytics
 * alerts from cron-analytics-alerts.js, ad alerts from _alert-check.js).
 * Tokens Expo reports as DeviceNotRegistered (app uninstalled) are removed.
 */
export const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
export const EXPO_TOKEN_RE = /^Expo(nent)?PushToken\[[A-Za-z0-9_-]{10,}\]$/;
export const MAX_DEVICES_PER_USER = 10;
const CHUNK = 100; // Expo accepts up to 100 messages per request
const LANGUAGES = ["en", "de", "da", "sv", "nb", "nl", "fr", "es", "it", "pl"];

let tableReady = null;
export function ensureMobilePushTable(db = getPool()) {
    if (!tableReady) {
        tableReady = db.query(`
            CREATE TABLE IF NOT EXISTS mobile_push_devices (
                expo_token      TEXT         PRIMARY KEY,
                organisation_id INTEGER      NOT NULL,
                email           TEXT         NOT NULL,
                platform        VARCHAR(10),
                language        VARCHAR(5)   NOT NULL DEFAULT 'en',
                created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
                last_seen_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
            );
            CREATE INDEX IF NOT EXISTS mobile_push_devices_org_idx ON mobile_push_devices (organisation_id);
            CREATE INDEX IF NOT EXISTS mobile_push_devices_email_idx ON mobile_push_devices (email);
            ALTER TABLE mobile_push_devices ADD COLUMN IF NOT EXISTS last_test_at TIMESTAMPTZ;
        `).catch((err) => { tableReady = null; throw err; });
    }
    return tableReady;
}

/** Registers (or moves) a phone to `member`'s organisation. → { ok } or { status, error } */
export async function registerDevice(db, { member, token, platform, language }) {
    if (!EXPO_TOKEN_RE.test(String(token || ""))) return { status: 400, error: "Invalid push token" };
    const { rows } = await db.query(
        "SELECT COUNT(*)::int AS n FROM mobile_push_devices WHERE email = $1 AND expo_token <> $2",
        [member.email, token],
    );
    if ((rows[0]?.n || 0) >= MAX_DEVICES_PER_USER) return { status: 429, error: "Too many devices" };
    await db.query(
        `INSERT INTO mobile_push_devices (expo_token, organisation_id, email, platform, language)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (expo_token) DO UPDATE
            SET organisation_id = EXCLUDED.organisation_id, email = EXCLUDED.email,
                platform = EXCLUDED.platform, language = EXCLUDED.language, last_seen_at = NOW()`,
        [token, member.organisationId, member.email,
            ["ios", "android"].includes(platform) ? platform : null,
            LANGUAGES.includes(language) ? language : "en"],
    );
    return { ok: true };
}

/** Removes the phone — only the account that registered it can. */
export async function unregisterDevice(db, { member, token }) {
    await db.query("DELETE FROM mobile_push_devices WHERE expo_token = $1 AND email = $2", [String(token || ""), member.email]);
    return { ok: true };
}

// ── Wording (the phone's language) ───────────────────────────────────────────
const METRIC_NAMES = {
    traffic_drop:       { en: "Traffic drop", de: "Traffic-Rückgang", da: "Fald i trafik", sv: "Trafikminskning", nb: "Trafikkfall", nl: "Daling in verkeer", fr: "Baisse du trafic", es: "Caída del tráfico", it: "Calo del traffico", pl: "Spadek ruchu" },
    consent_rate_below: { en: "Consent rate", de: "Einwilligungsrate", da: "Samtykkerate", sv: "Samtyckesgrad", nb: "Samtykkerate", nl: "Toestemmingspercentage", fr: "Taux de consentement", es: "Tasa de consentimiento", it: "Tasso di consenso", pl: "Wskaźnik zgód" },
    zero_conversions:   { en: "Conversions", de: "Conversions", da: "Konverteringer", sv: "Konverteringar", nb: "Konverteringer", nl: "Conversies", fr: "Conversions", es: "Conversiones", it: "Conversioni", pl: "Konwersje" },
    conversion_drop:    { en: "Conversion drop", de: "Conversion-Rückgang", da: "Fald i konverteringer", sv: "Minskade konverteringar", nb: "Fall i konverteringer", nl: "Daling in conversies", fr: "Baisse des conversions", es: "Caída de conversiones", it: "Calo delle conversioni", pl: "Spadek konwersji" },
    engaged_drop:       { en: "Engaged users drop", de: "Rückgang aktiver Nutzer", da: "Fald i aktive brugere", sv: "Färre engagerade användare", nb: "Fall i aktive brukere", nl: "Daling in betrokken gebruikers", fr: "Baisse des utilisateurs engagés", es: "Caída de usuarios activos", it: "Calo degli utenti attivi", pl: "Spadek aktywnych użytkowników" },
};
const BODY = {
    en: "Now {value} — your alert is set at {threshold}.",
    de: "Jetzt {value} – Ihr Alarm ist auf {threshold} eingestellt.",
    da: "Nu {value} – din alarm er sat til {threshold}.",
    sv: "Nu {value} – ditt larm är satt till {threshold}.",
    nb: "Nå {value} – varselet ditt er satt til {threshold}.",
    nl: "Nu {value} – je melding staat op {threshold}.",
    fr: "Actuellement {value} – votre alerte est réglée sur {threshold}.",
    es: "Ahora {value}: tu alerta está configurada en {threshold}.",
    it: "Ora {value}: il tuo avviso è impostato su {threshold}.",
    pl: "Teraz {value} – alert ustawiono na {threshold}.",
};
const LOCALES = { en: "en-GB", de: "de-DE", da: "da-DK", sv: "sv-SE", nb: "nb-NO", nl: "nl-NL", fr: "fr-FR", es: "es-ES", it: "it-IT", pl: "pl-PL" };

/** Title/body for an analytics alert in `language`. */
export function analyticsAlertMessage(alert, language = "en") {
    const lang = LANGUAGES.includes(language) ? language : "en";
    const fmt = (n) => {
        if (typeof n !== "number" || !Number.isFinite(n)) return "—";
        const isPct = /rate|drop/.test(alert.metric);
        return new Intl.NumberFormat(LOCALES[lang], { maximumFractionDigits: 1 }).format(n) + (isPct ? " %" : "");
    };
    const name = alert.label || METRIC_NAMES[alert.metric]?.[lang] || METRIC_NAMES[alert.metric]?.en || alert.metric;
    return {
        title: `${name} · ${alert.domain}`,
        body: BODY[lang].replace("{value}", fmt(alert.value)).replace("{threshold}", fmt(alert.threshold)),
    };
}

// ── Sending ──────────────────────────────────────────────────────────────────
/**
 * Sends to every phone registered for `organisationId`.
 * `message`: { title, body } (same text for all) or { analytics: alert }
 * (worded per phone's language). `data` travels with the notification.
 */
/**
 * Sends prepared messages via Expo, removes uninstalled phones.
 * → { sent, removed, errors: [Expo error codes] }
 */
async function deliver(db, messages, fetchImpl) {
    const headers = { Accept: "application/json", "Content-Type": "application/json" };
    if (process.env.EXPO_ACCESS_TOKEN) headers.Authorization = `Bearer ${process.env.EXPO_ACCESS_TOKEN}`;

    let sent = 0;
    const gone = [];
    const errors = [];
    for (let i = 0; i < messages.length; i += CHUNK) {
        const chunk = messages.slice(i, i + CHUNK);
        try {
            const res = await fetchImpl(EXPO_PUSH_URL, { method: "POST", headers, body: JSON.stringify(chunk) });
            const tickets = (await res.json().catch(() => null))?.data || [];
            tickets.forEach((ticket, j) => {
                if (ticket?.status === "ok") sent++;
                else {
                    const code = ticket?.details?.error || "Unknown";
                    errors.push(code);
                    if (code === "DeviceNotRegistered") gone.push(chunk[j].to);
                }
            });
        } catch (err) {
            console.error("[mobile-push] send failed:", err.message);
            errors.push("Unreachable");
        }
    }
    if (gone.length) {
        await db.query("DELETE FROM mobile_push_devices WHERE expo_token = ANY($1)", [gone]).catch(() => {});
    }
    return { sent, removed: gone.length, errors };
}

/**
 * Sends to every phone registered for `organisationId`.
 * `message`: { title, body } (same text for all) or { analytics: alert }
 * (worded per phone's language). `data` travels with the notification.
 */
export async function sendMobilePush(db, organisationId, message, { data = {}, fetchImpl = globalThis.fetch } = {}) {
    let devices;
    try {
        await ensureMobilePushTable(db);
        ({ rows: devices } = await db.query("SELECT expo_token, language FROM mobile_push_devices WHERE organisation_id = $1", [organisationId]));
    } catch (err) {
        console.error("[mobile-push] device lookup failed:", err.message);
        return { sent: 0, removed: 0 };
    }
    if (!devices.length) return { sent: 0, removed: 0 };

    const messages = devices.map((d) => {
        const text = message.analytics ? analyticsAlertMessage(message.analytics, d.language) : message;
        return { to: d.expo_token, title: text.title, body: text.body, sound: "default", channelId: "alerts", data };
    });
    const { sent, removed } = await deliver(db, messages, fetchImpl);
    return { sent, removed };
}

const TEST_MESSAGE = {
    en: ["Push works", "Alerts for your sites will arrive on this phone."],
    de: ["Push funktioniert", "Alarme für Ihre Websites kommen auf dieses Telefon."],
    da: ["Push virker", "Alarmer for dine websites kommer på denne telefon."],
    sv: ["Push fungerar", "Larm för dina webbplatser kommer till den här telefonen."],
    nb: ["Push fungerer", "Varsler for nettstedene dine kommer til denne telefonen."],
    nl: ["Push werkt", "Meldingen voor je websites komen op deze telefoon binnen."],
    fr: ["Les notifications fonctionnent", "Les alertes de vos sites arriveront sur ce téléphone."],
    es: ["Las notificaciones funcionan", "Las alertas de tus sitios llegarán a este teléfono."],
    it: ["Le notifiche funzionano", "Gli avvisi dei tuoi siti arriveranno su questo telefono."],
    pl: ["Powiadomienia działają", "Alerty z Twoich stron będą trafiać na ten telefon."],
};
export const TEST_PUSH_INTERVAL_SECONDS = 30;

/**
 * One test notification to the caller's own phone. → { sent: 1 } or
 * { status, error, code } — `code` is Expo's reason (e.g. InvalidCredentials
 * when the Apple / Firebase push key isn't set up in EAS yet).
 */
export async function sendTestPush(db, { member, token }, { fetchImpl = globalThis.fetch } = {}) {
    if (!EXPO_TOKEN_RE.test(String(token || ""))) return { status: 400, error: "Invalid push token" };
    // Only the account that registered the phone, at most every 30 s (atomic).
    const { rows } = await db.query(
        `UPDATE mobile_push_devices SET last_test_at = NOW()
          WHERE expo_token = $1 AND email = $2
            AND (last_test_at IS NULL OR last_test_at < NOW() - make_interval(secs => $3))
          RETURNING language`,
        [token, member.email, TEST_PUSH_INTERVAL_SECONDS],
    );
    if (!rows.length) {
        const { rows: known } = await db.query("SELECT 1 FROM mobile_push_devices WHERE expo_token = $1 AND email = $2", [token, member.email]);
        return known.length
            ? { status: 429, error: "Wait a moment before sending another test" }
            : { status: 404, error: "This phone isn't registered — turn push on first" };
    }
    const [title, body] = TEST_MESSAGE[rows[0].language] || TEST_MESSAGE.en;
    const result = await deliver(db, [{ to: token, title, body, sound: "default", channelId: "alerts", data: { type: "test" } }], fetchImpl);
    return result.sent === 1 ? { sent: 1 } : { status: 502, error: "Expo didn't accept the notification", code: result.errors[0] || "Unknown" };
}

// ── Alert list for the app ───────────────────────────────────────────────────
/** Analytics + ad alerts of the organisation, newest first (last `days` days). */
export async function listAlerts(db, organisationId, { days = 30, limit = 60 } = {}) {
    const [analytics, ads] = await Promise.all([
        db.query(
            `SELECT h.id, h.triggered_at AS at, h.metric_value AS value, c.metric, c.label, c.threshold, c.operator, c.period_days, s.domain
               FROM analytics_alert_history h
               JOIN analytics_alert_configs c ON c.id = h.config_id
               JOIN analytics_sites s ON s.id = c.site_id
              WHERE c.organisation_id = $1 AND h.triggered_at > NOW() - make_interval(days => $2)
              ORDER BY h.triggered_at DESC LIMIT $3`,
            [organisationId, days, limit],
        ).then((r) => r.rows).catch(() => []),
        db.query(
            `SELECT id, created_at AS at, domain, severity, title, body
               FROM ad_notifications
              WHERE organisation_id = $1 AND created_at > NOW() - make_interval(days => $2)
              ORDER BY created_at DESC LIMIT $3`,
            [organisationId, days, limit],
        ).then((r) => r.rows).catch(() => []),
    ]);
    const items = [
        ...analytics.map((r) => ({
            id: `analytics:${r.id}`, kind: "analytics", at: new Date(r.at).toISOString(), domain: r.domain,
            metric: r.metric, label: r.label || null, operator: r.operator, periodDays: r.period_days,
            value: r.value == null ? null : Number(r.value), threshold: r.threshold == null ? null : Number(r.threshold),
        })),
        ...ads.map((r) => ({
            id: `ads:${r.id}`, kind: "ads", at: new Date(r.at).toISOString(), domain: r.domain,
            severity: r.severity, title: r.title, body: r.body || null,
        })),
    ];
    return items.sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, limit);
}
