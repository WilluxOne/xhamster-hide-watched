# PROJECT_CONTEXT: xHamster Watched Video Hider (Tampermonkey Userscript)

**Data utworzenia:** 2026-11-17  
**Autor:** WilluxOne  
**Środowisko:** Windows 11 x64, Node.js v24.20.0, Tampermonkey (Brave/Chromium/Firefox)  
**Stan projektu:** Zakończony pomyślnie (Etap v1.2.0 – otwarcie w nowej karcie pod prawym klikiem z GM_openInTab)

---

## 1. Cel Projektu
Stworzenie zaawansowanego, a zarazem prostego w obsłudze skryptu Tampermonkey przeznaczonego dla serwisu `https://xhamster.com` oraz wszystkich jego podstron (kategorie, tagi, wyniki wyszukiwania, kanały, podgląd wideo, subdomeny).
Skrypt identyfikuje pozycje oznaczone jako już obejrzane (**Watched**) oraz oferuje dedykowane menu kontekstowe pod prawym przyciskiem myszy (otwarcie filmu w nowej karcie bez blokad popup, ręczne oznaczanie filmu jako obejrzany/nieobejrzany, kopiowanie linku). Automatycznie ukrywa je lub wyszarza, zapobiegając zaśmiecaniu katalogu treściami, które użytkownik już widział. Posiada nowoczesny pływający interfejs UI ze statystykami na żywo oraz obsługę automatycznych aktualizacji z GitHuba (`@updateURL`, `@downloadURL`).

---

## 2. Architektura i Przepływ Danych

1. **Storage Manager:**
   - Dwuwarstwowy mechanizm trwałości konfiguracji: `GM_getValue` / `GM_setValue` z automatycznym fallbackiem na `localStorage`.
   - Zapamiętywane stany: `enabled` (boolean), `mode` ('hide' | 'dim'), `minimized` (boolean).

2. **Detekcja i Selektory DOM:**
   - Identyfikacja kontenerów wideo: `.thumb-list__item`, `.video-thumb`, `[data-video-id]`, `[data-role="video-thumb"]`, `article[data-role="video-thumb"]`, `.thumb-item`.
   - Wykrywanie wskaźników Watched:
     - Atrybut data: `[data-role="video-watched"]`
     - Klasy BEM: `.thumb-image-container__watched`, `[class*="thumb-image-container__watched"]`, `[class*="video-watched"]`
     - Analiza tekstu węzłów podrzędnych: `"Watched"`, `"Obejrzane"`.
   - Tagowanie przetworzonych elementów unikalnym atrybutem `data-xh-watched="true"` oraz klasą `xh-watched-item`.

3. **Silnik Ukrywania CSS (Flicker-Free):**
   - Wstrzyknięcie dedykowanego arkusza stylów wykorzystującego selektory `:has()`, co eliminuje opóźnienia i migotanie kafelków przed wykonaniem pętli JavaScript.
   - Dynamiczne klasy na `<body>`: `xh-hide-watched-active`, `xh-mode-hide`, `xh-mode-dim`.

4. **Dynamiczny Obserwator (MutationObserver & SPA Routing):**
   - `MutationObserver` monitorujący zmiany struktury DOM z mechanizmem debouncingu (`100ms`).
   - Przechwytywanie zdarzeń `popstate`, `hashchange` oraz nadpisanie `history.pushState` dla natychmiastowego skanowania przy przejściach wewnątrz aplikacji SPA.

5. **Interfejs Użytkownika (Floating Widget UI):**
   - Dyskretny pasek "Pill" w prawym dolnym rogu (`bottom: 24px; right: 24px; z-index: 99999999`) ze wskaźnikiem stanu (zielona/czerwona dioda) oraz licznikiem ukrytych pozycji.
   - Rozwijany modal opcji (trybik ⚙️): przełącznik ON/OFF, wybór trybu (Ukrycie / Dim), licznik na żywo (ukryte / nowe / suma), przycisk odświeżenia skanu oraz link do aktualizacji na GitHubie.
   - Rejestracja natywnych poleceń w menu Tampermonkey (`GM_registerMenuCommand`).

---

## 3. Instrukcje Budowania, Testowania i Publikacji

