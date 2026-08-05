/**
 * Popup Card — Lightweight popup overlay for Home Assistant Lovelace.
 *
 * Listens for HA core `ll-custom` events with a `popup_card` key,
 * renders HA Lovelace cards inside a fullscreen overlay.
 * No external dependencies. Works on desktop, tablets, and Companion App.
 *
 * This file is an ES module (registered as `res_type: module`). It exports
 * its pure helpers for unit testing and, when loaded in a browser, attaches
 * the global `ll-custom` listener via initPopupCard().
 */

// ─── Helpers ───────────────────────────────────────────────────────────

/**
 * The HA app root element. Besides holding `hass`, this element provides (via
 * HA's `contextMixin`) the Lit contexts that cards consume — internationalization
 * (relative-time state), registries/entities (icons), formatters, etc. A card
 * rendered outside this element's subtree cannot resolve those contexts, so its
 * relative-time state and registry-backed icons render blank.
 */
function getHassRoot() {
  const ha = document.querySelector("home-assistant");
  if (ha && ha.hass) return ha;
  const hc = document.querySelector("hc-main");
  if (hc && hc.hass) return hc;
  return null;
}

function getHass() {
  const root = getHassRoot();
  return root ? root.hass : null;
}

/**
 * Where to mount the overlay. We render inside the provider's shadow root so
 * `context-request` events from content cards bubble (composed) up to HA's
 * providers. Falls back to <body> when there's no host/shadow root (non-standard
 * embeds, tests) — degraded (no context) but still renders.
 */
function getMountRoot() {
  const root = getHassRoot();
  return (root && root.shadowRoot) || document.body;
}

/**
 * Styles must live in the same root as the overlay, or shadow-DOM encapsulation
 * hides them. In a ShadowRoot that's the root itself; in the <body> fallback,
 * <head> works (same document, no encapsulation).
 */
function getStyleHost(mountRoot) {
  const isShadow =
    typeof ShadowRoot !== "undefined" && mountRoot instanceof ShadowRoot;
  return isShadow ? mountRoot : document.head;
}

async function createCard(config) {
  const helpers = await window.loadCardHelpers();
  const card = await helpers.createCardElement(config);
  card.hass = getHass();
  return card;
}

// ─── Config parsing ────────────────────────────────────────────────────

// Discrete style keys exposed in the popup_card config. Each maps to a CSS
// rule generated in buildPopupStyles(). Listed here so parseConfig() can
// collect exactly these (plus the raw `style` escape hatch).
const STYLE_KEYS = [
  "background",
  "backdrop",
  "backdrop_blur",
  "border_radius",
  "border",
  "title_color",
];

/**
 * Normalize a raw popup_card config into the shape show() consumes.
 *
 * @param {object} config raw config from the ll-custom event
 * @returns {{title:string|undefined, content:any, autoCloseMs:number|null,
 *            showProgress:boolean, styleConfig:object}}
 */
export function parseConfig(config) {
  const { title, content } = config;

  // auto_close: seconds → ms. Absent / 0 / negative / non-numeric → never.
  const autoCloseSeconds = Number(config.auto_close);
  const autoCloseMs =
    Number.isFinite(autoCloseSeconds) && autoCloseSeconds > 0
      ? autoCloseSeconds * 1000
      : null;

  // auto_close_progress: show the countdown bar (default true). Only has any
  // effect when auto_close is set.
  const showProgress = config.auto_close_progress !== false;

  const styleConfig = {};
  for (const key of STYLE_KEYS) {
    if (config[key] != null) styleConfig[key] = config[key];
  }
  if (config.style != null) styleConfig.style = config.style;

  return { title, content, autoCloseMs, showProgress, styleConfig };
}

// ─── Scoped styling ────────────────────────────────────────────────────

/**
 * Prefix every selector in a CSS block with a scope class so the user's raw
 * `style:` cannot leak onto other popups. Handles comma-separated selector
 * lists; leaves at-rules (@media, @keyframes) and their inner selectors
 * unscoped at the top level (the @media wrapper itself can't take a class).
 *
 * This is intentionally simple — it scopes each top-level rule's selector
 * list. Nested at-rules pass through as-is (rare in popup styling).
 */
function scopeRawStyle(scopeClass, css) {
  const scope = `.${scopeClass}`;
  // Match `selectorList { ... }` blocks at the top level.
  return css.replace(/([^{}]+)\{([^{}]*)\}/g, (match, selectors, body) => {
    const trimmed = selectors.trim();
    // Pass at-rules through untouched (e.g. @media, @keyframes headers).
    if (trimmed.startsWith("@")) return match;
    const scoped = trimmed
      .split(",")
      .map((sel) => `${scope} ${sel.trim()}`)
      .join(", ");
    return `${scoped} { ${body.trim()} }`;
  });
}

