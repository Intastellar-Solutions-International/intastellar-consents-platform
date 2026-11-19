---
title: De code installeren
summary: Eén codefragment in de paginakop laadt de cookiebanner en de Analytics-tracker.
tags: codefragment, script, installeren, head
---
Plaats de installatiecode in de `<head>` van **elke pagina**, vóór elk ander script dat cookies plaatst. De banner moet als eerste laden, zodat hij andere cookies kan tegenhouden tot de bezoeker heeft gekozen.

## Wat de code bevat

- De **bannerconfiguratie** voor je domein en het **bannerscript**.
- Als Analytics aan staat voor het domein: de **Analytics-tracker** met je sitesleutel (`data-site="…"`).

De tracker leest de keuze van de bezoeker uit de banner, dus een tweede toestemmingsoplossing is niet nodig.

## Waar je hem vindt

- **Aan de slag → Installeer op je website** – kies het domein; staat Analytics uit, dan voegt **Analytics aanzetten** de tracker aan de code toe.
- **Domein toevoegen** – vink na het opslaan **Ook Analytics installeren** aan om meteen de gecombineerde code te krijgen.
- **Instellingen → Analytics-script** – alleen de trackerregel, voor websites die de banner al hebben.

> Code aangepast? Het kan een paar minuten duren voordat de eerste toestemming of het eerste bezoek verschijnt en de bijbehorende stap in Aan de slag wordt afgevinkt.
