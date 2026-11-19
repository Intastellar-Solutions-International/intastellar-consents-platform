---
title: Vermutete Bots
summary: Was als Bot gilt, warum Bots standardmäßig ausgeschlossen sind und wie Sie sie einbeziehen.
tags: bots, crawler, rechenzentrum, filter
---
Auch Crawler und automatische Prüfungen besuchen Ihre Website. Zählt man sie als Besucher, wirkt der Traffic größer und die Einwilligungsrate niedriger, als sie ist – deshalb lassen beide Produkte sie standardmäßig weg.

## Was als vermuteter Bot gilt

- **CMP:** Einwilligungsdatensätze von Hosting- oder Rechenzentrums-IP-Adressen.
- **Analytics:** ein Besuch von einer Rechenzentrums-IP, **der nie die volle Einwilligung gegeben hat**. Crawler (bei Google, AWS, Tencent u. ä.) stimmen nie zu. Menschen hinter einem VPN oder iCloud Private Relay tun es oft – Zustimmen ist eine menschliche Handlung, daher zählen diese Besuche weiter.

## Ein Schalter für beide Produkte

Es ist eine Einstellung, standardmäßig an, und eine Änderung an einer Stelle gilt überall:

- **CMP:** der Schalter **Vermutete Bots ausschließen** oben auf Startseite, Compliance und Audit-Log.
- **Analytics-Startseite:** **Bots einbeziehen / Bots ausschließen** in der Zeile unter dem Diagramm.
- **Live-Ansicht:** **Anzeigen / Ausblenden** unter dem Aktivitätsdiagramm, mit der Anzahl ausgeblendeter Aufrufe.

> Benutzerdefinierte Ereignisse und Klicks werden nicht gefiltert: Diese Datensätze speichern den Netzwerktyp nicht. Bots erzeugen sie selten.
