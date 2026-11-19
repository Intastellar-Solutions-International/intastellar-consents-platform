---
title: Formodede bots
summary: Hvad der tæller som en bot, hvorfor den udelades som standard, og hvordan du tager den med.
tags: bots, crawler, datacenter, filter
---
Crawlere og automatiske tjek besøger også dit website. Tæller man dem som besøgende, ser trafikken større ud og samtykkeraten lavere ud, end den er – derfor udelader begge produkter dem som standard.

## Hvad der tæller som en formodet bot

- **CMP:** samtykkeposter fra hosting- eller datacenter-IP-adresser.
- **Analytics:** et besøg fra en datacenter-IP, **der aldrig gav fuldt samtykke**. Crawlere (hos Google, AWS, Tencent og lignende) accepterer aldrig banneret. Folk bag en VPN eller iCloud Private Relay gør det ofte – at acceptere er en menneskelig handling, så de besøg tælles stadig med.

## Én kontakt til begge produkter

Det er én indstilling, slået til som standard, og en ændring ét sted gælder overalt:

- **CMP:** kontakten **Udelad formodede bots** øverst på forsiden, Compliance og auditloggen.
- **Analytics-forsiden:** **Medtag bots / Udelad bots** i linjen under diagrammet.
- **Live-visning:** **Vis dem / Skjul dem** under aktivitetsdiagrammet med antallet af skjulte hits.

> Brugerdefinerede hændelser og klik filtreres ikke: de poster gemmer ikke netværkstypen. Bots skaber dem sjældent.
