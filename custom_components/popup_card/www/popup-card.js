/**
 * Popup Card — Lightweight popup overlay for Home Assistant Lovelace.
 *
 * Listens for HA core `ll-custom` events with a `popup_card` key,
 * renders HA Lovelace cards inside a fullscreen overlay.
 * No external dependencies. Works on desktop, tablets, and Companion App.
 */

(function () {
  if (window.__popupCardInitialized) return;
  window.__popupCardInitialized = true;

  // ─── Helpers ─────────────────────────────────────────────────────────

  function getHass() {
    const ha = document.querySelector('home-assistant');
    if (ha && ha.hass) return ha.hass;
    const hc = document.querySelector('hc-main');
    if (hc && hc.hass) return hc.hass;
    return null;
  }

  async function createCard(config) {
    const helpers = await window.loadCardHelpers();
    const card = await helpers.createCardElement(config);
    card.hass = getHass();
    return card;
  }

  // ─── Styles ──────────────────────────────────────────────────────────

  const STYLES = `
    .popup-card-overlay {
      position: fixed;
      inset: 0;
      z-index: 999;
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 0;
      transition: opacity 150ms ease;
    }
    .popup-card-overlay.open {
      opacity: 1;
    }
    .popup-card-backdrop {
      position: absolute;
      inset: 0;
      background: rgba(0, 0, 0, 0.8);
    }
    .popup-card-dialog {
      position: relative;
      z-index: 1;
      max-width: 500px;
      width: 90%;
      max-height: 80vh;
      overflow-y: auto;
      scrollbar-width: none;
      background: var(--ha-card-background, rgba(30, 30, 30, 0.95));
      border-radius: 16px;
      border: 1px solid rgba(255, 255, 255, 0.08);
      box-sizing: border-box;
      touch-action: pan-y;
      transition: transform 150ms ease;
    }
    .popup-card-dialog::-webkit-scrollbar { display: none; }
    .popup-card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 20px 24px 0;
    }
    .popup-card-title {
      font-size: 18px;
      font-weight: 700;
      color: var(--primary-text-color, #fff);
    }
    .popup-card-close {
      background: none;
      border: none;
      color: rgba(255, 255, 255, 0.5);
      font-size: 20px;
      cursor: pointer;
      padding: 4px 8px;
      line-height: 1;
    }
    .popup-card-close:hover { color: #fff; }
    .popup-card-content {
      padding: 16px 24px 24px;
    }

    /* Mobile: full-screen popup */
    @media (max-width: 768px) {
      .popup-card-dialog {
        max-width: 100%;
        width: 100%;
        max-height: 100%;
        height: 100%;
        border-radius: 0;
        border: none;
      }
    }
  `;

  // ─── Popup Manager ───────────────────────────────────────────────────

  let overlay = null;
  let escHandler = null;
  let touchStartY = 0;
  let touchCurrentY = 0;
  let isDragging = false;

  function injectStyles() {
    if (document.getElementById('popup-card-styles')) return;
    const style = document.createElement('style');
    style.id = 'popup-card-styles';
    style.textContent = STYLES;
    document.head.appendChild(style);
  }

  async function show(config) {
    // Close existing popup if any
    close();
    injectStyles();

    const { title, content } = config;
    if (!content) return;

    // Create overlay
    overlay = document.createElement('div');
    overlay.className = 'popup-card-overlay';
    overlay.innerHTML = `
      <div class="popup-card-backdrop"></div>
      <div class="popup-card-dialog">
        <div class="popup-card-header">
          <span class="popup-card-title">${title || ''}</span>
          <button class="popup-card-close">\u2715</button>
        </div>
        <div class="popup-card-content"></div>
      </div>
    `;

    // Render HA card
    const contentEl = overlay.querySelector('.popup-card-content');
    try {
      const card = await createCard(content);
      contentEl.appendChild(card);

      // Keep hass updated on the card
      const hassInterval = setInterval(() => {
        const hass = getHass();
        if (hass && card.hass !== hass) card.hass = hass;
      }, 1000);
      overlay._hassInterval = hassInterval;
    } catch (err) {
      contentEl.innerHTML = `<div style="color:red;padding:16px">Error rendering card: ${err.message}</div>`;
    }

    // Append to body
    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';

    // Trigger open animation
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        overlay.classList.add('open');
      });
    });

    // Close handlers
    overlay.querySelector('.popup-card-backdrop').addEventListener('click', close);
    overlay.querySelector('.popup-card-close').addEventListener('click', close);

    escHandler = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', escHandler);

    // Mobile: swipe down to close
    const dialog = overlay.querySelector('.popup-card-dialog');
    dialog.addEventListener('touchstart', onTouchStart, { passive: true });
    dialog.addEventListener('touchmove', onTouchMove, { passive: false });
    dialog.addEventListener('touchend', onTouchEnd, { passive: true });
  }

  function close() {
    if (!overlay) return;

    if (overlay._hassInterval) {
      clearInterval(overlay._hassInterval);
    }

    overlay.remove();
    overlay = null;
    document.body.style.overflow = '';

    if (escHandler) {
      document.removeEventListener('keydown', escHandler);
      escHandler = null;
    }
  }

  // ─── Swipe to Close ──────────────────────────────────────────────────

  function onTouchStart(e) {
    const dialog = overlay?.querySelector('.popup-card-dialog');
    if (!dialog) return;

    // Only enable swipe when scrolled to top
    if (dialog.scrollTop > 0) return;

    touchStartY = e.touches[0].clientY;
    touchCurrentY = touchStartY;
    isDragging = false;
  }

  function onTouchMove(e) {
    if (!touchStartY) return;

    const dialog = overlay?.querySelector('.popup-card-dialog');
    if (!dialog) return;

    touchCurrentY = e.touches[0].clientY;
    const deltaY = touchCurrentY - touchStartY;

    // Only drag downward
    if (deltaY > 10) {
      isDragging = true;
      e.preventDefault();
      dialog.style.transform = `translateY(${deltaY}px)`;
      dialog.style.transition = 'none';
    }
  }

  function onTouchEnd() {
    const dialog = overlay?.querySelector('.popup-card-dialog');
    if (!dialog) {
      touchStartY = 0;
      isDragging = false;
      return;
    }

    const deltaY = touchCurrentY - touchStartY;

    if (isDragging && deltaY > 80) {
      // Swipe threshold met — close
      dialog.style.transition = 'transform 200ms ease';
      dialog.style.transform = 'translateY(100vh)';
      setTimeout(close, 200);
    } else {
      // Snap back
      dialog.style.transition = 'transform 150ms ease';
      dialog.style.transform = '';
    }

    touchStartY = 0;
    touchCurrentY = 0;
    isDragging = false;
  }

  // ─── Event Listener ──────────────────────────────────────────────────

  document.body.addEventListener('ll-custom', (e) => {
    const config = e.detail?.popup_card;
    if (!config) return;

    show(config);
  });

  console.info('%c POPUP-CARD %c loaded ', 'background:#8B5CF6;color:#fff;font-weight:bold', '');
})();
