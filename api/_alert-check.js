import { emailLayout, emailEsc, emailP, INTASTELLAR_LOGO_ATTACHMENT } from "./_email-layout.js";
/**
 * Shared alert-check logic — used by ad-alerts.js (manual trigger) and
 * ad-snapshots.js (auto-trigger on snapshot save).
 *
 * Exported: checkAndFireAlerts(db, { orgId, domain, snapshot })
 */

// ── Email ─────────────────────────────────────────────────────────────────────

async function sendEmail({ to, subject, html }) {
    const key = process.env.RESEND_API_KEY;
    if (!key || !to) return false;
    const from = process.env.RESEND_FROM || "alerts@intastellarconsents.com";
    try {
        const resp = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
            body: JSON.stringify({ from, to, subject, html, attachments: [INTASTELLAR_LOGO_ATTACHMENT] }),
        });
        return resp.ok;
    } catch (err) {
        console.error("[alert-check] email error:", err.message);
        return false;
    }
}

function buildEmailHtml({ title, body, domain, severity, snapshotDate }) {
    return emailLayout({
        badge: { text: `${emailEsc(severity.charAt(0).toUpperCase() + severity.slice(1))} · ${emailEsc(domain)}`, tone: severity === "critical" ? "critical" : severity === "warning" ? "warning" : "info" },
        heading: title,
        body: emailP(emailEsc(body)) + (snapshotDate ? emailP(`Snapshot: ${emailEsc(snapshotDate)}`, "font-size:14px;color:#5f5f5f") : ""),
        cta: { label: "Open Ad Reconciliation", href: "https://www.intastellarconsents.com" },
        note: "Manage alerts in the Ad Reconciliation dashboard.",
    });
}

// ── Web Push ──────────────────────────────────────────────────────────────────

async function sendPushToSubscribers(db, orgId, domain, { title, body, tag }) {
    const pubKey  = process.env.VAPID_PUBLIC_KEY;
    const privKey = process.env.VAPID_PRIVATE_KEY;
    if (!pubKey || !privKey) return;

    let webpush;
    try {
        const mod = await import("web-push");
        webpush = mod.default || mod;
    } catch {
        return;
    }

    webpush.setVapidDetails(
        process.env.VAPID_CONTACT || "mailto:alerts@intastellarconsents.com",
        pubKey, privKey
    );

    const { rows } = await db.query(
        `SELECT endpoint, p256dh, auth FROM ad_push_subscriptions
          WHERE organisation_id = $1 AND domain = $2`,
        [orgId, domain]
    );

    const payload = JSON.stringify({ title, body, tag, icon: "/logo.png" });

    await Promise.allSettled(
        rows.map(r =>
            webpush.sendNotification(
                { endpoint: r.endpoint, keys: { p256dh: r.p256dh, auth: r.auth } },
                payload
            ).catch(err => {
                if (err.statusCode === 410 || err.statusCode === 404) {
                    db.query("DELETE FROM ad_push_subscriptions WHERE endpoint = $1", [r.endpoint]).catch(() => {});
                }
            })
        )
    );
}

// ── Alert check ───────────────────────────────────────────────────────────────