/**
 * Build the per-popup scoped stylesheet.
 *
 * Rules are emitted in precedence order — base defaults, then discrete-key
 * overrides, then the user's raw `style:` block — all at equal specificity
 * (one class under the same scope). Later rules win, so:
 *
 *     base defaults  <  discrete keys  <  user `style:`
 *
 * @param {string} scopeClass unique overlay class (e.g. popup-card-overlay-3)
 * @param {object} styleConfig discrete keys + optional raw `style`
 * @returns {string} CSS text
 */
export function buildPopupStyles(scopeClass, styleConfig = {}) {
  const scope = `.${scopeClass}`;
  const blocks = [];

  // 1. Base defaults for the themeable surfaces (scoped so keys/style can
  //    override at equal specificity).
  blocks.push(`
    ${scope} .popup-card-dialog {
      background: var(--ha-card-background, rgba(30, 30, 30, 0.95));
      border-radius: 16px;
      border: 1px solid rgba(255, 255, 255, 0.08);
    }
    ${scope} .popup-card-backdrop {
      background: rgba(0, 0, 0, 0.8);
    }
    ${scope} .popup-card-title {
      color: var(--primary-text-color, #fff);
    }
  `);

  // 2. Discrete-key overrides.
  const {
    background,
    backdrop,
    backdrop_blur,
    border_radius,
    border,
    title_color,
  } = styleConfig;

  const dialogDecls = [];
  if (background != null) dialogDecls.push(`background: ${background};`);
  if (border_radius != null) dialogDecls.push(`border-radius: ${border_radius};`);
  if (border != null) dialogDecls.push(`border: ${border};`);
  if (dialogDecls.length) {
    blocks.push(`${scope} .popup-card-dialog { ${dialogDecls.join(" ")} }`);
  }

  const backdropDecls = [];
  if (backdrop != null) backdropDecls.push(`background: ${backdrop};`);
  if (backdrop_blur != null) {
    backdropDecls.push(`backdrop-filter: blur(${backdrop_blur});`);
    backdropDecls.push(`-webkit-backdrop-filter: blur(${backdrop_blur});`);
  }
  if (backdropDecls.length) {
    blocks.push(`${scope} .popup-card-backdrop { ${backdropDecls.join(" ")} }`);
  }

  if (title_color != null) {
    blocks.push(`${scope} .popup-card-title { color: ${title_color}; }`);
  }

  // 3. User raw `style:` — emitted last so it always wins.
  if (styleConfig.style != null) {
    blocks.push(scopeRawStyle(scopeClass, String(styleConfig.style)));
  }

  return blocks.join("\n");
}

// ─── Structural styles (not user-overridable surfaces) ─────────────────

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
  }
  .popup-card-dialog {
    position: relative;
    z-index: 1;
    max-width: 500px;
    width: 90%;
    max-height: 80vh;
    overflow-y: auto;
    scrollbar-width: none;
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

  /* Auto-close countdown: very subtle draining bar pinned to the dialog top. */
  .popup-card-progress {
    position: absolute;
    top: 0;
    left: 0;
    height: 2px;
    width: 100%;
    transform-origin: left center;
    transform: scaleX(1);
    background: rgba(255, 255, 255, 0.25);
    border-radius: 2px 2px 0 0;
    pointer-events: none;
  }
  .popup-card-progress.run {
    transform: scaleX(0);
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

// ─── Popup Manager ─────────────────────────────────────────────────────

let overlay = null;
let escHandler = null;
let touchStartY = 0;
let touchCurrentY = 0;
let isDragging = false;
let scopeCounter = 0;

function injectStyles(styleHost) {
  if (styleHost.querySelector("#popup-card-styles")) return;
  const style = document.createElement("style");
  style.id = "popup-card-styles";
  style.textContent = STYLES;
  styleHost.appendChild(style);
}

export async function show(rawConfig) {
  // Close existing popup if any
  close();

  // Mount inside the HA context-provider subtree so content cards can resolve
  // the Lit contexts they need (icons, relative-time state). Styles go in the
  // same root, or shadow-DOM encapsulation would hide them.
  const mountRoot = getMountRoot();
  const styleHost = getStyleHost(mountRoot);
  injectStyles(styleHost);

  const { title, content, autoCloseMs, showProgress, styleConfig } =
    parseConfig(rawConfig);
  if (!content) return;

  const withProgressBar = Boolean(autoCloseMs) && showProgress;

  // Unique scope class so per-popup styles can't leak to a later popup.
  scopeCounter += 1;
  const scopeClass = `popup-card-overlay-${scopeCounter}`;

  // Inject the per-popup scoped stylesheet (base < keys < style).
  const scopedStyleEl = document.createElement("style");
  scopedStyleEl.setAttribute("data-popup-card-scoped", scopeClass);
  scopedStyleEl.textContent = buildPopupStyles(scopeClass, styleConfig);
  styleHost.appendChild(scopedStyleEl);

  // Create overlay
  overlay = document.createElement("div");
  overlay.className = `popup-card-overlay ${scopeClass}`;
  overlay._scopedStyleEl = scopedStyleEl;
  overlay.innerHTML = `
    <div class="popup-card-backdrop"></div>
    <div class="popup-card-dialog">
      ${withProgressBar ? '<div class="popup-card-progress"></div>' : ""}
      <div class="popup-card-header">
        <span class="popup-card-title">${title || ""}</span>
        <button class="popup-card-close">✕</button>
      </div>
      <div class="popup-card-content"></div>
    </div>
  `;

  // Render HA card
  const contentEl = overlay.querySelector(".popup-card-content");
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

  // Append to the mount root (provider subtree, or <body> fallback).
  mountRoot.appendChild(overlay);
  document.body.style.overflow = "hidden";

  // Trigger open animation
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (!overlay) return;
      overlay.classList.add("open");

      // Kick off the auto-close drain bar in the same frame the overlay
      // becomes visible, so the bar's transition matches the timer.
      const progress = overlay.querySelector(".popup-card-progress");
      if (progress && autoCloseMs) {
        progress.style.transition = `transform ${autoCloseMs}ms linear`;
        progress.classList.add("run");
      }
    });
  });

  // Auto-close timer
  if (autoCloseMs) {
    overlay._autoCloseTimer = setTimeout(close, autoCloseMs);
  }

  // Close handlers
  overlay.querySelector(".popup-card-backdrop").addEventListener("click", close);
  overlay.querySelector(".popup-card-close").addEventListener("click", close);

  escHandler = (e) => {
    if (e.key === "Escape") close();
  };
  document.addEventListener("keydown", escHandler);

  // Mobile: swipe down to close
  const dialog = overlay.querySelector(".popup-card-dialog");
  dialog.addEventListener("touchstart", onTouchStart, { passive: true });
  dialog.addEventListener("touchmove", onTouchMove, { passive: false });
  dialog.addEventListener("touchend", onTouchEnd, { passive: true });
}

