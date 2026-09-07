/**
 * Regression tests for the four defects found on the 1.3.0-test build.
 *
 * 1. showModal() focused the close button, so mobile painted a focus ring on
 *    the X of every popup.
 * 2. The swipe guard read one fixed element, but content cards (logbook,
 *    history) scroll INSIDE themselves, so our container's scrollTop stayed 0
 *    and every downward drag dismissed the popup instead of scrolling it.
 * 3. The open animation started before the content had laid out. With a
 *    percentage translate on a growing box, the surface drifted rather than
 *    sliding cleanly.
 * 4. In sticky mode a card that scrolls internally kept its own height inside
 *    a taller area, leaving a gap below it and a row clipped inside it.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { close, show } from "../popup-card.js";

/** A card that scrolls inside itself, the way hui-logbook-card does. */
function scrollableCard() {
  const card = document.createElement("div");
  card.className = "stub-content-card";
  const inner = document.createElement("div");
  inner.className = "inner-scroller";
  card.appendChild(inner);
  // happy-dom computes no layout, so the scroll geometry is declared.
  Object.defineProperty(inner, "scrollHeight", { value: 900, writable: true });
  Object.defineProperty(inner, "clientHeight", { value: 300, writable: true });
  return card;
}

function stubHelpers(factory) {
  globalThis.window.loadCardHelpers = async () => ({
    createCardElement: factory,
  });
}

function plainCard() {
  const el = document.createElement("div");
  el.className = "stub-content-card";
  return el;
}

function touchFrom(element, type, clientY) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  event.touches = [{ clientY }];
  element.dispatchEvent(event);
  return event;
}

function swipeDownFrom(element) {
  touchFrom(element, "touchstart", 100);
  touchFrom(element, "touchmove", 220);
  touchFrom(element, "touchend", 220);
}

function overlay() {
  return document.querySelector(".popup-card-overlay");
}

beforeEach(() => {
  stubHelpers(plainCard);
  const ha = document.createElement("home-assistant");
  ha.hass = { states: {} };
  document.body.appendChild(ha);
});

afterEach(() => {
  close();
  document.body.innerHTML = "";
  document.head.innerHTML = "";
  delete globalThis.window.loadCardHelpers;
});

