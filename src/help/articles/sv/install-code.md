---
title: Installera koden
summary: Ett kodavsnitt i sidhuvudet laddar cookiebannern och Analytics-spåraren.
tags: kodavsnitt, skript, installera, head
---
Lägg installationskoden i `<head>` på **varje sida**, före alla andra skript som sätter cookies. Bannern måste laddas först så att den kan hålla tillbaka andra cookies tills besökaren har bestämt sig.

## Vad koden innehåller

- **Bannerkonfigurationen** för din domän och **bannerskriptet**.
- Om Analytics är påslaget för domänen: **Analytics-spåraren** med din webbplatsnyckel (`data-site="…"`).

Spåraren läser besökarens val från bannern, så du behöver ingen andra samtyckeslösning.

## Var du hittar den

- **Kom igång → Installera på din webbplats** – välj domän; om Analytics är avstängt lägger **Slå på Analytics** till spåraren i koden.
- **Lägg till domän** – kryssa i **Installera även Analytics** efter att ha sparat för att få den kombinerade koden direkt.
- **Inställningar → Analytics-skript** – bara spårarraden, för webbplatser som redan har bannern.

> Ändrat koden? Det kan ta några minuter innan det första samtycket eller besöket syns och motsvarande steg i Kom igång bockas av.