export async function checkAndFireAlerts(db, { orgId, domain, snapshot }) {
    const { rows: rules } = await db.query(
        `SELECT * FROM ad_alert_rules WHERE organisation_id = $1 AND domain = $2 AND enabled = TRUE`,
        [orgId, domain]
    );
    if (!rules.length) return [];

    const visPct     = snapshot.visibilityOfConsentsPct ?? snapshot.visibility_of_consents_pct;
    const bannerPct  = snapshot.bannerReachPct   ?? snapshot.banner_reach_pct;
    const costPerVis = snapshot.costPerVisible   ?? snapshot.cost_per_visible;
    const darkPct    = snapshot.darkTrafficPct   ?? snapshot.dark_traffic_pct ?? null;
    const platformLabel = snapshot.platformLabel ?? snapshot.platform_label ?? snapshot.platform ?? "";
    const platform      = snapshot.platform ?? "";
    const snapshotId    = snapshot.id ?? null;
    const savedAt       = snapshot.savedAt ?? snapshot.saved_at ?? null;

    const fired = [];

    for (const rule of rules) {
        let triggered = false, severity = "warning", title = "", body = "";

        switch (rule.rule_type) {
            case "visibility_low": {
                const pct = Number(visPct);
                if (!Number.isFinite(pct) || pct === 0) break;
                if (pct < Number(rule.threshold)) {
                    triggered = true;
                    severity = pct < 40 ? "critical" : "warning";
                    title = `Analytics visibility dropped to ${pct.toFixed(1)}% on ${domain}`;
                    body = `${platformLabel} campaign visibility (${pct.toFixed(1)}%) is below your ${rule.threshold}% threshold. `
                        + `${Math.round(100 - pct)}% of consents are invisible to analytics — your reported ROAS is overstated.`;
                }
                break;
            }
            case "dark_traffic_high": {
                const pct = Number(darkPct);
                if (!Number.isFinite(pct)) break;
                if (pct > Number(rule.threshold)) {
                    triggered = true;
                    severity = pct > 60 ? "critical" : "warning";
                    title = `${pct.toFixed(1)}% of traffic is untagged on ${domain}`;
                    body = `Untagged traffic (no utm_source) exceeded your ${rule.threshold}% threshold. `
                        + "Your attribution data is incomplete — review UTM tagging across all campaigns.";
                }
                break;
            }
            case "banner_reach_low": {
                const pct = Number(bannerPct);
                if (!Number.isFinite(pct) || pct === 0) break;
                if (pct < Number(rule.threshold)) {
                    triggered = true;
                    severity = pct < 25 ? "critical" : "warning";
                    title = `Low banner reach (${pct.toFixed(1)}%) on ${domain}`;
                    body = `Only ${pct.toFixed(1)}% of reported ${platformLabel} clicks triggered a banner interaction — below your ${rule.threshold}% threshold. `
                        + "Check your consent banner loads on all ad landing pages.";
                }
                break;
            }
            case "cost_high": {
                const cost = Number(costPerVis);
                const threshold = Number(rule.threshold);
                if (!Number.isFinite(cost) || !threshold) break;
                if (cost > threshold) {
                    triggered = true;
                    severity = cost > threshold * 1.5 ? "critical" : "warning";
                    const sym = rule.currency === "USD" ? "$" : rule.currency === "GBP" ? "£" : "€";
                    title = `Cost per visible consent hit ${sym}${cost.toFixed(2)} on ${domain}`;
                    body = `Cost per analytics-visible consent (${sym}${cost.toFixed(2)}) exceeded your ${sym}${threshold.toFixed(2)} threshold. `
                        + "Improving banner opt-in rate is typically the fastest way to reduce this.";
                }
                break;
            }
        }

        if (!triggered) continue;

        const { rows: [notif] } = await db.query(
            `INSERT INTO ad_notifications
                (organisation_id, domain, rule_type, severity, title, body, snapshot_id, platform)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
            [orgId, domain, rule.rule_type, severity, title, body, snapshotId, platform || null]
        );
        fired.push({ id: notif.id, severity, title, body, rule_type: rule.rule_type });

        if (rule.notify_email && rule.email_address) {
            sendEmail({
                to: rule.email_address,
                subject: `[${severity.toUpperCase()}] ${title}`,
                html: buildEmailHtml({ title, body, domain, severity, snapshotDate: savedAt ? new Date(savedAt).toLocaleString("en-GB") : null }),
            }).catch(() => {});
        }
    }

    if (fired.length) {
        const top = [...fired].sort((a, b) => {
            const o = { critical: 0, warning: 1, info: 2 };
            return (o[a.severity] ?? 9) - (o[b.severity] ?? 9);
        })[0];
        sendPushToSubscribers(db, orgId, domain, {
            title: top.title,
            body: fired.length > 1 ? `+ ${fired.length - 1} more alert${fired.length > 2 ? "s" : ""}` : top.body,
            tag: `ad-alert-${domain}`,
        }).catch(() => {});
    }

    return fired;
}
