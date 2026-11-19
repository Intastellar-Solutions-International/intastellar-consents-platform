---
title: Installér koden
summary: Ét kodestykke i sidens head indlæser cookiebanneret og Analytics-trackeren.
tags: kodestykke, script, installér, head
---
Tilføj installationskoden i `<head>` på **hver side**, før alle andre scripts, der sætter cookies. Banneret skal indlæses først, så det kan holde andre cookies tilbage, indtil den besøgende har valgt.

## Hvad koden indeholder

- **Bannerkonfigurationen** for dit domæne og **banner-scriptet**.
- Hvis Analytics er slået til for domænet: **Analytics-trackeren** med din site-nøgle (`data-site="…"`).

Trackeren læser den besøgendes valg fra banneret, så der er ingen ekstra samtykkeopsætning.

## Hvor du finder den

- **Kom i gang → Installér på dit website** – vælg domænet; er Analytics slået fra, tilføjer **Slå Analytics til** trackeren til koden.
- **Tilføj domæne** – efter at have gemt, sæt kryds i **Installér også Analytics** for at få den samlede kode med det samme.
- **Indstillinger → Analytics-script** – kun tracker-linjen, til websites der allerede har banneret.

> Har du ændret koden? Der kan gå et par minutter, før det første samtykke eller besøg vises, og det tilsvarende trin i Kom i gang krydses af.
