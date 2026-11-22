---
title: Campaign consent
summary: How visitors from each channel and campaign answer the cookie banner — and how many you can measure.
category: ads
product: analytics
routes: /analytics/*/marketing, /analytics/marketing
tags: marketing, utm, campaigns, channels, cost per consent, measurable
order: 30
---
Campaign consent shows how visitors from each **channel** (Google Ads, Email, Facebook …) and **campaign** answer your cookie banner.

## Which visits count

Visits whose landing URL has **UTM tags** (`utm_source`, `utm_campaign` …) or an **ad click ID** such as `gclid` or `fbclid`. Visits without them are not on this page.

## The numbers

- **Consent decisions** – banner answers from those visits.
- **Accepted all** – the share who allowed every category. Only these visitors are fully visible to GA4, Google Ads, the Meta pixel and similar tools.
- **Not measurable** – visitors who chose essential only or some categories. Ad platforms and GA4 don't see them, which is why their numbers are lower than yours.
- **Cost per consent** – ad spend ÷ consent decisions from that platform's **paid** channels (for Meta: Facebook Ads and Instagram Ads). Shown when an ad platform is connected; the second figure is cost per visitor who accepted all.

## The bar

Each row's bar splits its decisions into **Accepted all**, **Chose some** and **Essential only**. Hover it for the exact numbers. Rows marked **Mostly not measurable** have so few accept-alls that most of that traffic is invisible to analytics.

Select a channel to see its campaigns and a daily trend.

> Ad platform reporting fewer conversions than you expect? **Compare with ad platforms** puts clicks next to consenting visits per campaign.

Related: [Ad spend](help:ad-spend), [Banner acceptance vs. statistics consent](help:consent-rates)
