---
title: Mistenkte roboter
summary: Hva som regnes som en robot, hvorfor den utelates som standard, og hvordan du tar den med.
tags: roboter, bots, crawler, datasenter, filter
---
Crawlere og automatiske kontroller besøker også nettstedet ditt. Telles de som besøkende, ser trafikken større ut og samtykkeraten lavere ut enn den er – derfor utelater begge produktene dem som standard.

## Hva som regnes som en mistenkt robot

- **CMP:** samtykkeposter fra hosting- eller datasenter-IP-adresser.
- **Analytics:** et besøk fra en datasenter-IP **som aldri ga fullt samtykke**. Crawlere (hos Google, AWS, Tencent og lignende) aksepterer aldri banneret. Folk bak en VPN eller iCloud Private Relay gjør det ofte – å akseptere er en menneskelig handling, så de besøkene telles fortsatt.

## Én bryter for begge produktene

Det er én innstilling, slått på som standard, og en endring ett sted gjelder overalt:

- **CMP:** bryteren **Utelat mistenkte roboter** øverst på startsiden, Compliance og revisjonsloggen.
- **Analytics-startsiden:** **Ta med roboter / Utelat roboter** i linjen under diagrammet.
- **Sanntidsvisning:** **Vis dem / Skjul dem** under aktivitetsdiagrammet, med antall skjulte treff.

> Egendefinerte hendelser og klikk filtreres ikke: de postene lagrer ikke nettverkstypen. Roboter skaper dem sjelden.
