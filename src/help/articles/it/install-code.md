---
title: Installare il codice
summary: Un solo snippet nell'intestazione della pagina carica il banner dei cookie e il tracker di Analytics.
tags: snippet, script, installare, head
---
Aggiungi il codice di installazione nell'`<head>` di **ogni pagina**, prima di qualsiasi altro script che imposta cookie. Il banner deve caricarsi per primo, così può trattenere gli altri cookie finché il visitatore non ha scelto.

## Cosa contiene il codice

- La **configurazione del banner** per il tuo dominio e lo **script del banner**.
- Se Analytics è attivo per il dominio: il **tracker di Analytics** con la tua chiave del sito (`data-site="…"`).

Il tracker legge la scelta del visitatore dal banner, quindi non serve una seconda soluzione di consenso.

## Dove trovarlo

- **Inizia → Installa sul tuo sito**: scegli il dominio; se Analytics è disattivato, **Attiva Analytics** aggiunge il tracker al codice.
- **Aggiungi dominio**: dopo il salvataggio, spunta **Installa anche Analytics** per ottenere subito il codice combinato.
- **Impostazioni → Script di Analytics**: solo la riga del tracker, per i siti che hanno già il banner.

> Hai modificato il codice? Possono servire alcuni minuti prima che compaiano il primo consenso o la prima visita e che il passaggio corrispondente in Inizia venga spuntato.
