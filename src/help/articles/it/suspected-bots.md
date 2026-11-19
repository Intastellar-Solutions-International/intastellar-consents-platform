---
title: Bot sospetti
summary: Cosa conta come bot, perché è escluso per impostazione predefinita e come includerlo.
tags: bot, crawler, data center, filtro
---
Anche crawler e controlli automatici visitano il tuo sito. Contarli come visitatori fa sembrare il traffico più alto e il tasso di consenso più basso di quanto siano: per questo entrambi i prodotti li escludono per impostazione predefinita.

## Cosa conta come bot sospetto

- **CMP:** registrazioni di consenso da indirizzi IP di hosting o data center.
- **Analytics:** una visita da un IP di data center **che non ha mai dato il consenso completo**. I crawler (su Google, AWS, Tencent e simili) non accettano mai il banner. Le persone dietro una VPN o iCloud Private Relay spesso sì: accettare è un gesto umano, quindi quelle visite continuano a essere contate.

## Un solo interruttore per entrambi i prodotti

È un'unica preferenza, attiva per impostazione predefinita, e cambiarla in un punto la cambia ovunque:

- **CMP:** l'interruttore **Escludi bot sospetti** in alto su Home, Conformità e registro di audit.
- **Home di Analytics:** **Includi bot / Escludi bot** nella riga sotto il grafico.
- **Vista in tempo reale:** **Mostrali / Nascondili** sotto il grafico delle attività, con il numero di visite nascoste.

> Eventi personalizzati e clic non vengono filtrati: quei record non memorizzano il tipo di rete. I bot li generano raramente.
