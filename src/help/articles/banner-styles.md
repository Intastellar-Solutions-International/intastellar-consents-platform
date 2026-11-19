---
title: Banner designs and settings
summary: The five banner designs, and what each setting in Add domain does.
category: consent
product: cmp
routes: /settings/add-domain, /*/domains
tags: banner, design, style, overlay, popup, wide, bannerV2, nova, premium, colour, logo, partner domains
order: 5
---
You choose the banner's look when you add a domain. The setting is stored as `design` in the domain's banner configuration.

## Designs

- **Popup** (`overlay`) — a compact card at the bottom centre. The most familiar consent pattern, and the default.
- **Wide** (`banner`) — a full-width bar, with your logo and the buttons in a side panel.
- **Wide V2** (`bannerV2`) — the updated full-width bar with a side panel.
- **Nova** (`nova`) — a navy and gold card with a floating cookie badge.
- **Premium** (`premium`) — a plain, neutral card that stays out of the way.

Nova and Premium use their own fixed colours, so the brand colour setting doesn't apply to them.

## Settings

- **Privacy policy URL** — linked from the banner, opens in a new tab.
- **Company name** — shown in the banner text.
- **Logo URL** _(optional)_ — shown by the designs that have room for it.
- **Brand colour** — the buttons' colour (not used by Nova and Premium). Button text switches between dark and light so it stays readable.
- **Position** — Wide designs: logo and buttons on the right or left. Nova and Premium: bottom-right or bottom-left corner. Popup is always centred.
- **Required cookies** — strictly necessary cookies that are always allowed, for example a session cookie like `PHPSESSID`.
- **Partner domains** — other domains you own that should share the visitor's consent, so they aren't asked twice.

> After changing the design, the install code stays the same — the banner reads its configuration on every page load.

Related: [Installing the code](help:install-code)
