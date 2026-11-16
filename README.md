# xHamster Watched Video Hider (Tampermonkey Userscript)

Skrypt Tampermonkey do automatycznego wykrywania i ukrywania filmów oznaczonych etykietą **Watched** (Obejrzane) na stronie `https://xhamster.com` oraz wszystkich jej podstronach (strona główna, wyszukiwarka, kategorie, tagi, kanały twórców, podgląd wideo i subdomeny regionalne).

## Główne Funkcje

- **Wielopoziomowe wykrywanie:**
  - Standardowe atrybuty: `[data-role="video-watched"]`
  - Klasy BEM: `.thumb-image-container__watched`, `[class*="video-watched"]`
  - Etykiety tekstowe w badge'ach: `"Watched"`, `"Obejrzane"`
- **Błyskawiczne ukrywanie bez migotania:** Wykorzystanie selektorów CSS `:has()` w silniku przeglądarki Chromium / Brave.
- **Wsparcie dla SPA i Infinite Scroll:** Monitorowanie doładowywania kolejnych kafelków przez zoptymalizowany `MutationObserver` z debouncingiem (`100ms`).
- **Pływający interfejs (Floating UI Widget):**
  - Kompaktowy pasek (Pill Bar) w prawym dolnym rogu ekranu z licznikiem ukrytych filmów w czasie rzeczywistym.
  - Szybkie przełączanie ON/OFF jednym kliknięciem.
  - Rozwijany panel ustawień (trybik ⚙️):
    - Wybór trybu: **Ukryj całkowicie** (`display: none`) lub **Wyszarz/Półprzezroczysty** (Dim).
    - Statystyki na żywo: liczba ukrytych filmów, nowych filmów i łączna liczba na stronie.
    - Przycisk wymuszenia ponownego skanowania.
    - Bezpośredni link do aktualizacji na GitHubie.
- **Integracja z menu Tampermonkey:** Skróty szybkiego przełączania i wymuszenia skanowania w menu rozszerzenia (`GM_registerMenuCommand`).
- **Aktualizacje z GitHuba:** Wbudowane nagłówki `@updateURL` oraz `@downloadURL` umożliwiające Tampermonkey automatyczne sprawdzanie i pobieranie nowych wydań z repozytorium GitHub.

---

## Instalacja w Tampermonkey

1. Upewnij się, że masz zainstalowane rozszerzenie **Tampermonkey** w swojej przeglądarce (Brave, Chrome, Firefox, Edge).
2. Otwórz panel Tampermonkey -> **Utwórz nowy skrypt**.
3. Wklej zawartość pliku `xhamster-hide-watched.user.js` (lub otwórz plik bezpośrednio w przeglądarce).
4. Kliknij **Plik -> Zapisz** (lub `Ctrl + S`).
5. Wejdź na `https://xhamster.com` – w prawym dolnym rogu pojawi się dyskretny panel z licznikiem obejrzanych pozycji.

---

## Aktualizacje z GitHuba

W nagłówku skryptu skonfigurowano:
```javascript
// @updateURL    https://raw.githubusercontent.com/WilluxOne/xhamster-hide-watched/main/xhamster-hide-watched.user.js
// @downloadURL  https://raw.githubusercontent.com/WilluxOne/xhamster-hide-watched/main/xhamster-hide-watched.user.js
```

### Tryb repozytorium prywatnego (Domyślny dla WilluxOne):
W przypadku repozytorium prywatnego na GitHubie, aby Tampermonkey mógł pobierać aktualizacje:
- W Tampermonkey przejdź do: **Ustawienia** -> **Tryb konfiguracji: Zaawansowany** -> sekcja **Pobieranie / Aktualizacje**.
- Dodaj swój token GitHub (Personal Access Token) z uprawnieniem do odczytu repozytoriów (`repo` / `contents:read`).

---

## Struktura Projektu

- `xhamster-hide-watched.user.js` – Główny kod produkcyjny skryptu userscript.
- `1. Kompilacja/` – Gotowy do bezpośredniego użycia plik instalacyjny.
- `tests/` – Zestaw testów jednostkowych i symulacji DOM w Node.js (`npm test`).
- `PROJECT_CONTEXT.md` – Pełny stan techniczny i dokumentacja cyklu życia projektu.
