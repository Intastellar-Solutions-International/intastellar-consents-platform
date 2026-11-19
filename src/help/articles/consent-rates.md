---
title: Banner acceptance vs. statistics consent
summary: Two different consent numbers — why they rarely match, and which one to use.
category: consent
product: both
routes: /*/dashboard, /*/view/*, /analytics/*/consent, /analytics/consent
tags: consent rate, acceptance rate, opt-in, statistics, statisticCookies
order: 10
---
The platform shows two consent percentages. They measure different things, so they're rarely the same.

## Banner acceptance rate (CMP)

The share of **banner decisions** where the visitor accepted. Every visitor who answers the banner counts **once**. Use it to judge your banner: design, wording, placement.

## Statistics consent rate (Analytics)

The share of **Analytics events** from visitors who allowed **statistics cookies**. It counts **every page view**, and only the statistics category. Use it to judge how much of your traffic Analytics can follow across pages.

## Why statistics consent is usually lower

- It only counts statistics consent — a visitor can accept other categories but not this one.
- It weighs every page view, not one decision per visitor.
- Visitors who never answer the banner still create page views, but no banner decision.

> The **Consent** page in Analytics shows both numbers side by side for the same domain and period.