### Uruchomienie testów jednostkowych:
Wymagane środowisko: Node.js >= 18 (zainstalowane v24.20.0).
```powershell
cd D:\Projekty\xhamster-hide-watched
npm test
```
Zestaw testów weryfikuje:
- 100% poprawność detekcji filmów z etykietą Watched na rzeczywistym wycinku HTML serwisu.
- Poprawne nadawanie atrybutów `data-xh-watched`.
- Przełączanie klas na `body` przy zmianie stanu (aktywny / nieaktywny) oraz trybu (`hide` vs `dim`).
- Reakcję `MutationObserver` na dynamicznie dołączane karty wideo.
- Poprawność generowania i zdarzeń wstrzykiwanego widżetu UI.
- Przypadki brzegowe: 0 obejrzanych filmów oraz alternatywne wersje językowe ("Obejrzane").

### Publikacja:
Plik gotowy do instalacji w Tampermonkey znajduje się w folderze:
`D:\Projekty\xhamster-hide-watched\1. Kompilacja\xhamster-hide-watched.user.js`
Na Pulpicie utworzono skrót:
`C:\Users\Willux\Desktop\Projekty\xHamster Watched Hider.lnk`

---

## 4. Repozytorium Git i Aktualizacje z GitHub

- **Ścieżka zdalna:** `https://github.com/WilluxOne/xhamster-hide-watched` (Repozytorium Publiczne – autoryzowane przez użytkownika)
- **Bezpośredni link instalacyjny:** `https://raw.githubusercontent.com/WilluxOne/xhamster-hide-watched/main/xhamster-hide-watched.user.js`
- **Konfiguracja aktualizacji Tampermonkey:**
  - `@updateURL`: `https://raw.githubusercontent.com/WilluxOne/xhamster-hide-watched/main/xhamster-hide-watched.user.js`
  - `@downloadURL`: `https://raw.githubusercontent.com/WilluxOne/xhamster-hide-watched/main/xhamster-hide-watched.user.js`
- **Działanie aktualizacji:** Dzięki widoczności publicznej Tampermonkey automatycznie i natywnie pobiera aktualizacje przy zmianie wersji w nagłówku skryptu bez konieczności podawania tokenów.

---

## 5. Historia Wersji i Zrealizowane Zadania

- **v1.2.0 (2026-11-17):**
  - Dodanie i wyeksponowanie opcji „Otwórz w nowej karcie” na pierwszym miejscu menu kontekstowego PPM.
  - Implementacja odpornego mechanizmu ekstrakcji URL (`getVideoUrl`) obsługującego karty będące tagami `<a>`, linki zagnieżdżone, relatywne ścieżki i fallbacki `data-video-id`.
  - Integracja z `@grant GM_openInTab` gwarantująca bezproblemowe otwieranie kart z ominięciem blokad wyskakujących okienek (popup blocker) przeglądarki Brave/Chromium.
  - Rozszerzenie zestawu testów do 13 przypadków (100% pass).
- **v1.1.0 (2026-11-17):**
  - Dodanie obsługi zdarzenia `contextmenu` (prawy przycisk myszy) na kafelkach wideo.
  - Implementacja dedykowanego ciemnego menu kontekstowego z opcją „Oznacz jako obejrzane (Ukryj)” oraz „Cofnij oznaczenie”.
  - Trwały zapis ręcznie oznaczonych pozycji w `Storage` (Set ID / slugów).
  - Dodanie do panelu ustawień licznika ręcznie oznaczonych pozycji i przycisku resetu.
  - Przepustka `Shift + Prawy klik` dla zachowania standardowego menu przeglądarki.
  - Rozszerzenie zestawu testów do 12 przypadków testowych (100% pass).
- **v1.0.0 (2026-11-17):**
  - Implementacja rdzenia detekcji (atrybuty, BEM, tekst).
  - Implementacja silnika stylów CSS `:has()`.
  - Stworzenie eleganckiego pływającego interfejsu użytkownika w stylu dark-mode / glassmorphism.
  - Implementacja obsługi `MutationObserver` i SPA.
  - Opracowanie zestawu 8 testów automatycznych w Node.js (wszystkie zaliczone sukcesem).
  - Zbudowanie wydania w `1. Kompilacja/` i utworzenie skrótu na Pulpicie.
