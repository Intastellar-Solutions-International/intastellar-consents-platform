# Findings for the asasoftware.aero site owner

These are issues on the ASA website itself, found while auditing this analytics dashboard
(see `docs/analytics-audit-plan.md`). None of this is fixable from this repository — it's the
site's own code/content/hosting, not the tracker or dashboard. Passing these along for the site
owner or whoever maintains asasoftware.aero.

## Contact form: 63 starts, 0 submissions

`/contact` and `/contact.php` show 63 form-start events and **zero** successful submissions in
the last 30 days. Worth checking directly — a form that nobody ever completes usually means a
client-side JS error, a broken submit handler, or a backend endpoint that's failing silently.

## Demo-request form: technical errors

13 network failures recorded against the demo-request flow in the last 30 days, including 2×
HTTP 502 (Bad Gateway) and 1× HTTP 410 (Gone). Also, verification-code emails are failing to send
5 times out of 22 attempts (`verification_code_send_failed`). Together these likely explain why
some visitors submit the same form repeatedly within a short window (see
`docs/analytics-audit-plan.md` item 7's book-demo-request-form before/after) — they're retrying
because it's failing, not double-submitting by accident.

## Wildcard/spoofed subdomains serving the site

Search Console shows Googlebot crawling 100+ junk subdomains that shouldn't exist —
`dev.`, `workspaces.`, `vendor.`, and many single-use UUID-style hostnames
(e.g. `1d0f4e22-a3a5-4db3-9102-93f4dda5f647.asasoftware.aero`). This looks like the server/CDN is
configured to accept requests for *any* subdomain of asasoftware.aero rather than only the
intended ones, which both wastes crawl budget and could be a minor security exposure (anyone can
point a subdomain at your IP and serve arbitrary content under your domain). Worth tightening the
DNS/vhost configuration to only accept known hostnames.

## Unoptimised images

Three testimonial photos are 1.2–1.9 MB each, and the homepage hero image is 1.4 MB. All are much
larger than needed for web delivery — compressing and/or serving responsive/modern formats (WebP,
AVIF) would meaningfully improve page load time, especially on mobile.

## Layout shift on /software/app/sam-aviation

CLS (Cumulative Layout Shift) on this page is 0.638 — well above Google's "poor" threshold (0.25).
Likely caused by content (images, ads, embeds) loading in without reserved space, pushing the
rest of the page down after initial render. Worth profiling this specific page with Chrome
DevTools' Performance panel.

## Mobile responsiveness (INP)

Mobile INP (Interaction to Next Paint) is 424 ms, above Google's "needs improvement" threshold
(200 ms is "good", 500 ms is "poor" — this sits in the middle). Suggests some interactions
(button taps, menu opens) feel sluggish on mobile devices specifically.
