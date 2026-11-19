---
title: Vermoedelijke bots
summary: Wat telt als bot, waarom bots standaard worden uitgesloten en hoe je ze meetelt.
tags: bots, crawler, datacenter, filter
---
Crawlers en automatische controles bezoeken je website ook. Tel je ze als bezoekers, dan lijkt het verkeer groter en de toestemmingsgraad lager dan hij is – daarom laten beide producten ze standaard weg.

## Wat telt als vermoedelijke bot

- **CMP:** toestemmingsrecords van hosting- of datacenter-IP-adressen.
- **Analytics:** een bezoek van een datacenter-IP **dat nooit volledige toestemming gaf**. Crawlers (bij Google, AWS, Tencent en vergelijkbaar) accepteren de banner nooit. Mensen achter een VPN of iCloud Private Relay doen dat vaak wel – accepteren is een menselijke handeling, dus die bezoeken tellen nog steeds mee.

## Eén schakelaar voor beide producten

Het is één voorkeur, standaard aan, en een wijziging op één plek geldt overal:

- **CMP:** de schakelaar **Vermoedelijke bots uitsluiten** bovenaan de startpagina, Compliance en het auditlogboek.
- **Analytics-startpagina:** **Bots meetellen / Bots uitsluiten** in de regel onder de grafiek.
- **Liveweergave:** **Toon ze / Verberg ze** onder de activiteitsgrafiek, met het aantal verborgen hits.

> Aangepaste gebeurtenissen en klikken worden niet gefilterd: die records slaan het netwerktype niet op. Bots maken ze zelden aan.
