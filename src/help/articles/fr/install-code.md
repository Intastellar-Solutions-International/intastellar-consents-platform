---
title: Installer le code
summary: Un seul extrait dans l'en-tête de page charge le bandeau cookies et le traceur Analytics.
tags: extrait, script, installer, en-tête
---
Ajoutez le code d'installation dans le `<head>` de **chaque page**, avant tout autre script qui dépose des cookies. Le bandeau doit se charger en premier pour retenir les autres cookies jusqu'à ce que le visiteur ait choisi.

## Ce que contient le code

- La **configuration du bandeau** pour votre domaine et le **script du bandeau**.
- Si Analytics est activé pour le domaine : le **traceur Analytics** avec votre clé de site (`data-site="…"`).

Le traceur lit le choix du visiteur dans le bandeau : aucune seconde solution de consentement n'est nécessaire.

## Où le trouver

- **Commencer → Installer sur votre site** – choisissez le domaine ; si Analytics est désactivé, **Activer Analytics** ajoute le traceur au code.
- **Ajouter un domaine** – après l'enregistrement, cochez **Installer aussi Analytics** pour obtenir directement le code combiné.
- **Paramètres → Script Analytics** – uniquement la ligne du traceur, pour les sites qui ont déjà le bandeau.

> Code modifié ? Il peut falloir quelques minutes avant que le premier consentement ou la première visite n'apparaisse et que l'étape correspondante de Commencer soit cochée.
