---
title: Installer koden
summary: Ett kodestykke i sidehodet laster informasjonskapselbanneret og Analytics-sporeren.
tags: kodestykke, skript, installer, head
---
Legg installasjonskoden i `<head>` på **hver side**, før alle andre skript som setter informasjonskapsler. Banneret må lastes først, slik at det kan holde tilbake andre informasjonskapsler til den besøkende har bestemt seg.

## Hva koden inneholder

- **Bannerkonfigurasjonen** for domenet ditt og **bannerskriptet**.
- Hvis Analytics er slått på for domenet: **Analytics-sporeren** med nettstedsnøkkelen din (`data-site="…"`).

Sporeren leser den besøkendes valg fra banneret, så det trengs ikke noe ekstra samtykkeoppsett.

## Hvor du finner den

- **Kom i gang → Installer på nettstedet ditt** – velg domenet; er Analytics av, legger **Slå på Analytics** sporeren til i koden.
- **Legg til domene** – etter lagring, kryss av for **Installer også Analytics** for å få den samlede koden med en gang.
- **Innstillinger → Analytics-skript** – bare sporerlinjen, for nettsteder som allerede har banneret.

> Endret koden? Det kan ta noen minutter før det første samtykket eller besøket vises og det tilsvarende steget i Kom i gang krysses av.
