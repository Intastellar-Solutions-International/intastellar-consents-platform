---
title: Podejrzane boty
summary: Co uznaje się za bota, dlaczego jest domyślnie wykluczany i jak go uwzględnić.
tags: boty, roboty, centrum danych, filtr
---
Roboty indeksujące i automatyczne testy również odwiedzają Twoją stronę. Liczenie ich jako odwiedzających zawyża ruch i zaniża wskaźnik zgód – dlatego oba produkty domyślnie je pomijają.

## Co uznaje się za podejrzanego bota

- **CMP:** rekordy zgód z adresów IP hostingu lub centrów danych.
- **Analytics:** wizyta z adresu IP centrum danych, **która nigdy nie udzieliła pełnej zgody**. Roboty (w Google, AWS, Tencent i podobnych) nigdy nie akceptują banera. Ludzie korzystający z VPN lub iCloud Private Relay często tak – akceptacja to ludzkie działanie, więc te wizyty są nadal liczone.

## Jeden przełącznik dla obu produktów

To jedno ustawienie, domyślnie włączone, a zmiana w jednym miejscu obowiązuje wszędzie:

- **CMP:** przełącznik **Wyklucz podejrzane boty** u góry strony głównej, Zgodności i dziennika audytu.
- **Strona główna Analytics:** **Uwzględnij boty / Wyklucz boty** w wierszu pod wykresem.
- **Widok na żywo:** **Pokaż je / Ukryj je** pod wykresem aktywności, z liczbą ukrytych wejść.

> Zdarzenia niestandardowe i kliknięcia nie są filtrowane: te rekordy nie zapisują typu sieci. Boty rzadko je generują.
