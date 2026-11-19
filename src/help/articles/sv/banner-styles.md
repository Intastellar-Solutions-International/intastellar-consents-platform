---
title: Bannerdesigner och inställningar
summary: De fem bannerdesignerna och vad varje inställning under Lägg till domän gör.
tags: banner, design, stil, färg, logotyp, partnerdomäner
---
Du väljer bannerns utseende när du lägger till en domän. Inställningen sparas som `design` i domänens bannerkonfiguration.

## Designer

- **Popup** (`overlay`) – ett kompakt kort längst ned i mitten. Det mest välbekanta samtyckesmönstret och standard.
- **Bred** (`banner`) – en list i full bredd, med logotyp och knappar i en sidopanel.
- **Bred V2** (`bannerV2`) – den uppdaterade breda listen med sidopanel.
- **Nova** (`nova`) – ett kort i marinblått och guld med en svävande cookie-bricka.
- **Premium** (`premium`) – ett enkelt, neutralt kort som inte är i vägen.

Nova och Premium använder egna fasta färger, så varumärkesfärgen gäller inte för dem.

## Inställningar

- **URL till integritetspolicy** – länkas från bannern, öppnas i en ny flik.
- **Företagsnamn** – visas i bannertexten.
- **Logotyp-URL** _(valfri)_ – visas i de designer som har plats för den.
- **Varumärkesfärg** – knapparnas färg (används inte i Nova och Premium). Knapptexten växlar mellan mörk och ljus så att den förblir läsbar.
- **Placering** – breda designer: logotyp och knappar till höger eller vänster. Nova och Premium: nedre högra eller vänstra hörnet. Popup är alltid centrerad.
- **Nödvändiga cookies** – strikt nödvändiga cookies som alltid är tillåtna, till exempel en sessionscookie som `PHPSESSID`.
- **Partnerdomäner** – andra domäner du äger som ska dela besökarens samtycke, så att de inte tillfrågas två gånger.

> Efter ett designbyte är installationskoden densamma – bannern läser sin konfiguration vid varje sidvisning.

Relaterat: [Installera koden](help:install-code)
