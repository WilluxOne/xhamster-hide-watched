const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

describe('XHamster Watched Video Hider - Core Engine Tests', () => {
  let dom;
  let document;
  let window;
  let XHamsterWatchedHider;

  beforeEach(() => {
    const htmlFixture = fs.readFileSync(path.join(__dirname, 'fixtures', 'xhamster_sample.html'), 'utf-8');
    dom = new JSDOM(htmlFixture, {
      url: 'https://xhamster.com/search/test',
      runScripts: 'dangerously'
    });
    window = dom.window;
    document = window.document;
    if (window.localStorage) {
      window.localStorage.clear();
    }

    delete require.cache[require.resolve('../xhamster-hide-watched.user.js')];
    XHamsterWatchedHider = require('../xhamster-hide-watched.user.js').XHamsterWatchedHider;
  });

  test('Powinien poprawnie wykryć 4 obejrzane filmy z 6 łącznych na stronie testowej', () => {
    const hider = new XHamsterWatchedHider({
      window,
      document,
      autoStart: false
    });

    const stats = hider.scan();
    assert.equal(stats.totalVideos, 6, 'Łączna liczba wideo powinna wynosić 6');
    assert.equal(stats.watchedCount, 4, 'Liczba obejrzanych wideo powinna wynosić 4');
    assert.equal(stats.unwatchedCount, 2, 'Liczba nieobejrzanych wideo powinna wynosić 2');
  });

  test('Powinien nadać atrybut data-xh-watched="true" wszystkim kartom obejrzanym', () => {
    const hider = new XHamsterWatchedHider({
      window,
      document,
      autoStart: false
    });

    hider.scan();

    const item1 = document.querySelector('[data-video-id="101"]');
    const item2 = document.querySelector('[data-video-id="102"]');
    const item3 = document.querySelector('[data-video-id="103"]');
    const item4 = document.querySelector('[data-video-id="104"]');
    const item5 = document.querySelector('[data-video-id="105"]');
    const item6 = document.querySelector('[data-video-id="106"]');

    assert.equal(item1.getAttribute('data-xh-watched'), 'true', 'Film 101 powinien być oznaczony jako obejrzany');
    assert.equal(item2.getAttribute('data-xh-watched'), 'true', 'Film 102 powinien być oznaczony jako obejrzany');
    assert.equal(item3.getAttribute('data-xh-watched'), null, 'Film 103 NIE powinien być oznaczony');
    assert.equal(item4.getAttribute('data-xh-watched'), 'true', 'Film 104 powinien być oznaczony jako obejrzany');
    assert.equal(item5.getAttribute('data-xh-watched'), null, 'Film 105 NIE powinien być oznaczony');
    assert.equal(item6.getAttribute('data-xh-watched'), 'true', 'Film 106 powinien być oznaczony jako obejrzany');
  });

  test('Włączenie ukrywania powinno dodać klasę xh-hide-watched-active na body', () => {
    const hider = new XHamsterWatchedHider({
      window,
      document,
      autoStart: false
    });

    hider.setEnabled(true);
    assert.equal(document.body.classList.contains('xh-hide-watched-active'), true);

    hider.setEnabled(false);
    assert.equal(document.body.classList.contains('xh-hide-watched-active'), false);
  });

  test('Przełączanie trybu (hide vs dim) powinno aktualizować klasę na body', () => {
    const hider = new XHamsterWatchedHider({
      window,
      document,
      autoStart: false
    });

    hider.setMode('dim');
    assert.equal(document.body.classList.contains('xh-mode-dim'), true);
    assert.equal(document.body.classList.contains('xh-mode-hide'), false);

    hider.setMode('hide');
    assert.equal(document.body.classList.contains('xh-mode-hide'), true);
    assert.equal(document.body.classList.contains('xh-mode-dim'), false);
  });

  test('Powinien dynamicznie obsłużyć nowo dodane węzły przez MutationObserver', async () => {
    const hider = new XHamsterWatchedHider({
      window,
      document,
      autoStart: true
    });

    assert.equal(hider.getStats().watchedCount, 4);

    const container = document.querySelector('.thumb-list');
    const newVideo = document.createElement('div');
    newVideo.className = 'thumb-list__item video-thumb';
    newVideo.setAttribute('data-video-id', '107');
    newVideo.innerHTML = `
      <div class="thumb-image-container">
        <div class="thumb-image-container__watched" data-role="video-watched">Watched</div>
        <div class="thumb-image-container__duration">22:10</div>
      </div>
    `;
    container.appendChild(newVideo);

    await new Promise(resolve => setTimeout(resolve, 50));
    hider.scan();

    assert.equal(hider.getStats().watchedCount, 5, 'Liczba obejrzanych po mutacji powinna wynosić 5');
    assert.equal(newVideo.getAttribute('data-xh-watched'), 'true');

    hider.destroy();
  });

  test('Powinien renderować pływający interfejs UI ze statystykami i kontrolkami', () => {
    const hider = new XHamsterWatchedHider({
      window,
      document,
      autoStart: true
    });

    const widget = document.getElementById('xh-hider-widget');
    assert.ok(widget, 'Pływający widget UI powinien zostać wstrzyknięty do DOM');

    const badge = widget.querySelector('.xh-badge-count');
    assert.ok(badge, 'Badge licznika powinien istnieć');
    assert.equal(badge.textContent, '4', 'Badge powinien wskazywać 4 ukryte filmy');

    const toggleCheckbox = widget.querySelector('#xh-toggle-enabled');
    assert.ok(toggleCheckbox, 'Checkbox przełączania ON/OFF powinien istnieć');

    const pillBtn = widget.querySelector('#xh-toggle-pill');
    assert.ok(pillBtn, 'Przycisk pill powinien istnieć');
    pillBtn.click();
    assert.equal(hider.enabled, false, 'Kliknięcie w pill powinno wyłączyć ukrywanie');
    pillBtn.click();
    assert.equal(hider.enabled, true, 'Ponowne kliknięcie powinno włączyć ukrywanie');

    const modeSelect = widget.querySelector('#xh-mode-select');
    modeSelect.value = 'dim';
    modeSelect.dispatchEvent(new window.Event('change'));
    assert.equal(hider.mode, 'dim', 'Zmiana w select powinna przestawić tryb na dim');

    hider.destroy();
  });

  test('Przypadek brzegowy: Strona z 0 obejrzanymi filmami', () => {
    const watchedBadges = document.querySelectorAll('.thumb-image-container__watched');
    watchedBadges.forEach(b => b.remove());

    const hider = new XHamsterWatchedHider({
      window,
      document,
      autoStart: false
    });

    const stats = hider.scan();
    assert.equal(stats.watchedCount, 0, 'Liczba obejrzanych powinna wynosić 0');
    assert.equal(stats.totalVideos, 6, 'Wszystkie 6 powinny być widoczne');
    assert.equal(stats.unwatchedCount, 6, 'Liczba nieobejrzanych powinna wynosić 6');
  });

  test('Przypadek brzegowy: Etykieta językowa w innym języku (np. Obejrzane)', () => {
    const container = document.querySelector('.thumb-list');
    const plVideo = document.createElement('div');
    plVideo.className = 'thumb-list__item video-thumb';
    plVideo.setAttribute('data-video-id', '201');
    plVideo.innerHTML = `
      <div class="thumb-image-container">
        <span class="custom-badge">Obejrzane</span>
        <span class="duration">11:00</span>
      </div>
    `;
    container.appendChild(plVideo);

    const hider = new XHamsterWatchedHider({
      window,
      document,
      autoStart: false
    });

    hider.scan();
    assert.equal(plVideo.getAttribute('data-xh-watched'), 'true', 'Polskie "Obejrzane" powinno zostać wykryte');
  });

  test('Ręczne oznaczanie filmu jako obejrzany przez markAsWatched', () => {
    const hider = new XHamsterWatchedHider({
      window,
      document,
      autoStart: true
    });

    const item3 = document.querySelector('[data-video-id="103"]');
    assert.equal(item3.getAttribute('data-xh-watched'), null, 'Początkowo film 103 nie jest obejrzany');

    hider.markAsWatched(item3);

    assert.equal(item3.getAttribute('data-xh-watched'), 'true', 'Film 103 powinien otrzymać data-xh-watched="true"');
    assert.equal(hider.isWatchedCard(item3), true, 'isWatchedCard powinno zwrócić true dla filmu 103');
    assert.equal(hider.getStats().watchedCount, 5, 'Liczba obejrzanych powinna wzrosnąć do 5');

    const badge = item3.querySelector('.thumb-image-container__watched');
    assert.ok(badge, 'Powinien zostać dodany wizualny element znacznika Watched');

    hider.destroy();
  });

  test('Cofnięcie ręcznego oznaczenia filmu przez unmarkAsWatched', () => {
    const hider = new XHamsterWatchedHider({
      window,
      document,
      autoStart: true
    });

    const item3 = document.querySelector('[data-video-id="103"]');
    hider.markAsWatched(item3);
    assert.equal(hider.getStats().watchedCount, 5);

    hider.unmarkAsWatched(item3);
    assert.equal(item3.getAttribute('data-xh-watched'), null);
    assert.equal(hider.getStats().watchedCount, 4, 'Liczba obejrzanych powinna spaść z powrotem do 4');

    hider.destroy();
  });

  test('Zdarzenie prawego kliku (contextmenu) powinno wyświetlić Otwórz w nowej karcie oraz Oznacz jako obejrzane', () => {
    const hider = new XHamsterWatchedHider({
      window,
      document,
      autoStart: true
    });

    const item3 = document.querySelector('[data-video-id="103"]');
    const img = item3.querySelector('img');

    const contextEvent = new window.MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      clientX: 150,
      clientY: 200,
      shiftKey: false
    });

    img.dispatchEvent(contextEvent);

    const menu = document.getElementById('xh-context-menu');
    assert.ok(menu, 'Menu kontekstowe powinno zostać utworzone i dołączone');
    assert.equal(menu.classList.contains('active'), true, 'Menu powinno być aktywne/widoczne');

    // 1. Sprawdzenie obecności opcji Otwórz w nowej karcie
    const openTabOption = menu.querySelector('#xh-cm-open-tab');
    assert.ok(openTabOption, 'Opcja "Otwórz w nowej karcie" powinna być obecna w menu kontekstowym');
    assert.ok(openTabOption.textContent.includes('Otwórz w nowej karcie'), 'Etykieta powinna zawierać "Otwórz w nowej karcie"');

    // 2. Sprawdzenie obecności opcji Oznacz jako obejrzane
    const markOption = menu.querySelector('#xh-cm-toggle-watched');
    assert.ok(markOption, 'Opcja oznaczania powinna istnieć w menu');

    // Test otwarcia nowej karty po kliknięciu
    let openedUrl = null;
    window.open = (url) => { openedUrl = url; return {}; };

    openTabOption.click();

    assert.ok(openedUrl && openedUrl.includes('/videos/video-103'), 'Kliknięcie powinno wywołać otwarcie URL filmu w nowej karcie');
    assert.equal(menu.classList.contains('active'), false, 'Menu powinno się zamknąć po wybraniu opcji');

    hider.destroy();
  });

  test('Ekstrakcja URL filmu przez getVideoUrl dla różnych struktur kart', () => {
    const hider = new XHamsterWatchedHider({
      window,
      document,
      autoStart: false
    });

    // Karta z linkiem wewnątrz
    const item1 = document.querySelector('[data-video-id="101"]');
    const url1 = hider.getVideoUrl(item1);
    assert.ok(url1.includes('/videos/video-101'), 'Powinien wyciągnąć URL z linku wewnątrz karty');

    // Karta będąca sama w sobie tagiem <a>
    const anchorCard = document.createElement('a');
    anchorCard.className = 'thumb-list__item video-thumb';
    anchorCard.href = 'https://xhamster.com/videos/custom-video-999';
    const url2 = hider.getVideoUrl(anchorCard);
    assert.equal(url2, 'https://xhamster.com/videos/custom-video-999');

    // Karta bez linku, ale z data-video-id
    const cardOnlyId = document.createElement('div');
    cardOnlyId.className = 'video-thumb';
    cardOnlyId.setAttribute('data-video-id', '888');
    const url3 = hider.getVideoUrl(cardOnlyId);
    assert.ok(url3.includes('/videos/888'), 'Powinien złożyć URL na podstawie data-video-id');
  });

  test('Shift + Prawy klik nie powinien przechwytywać zdarzenia ani otwierać menu autorskiego', () => {
    const hider = new XHamsterWatchedHider({
      window,
      document,
      autoStart: true
    });

    const item3 = document.querySelector('[data-video-id="103"]');

    const shiftEvent = new window.MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      clientX: 100,
      clientY: 100,
      shiftKey: true
    });

    item3.dispatchEvent(shiftEvent);

    const menu = document.getElementById('xh-context-menu');
    if (menu) {
      assert.equal(menu.classList.contains('active'), false, 'Menu autorskie nie może się otworzyć przy Shift+RightClick');
    }

    hider.destroy();
  });
});
