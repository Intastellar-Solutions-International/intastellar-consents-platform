---
title: Installing the code
summary: One snippet in the page head loads the cookie banner and the Analytics tracker.
category: start
product: both
routes: /*/onboarding, /analytics/getting-started, /settings/add-domain, /settings/analytics-script
tags: snippet, script, install, head, tracker, site key
order: 2
---
Add the install code to the `<head>` of **every page**, before any other script that sets cookies. The banner has to load first so it can hold back other cookies until the visitor decides.

## What the code contains

- The **banner configuration** for your domain and the **banner script**.
- If Analytics is on for the domain: the **Analytics tracker** with your site key (`data-site="…"`).

The tracker reads the visitor's choice from the banner, so there is no second consent setup.

## Where to get it

- **Get started → Install on your site** — pick the domain; if Analytics is off, **Turn on Analytics** adds the tracker to the code.
- **Add domain** — after saving, tick **Also install Analytics** to get the combined code straight away.
- **Settings → Analytics script** — the tracker line on its own, for sites that already have the banner.

> Changed the code? It can take a few minutes until the first consent or visit shows up and the matching step in Get started ticks off.
