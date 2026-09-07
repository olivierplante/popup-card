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

// Matches the CSS breakpoint below which a popup goes full screen. Kept in
// sync by hand: it decides whether the dialog has a definite height, which is
// what makes the card fill hint safe.
const FULL_SCREEN_QUERY = "(max-width: 768px)";

function isFullScreenViewport() {
  return (
    typeof window.matchMedia === "function" &&
    window.matchMedia(FULL_SCREEN_QUERY).matches
  );
}

/**
 * Cards decide for themselves whether they may fill their container, and they
 * read HA's `layout` hint to do it. The logbook card is the clearest case: it
 * pins ha-logbook to 385px and only releases it to 100% for `grid` or `panel`.
 * Without the hint a full-screen popup wraps a 385px list in dead space, and
 * no amount of stretching from outside changes that.
 *
 * Only passed where the popup actually has a definite height to fill: a sticky
 * popup on a narrow screen, which is full screen. Everywhere else the dialog
 * sizes to its content, and a card told to fill an indefinite height collapses
 * instead — that is what left the logbook three rows tall on desktop.
 */
async function createCard(config, { fillsHeight = false } = {}) {
  const helpers = await window.loadCardHelpers();
  const card = await helpers.createCardElement(config);
  if (fillsHeight) card.layout = "panel";
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

// ─── Jinja templating ──────────────────────────────────────────────────

// Config keys we define ourselves. Nothing downstream ever renders these, so
// templating them cannot collide with a card's own templating. The two boolean
// options are deliberately absent: render_template returns strings, and the
// string "false" is not false, so templating them would silently flip them.
const OWN_TEMPLATE_KEYS = [
  "title",
  "style",
  "auto_close",
  "close_position",
  "presentation",
  ...STYLE_KEYS,
];

// Key names that hold entity ids, matched at any depth inside `content`. Every
// core card that names an entity uses one of these, and containers (cards,
// elements, badges, conditions, series) are reached by walking rather than by
// knowing their shape, so custom cards work without us knowing their schema.
//
// Matching on the key name is what keeps the markdown card safe: its templated
// field is `content`, which we never touch, while its entity key is `entity_id`,
// a scoping list that is ours to resolve.
const ENTITY_KEYS = new Set([
  "entity",
  "entities",
  "entity_id",
  "camera_image",
  "image_entity",
]);

/**
 * Whether a value is a string carrying Jinja. Only opening markers count:
 * minified CSS in `style:` closes media queries with `}}`, which must not be
 * mistaken for a template.
 */
export function hasTemplate(value) {
  return (
    typeof value === "string" &&
    (value.includes("{{") || value.includes("{%"))
  );
}

function deepClone(value) {
  if (Array.isArray(value)) return value.map(deepClone);
  if (value && typeof value === "object") {
    const clone = {};
    for (const key of Object.keys(value)) clone[key] = deepClone(value[key]);
    return clone;
  }
  return value;
}

/**
 * Resolve every Jinja string in a popup_card config, returning a new config.
 *
 * The whole string goes to the renderer, not just what sits between the
 * braces, so `sensor.{{ base }}_memory` interpolates the way it reads.
 *
 * Renders are started for the entire config before any is awaited, so a config
 * with several templates costs one round trip rather than one each.
 *
 * @param {object} config raw popup_card config
 * @param {(template: string) => Promise<string>|string} renderFn
 * @returns {Promise<object>} a clone with rendered values substituted
 */
export async function resolveTemplates(config, renderFn) {
  // Explicit opt-out, so a config can turn the whole pass off if our walk ever
  // collides with a card that renders its own Jinja under an entity-typed key.
  // Only `false` disables it, never a bare falsy check.
  if (config && config.render_templates === false) return config;

  const clone = deepClone(config);
  const pending = [];

  const render = (holder, key) => {
    pending.push(
      Promise.resolve(renderFn(holder[key])).then((result) => {
        holder[key] = result;
      }),
    );
  };

  // A value sitting under an entity-typed key: a string renders, a list renders
  // its string items, and anything else keeps walking (rows given as objects).
  const walkEntityValue = (holder, key) => {
    const value = holder[key];
    if (hasTemplate(value)) return render(holder, key);
    if (Array.isArray(value)) {
      value.forEach((item, index) => {
        if (hasTemplate(item)) render(value, index);
        else if (item && typeof item === "object") walkContent(item);
      });
      return;
    }
    if (value && typeof value === "object") walkContent(value);
  };

  function walkContent(node) {
    if (Array.isArray(node)) {
      for (const child of node) {
        if (child && typeof child === "object") walkContent(child);
      }
      return;
    }
    if (!node || typeof node !== "object") return;
    for (const key of Object.keys(node)) {
      if (ENTITY_KEYS.has(key)) {
        walkEntityValue(node, key);
      } else if (node[key] && typeof node[key] === "object") {
        walkContent(node[key]);
      }
    }
  }

  for (const key of OWN_TEMPLATE_KEYS) {
    if (hasTemplate(clone[key])) render(clone, key);
  }
  if (clone.content && typeof clone.content === "object") {
    walkContent(clone.content);
  }

  // Nothing to render: hand back the caller's own object rather than a
  // plain-data clone, which would flatten anything a JS-dispatched config
  // carries beyond JSON.
  if (!pending.length) return config;

  await Promise.all(pending);
  return clone;
}

/**
 * Render one template over HA's websocket.
 *
 * render_template is a subscription that pushes on every change. A popup is
 * short-lived and re-opened constantly, so opening it is the refresh: we take
 * the first result and unsubscribe, leaving close() nothing extra to tear down.
 */
function renderTemplate(hass, template) {
  return new Promise((resolve, reject) => {
    let unsubscribe = null;
    let settled = false;

    const release = () => {
      if (typeof unsubscribe === "function") unsubscribe();
      unsubscribe = "released";
    };

    const onMessage = (message) => {
      if (settled) return;
      settled = true;
      release();
      if (message && message.error) reject(new Error(message.error));
      else resolve(message ? message.result : "");
    };

    hass.connection
      .subscribeMessage(onMessage, {
        type: "render_template",
        template,
        report_errors: true,
      })
      .then((fn) => {
        unsubscribe = fn;
        // The first push can land before the subscription promise resolves.
        if (settled) release();
      }, reject);
  });
}

/**
 * Normalize a raw popup_card config into the shape show() consumes.
 *
 * @param {object} config raw config from the ll-custom event
 * @returns {{title:string|undefined, content:any, autoCloseMs:number|null,
 *            showProgress:boolean, stickyHeader:boolean,
 *            closePosition:"left"|"right", presentation:"centered"|"sheet",
 *            swipeToClose:boolean, styleConfig:object}}
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

  // sticky_header: keep the title and close button in place while the body
  // scrolls. Opt-in — the default keeps the whole dialog as one scroll area.
  const stickyHeader = config.sticky_header === true;

  // close_position: which side the ✕ sits on. HA's own dialogs put it on the
  // left; ours has always been on the right, which stays the default.
  const closePosition = config.close_position === "left" ? "left" : "right";

  // presentation: how the surface is placed. `centered` is the historical
  // behaviour and the default; `sheet` anchors it to the bottom edge. Unknown
  // values fall back rather than rendering something unplaceable.
  const presentation = config.presentation === "sheet" ? "sheet" : "centered";

  // swipe_to_close: whether the drag-to-dismiss gesture is attached at all.
  // Explicit opt-out only, same shape as auto_close_progress — a popup whose
  // content is mostly a slider can still turn the gesture off outright.
  const swipeToClose = config.swipe_to_close !== false;

  const styleConfig = {};
  for (const key of STYLE_KEYS) {
    if (config[key] != null) styleConfig[key] = config[key];
  }
  if (config.style != null) styleConfig.style = config.style;

  return {
    title,
    content,
    autoCloseMs,
    showProgress,
    stickyHeader,
    closePosition,
    presentation,
    swipeToClose,
    styleConfig,
  };
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
 * Discrete keys become --popup-card-* variables set on this popup's scope
 * class; the raw `style:` block follows, setting properties directly. The
 * frame's defaults live in the structural stylesheet, which reads those
 * variables. Hence:
 *
 *     theme variables  <  discrete keys  <  user `style:`
 *
 * Keys beat an inherited theme value because they are set on the overlay
 * element itself; raw CSS beats keys because it sets the property, not the
 * variable, and is emitted last.
 *
 * @param {string} scopeClass unique overlay class (e.g. popup-card-overlay-3)
 * @param {object} styleConfig discrete keys + optional raw `style`
 * @returns {string} CSS text
 */
export function buildPopupStyles(scopeClass, styleConfig = {}) {
  const scope = `.${scopeClass}`;
  const blocks = [];

  // 1. Discrete keys, written as --popup-card-* variables on this popup's own
  //    scope. The structural stylesheet reads those variables with defaults,
  //    so a key set here beats any value inherited from the user's theme
  //    (set on the overlay element itself) while still losing to the raw
  //    `style:` block below, which sets properties directly and comes last.
  const {
    background,
    backdrop,
    backdrop_blur,
    border_radius,
    border,
    title_color,
  } = styleConfig;

  const vars = [];
  if (background != null) vars.push(`--popup-card-background: ${background};`);
  if (backdrop != null) vars.push(`--popup-card-backdrop: ${backdrop};`);
  if (backdrop_blur != null) {
    vars.push(`--popup-card-backdrop-filter: blur(${backdrop_blur});`);
  }
  if (border_radius != null) vars.push(`--popup-card-radius: ${border_radius};`);
  if (border != null) vars.push(`--popup-card-border: ${border};`);
  if (title_color != null) {
    vars.push(`--popup-card-title-color: ${title_color};`);
  }
  if (vars.length) {
    blocks.push(`${scope} { ${vars.join(" ")} }`);
  }

  // 2. User raw `style:` — emitted last so it always wins.
  if (styleConfig.style != null) {
    blocks.push(scopeRawStyle(scopeClass, String(styleConfig.style)));
  }

  return blocks.join("\n");
}

// ─── Structural styles (not user-overridable surfaces) ─────────────────

const STYLES = `
  /* The overlay is a real <dialog> opened with showModal(): the browser puts
     it in the top layer, so no ancestor transform, filter, contain or z-index
     can clip or occlude it. These rules undo the UA dialog defaults (auto
     margins, border, padding, fit-content sizing, canvas background) and turn
     it back into a full-viewport flex container. A class selector outranks the
     UA element selector, so no !important is needed. */
  .popup-card-overlay {
    position: fixed;
    inset: 0;
    width: 100%;
    height: 100%;
    max-width: none;
    max-height: none;
    margin: 0;
    padding: 0;
    border: none;
    background: transparent;
    color: inherit;
    z-index: 999;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
  }
  /* The scrim is the .popup-card-backdrop child, not ::backdrop — that keeps
     the documented class API (and the backdrop/backdrop_blur keys) working. */
  .popup-card-overlay::backdrop {
    background: transparent;
  }
  .popup-card-overlay.open {
    opacity: 1;
  }
  .popup-card-backdrop {
    position: absolute;
    inset: 0;
    background: var(--popup-card-backdrop, rgba(0, 0, 0, 0.8));
    -webkit-backdrop-filter: var(--popup-card-backdrop-filter, none);
    backdrop-filter: var(--popup-card-backdrop-filter, none);
  }
  .popup-card-dialog {
    position: relative;
    z-index: 1;
    /* --ha-card-background is read by ha-card but defined by no HA core
       stylesheet, so stopping the chain there painted a dark slab on light
       themes. It continues to --card-background-color before any literal. */
    background: var(--popup-card-background, var(--ha-card-background, var(--card-background-color, rgba(30, 30, 30, 0.95))));
    border-radius: var(--popup-card-radius, 16px);
    border: var(--popup-card-border, 1px solid rgba(255, 255, 255, 0.08));
    box-shadow: var(--popup-card-shadow, none);
    max-width: var(--popup-card-max-width, 500px);
    width: var(--popup-card-width, 90%);
    max-height: var(--popup-card-max-height, 80vh);
    overflow-y: auto;
    scrollbar-width: none;
    box-sizing: border-box;
    touch-action: pan-y;
    /* Opens the way HA's dialogs do: opacity 0 -> 1 with scale 0.8 -> 1, ease,
       over --ha-dialog-show-duration. scale is its own CSS property, so the
       swipe gesture can keep using transform for the drag without the two
       fighting. The transform transition stays at 150ms for that gesture. */
    opacity: 0;
    scale: 0.8;
  }
  /* showModal() focuses the first focusable descendant, which was the close
     button — mobile then painted a focus ring on the X of every popup. The
     surface claims focus instead, and shows no ring for it. */
  .popup-card-dialog:focus,
  .popup-card-dialog:focus-visible {
    outline: none;
  }
  /* Transitions are armed only once the popup is ready, one frame after the
     content card has laid out. Armed earlier, a card that grows after mount
     animates the surface's height-derived translate and scale on its way in,
     which reads as the popup drifting into place. */
  .popup-card-ready {
    transition: opacity var(--popup-card-animation-duration, var(--ha-dialog-show-duration, 200ms)) ease;
  }
  .popup-card-ready .popup-card-dialog {
    transition:
      transform 150ms ease,
      scale var(--popup-card-animation-duration, var(--ha-dialog-show-duration, 200ms)) ease,
      translate var(--popup-card-animation-duration, var(--ha-dialog-show-duration, 200ms)) ease,
      opacity var(--popup-card-animation-duration, var(--ha-dialog-show-duration, 200ms)) ease;
  }
  /* The scrim fades in with .open, immediately. The surface waits for
     .popup-card-settled, which lands once its content stops resizing —
     measured on a real logbook sheet, the card's height went 122 -> 204 ->
     156 -> 306 while the viewport never moved, and every one of those steps
     jumped a bottom-anchored sheet. */
  .popup-card-overlay.popup-card-settled .popup-card-dialog {
    opacity: 1;
    scale: 1;
  }
  @media (prefers-reduced-motion: reduce) {
    .popup-card-overlay,
    .popup-card-dialog {
      transition-duration: 0ms;
    }
    .popup-card-dialog {
      scale: 1;
    }
  }
  .popup-card-dialog::-webkit-scrollbar { display: none; }
  .popup-card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--popup-card-header-padding, 20px 24px 0);
  }
  .popup-card-title {
    color: var(--popup-card-title-color, var(--primary-text-color, #fff));
    font-size: var(--popup-card-title-size, 18px);
    font-weight: var(--popup-card-title-weight, 700);
  }
  .popup-card-close {
    background: none;
    border: none;
    /* currentColor, not a hardcoded white: the X was invisible on any light
       surface. Dimming is done with opacity so it works on both. */
    color: var(--popup-card-close-color, currentColor);
    opacity: 0.6;
    font-size: 20px;
    cursor: pointer;
    padding: 4px 8px;
    line-height: 1;
  }
  .popup-card-close:hover { opacity: 1; }
  .popup-card-content {
    padding: var(--popup-card-padding, 16px 24px 24px);
  }

  /* sticky_header: the dialog stops scrolling and the content takes over, so
     the header stays put. min-height:0 is what lets the content shrink inside
     the flex column instead of overflowing it. */
  .popup-card-dialog.popup-card-sticky {
    display: flex;
    flex-direction: column;
    overflow: hidden;
    /* Sizes to its content and scrolls once it reaches the maximum. The fill
       hint in createCard() is withheld here, because a card told it may fill
       collapses against an indefinite height — that is what left the logbook
       three rows tall on desktop. */
    height: auto;
  }
  .popup-card-dialog.popup-card-sticky .popup-card-content {
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
    scrollbar-width: none;
  }
  .popup-card-dialog.popup-card-sticky .popup-card-content::-webkit-scrollbar {
    display: none;
  }

  /* close_position: left — HA's own dialogs lead with the ✕. */
  .popup-card-header.popup-card-close-left {
    flex-direction: row-reverse;
    justify-content: flex-end;
    gap: 8px;
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
    background: var(--popup-card-progress-color, currentColor);
    opacity: 0.25;
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
      /* HA's frontend renders with viewport-fit=cover, so a full-screen
         surface sits underneath the iOS status bar and home indicator unless
         it insets itself — confirmed on-device as the title overlapping the
         clock and the close button overlapping the battery icon. The dialog
         is already box-sizing: border-box above, so this padding comes out
         of the 100% height rather than pushing the surface past it. The
         backdrop is untouched and keeps covering the full screen; only the
         surface pays the inset back. left/right are 0 in portrait and only
         matter in landscape on a notched device. */
      padding-top: env(safe-area-inset-top, 0px);
      padding-bottom: env(safe-area-inset-bottom, 0px);
      padding-left: env(safe-area-inset-left, 0px);
      padding-right: env(safe-area-inset-right, 0px);
    }
    /* Full screen here, unlike wider screens where a sticky popup sizes to its
       content. That definite height is also what makes the fill hint safe, so
       a card that can fill (logbook) uses the whole screen instead of leaving
       dead space under itself. */
    .popup-card-dialog.popup-card-sticky {
      height: 100%;
    }
    .popup-card-dialog.popup-card-sticky .popup-card-content > * {
      display: block;
      height: 100%;
    }
    /* The countdown bar is pinned to the dialog's own top edge (see the base
       .popup-card-progress rule above), which is now under the status bar
       inset rather than the surface's edge. Follow the same inset here so it
       lands just below the status bar instead of hidden beneath it. Two
       classes in the selector out-specify the single-class base rule. */
    .popup-card-dialog .popup-card-progress {
      top: env(safe-area-inset-top, 0px);
    }
  }

  /* presentation: sheet — anchored to the bottom edge with rounded top
     corners, sliding up instead of scaling in. Two classes in the selector, so
     it outranks the single-class mobile full-screen rule above at any width.
     translate is its own property: transform stays free for the swipe drag and
     scale for the centered mode. */
  .popup-card-overlay.popup-card-sheet {
    align-items: flex-end;
  }
  .popup-card-overlay.popup-card-sheet .popup-card-dialog {
    width: 100%;
    max-width: var(--popup-card-max-width, 640px);
    max-height: var(--popup-card-max-height, 90vh);
    height: auto;
    border: none;
    border-radius: var(--popup-card-radius, 28px) var(--popup-card-radius, 28px) 0 0;
    padding-bottom: env(safe-area-inset-bottom, 0px);
    scale: 1;
    /* The entrance is run from JS with explicit keyframes (revealSheet), so
       no starting translate here and no transition below: a CSS transition
       derives its start value from computed style when it starts, and WebKit
       lets a layout change mid-flight re-derive it. On a bottom-anchored
       surface that showed up as the sheet passing above its resting place and
       settling back. Its own compositing layer keeps layout from perturbing
       the animation, a documented WebKit workaround. */
    will-change: transform, opacity;
  }
  .popup-card-overlay.popup-card-sheet .popup-card-dialog {
    transition: none;
  }
`;

// ─── Popup Manager ─────────────────────────────────────────────────────

let overlay = null;
let escHandler = null;
let popstateHandler = null;
let touchActive = false;
let touchStartX = 0;
let touchStartY = 0;
let touchCurrentY = 0;
let isDragging = false;
// null until the gesture has traveled far enough to tell horizontal from
// vertical, then held for the rest of the touch. See onTouchMove.
let gestureAxis = null;
let scopeCounter = 0;

function injectStyles(styleHost) {
  if (styleHost.querySelector("#popup-card-styles")) return;
  const style = document.createElement("style");
  style.id = "popup-card-styles";
  style.textContent = STYLES;
  styleHost.appendChild(style);
}

// How long a popup waits for its content to stop resizing before the surface
// is revealed, and the cap that guarantees it appears regardless. Measured on
// a real logbook sheet, the content settled by ~250ms.
const SETTLE_QUIET_MS = 80;
const SETTLE_CAP_MS = 400;

/**
 * Reveal the surface once its content has stopped changing size.
 *
 * Cards render progressively, and their height can shrink before it grows. A
 * bottom-anchored sheet turns every step into a jump of its top edge, which
 * reads as the popup overshooting and snapping back. Waiting costs nothing
 * visible: the scrim is already up, so the tap feels answered.
 */
function revealWhenSettled(overlayEl, onSettled) {
  let done = false;
  let quietTimer = null;

  const finish = () => {
    if (done) return;
    done = true;
    clearTimeout(quietTimer);
    clearTimeout(overlayEl._settleCapTimer);
    if (overlayEl._settleObserver) overlayEl._settleObserver.disconnect();
    onSettled();
  };

  // Always fires, so a card that never stops resizing cannot hide the popup.
  overlayEl._settleCapTimer = setTimeout(finish, SETTLE_CAP_MS);

  if (typeof ResizeObserver !== "function") {
    quietTimer = setTimeout(finish, SETTLE_QUIET_MS);
    return;
  }

  const observer = new ResizeObserver(() => {
    clearTimeout(quietTimer);
    quietTimer = setTimeout(finish, SETTLE_QUIET_MS);
  });
  observer.observe(overlayEl.querySelector(".popup-card-dialog"));
  overlayEl._settleObserver = observer;

  // No resize at all (static content) still has to resolve.
  quietTimer = setTimeout(finish, SETTLE_QUIET_MS);
}

// The sheet's entrance distance, when the theme does not set one.
const SHEET_RISE_DEFAULT = "24px";
const SHEET_DURATION_DEFAULT = 200;

/**
 * Animate a sheet into place with explicit keyframes.
 *
 * Not a CSS transition: a transition derives its start value from computed
 * style at the moment it starts, and WebKit lets a layout change mid-flight
 * re-derive it. Measured on a real iPhone, that showed the surface passing
 * above its resting place and settling back, with the overlay, the page scroll
 * and the viewport all steady. Keyframes state both ends outright, so nothing
 * can reinterpret them.
 */
function revealSheet(overlayEl) {
  const dialog = overlayEl.querySelector(".popup-card-dialog");
  if (!dialog || typeof dialog.animate !== "function") return;

  const styles = getComputedStyle(dialog);
  const rise =
    (styles.getPropertyValue("--popup-card-sheet-rise") || "").trim() ||
    SHEET_RISE_DEFAULT;
  // A theme can opt out of the motion entirely.
  if (parseFloat(rise) === 0) return;

  const duration =
    parseFloat(styles.getPropertyValue("--popup-card-animation-duration")) ||
    SHEET_DURATION_DEFAULT;

  dialog.animate(
    [
      { translate: `0 ${rise}`, opacity: 0 },
      { translate: "0 0", opacity: 1 },
    ],
    { duration, easing: "ease" },
  );
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

  // Resolve any Jinja in the config before parsing it, so everything
  // downstream sees plain values. Untemplated configs never touch the
  // websocket, so the common case costs nothing.
  const templateHass = getHass();
  const renderFn =
    templateHass && templateHass.connection
      ? (template) => renderTemplate(templateHass, template)
      : (template) => template;

  let config = rawConfig;
  let templateError = null;
  try {
    config = await resolveTemplates(rawConfig, renderFn);
  } catch (err) {
    templateError = err;
  }

  const {
    title,
    content,
    autoCloseMs,
    showProgress,
    stickyHeader,
    closePosition,
    presentation,
    swipeToClose,
    styleConfig,
  } = parseConfig(config);
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

  // Create overlay. A <dialog> rather than a div: opened modally below, it
  // renders in the browser's top layer and makes the rest of the document
  // inert (focus containment, no stray clicks) with no code of our own.
  overlay = document.createElement("dialog");
  overlay.className =
    presentation === "sheet"
      ? `popup-card-overlay popup-card-sheet ${scopeClass}`
      : `popup-card-overlay ${scopeClass}`;
  overlay._scopedStyleEl = scopedStyleEl;
  const dialogClasses = stickyHeader
    ? "popup-card-dialog popup-card-sticky"
    : "popup-card-dialog";
  const headerClasses =
    closePosition === "left"
      ? "popup-card-header popup-card-close-left"
      : "popup-card-header";

  overlay.innerHTML = `
    <div class="popup-card-backdrop"></div>
    <div class="${dialogClasses}" tabindex="-1" autofocus>
      ${withProgressBar ? '<div class="popup-card-progress"></div>' : ""}
      <div class="${headerClasses}">
        <span class="popup-card-title">${title || ""}</span>
        <button class="popup-card-close">✕</button>
      </div>
      <div class="popup-card-content"></div>
    </div>
  `;

  // Render HA card
  const contentEl = overlay.querySelector(".popup-card-content");
  try {
    // A failed template surfaces in the popup itself rather than leaving an
    // empty dialog: the message names what broke.
    if (templateError) throw templateError;
    const card = await createCard(content, {
      fillsHeight: stickyHeader && isFullScreenViewport(),
    });
    contentEl.appendChild(card);

    // Keep hass updated on the card
    const hassInterval = setInterval(() => {
      const hass = getHass();
      if (hass && card.hass !== hass) card.hass = hass;
    }, 1000);
    overlay._hassInterval = hassInterval;
  } catch (err) {
    const label =
      err === templateError ? "Template error" : "Error rendering card";
    contentEl.innerHTML = `<div style="color:red;padding:16px">${label}: ${err.message}</div>`;
  }

  // Append to the mount root (provider subtree, or <body> fallback), then open
  // modally. showModal() requires the element to be connected, so order
  // matters. The guard keeps non-standard embeds (and any browser without
  // dialog support) rendering an inline popup rather than nothing at all.
  mountRoot.appendChild(overlay);
  if (typeof overlay.showModal === "function") {
    overlay.showModal();
  } else {
    overlay.setAttribute("open", "");
  }
  document.body.style.overflow = "hidden";

  // Frame 1: the content card has laid out, so size it if it manages its own
  // scrolling and only then arm the transitions. Frame 2: open, so the
  // animation runs against a settled box. Arming earlier makes a card that
  // grows after mount animate the surface into place, which reads as drift.
  // Captured, so frames queued by a popup that has since been closed and
  // replaced cannot arm the one that took its place.
  const openedOverlay = overlay;

  requestAnimationFrame(() => {
    if (overlay !== openedOverlay) return;
    overlay.classList.add("popup-card-ready");

    requestAnimationFrame(() => {
      if (overlay !== openedOverlay) return;
      overlay.classList.add("open");

      // The scrim is up; hold the surface until its content stops resizing.
      revealWhenSettled(openedOverlay, () => {
        if (overlay !== openedOverlay) return;
        openedOverlay.classList.add("popup-card-settled");
        if (presentation === "sheet") revealSheet(openedOverlay);
      });

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

  // Escape can reach us twice in a real browser: the modal dialog's native
  // `cancel` event, and our own keydown listener (kept because `cancel` is not
  // fired everywhere — happy-dom, older webviews). preventDefault() stops the
  // browser closing the dialog behind our back, so close() stays the single
  // teardown path. Both entries are idempotent.
  overlay.addEventListener("cancel", (event) => {
    event.preventDefault();
    close();
  });

  escHandler = (e) => {
    if (e.key === "Escape") close();
  };
  document.addEventListener("keydown", escHandler);

  // Back button and the mobile back gesture close the popup, the way HA's own
  // dialogs do. One entry is pushed on open and consumed on close, so the
  // history stack is left exactly as we found it. When the user closes BY
  // going back the entry is already gone, hence the flag.
  if (typeof history !== "undefined" && typeof history.pushState === "function") {
    history.pushState({ popupCard: true }, "");
    overlay._historyPushed = true;

    popstateHandler = () => {
      if (overlay) overlay._historyPushed = false;
      close();
    };
    window.addEventListener("popstate", popstateHandler);
  }

  // Mobile: swipe down to close. Opt-out only — swipeToClose defaults true.
  if (swipeToClose) {
    const dialog = overlay.querySelector(".popup-card-dialog");
    dialog.addEventListener("touchstart", onTouchStart, { passive: true });
    dialog.addEventListener("touchmove", onTouchMove, { passive: false });
    dialog.addEventListener("touchend", onTouchEnd, { passive: true });
  }
}

export function close() {
  if (!overlay) return;

  // Detach the module state first. Closing the dialog fires events, and the
  // swipe and auto-close paths can call back in, so every re-entry has to be
  // a no-op rather than a second teardown.
  const dialogEl = overlay;
  overlay = null;

  // A popup can close mid-drag (auto-close timer, back gesture, Escape), which
  // never reaches onTouchEnd. Left set, the next popup's first touchmove would
  // arrive with no touchstart of its own and drag from stale state.
  touchActive = false;
  touchStartX = 0;
  touchStartY = 0;
  touchCurrentY = 0;
  isDragging = false;
  gestureAxis = null;

  if (dialogEl._autoCloseTimer) {
    clearTimeout(dialogEl._autoCloseTimer);
  }

  if (dialogEl._hassInterval) {
    clearInterval(dialogEl._hassInterval);
  }

  if (dialogEl._scopedStyleEl) {
    dialogEl._scopedStyleEl.remove();
  }

  if (dialogEl._settleObserver) {
    dialogEl._settleObserver.disconnect();
  }

  if (dialogEl._settleCapTimer) {
    clearTimeout(dialogEl._settleCapTimer);
  }

  // Close before removing: a <dialog> detached while still open stays
  // registered in the top layer in some engines.
  if (typeof dialogEl.close === "function" && dialogEl.open) {
    dialogEl.close();
  }

  dialogEl.remove();
  document.body.style.overflow = "";

  if (escHandler) {
    document.removeEventListener("keydown", escHandler);
    escHandler = null;
  }

  // Unhook before popping, so consuming our own entry cannot re-enter here.
  if (popstateHandler) {
    window.removeEventListener("popstate", popstateHandler);
    popstateHandler = null;
  }

  if (
    dialogEl._historyPushed &&
    typeof history !== "undefined" &&
    typeof history.back === "function"
  ) {
    history.back();
  }
}

// ─── Swipe to Close ────────────────────────────────────────────────────

/**
 * Is anything under the finger scrolled away from its own top?
 *
 * Reading one fixed element is not enough: content cards like logbook and
 * history scroll INSIDE themselves, so our container's scrollTop stays 0
 * forever and every downward drag would dismiss the popup instead of
 * scrolling it. Walking the drag's own composed path (which crosses shadow
 * boundaries, where those scrollers live) means a swipe dismisses only when
 * everything under it is at its top, and a drag outside any scroller always
 * dismisses.
 */
function pathIsScrolled(event, dialog) {
  const path =
    typeof event.composedPath === "function" ? event.composedPath() : [];
  const nodes = path.length ? path : [event.target];

  for (const node of nodes) {
    // Stop at the frame: the dialog is checked separately below, because it
    // is the scroller itself when sticky_header is off.
    if (node === dialog) break;
    if (node && node.scrollTop > 0) return true;
  }

  return dialog.scrollTop > 0;
}

// Elements whose own gesture recognizer wants the exact downward drag the
// sheet does. role="slider" is what ha-control-slider renders on the element
// its Hammer pan recognizer binds to — it covers every HA light/cover/fan/
// climate/volume control, plus any accessible custom slider built the same
// way. role="switch" and input[type="range"] round out the other native and
// HA controls a finger can drag or tap-drag across.
const GESTURE_CONTROL_SELECTOR =
  '[role="slider"],[role="switch"],input[type="range"]';

/**
 * Is a gesture-owning control (slider/switch) under the finger?
 *
 * The axis lock in onTouchMove separates most conflicts, but not this one: a
 * vertical ha-control-slider wants the same downward gesture the sheet does,
 * so no gesture-SHAPE rule can tell them apart — the element under the finger
 * has to win outright, decided at touchstart before any drag can arm.
 */
function pathHasGestureControl(event, dialog) {
  const path =
    typeof event.composedPath === "function" ? event.composedPath() : [];
  const nodes = path.length ? path : [event.target];

  for (const node of nodes) {
    if (node === dialog) break;
    if (
      typeof node?.matches === "function" &&
      node.matches(GESTURE_CONTROL_SELECTOR)
    ) {
      return true;
    }
  }

  return false;
}

function onTouchStart(e) {
  const dialog = overlay?.querySelector(".popup-card-dialog");
  if (!dialog) return;

  // Only dismiss when everything under the finger is at its own top.
  if (pathIsScrolled(e, dialog)) return;

  // Never dismiss when the finger is on a slider/switch — see
  // pathHasGestureControl above.
  if (pathHasGestureControl(e, dialog)) return;

  touchStartX = e.touches[0].clientX;
  touchStartY = e.touches[0].clientY;
  touchCurrentY = touchStartY;
  touchActive = true;
  isDragging = false;
  gestureAxis = null;
}

// Below this many px of total travel, direction is noise — a stationary
// finger still jitters a pixel or two. ha-control-slider's own Hammer pan
// recognizer arms at 10px with DIRECTION_ALL, so deciding the axis at 8
// resolves the conflict before either side's own threshold fires.
const AXIS_LOCK_THRESHOLD = 8;

function onTouchMove(e) {
  if (!touchActive) return;

  const dialog = overlay?.querySelector(".popup-card-dialog");
  if (!dialog) return;

  const currentX = e.touches[0].clientX;
  touchCurrentY = e.touches[0].clientY;
  const deltaX = currentX - touchStartX;
  const deltaY = touchCurrentY - touchStartY;

  // Decide the axis once, the first time total travel clears the lock
  // threshold, and hold it for the rest of the touch (a curved flick that
  // starts sideways and drifts down stays horizontal).
  if (gestureAxis === null && Math.hypot(deltaX, deltaY) > AXIS_LOCK_THRESHOLD) {
    gestureAxis = Math.abs(deltaX) > Math.abs(deltaY) ? "horizontal" : "vertical";
  }

  // A horizontal gesture is never ours: no drag, no transform, and no
  // preventDefault — whatever horizontal behavior lives under the finger
  // (a slider's own value drag, a swipeable row) keeps working untouched.
  if (gestureAxis === "horizontal") return;

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
    touchActive = false;
    touchStartX = 0;
    touchStartY = 0;
    isDragging = false;
    gestureAxis = null;
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

  touchActive = false;
  touchStartX = 0;
  touchStartY = 0;
  touchCurrentY = 0;
  isDragging = false;
  gestureAxis = null;
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
