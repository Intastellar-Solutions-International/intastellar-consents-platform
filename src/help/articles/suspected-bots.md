---
title: Suspected bots
summary: What counts as a bot, why it's excluded by default, and how to include it.
category: account
product: both
routes: /*/dashboard, /*/view/*, /analytics/*, /analytics, /analytics/*/live, /analytics/live, /analytics/*/bots
tags: bots, crawler, data centre, hosting, filter, exclude
order: 20
---
Crawlers and automated checks visit your site too. Counting them as visitors makes traffic look bigger and consent rates look lower than they are, so both products leave them out by default.

## What counts as a suspected bot

- **CMP:** consent records from hosting or data-centre IP addresses.
- **Analytics:** a visit from a data-centre IP **that never gave full consent**. Crawlers (on Google, AWS, Tencent and similar networks) never accept the banner. People behind a VPN or iCloud Private Relay often do — accepting is a human action, so those visits stay counted.

## One switch for both products

It's one preference, on by default, and changing it anywhere changes it everywhere:

- **CMP:** the **Exclude suspected bots** toggle at the top of Home, Compliance and the audit log.
- **Analytics Home:** **Include bots / Exclude bots** in the line under the chart.
- **Live view:** **Show them / Hide them** under the activity chart, with how many hits were hidden.

> Custom events and clicks aren't filtered: those records don't store the network type. Bots rarely produce them.