describe("initial focus", () => {
  it("test_dialog_surface_takes_focus_not_the_close_button", async () => {
    await show({ content: { type: "markdown" } });
    const dialog = document.querySelector(".popup-card-dialog");
    // showModal() focuses the first focusable descendant unless something
    // claims it. Without this the X gets a focus ring on every open.
    expect(dialog.getAttribute("tabindex")).toBe("-1");
    expect(dialog.hasAttribute("autofocus")).toBe(true);
  });

  it("test_focus_ring_is_suppressed_on_the_surface", async () => {
    await show({ content: { type: "markdown" } });
    const css = document.querySelector("#popup-card-styles").textContent;
    expect(css).toMatch(/\.popup-card-dialog:focus[^{]*\{[^}]*outline:\s*none/);
  });
});

describe("swipe guard walks the whole drag path", () => {
  it("test_scrolled_inner_card_blocks_dismissal", async () => {
    vi.useFakeTimers();
    stubHelpers(scrollableCard);
    await show({ content: { type: "markdown" }, sticky_header: true });
    const inner = document.querySelector(".inner-scroller");
    inner.scrollTop = 200;
    swipeDownFrom(inner);
    vi.advanceTimersByTime(300);
    expect(overlay()).not.toBeNull();
    vi.useRealTimers();
  });

  it("test_inner_card_at_its_own_top_still_dismisses", async () => {
    vi.useFakeTimers();
    stubHelpers(scrollableCard);
    await show({ content: { type: "markdown" }, sticky_header: true });
    const inner = document.querySelector(".inner-scroller");
    inner.scrollTop = 0;
    swipeDownFrom(inner);
    vi.advanceTimersByTime(300);
    expect(overlay()).toBeNull();
    vi.useRealTimers();
  });

  it("test_drag_outside_any_scroller_dismisses", async () => {
    vi.useFakeTimers();
    stubHelpers(scrollableCard);
    await show({ content: { type: "markdown" }, sticky_header: true });
    // Scrolled content, but the drag starts on the header, outside it.
    document.querySelector(".inner-scroller").scrollTop = 200;
    swipeDownFrom(document.querySelector(".popup-card-header"));
    vi.advanceTimersByTime(300);
    expect(overlay()).toBeNull();
    vi.useRealTimers();
  });
});

describe("animation waits for layout", () => {
  it("test_transitions_are_armed_only_once_ready", async () => {
    await show({ content: { type: "markdown" } });
    const css = document.querySelector("#popup-card-styles").textContent;
    // Transitions live behind the ready class, so a content card that grows
    // after mount cannot animate the surface on its way in.
    expect(css).toMatch(/\.popup-card-ready[^{]*\{[^}]*transition:/);
  });

  it("test_ready_class_is_applied_after_mount", async () => {
    await show({ content: { type: "markdown" } });
    await vi.waitFor(() =>
      expect(overlay().classList.contains("popup-card-ready")).toBe(true),
    );
  });

  it("test_ready_is_not_applied_before_the_open_state", async () => {
    await show({ content: { type: "markdown" } });
    const el = overlay();
    await vi.waitFor(() => expect(el.classList.contains("open")).toBe(true));
    // Both land together; neither may appear without the other.
    expect(el.classList.contains("popup-card-ready")).toBe(true);
  });
});

describe("sticky sizing", () => {
  function stubViewport(narrow) {
    globalThis.window.matchMedia = (query) => ({
      matches: narrow && query.includes("768px"),
      media: query,
    });
  }

  it("test_sticky_sizes_to_its_content_up_to_a_maximum", async () => {
    await show({ content: { type: "markdown" }, sticky_header: true });
    const css = document.querySelector("#popup-card-styles").textContent;
    const stickyRule = css.slice(
      css.indexOf(".popup-card-dialog.popup-card-sticky {"),
    );
    // Hug the content, scroll past --popup-card-max-height (80vh default).
    expect(stickyRule).toMatch(/height:\s*auto/);
  });

  it("test_sticky_is_full_screen_on_narrow_viewports", async () => {
    await show({ content: { type: "markdown" }, sticky_header: true });
    const css = document.querySelector("#popup-card-styles").textContent;
    const mobileBlock = css.slice(css.indexOf("@media (max-width: 768px)"));
    expect(mobileBlock).toMatch(
      /\.popup-card-dialog\.popup-card-sticky\s*\{[^}]*height:\s*100%/,
    );
  });

  it("test_fill_hint_only_on_the_full_screen_viewport", async () => {
    stubViewport(true);
    await show({ content: { type: "markdown" }, sticky_header: true });
    // Full screen means a definite height, so a logbook may fill it.
    expect(document.querySelector(".stub-content-card").layout).toBe("panel");
  });

  it("test_no_fill_hint_when_the_popup_hugs_its_content", async () => {
    stubViewport(false);
    await show({ content: { type: "markdown" }, sticky_header: true });
    // Against an indefinite height a filling card collapses: this is what
    // rendered the logbook three rows tall on desktop.
    expect(document.querySelector(".stub-content-card").layout).toBeUndefined();
  });

  it("test_no_fill_hint_without_sticky", async () => {
    stubViewport(true);
    await show({ content: { type: "markdown" } });
    expect(document.querySelector(".stub-content-card").layout).toBeUndefined();
  });
});

describe("mobile safe-area insets", () => {
  // HA renders with viewport-fit=cover, so the full-screen mobile surface
  // sits under the iOS status bar and home indicator unless it insets
  // itself. happy-dom does not evaluate env() or lay anything out, so these
  // only guard that the rules are emitted — not that the layout is correct.
  // The real check is on a physical iPhone.

  it("test_mobile_dialog_gets_the_full_safe_area_padding", async () => {
    await show({ content: { type: "markdown" } });
    const css = document.querySelector("#popup-card-styles").textContent;
    const mobileBlock = css.slice(css.indexOf("@media (max-width: 768px)"));
    const dialogRule = mobileBlock.slice(
      mobileBlock.indexOf(".popup-card-dialog {"),
    );
    expect(dialogRule).toMatch(/padding-top:\s*env\(safe-area-inset-top,\s*0px\)/);
    expect(dialogRule).toMatch(
      /padding-bottom:\s*env\(safe-area-inset-bottom,\s*0px\)/,
    );
    expect(dialogRule).toMatch(
      /padding-left:\s*env\(safe-area-inset-left,\s*0px\)/,
    );
    expect(dialogRule).toMatch(
      /padding-right:\s*env\(safe-area-inset-right,\s*0px\)/,
    );
  });

  it("test_progress_bar_follows_the_top_inset_on_mobile", async () => {
    await show({ content: { type: "markdown" } });
    const css = document.querySelector("#popup-card-styles").textContent;
    const mobileBlock = css.slice(css.indexOf("@media (max-width: 768px)"));
    expect(mobileBlock).toMatch(
      /\.popup-card-dialog \.popup-card-progress\s*\{[^}]*top:\s*env\(safe-area-inset-top,\s*0px\)/,
    );
  });

  it("test_progress_bar_mobile_override_out_specifies_the_base_rule", async () => {
    await show({ content: { type: "markdown" } });
    const css = document.querySelector("#popup-card-styles").textContent;
    const mobileBlock = css.slice(css.indexOf("@media (max-width: 768px)"));
    // The selector charset is restricted to valid bare-class-selector
    // characters, so a run of comment prose (parens, apostrophes, periods)
    // between two rules can never be swallowed into a captured selector.
    const rules = [
      ...mobileBlock.matchAll(/([.\w\s>-]+)\{([^}]*)\}/g),
    ];
    const overrideRule = rules.find(
      ([, , body]) =>
        /top:\s*env\(safe-area-inset-top,\s*0px\)/.test(body) &&
        !/padding-top/.test(body),
    );
    expect(overrideRule).not.toBeUndefined();
    const overrideSelector = overrideRule[1].trim();
    // The base rule is the single class ".popup-card-progress". Counting "."
    // markers is a crude but sufficient specificity proxy here: the override
    // must name more classes to out-specify it, rather than relying on
    // source order (which the cascade would ignore for a lower-specificity
    // rule declared later anyway).
    const baseClassCount = (".popup-card-progress".match(/\./g) || []).length;
    const overrideClassCount = (overrideSelector.match(/\./g) || []).length;
    expect(overrideClassCount).toBeGreaterThan(baseClassCount);
  });
});
