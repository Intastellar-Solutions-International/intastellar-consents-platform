---
title: Bots présumés
summary: Ce qui est considéré comme un bot, pourquoi il est exclu par défaut et comment l'inclure.
tags: bots, robots, crawler, centre de données, filtre
---
Les robots d'indexation et les vérifications automatiques visitent aussi votre site. Les compter comme visiteurs gonfle le trafic et fait baisser le taux de consentement – c'est pourquoi les deux produits les excluent par défaut.

## Ce qui compte comme bot présumé

- **CMP :** les enregistrements de consentement provenant d'adresses IP d'hébergeurs ou de centres de données.
- **Analytics :** une visite depuis une IP de centre de données **qui n'a jamais donné son plein consentement**. Les robots (chez Google, AWS, Tencent, etc.) n'acceptent jamais le bandeau. Les personnes derrière un VPN ou iCloud Private Relay le font souvent – accepter est un geste humain, ces visites restent donc comptées.

## Un seul réglage pour les deux produits

C'est une seule préférence, activée par défaut, et la modifier à un endroit la modifie partout :

- **CMP :** l'interrupteur **Exclure les bots présumés** en haut de l'accueil, de Conformité et du journal d'audit.
- **Accueil Analytics :** **Inclure les bots / Exclure les bots** dans la ligne sous le graphique.
- **Vue en direct :** **Les afficher / Les masquer** sous le graphique d'activité, avec le nombre de visites masquées.

> Les événements personnalisés et les clics ne sont pas filtrés : ces enregistrements ne stockent pas le type de réseau. Les bots en génèrent rarement.
