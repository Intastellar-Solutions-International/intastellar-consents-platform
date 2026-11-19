---
title: Designs et réglages du bandeau
summary: Les cinq designs de bandeau et le rôle de chaque réglage dans Ajouter un domaine.
tags: bandeau, design, style, couleur, logo, domaines partenaires
---
Vous choisissez l'apparence du bandeau en ajoutant un domaine. Le réglage est enregistré sous `design` dans la configuration du bandeau du domaine.

## Designs

- **Popup** (`overlay`) – une carte compacte en bas au centre. Le modèle de consentement le plus familier, et celui par défaut.
- **Large** (`banner`) – une barre sur toute la largeur, avec logo et boutons dans un panneau latéral.
- **Large V2** (`bannerV2`) – la barre large mise à jour, avec panneau latéral.
- **Nova** (`nova`) – une carte bleu marine et or avec un badge cookie flottant.
- **Premium** (`premium`) – une carte simple et neutre qui ne gêne pas.

Nova et Premium utilisent leurs propres couleurs fixes : la couleur de marque ne s'y applique pas.

## Réglages

- **URL de la politique de confidentialité** – liée depuis le bandeau, s'ouvre dans un nouvel onglet.
- **Nom de l'entreprise** – affiché dans le texte du bandeau.
- **URL du logo** _(facultatif)_ – affiché par les designs qui ont la place.
- **Couleur de marque** – la couleur des boutons (non utilisée par Nova et Premium). Le texte des boutons passe du foncé au clair pour rester lisible.
- **Position** – designs larges : logo et boutons à droite ou à gauche. Nova et Premium : coin inférieur droit ou gauche. Le popup est toujours centré.
- **Cookies nécessaires** – cookies strictement nécessaires, toujours autorisés, par exemple un cookie de session comme `PHPSESSID`.
- **Domaines partenaires** – vos autres domaines qui doivent partager le consentement du visiteur, pour qu'il ne soit pas sollicité deux fois.

> Après un changement de design, le code d'installation reste le même – le bandeau lit sa configuration à chaque page vue.

Voir aussi : [Installer le code](help:install-code)
