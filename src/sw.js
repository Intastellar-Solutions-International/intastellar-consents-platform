/* Service worker for Intastellar Consents — analytics blind-spot push alerts */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));

self.addEventListener("push", function (event) {
    if (!event.data) return;
    let data = {};
    try { data = event.data.json(); } catch { data = { title: event.data.text(), body: "" }; }

    const title = data.title || "Analytics Alert";
    const options = {
        body:    data.body   || "",
        icon:    data.icon   || "/logo.png",
        badge:   data.badge  || "/logo.png",
        tag:     data.tag    || "ad-alert",
        data:    { url: data.url || "/" },
        requireInteraction: true,
    };

    event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", function (event) {
    event.notification.close();
    const url = (event.notification.data && event.notification.data.url) || "/";
    event.waitUntil(
        self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(clients => {
            const existing = clients.find(c => c.url.includes(self.location.origin));
            if (existing) return existing.focus();
            return self.clients.openWindow(url);
        })
    );
});
