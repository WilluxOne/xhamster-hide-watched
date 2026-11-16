// ==UserScript==
// @name         xHamster - Hide Watched Videos
// @namespace    https://github.com/WilluxOne/xhamster-hide-watched
// @version      1.1.0
// @description  Automatycznie ukrywa już obejrzane filmy z oznaczeniem 'Watched' na xhamster.com i wszystkich podstronach. Zawiera opcję oznaczania prawym przyciskiem myszy, prosty pływający interfejs i aktualizacje z GitHuba.
// @author       WilluxOne
// @match        *://*.xhamster.com/*
// @match        *://xhamster.com/*
// @match        *://*.xhamster.desi/*
// @match        *://*.xhwide.com/*
// @icon         https://xhamster.com/favicon.ico
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        GM_addStyle
// @run-at       document-idle
// @updateURL    https://raw.githubusercontent.com/WilluxOne/xhamster-hide-watched/main/xhamster-hide-watched.user.js
// @downloadURL  https://raw.githubusercontent.com/WilluxOne/xhamster-hide-watched/main/xhamster-hide-watched.user.js
// ==/UserScript==

(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // --- Storage Helper (Tampermonkey GM storage with localStorage fallback) ---
  const Storage = {
    get(key, defaultValue) {
      try {
        if (typeof GM_getValue === 'function') {
          return GM_getValue(key, defaultValue);
        }
      } catch (e) {}
      try {
        if (typeof localStorage !== 'undefined') {
          const val = localStorage.getItem(`xh_hider_${key}`);
          return val !== null ? JSON.parse(val) : defaultValue;
        }
      } catch (e) {}
      return defaultValue;
    },
    set(key, value) {
      try {
        if (typeof GM_setValue === 'function') {
          GM_setValue(key, value);
          return;
        }
      } catch (e) {}
      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(`xh_hider_${key}`, JSON.stringify(value));
        }
      } catch (e) {}
    }
  };

  class XHamsterWatchedHider {
    constructor(options = {}) {
      this.window = options.window || (typeof window !== 'undefined' ? window : null);
      this.document = options.document || (this.window ? this.window.document : null);
      this.autoStart = options.autoStart !== false;

      this.enabled = Storage.get('enabled', true);
      this.mode = Storage.get('mode', 'hide'); // 'hide' (display:none) lub 'dim' (grayscale+opacity)
      this.minimized = Storage.get('minimized', false);
      this.manualWatched = new Set(Storage.get('manual_watched', []));

      this.stats = {
        totalVideos: 0,
        watchedCount: 0,
        unwatchedCount: 0
      };

      this.observer = null;
      this.scanDebounceTimer = null;
      this.widgetElement = null;
      this.contextMenuElement = null;
      this.activeContextCard = null;

      if (this.autoStart && this.document) {
        this.init();
      }
    }

    init() {
      this.injectStyles();
      this.applyClasses();
      this.scan();
      this.initObserver();
      this.initHistoryHooks();
      this.renderWidget();
      this.initContextMenu();
      this.registerTampermonkeyMenu();
    }

    saveManualWatched() {
      Storage.set('manual_watched', Array.from(this.manualWatched));
    }

    getVideoIdentifier(card) {
      if (!card) return null;
      const id = card.getAttribute('data-video-id');
      if (id) return String(id).trim();

      const link = card.querySelector('a[href*="/videos/"]');
      if (link) {
        const href = link.getAttribute('href') || '';
        const match = href.match(/\/videos\/([^?#]+)/);
        if (match) return match[1].trim();
      }
      return null;
    }

    injectStyles() {
      if (!this.document) return;
      if (this.document.getElementById('xh-hider-styles')) return;

      const css = `
        /* --- Style ukrywania filmów Watched na xHamster --- */
        body.xh-hide-watched-active.xh-mode-hide [data-xh-watched="true"],
        body.xh-hide-watched-active.xh-mode-hide .thumb-list__item:has([data-role="video-watched"]),
        body.xh-hide-watched-active.xh-mode-hide .thumb-list__item:has(.thumb-image-container__watched),
        body.xh-hide-watched-active.xh-mode-hide .video-thumb:has([data-role="video-watched"]),
        body.xh-hide-watched-active.xh-mode-hide .video-thumb:has(.thumb-image-container__watched),
        body.xh-hide-watched-active.xh-mode-hide [data-video-id]:has([data-role="video-watched"]),
        body.xh-hide-watched-active.xh-mode-hide [data-video-id]:has(.thumb-image-container__watched) {
          display: none !important;
        }

        /* --- Tryb półprzezroczysty (Dim) --- */
        body.xh-hide-watched-active.xh-mode-dim [data-xh-watched="true"],
        body.xh-hide-watched-active.xh-mode-dim .thumb-list__item:has([data-role="video-watched"]),
        body.xh-hide-watched-active.xh-mode-dim .video-thumb:has([data-role="video-watched"]),
        body.xh-hide-watched-active.xh-mode-dim [data-video-id]:has([data-role="video-watched"]) {
          opacity: 0.18 !important;
          filter: grayscale(100%) !important;
          transform: scale(0.97) !important;
          transition: opacity 0.2s ease, filter 0.2s ease !important;
        }
        body.xh-hide-watched-active.xh-mode-dim [data-xh-watched="true"]:hover {
          opacity: 0.85 !important;
          filter: grayscale(0%) !important;
        }

        /* --- Pływający widget UI skryptu --- */
        #xh-hider-widget {
          position: fixed;
          bottom: 24px;
          right: 24px;
          z-index: 99999999;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          font-size: 13px;
          line-height: 1.4;
          color: #f1f1f1;
          user-select: none;
        }

        .xh-pill-bar {
          display: flex;
          align-items: center;
          gap: 8px;
          background: rgba(26, 26, 26, 0.94);
          backdrop-filter: blur(10px);
          border: 1px solid rgba(255, 255, 255, 0.14);
          border-radius: 30px;
          padding: 6px 14px;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
          transition: all 0.2s ease;
        }
        .xh-pill-bar:hover {
          border-color: rgba(255, 255, 255, 0.28);
          box-shadow: 0 10px 28px rgba(0, 0, 0, 0.6);
        }

        .xh-toggle-btn {
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 6px;
          font-weight: 600;
          color: #fff;
          background: none;
          border: none;
          padding: 2px 4px;
          outline: none;
        }
        .xh-indicator-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #4cd964;
          box-shadow: 0 0 6px #4cd964;
          transition: background 0.2s;
        }
        .xh-indicator-dot.off {
          background: #ff3b30;
          box-shadow: 0 0 6px #ff3b30;
        }

        .xh-badge-count {
          background: #ff3b30;
          color: #fff;
          padding: 1px 7px;
          border-radius: 12px;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.3px;
        }

        .xh-gear-btn {
          background: none;
          border: none;
          cursor: pointer;
          padding: 3px;
          color: #a0a0a0;
          font-size: 14px;
          line-height: 1;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: color 0.2s, transform 0.2s;
        }
        .xh-gear-btn:hover {
          color: #fff;
          transform: rotate(30deg);
        }

        /* --- Panel Ustawień --- */
        #xh-settings-modal {
          display: none;
          position: absolute;
          bottom: 48px;
          right: 0;
          width: 290px;
          background: #181818;
          border: 1px solid #333;
          border-radius: 12px;
          padding: 16px;
          box-shadow: 0 12px 32px rgba(0,0,0,0.7);
        }
        #xh-settings-modal.active {
          display: block;
          animation: xhFadeIn 0.15s ease-out;
        }

        @keyframes xhFadeIn {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .xh-modal-title {
          font-size: 14px;
          font-weight: 700;
          margin-bottom: 12px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-bottom: 1px solid #2a2a2a;
          padding-bottom: 8px;
        }
        .xh-close-modal {
          cursor: pointer;
          color: #888;
          font-size: 16px;
        }
        .xh-close-modal:hover { color: #fff; }

        .xh-setting-row {
          margin-bottom: 12px;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .xh-setting-label {
          color: #ddd;
          font-size: 12px;
        }

        .xh-switch {
          position: relative;
          display: inline-block;
          width: 36px;
          height: 20px;
        }
        .xh-switch input { opacity: 0; width: 0; height: 0; }
        .xh-slider {
          position: absolute;
          cursor: pointer;
          top: 0; left: 0; right: 0; bottom: 0;
          background-color: #444;
          transition: .3s;
          border-radius: 20px;
        }
        .xh-slider:before {
          position: absolute;
          content: "";
          height: 14px;
          width: 14px;
          left: 3px;
          bottom: 3px;
          background-color: white;
          transition: .3s;
          border-radius: 50%;
        }
        input:checked + .xh-slider { background-color: #007aff; }
        input:checked + .xh-slider:before { transform: translateX(16px); }

        .xh-select {
          background: #252525;
          color: #fff;
          border: 1px solid #444;
          border-radius: 6px;
          padding: 4px 8px;
          font-size: 12px;
          outline: none;
        }

        .xh-stats-box {
          background: #222;
          border-radius: 8px;
          padding: 10px;
          margin-bottom: 12px;
          font-size: 12px;
          color: #bbb;
        }
        .xh-stats-box div {
          display: flex;
          justify-content: space-between;
          margin-bottom: 3px;
        }
        .xh-stats-box div:last-child { margin-bottom: 0; }
        .xh-stats-val { font-weight: 700; color: #fff; }

        .xh-actions {
          display: flex;
          gap: 8px;
          margin-bottom: 8px;
        }
        .xh-btn {
          flex: 1;
          background: #2a2a2a;
          border: 1px solid #444;
          color: #eee;
          padding: 6px 10px;
          border-radius: 6px;
          cursor: pointer;
          font-size: 11px;
          font-weight: 600;
          text-align: center;
          text-decoration: none;
          transition: background 0.2s;
        }
        .xh-btn:hover { background: #383838; color: #fff; }
        .xh-btn-primary { background: #007aff; border-color: #007aff; color: #fff; }
        .xh-btn-primary:hover { background: #0066d6; }

        /* --- Menu Kontekstowe Prawego Przycisku Myszy --- */
        #xh-context-menu {
          display: none;
          position: fixed;
          z-index: 100000000;
          background: #1e1e1e;
          border: 1px solid #383838;
          border-radius: 8px;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.75);
          padding: 4px 0;
          min-width: 200px;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          font-size: 12px;
          user-select: none;
        }
        #xh-context-menu.active {
          display: block;
          animation: xhFadeIn 0.12s ease-out;
        }
        .xh-cm-item {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 14px;
          color: #e0e0e0;
          cursor: pointer;
          transition: background 0.15s, color 0.15s;
        }
        .xh-cm-item:hover {
          background: #007aff;
          color: #fff;
        }
        .xh-cm-divider {
          height: 1px;
          background: #2f2f2f;
          margin: 4px 0;
        }
        .xh-cm-icon {
          font-size: 14px;
          width: 16px;
          text-align: center;
        }
      `;

      const style = this.document.createElement('style');
      style.id = 'xh-hider-styles';
      style.textContent = css;
      (this.document.head || this.document.documentElement).appendChild(style);
    }

    applyClasses() {
      if (!this.document || !this.document.body) return;
      const body = this.document.body;

      if (this.enabled) {
        body.classList.add('xh-hide-watched-active');
      } else {
        body.classList.remove('xh-hide-watched-active');
      }

      body.classList.remove('xh-mode-hide', 'xh-mode-dim');
      body.classList.add(`xh-mode-${this.mode}`);
    }

    setEnabled(value) {
      this.enabled = !!value;
      Storage.set('enabled', this.enabled);
      this.applyClasses();
      this.updateWidgetUI();
    }

    setMode(newMode) {
      this.mode = newMode === 'dim' ? 'dim' : 'hide';
      Storage.set('mode', this.mode);
      this.applyClasses();
      this.updateWidgetUI();
    }

    // --- DOM Scanner: Identyfikacja obejrzanych wideo i tagowanie węzłów ---
    scan() {
      if (!this.document) return this.stats;

      const cardSelectors = [
        '.thumb-list__item',
        '.video-thumb',
        '[data-video-id]',
        '[data-role="video-thumb"]',
        'article[data-role="video-thumb"]',
        '.thumb-item'
      ].join(', ');

      const allCards = Array.from(this.document.querySelectorAll(cardSelectors));
      const uniqueCards = new Set();
      allCards.forEach(el => {
        const topCard = el.closest('.thumb-list__item') || el.closest('.video-thumb') || el.closest('[data-video-id]') || el;
        uniqueCards.add(topCard);
      });

      let watched = 0;
      let total = 0;

      uniqueCards.forEach(card => {
        total++;
        if (this.isWatchedCard(card)) {
          card.setAttribute('data-xh-watched', 'true');
          card.classList.add('xh-watched-item');
          watched++;
        } else {
          card.removeAttribute('data-xh-watched');
          card.classList.remove('xh-watched-item');
        }
      });

      this.stats.totalVideos = total;
      this.stats.watchedCount = watched;
      this.stats.unwatchedCount = Math.max(0, total - watched);

      this.updateWidgetUI();
      return this.stats;
    }

    isWatchedCard(card) {
      if (!card) return false;

      // 0. Sprawdzenie ręcznie oznaczonej listy użytkownika
      const id = this.getVideoIdentifier(card);
      if (id && this.manualWatched.has(id)) {
        return true;
      }

      // 1. Sprawdzenie atrybutu data-role="video-watched"
      if (card.querySelector('[data-role="video-watched"]')) {
        return true;
      }

      // 2. Sprawdzenie klasy thumb-image-container__watched
      if (card.querySelector('.thumb-image-container__watched, [class*="thumb-image-container__watched"]')) {
        return true;
      }

      // 3. Sprawdzenie innych klas z watched
      if (card.querySelector('[class*="video-watched"], .video-thumb__watched')) {
        return true;
      }

      // 4. Badanie etykiet tekstowych (np. "Watched", "Obejrzane") w badge'ach/czasie trwania
      const badges = card.querySelectorAll('.thumb-image-container div, .thumb-image-container span, .video-thumb__badge');
      for (let i = 0; i < badges.length; i++) {
        const txt = (badges[i].textContent || '').trim().toLowerCase();
        if (txt === 'watched' || txt === 'obejrzane') {
          return true;
        }
      }

      return false;
    }

    markAsWatched(card) {
      if (!card) return;
      const id = this.getVideoIdentifier(card);
      if (id) {
        this.manualWatched.add(id);
        this.saveManualWatched();
      }

      card.setAttribute('data-xh-watched', 'true');
      card.setAttribute('data-xh-manual-watched', 'true');
      card.classList.add('xh-watched-item');

      // Dodaj wizualny badge jeśli nie istnieje
      let badge = card.querySelector('.thumb-image-container__watched');
      if (!badge) {
        const thumbContainer = card.querySelector('.thumb-image-container') || card;
        badge = this.document.createElement('div');
        badge.className = 'thumb-image-container__watched xh-manual-badge';
        badge.setAttribute('data-role', 'video-watched');
        badge.textContent = 'Watched';
        thumbContainer.appendChild(badge);
      }

      this.scan();
    }

    unmarkAsWatched(card) {
      if (!card) return;
      const id = this.getVideoIdentifier(card);
      if (id) {
        this.manualWatched.delete(id);
        this.saveManualWatched();
      }

      card.removeAttribute('data-xh-watched');
      card.removeAttribute('data-xh-manual-watched');
      card.classList.remove('xh-watched-item');

      const manualBadge = card.querySelector('.xh-manual-badge');
      if (manualBadge) {
        manualBadge.remove();
      }

      this.scan();
    }

    toggleManualWatched(card) {
      if (!card) return;
      if (this.isWatchedCard(card)) {
        this.unmarkAsWatched(card);
      } else {
        this.markAsWatched(card);
      }
    }

    getStats() {
      return { ...this.stats };
    }

    // --- Dynamic DOM Mutation Observer (infinite scroll & SPA) ---
    initObserver() {
      if (!this.document || !this.window || typeof this.window.MutationObserver === 'undefined') return;

      this.observer = new this.window.MutationObserver((mutations) => {
        let hasNewNodes = false;
        for (let i = 0; i < mutations.length; i++) {
          if (mutations[i].addedNodes && mutations[i].addedNodes.length > 0) {
            const target = mutations[i].target;
            if (target && (target.id === 'xh-hider-widget' || target.id === 'xh-context-menu')) continue;

            hasNewNodes = true;
            break;
          }
        }

        if (hasNewNodes) {
          this.scheduleScan();
        }
      });

      this.observer.observe(this.document.body || this.document.documentElement, {
        childList: true,
        subtree: true
      });
    }

    scheduleScan() {
      if (this.scanDebounceTimer) {
        clearTimeout(this.scanDebounceTimer);
      }
      this.scanDebounceTimer = setTimeout(() => {
        this.scan();
      }, 100);
    }

    // --- Obsługa przejść SPA (pushState, popstate) ---
    initHistoryHooks() {
      if (!this.window) return;

      const triggerUrlChange = () => {
        setTimeout(() => this.scan(), 300);
      };

      this.window.addEventListener('popstate', triggerUrlChange);
      this.window.addEventListener('hashchange', triggerUrlChange);

      if (this.window.history) {
        const origPush = this.window.history.pushState;
        if (origPush) {
          const self = this;
          this.window.history.pushState = function () {
            origPush.apply(this, arguments);
            triggerUrlChange();
          };
        }
      }
    }

    // --- Obsługa Menu Kontekstowego Prawego Przycisku Myszy ---
    initContextMenu() {
      if (!this.document) return;

      let menu = this.document.getElementById('xh-context-menu');
      if (!menu) {
        menu = this.document.createElement('div');
        menu.id = 'xh-context-menu';
        (this.document.body || this.document.documentElement).appendChild(menu);
      }
      this.contextMenuElement = menu;

      // Globalne nasłuchiwanie prawego kliku (contextmenu)
      this.document.addEventListener('contextmenu', (e) => {
        // Shift + Prawy klik zachowuje natywne menu przeglądarki
        if (e.shiftKey) {
          this.hideContextMenu();
          return;
        }

        const card = e.target.closest('.thumb-list__item, .video-thumb, [data-video-id], [data-role="video-thumb"], article');
        if (!card) {
          this.hideContextMenu();
          return;
        }

        e.preventDefault();
        this.showContextMenu(card, e.clientX, e.clientY);
      });

      // Zamykanie menu po kliknięciu poza nim lub przewinięciu
      this.document.addEventListener('click', (e) => {
        if (!menu.contains(e.target)) {
          this.hideContextMenu();
        }
      });

      if (this.window) {
        this.window.addEventListener('scroll', () => this.hideContextMenu(), { passive: true });
        this.window.addEventListener('resize', () => this.hideContextMenu(), { passive: true });
      }
    }

    showContextMenu(card, x, y) {
      if (!this.contextMenuElement) return;

      this.activeContextCard = card;
      const isWatched = this.isWatchedCard(card);
      const videoLink = card.querySelector('a[href*="/videos/"]');
      const href = videoLink ? (videoLink.href || videoLink.getAttribute('href') || '') : '';

      this.contextMenuElement.innerHTML = `
        <div class="xh-cm-item" id="xh-cm-toggle-watched">
          <span class="xh-cm-icon">${isWatched ? '↩️' : '👁️'}</span>
          <span>${isWatched ? 'Cofnij oznaczenie (Pokaż)' : 'Oznacz jako obejrzane (Ukryj)'}</span>
        </div>
        ${href ? `
        <div class="xh-cm-divider"></div>
        <div class="xh-cm-item" id="xh-cm-open-tab">
          <span class="xh-cm-icon">🔗</span>
          <span>Otwórz w nowej karcie</span>
        </div>
        <div class="xh-cm-item" id="xh-cm-copy-link">
          <span class="xh-cm-icon">📋</span>
          <span>Kopiuj link do filmu</span>
        </div>
        ` : ''}
      `;

      // Pozycjonowanie w granicach okna
      const menuWidth = 220;
      const menuHeight = 120;
      const winWidth = this.window ? this.window.innerWidth : 1200;
      const winHeight = this.window ? this.window.innerHeight : 800;

      let posX = x;
      let posY = y;
      if (posX + menuWidth > winWidth) posX = Math.max(10, winWidth - menuWidth - 15);
      if (posY + menuHeight > winHeight) posY = Math.max(10, winHeight - menuHeight - 15);

      this.contextMenuElement.style.left = `${posX}px`;
      this.contextMenuElement.style.top = `${posY}px`;
      this.contextMenuElement.classList.add('active');

      // Obsługa kliknięć w pozycje menu
      const toggleOption = this.contextMenuElement.querySelector('#xh-cm-toggle-watched');
      if (toggleOption) {
        toggleOption.addEventListener('click', () => {
          this.toggleManualWatched(this.activeContextCard);
          this.hideContextMenu();
        });
      }

      const openTabOption = this.contextMenuElement.querySelector('#xh-cm-open-tab');
      if (openTabOption && href) {
        openTabOption.addEventListener('click', () => {
          if (this.window) {
            this.window.open(href, '_blank');
          }
          this.hideContextMenu();
        });
      }

      const copyLinkOption = this.contextMenuElement.querySelector('#xh-cm-copy-link');
      if (copyLinkOption && href) {
        copyLinkOption.addEventListener('click', () => {
          try {
            if (this.window && this.window.navigator && this.window.navigator.clipboard) {
              this.window.navigator.clipboard.writeText(href);
            }
          } catch (e) {}
          this.hideContextMenu();
        });
      }
    }

    hideContextMenu() {
      if (this.contextMenuElement) {
        this.contextMenuElement.classList.remove('active');
      }
      this.activeContextCard = null;
    }

    // --- Pływający interfejs UI ---
    renderWidget() {
      if (!this.document || this.document.getElementById('xh-hider-widget')) return;

      const widget = this.document.createElement('div');
      widget.id = 'xh-hider-widget';

      widget.innerHTML = `
        <div class="xh-pill-bar">
          <button type="button" class="xh-toggle-btn" id="xh-toggle-pill" title="Kliknij, aby włączyć/wyłączyć ukrywanie widzianych filmów">
            <span class="xh-indicator-dot ${this.enabled ? '' : 'off'}" id="xh-pill-dot"></span>
            <span>Watched:</span>
            <span class="xh-badge-count" id="xh-pill-count">${this.stats.watchedCount}</span>
          </button>
          <button type="button" class="xh-gear-btn" id="xh-open-settings" title="Opcje i aktualizacje">&#9881;</button>
        </div>

        <div id="xh-settings-modal">
          <div class="xh-modal-title">
            <span>xHamster Watched Hider</span>
            <span class="xh-close-modal" id="xh-close-settings">&times;</span>
          </div>

          <div class="xh-setting-row">
            <span class="xh-setting-label">Ukrywaj obejrzane:</span>
            <label class="xh-switch">
              <input type="checkbox" id="xh-toggle-enabled" ${this.enabled ? 'checked' : ''} />
              <span class="xh-slider"></span>
            </label>
          </div>

          <div class="xh-setting-row">
            <span class="xh-setting-label">Tryb wizualny:</span>
            <select class="xh-select" id="xh-mode-select">
              <option value="hide" ${this.mode === 'hide' ? 'selected' : ''}>Ukryj całkowicie</option>
              <option value="dim" ${this.mode === 'dim' ? 'selected' : ''}>Wyszarz (Dim)</option>
            </select>
          </div>

          <div class="xh-stats-box">
            <div><span>Obejrzane (ukryte):</span> <span class="xh-stats-val" id="xh-stat-watched">${this.stats.watchedCount}</span></div>
            <div><span>Pozostałe nowe:</span> <span class="xh-stats-val" id="xh-stat-unwatched">${this.stats.unwatchedCount}</span></div>
            <div><span>Wszystkie filmy:</span> <span class="xh-stats-val" id="xh-stat-total">${this.stats.totalVideos}</span></div>
            <div><span>Ręcznie oznaczone:</span> <span class="xh-stats-val" id="xh-stat-manual">${this.manualWatched.size}</span></div>
          </div>

          <div class="xh-actions">
            <button type="button" class="xh-btn" id="xh-rescan-btn">Odśwież skan</button>
            <button type="button" class="xh-btn" id="xh-clear-manual-btn" title="Czyści pamięć ręcznie oznaczonych filmów">Reset ręcznych</button>
          </div>
          <div class="xh-actions">
            <a href="https://github.com/WilluxOne/xhamster-hide-watched" target="_blank" rel="noopener noreferrer" class="xh-btn xh-btn-primary" title="Sprawdź aktualizacje lub kod na GitHub">GitHub (v1.1.0)</a>
          </div>
        </div>
      `;

      (this.document.body || this.document.documentElement).appendChild(widget);
      this.widgetElement = widget;

      // Zdarzenia UI
      const pillBtn = widget.querySelector('#xh-toggle-pill');
      const gearBtn = widget.querySelector('#xh-open-settings');
      const closeBtn = widget.querySelector('#xh-close-settings');
      const modal = widget.querySelector('#xh-settings-modal');
      const toggleCheckbox = widget.querySelector('#xh-toggle-enabled');
      const modeSelect = widget.querySelector('#xh-mode-select');
      const rescanBtn = widget.querySelector('#xh-rescan-btn');
      const clearManualBtn = widget.querySelector('#xh-clear-manual-btn');

      if (pillBtn) {
        pillBtn.addEventListener('click', () => {
          this.setEnabled(!this.enabled);
        });
      }

      if (gearBtn) {
        gearBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          modal.classList.toggle('active');
        });
      }

      if (closeBtn) {
        closeBtn.addEventListener('click', () => {
          modal.classList.remove('active');
        });
      }

      if (toggleCheckbox) {
        toggleCheckbox.addEventListener('change', (e) => {
          this.setEnabled(e.target.checked);
        });
      }

      if (modeSelect) {
        modeSelect.addEventListener('change', (e) => {
          this.setMode(e.target.value);
        });
      }

      if (rescanBtn) {
        rescanBtn.addEventListener('click', () => {
          this.scan();
        });
      }

      if (clearManualBtn) {
        clearManualBtn.addEventListener('click', () => {
          if (confirm('Czy na pewno chcesz wyczyścić historię ręcznie oznaczonych pozycji?')) {
            this.manualWatched.clear();
            this.saveManualWatched();
            this.scan();
          }
        });
      }
    }

    updateWidgetUI() {
      if (!this.document) return;

      const dot = this.document.getElementById('xh-pill-dot');
      const count = this.document.getElementById('xh-pill-count');
      const toggle = this.document.getElementById('xh-toggle-enabled');
      const modeSelect = this.document.getElementById('xh-mode-select');

      const statWatched = this.document.getElementById('xh-stat-watched');
      const statUnwatched = this.document.getElementById('xh-stat-unwatched');
      const statTotal = this.document.getElementById('xh-stat-total');
      const statManual = this.document.getElementById('xh-stat-manual');

      if (dot) {
        if (this.enabled) dot.classList.remove('off');
        else dot.classList.add('off');
      }

      if (count) {
        count.textContent = String(this.stats.watchedCount);
      }

      if (toggle) {
        toggle.checked = this.enabled;
      }

      if (modeSelect) {
        modeSelect.value = this.mode;
      }

      if (statWatched) statWatched.textContent = String(this.stats.watchedCount);
      if (statUnwatched) statUnwatched.textContent = String(this.stats.unwatchedCount);
      if (statTotal) statTotal.textContent = String(this.stats.totalVideos);
      if (statManual) statManual.textContent = String(this.manualWatched.size);
    }

    registerTampermonkeyMenu() {
      if (typeof GM_registerMenuCommand === 'function') {
        try {
          GM_registerMenuCommand('👁️ Przełącz ukrywanie (Włącz / Wyłącz)', () => {
            this.setEnabled(!this.enabled);
          });
          GM_registerMenuCommand('🔄 Skanuj stronę ponownie', () => {
            this.scan();
          });
          GM_registerMenuCommand('⚙️ Przełącz tryb (Ukryj / Wyszarz)', () => {
            this.setMode(this.mode === 'hide' ? 'dim' : 'hide');
          });
          GM_registerMenuCommand('🌐 GitHub - Sprawdź aktualizacje', () => {
            if (this.window) {
              this.window.open('https://github.com/WilluxOne/xhamster-hide-watched', '_blank');
            }
          });
        } catch (e) {}
      }
    }

    destroy() {
      if (this.observer) {
        this.observer.disconnect();
        this.observer = null;
      }
      if (this.scanDebounceTimer) {
        clearTimeout(this.scanDebounceTimer);
        this.scanDebounceTimer = null;
      }
      if (this.widgetElement && this.widgetElement.parentNode) {
        this.widgetElement.parentNode.removeChild(this.widgetElement);
        this.widgetElement = null;
      }
      if (this.contextMenuElement && this.contextMenuElement.parentNode) {
        this.contextMenuElement.parentNode.removeChild(this.contextMenuElement);
        this.contextMenuElement = null;
      }
    }
  }

  // Automatyczny start w przeglądarce
  let instance = null;
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    instance = new XHamsterWatchedHider();
  }

  return {
    XHamsterWatchedHider,
    getInstance: () => instance
  };
});
