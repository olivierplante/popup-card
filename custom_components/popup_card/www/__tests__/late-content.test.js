/**
 * Regression test for content that settles AFTER the popup opens.
 *
 * The sheet slid from `translate: 0 100%`, a percentage of the box height
 * captured when the transition started. Cards like logbook fetch over the
 * websocket and grow well after that, which left the surface starting
 * mid-screen and drifting up: measured in Chromium, the slide began at top 694
 * of an 864px viewport for a 610px surface. The rise is now a fixed offset, so
 * no late growth can stale it.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { close, show } from "../popup-card.js";

let observers = [];

/** Captures instances so tests can fire resize callbacks on demand. */
class StubResizeObserver {
  constructor(callback) {
    this.callback = callback;
    this.targets = [];
    this.disconnected = false;
    observers.push(this);
  }
  observe(target) {
    this.targets.push(target);
  }
  disconnect() {
    this.disconnected = true;
  }
  fire() {
    this.callback([], this);
  }
}

function growableCard() {
  const card = document.createElement("div");
  card.className = "stub-content-card";
  const inner = document.createElement("div");
  inner.className = "inner-scroller";
  card.appendChild(inner);
  Object.defineProperty(inner, "scrollHeight", { value: 0, writable: true });
  Object.defineProperty(inner, "clientHeight", { value: 0, writable: true });
  return card;
}

/** Simulates websocket data arriving: the inner list becomes scrollable. */
function loadData() {
  const inner = document.querySelector(".inner-scroller");
  inner.scrollHeight = 900;
  inner.clientHeight = 300;
}

function stubHelpers(factory) {
  globalThis.window.loadCardHelpers = async () => ({
    createCardElement: factory,
  });
}

beforeEach(() => {
  observers = [];
  globalThis.window.ResizeObserver = StubResizeObserver;
  stubHelpers(growableCard);
  const ha = document.createElement("home-assistant");
  ha.hass = { states: {} };
  document.body.appendChild(ha);
});

afterEach(() => {
  close();
  document.body.innerHTML = "";
  document.head.innerHTML = "";
  delete globalThis.window.loadCardHelpers;
  delete globalThis.window.ResizeObserver;
});

describe("sheet slide is independent of the surface height", () => {
  it("test_sheet_does_not_translate_by_a_percentage", async () => {
    await show({ content: { type: "markdown" }, presentation: "sheet" });
    const css = document.querySelector("#popup-card-styles").textContent;
    const sheetRule = css.slice(css.indexOf(".popup-card-overlay.popup-card-sheet"));
    // A percentage resolves against a box that late content changes.
    expect(sheetRule).not.toMatch(/translate:\s*0\s+100%/);
  });

  it("test_sheet_entrance_is_not_a_css_transition", async () => {
    await show({ content: { type: "markdown" }, presentation: "sheet" });
    const css = document.querySelector("#popup-card-styles").textContent;
    const sheetRule = css.slice(
      css.indexOf(".popup-card-overlay.popup-card-sheet .popup-card-dialog"),
    );
    // Explicit keyframes own it (see sheet-reveal.test.js), so a transition
    // must not run alongside and reintroduce the re-derivation problem.
    expect(sheetRule).toMatch(/transition:\s*none/);
  });
});
