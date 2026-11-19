---
title: Misstänkta botar
summary: Vad som räknas som en bot, varför de utesluts som standard och hur du tar med dem.
tags: botar, crawler, datacenter, filter
---
Crawlers och automatiska kontroller besöker också din webbplats. Om de räknas som besökare ser trafiken större ut och samtyckesgraden lägre ut än den är – därför utesluter båda produkterna dem som standard.

## Vad som räknas som en misstänkt bot

- **CMP:** samtyckesposter från hosting- eller datacenter-IP-adresser.
- **Analytics:** ett besök från en datacenter-IP **som aldrig gav fullt samtycke**. Crawlers (hos Google, AWS, Tencent med flera) accepterar aldrig bannern. Personer bakom en VPN eller iCloud Private Relay gör det ofta – att acceptera är en mänsklig handling, så de besöken räknas fortfarande.

## En inställning för båda produkterna

Det är en inställning, påslagen som standard, och en ändring på ett ställe gäller överallt:

- **CMP:** reglaget **Uteslut misstänkta botar** överst på startsidan, Compliance och granskningsloggen.
- **Analytics startsida:** **Ta med botar / Uteslut botar** i raden under diagrammet.
- **Livevy:** **Visa dem / Dölj dem** under aktivitetsdiagrammet, med antalet dolda träffar.

> Anpassade händelser och klick filtreras inte: de posterna sparar inte nätverkstypen. Botar skapar dem sällan.
