---
title: Bannerdesign og innstillinger
summary: De fem bannerdesignene, og hva hver innstilling under Legg til domene gjør.
tags: banner, design, stil, farge, logo, partnerdomener
---
Du velger bannerets utseende når du legger til et domene. Innstillingen lagres som `design` i domenets bannerkonfigurasjon.

## Design

- **Popup** (`overlay`) – et kompakt kort nederst i midten. Det mest kjente samtykkemønsteret og standarden.
- **Bred** (`banner`) – en stripe i full bredde, med logo og knapper i et sidepanel.
- **Bred V2** (`bannerV2`) – den oppdaterte brede stripen med sidepanel.
- **Nova** (`nova`) – et kort i marineblått og gull med et svevende informasjonskapselmerke.
- **Premium** (`premium`) – et enkelt, nøytralt kort som ikke er i veien.

Nova og Premium bruker egne faste farger, så merkevarefargen gjelder ikke for dem.

## Innstillinger

- **URL til personvernerklæring** – lenket fra banneret, åpnes i en ny fane.
- **Firmanavn** – vises i bannerteksten.
- **Logo-URL** _(valgfri)_ – vises i designene som har plass til den.
- **Merkevarefarge** – fargen på knappene (brukes ikke i Nova og Premium). Knappeteksten veksler mellom mørk og lys, slik at den forblir lesbar.
- **Plassering** – brede design: logo og knapper til høyre eller venstre. Nova og Premium: nedre høyre eller venstre hjørne. Popup er alltid sentrert.
- **Nødvendige informasjonskapsler** – strengt nødvendige informasjonskapsler som alltid er tillatt, for eksempel en øktinformasjonskapsel som `PHPSESSID`.
- **Partnerdomener** – andre domener du eier som skal dele den besøkendes samtykke, slik at de ikke blir spurt to ganger.

> Etter et designbytte er installasjonskoden den samme – banneret leser konfigurasjonen sin ved hver sidevisning.

Relatert: [Installer koden](help:install-code)
