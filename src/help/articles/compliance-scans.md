---
title: Compliance and cookie scans
summary: What a cookie scan checks, and how to read what loads before consent.
category: consent
product: cmp
routes: /*/reports/compliance, /*/reports/view/*/compliance, /*/reports/scans
tags: scan, cookies, vendors, pre-consent, transfers, compliance
order: 20
---
A cookie scan opens your site like a first-time visitor and records the cookies and third-party services that load — including those that load **before** the visitor has made a choice in the banner.

## Reading the results

- **Before consent:** anything here that isn't strictly necessary is a finding to fix — the service should wait for consent, or have a documented legal basis.
- **Vendors and transfers:** which companies receive data, and whether data leaves the EU. Add a DPA or transfer mechanism per vendor where needed.
- **Cookies:** each cookie with its category. You can correct a category; the change is saved for your whole team.

Run a scan again after changing your site to confirm the fix.

> If vendor records or evidence documents can't be loaded, the page says so — an empty list then doesn't mean "no vendors".

Related: [Records of processing & legal basis](help:records-and-legal-basis)
