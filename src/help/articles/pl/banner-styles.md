---
title: Wygląd i ustawienia banera
summary: Pięć wersji wyglądu banera i działanie każdego ustawienia w Dodaj domenę.
tags: baner, wygląd, styl, kolor, logo, domeny partnerskie
---
Wygląd banera wybierasz podczas dodawania domeny. Ustawienie jest zapisywane jako `design` w konfiguracji banera domeny.

## Wersje wyglądu

- **Okienko** (`overlay`) – zwarta karta na dole pośrodku. Najbardziej znany wzór zgody i ustawienie domyślne.
- **Szeroki** (`banner`) – pasek na całą szerokość, z logo i przyciskami w panelu bocznym.
- **Szeroki V2** (`bannerV2`) – odświeżony szeroki pasek z panelem bocznym.
- **Nova** (`nova`) – granatowo-złota karta z unoszącą się plakietką cookie.
- **Premium** (`premium`) – prosta, neutralna karta, która nie przeszkadza.

Nova i Premium mają własne stałe kolory, więc kolor marki ich nie dotyczy.

## Ustawienia

- **Adres polityki prywatności** – link z banera, otwiera się w nowej karcie.
- **Nazwa firmy** – wyświetlana w tekście banera.
- **Adres logo** _(opcjonalnie)_ – wyświetlane w wersjach, w których jest na nie miejsce.
- **Kolor marki** – kolor przycisków (nieużywany w Nova i Premium). Tekst przycisków zmienia się z ciemnego na jasny, aby pozostał czytelny.
- **Położenie** – wersje szerokie: logo i przyciski po prawej lub po lewej. Nova i Premium: prawy lub lewy dolny róg. Okienko jest zawsze wyśrodkowane.
- **Niezbędne pliki cookie** – ściśle niezbędne pliki cookie, zawsze dozwolone, np. plik sesji taki jak `PHPSESSID`.
- **Domeny partnerskie** – inne Twoje domeny, które mają współdzielić zgodę odwiedzającego, aby nie pytać go dwa razy.

> Po zmianie wyglądu kod instalacyjny pozostaje taki sam – baner odczytuje swoją konfigurację przy każdym wyświetleniu strony.

Powiązane: [Instalacja kodu](help:install-code)
