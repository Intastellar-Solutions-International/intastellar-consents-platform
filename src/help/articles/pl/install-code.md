---
title: Instalacja kodu
summary: Jeden fragment w nagłówku strony wczytuje baner plików cookie i tracker Analytics.
tags: fragment kodu, skrypt, instalacja, head
---
Dodaj kod instalacyjny w sekcji `<head>` **każdej strony**, przed wszystkimi innymi skryptami ustawiającymi pliki cookie. Baner musi wczytać się jako pierwszy, aby mógł wstrzymać inne pliki cookie, dopóki odwiedzający nie dokona wyboru.

## Co zawiera kod

- **Konfigurację banera** dla Twojej domeny i **skrypt banera**.
- Jeśli Analytics jest włączone dla domeny: **tracker Analytics** z kluczem witryny (`data-site="…"`).

Tracker odczytuje wybór odwiedzającego z banera, więc nie potrzebujesz drugiego rozwiązania do zgód.

## Gdzie go znaleźć

- **Rozpocznij → Zainstaluj na stronie** – wybierz domenę; jeśli Analytics jest wyłączone, **Włącz Analytics** dodaje tracker do kodu.
- **Dodaj domenę** – po zapisaniu zaznacz **Zainstaluj też Analytics**, aby od razu otrzymać połączony kod.
- **Ustawienia → Skrypt Analytics** – tylko wiersz trackera, dla stron, które mają już baner.

> Zmieniono kod? Może minąć kilka minut, zanim pojawi się pierwsza zgoda lub wizyta, a odpowiedni krok w Rozpocznij zostanie odhaczony.