export function close() {
  if (!overlay) return;

  if (overlay._autoCloseTimer) {
    clearTimeout(overlay._autoCloseTimer);
  }

  if (overlay._hassInterval) {
    clearInterval(overlay._hassInterval);
  }

  if (overlay._scopedStyleEl) {
    overlay._scopedStyleEl.remove();
  }

  overlay.remove();
  overlay = null;
  document.body.style.overflow = "";

  if (escHandler) {
    document.removeEventListener("keydown", escHandler);
    escHandler = null;
  }
}

// ─── Swipe to Close ────────────────────────────────────────────────────

function onTouchStart(e) {
  const dialog = overlay?.querySelector(".popup-card-dialog");
  if (!dialog) return;

  // Only enable swipe when scrolled to top
  if (dialog.scrollTop > 0) return;

  touchStartY = e.touches[0].clientY;
  touchCurrentY = touchStartY;
  isDragging = false;
}

function onTouchMove(e) {
  if (!touchStartY) return;

  const dialog = overlay?.querySelector(".popup-card-dialog");
  if (!dialog) return;

  touchCurrentY = e.touches[0].clientY;
  const deltaY = touchCurrentY - touchStartY;

  // Only drag downward
  if (deltaY > 10) {
    isDragging = true;
    e.preventDefault();
    dialog.style.transform = `translateY(${deltaY}px)`;
    dialog.style.transition = "none";
  }
}

function onTouchEnd() {
  const dialog = overlay?.querySelector(".popup-card-dialog");
  if (!dialog) {
    touchStartY = 0;
    isDragging = false;
    return;
  }

  const deltaY = touchCurrentY - touchStartY;

  if (isDragging && deltaY > 80) {
    // Swipe threshold met — close
    dialog.style.transition = "transform 200ms ease";
    dialog.style.transform = "translateY(100vh)";
    setTimeout(close, 200);
  } else {
    // Snap back
    dialog.style.transition = "transform 150ms ease";
    dialog.style.transform = "";
  }

  touchStartY = 0;
  touchCurrentY = 0;
  isDragging = false;
}

// ─── Event Listener ────────────────────────────────────────────────────

let initialized = false;

export function initPopupCard() {
  if (initialized) return;
  initialized = true;

  document.body.addEventListener("ll-custom", (e) => {
    const config = e.detail?.popup_card;
    if (!config) return;
    show(config);
  });

  console.info(
    "%c POPUP-CARD %c loaded ",
    "background:#8B5CF6;color:#fff;font-weight:bold",
    "",
  );
}

// Auto-initialize when loaded as a Lovelace resource in a real browser.
// Guarded so importing the module in unit tests doesn't attach the global
// listener (tests call show()/close() directly).
if (typeof document !== "undefined" && !window.__POPUP_CARD_TEST__) {
  initPopupCard();
}
