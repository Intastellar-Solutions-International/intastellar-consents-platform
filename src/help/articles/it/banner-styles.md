---
title: Design e impostazioni del banner
summary: I cinque design del banner e cosa fa ogni impostazione in Aggiungi dominio.
tags: banner, design, stile, colore, logo, domini partner
---
Scegli l'aspetto del banner quando aggiungi un dominio. L'impostazione viene salvata come `design` nella configurazione del banner del dominio.

## Design

- **Popup** (`overlay`): una scheda compatta in basso al centro. Lo schema di consenso più familiare e quello predefinito.
- **Largo** (`banner`): una barra a tutta larghezza, con logo e pulsanti in un pannello laterale.
- **Largo V2** (`bannerV2`): la barra larga aggiornata con pannello laterale.
- **Nova** (`nova`): una scheda blu navy e oro con un badge cookie fluttuante.
- **Premium** (`premium`): una scheda semplice e neutra che non disturba.

Nova e Premium usano colori fissi propri, quindi il colore del brand non si applica a loro.

## Impostazioni

- **URL dell'informativa privacy**: collegato dal banner, si apre in una nuova scheda.
- **Nome dell'azienda**: compare nel testo del banner.
- **URL del logo** _(facoltativo)_: compare nei design che hanno spazio.
- **Colore del brand**: il colore dei pulsanti (non usato da Nova e Premium). Il testo dei pulsanti passa da scuro a chiaro per restare leggibile.
- **Posizione**: design larghi: logo e pulsanti a destra o a sinistra. Nova e Premium: angolo in basso a destra o a sinistra. Il popup è sempre centrato.
- **Cookie necessari**: cookie strettamente necessari, sempre consentiti, ad esempio un cookie di sessione come `PHPSESSID`.
- **Domini partner**: altri tuoi domini che devono condividere il consenso del visitatore, così non gli viene chiesto due volte.

> Dopo un cambio di design il codice di installazione resta lo stesso: il banner legge la sua configurazione a ogni visualizzazione di pagina.

Correlato: [Installare il codice](help:install-code)
