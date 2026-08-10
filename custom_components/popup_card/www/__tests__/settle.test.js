/**
 * The surface is revealed only once its content has stopped resizing.
 *
 * Measured on a real logbook sheet, viewport constant at 812 throughout:
 *   dlg 690+122 -> 608+204 -> 656+156 -> 506+306 -> settled
 * The card renders progressively and its height oscillates, shrinking before
 * it grows. A bottom-anchored sheet turns every one of those into a jump of
 * the top edge, which read as the sheet overshooting and snapping back.
 *
 * The scrim still appears immediately, so the tap feels answered; only the
 * surface waits, and never longer than the cap.
 *
 * Real timers here: requestAnimationFrame does not advance under fake ones,
 * and the open sequence runs across frames.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { close, show } from "../popup-card.js";

let observers = [];

class StubResizeObserver {
  constructor(callback) {
    this.callback = callback;
    this.disconnected = false;
    observers.push(this);
  }
  observe() {}
  disconnect() {
    this.disconnected = true;
  }
  fire() {
    this.callback([], this);
  }
}

function stubHelpers() {
  globalThis.window.loadCardHelpers = async () => ({
    createCardElement: () => {
      const el = document.createElement("div");
      el.className = "stub-content-card";
      return el;
    },
  });
}

function overlay() {
  return document.querySelector(".popup-card-overlay");
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

beforeEach(() => {
  observers = [];
  globalThis.window.ResizeObserver = StubResizeObserver;
  stubHelpers();
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

describe("surface waits for its content to settle", () => {
  it("test_scrim_is_shown_immediately", async () => {
    await show({ content: { type: "markdown" } });
    // The overlay carries the scrim: it must not wait on the content.
    await vi.waitFor(() =>
      expect(overlay().classList.contains("open")).toBe(true),
    );
  });

  it("test_surface_is_held_back_while_the_content_resizes", async () => {
    await show({ content: { type: "markdown" }, presentation: "sheet" });
    await vi.waitFor(() => expect(observers.length).toBeGreaterThan(0));
    for (let tick = 0; tick < 4; tick += 1) {
      observers.forEach((observer) => observer.fire());
      await wait(30);
    }
    // Still resizing, so the surface stays hidden.
    expect(overlay().classList.contains("popup-card-settled")).toBe(false);
  });

  it("test_surface_appears_once_resizing_stops", async () => {
    await show({ content: { type: "markdown" }, presentation: "sheet" });
    await vi.waitFor(() => expect(observers.length).toBeGreaterThan(0));
    observers.forEach((observer) => observer.fire());
    await vi.waitFor(
      () =>
        expect(overlay().classList.contains("popup-card-settled")).toBe(true),
      { timeout: 600 },
    );
  });

  it("test_surface_appears_even_if_resizing_never_stops", async () => {
    await show({ content: { type: "markdown" }, presentation: "sheet" });
    await vi.waitFor(() => expect(observers.length).toBeGreaterThan(0));
    // A card that never settles must not hide the popup forever: the cap wins.
    for (let tick = 0; tick < 20; tick += 1) {
      observers.forEach((observer) => observer.fire());
      await wait(30);
    }
    expect(overlay().classList.contains("popup-card-settled")).toBe(true);
  });

  it("test_settled_state_drives_the_surface_transition", async () => {
    await show({ content: { type: "markdown" }, presentation: "sheet" });
    const css = document.querySelector("#popup-card-styles").textContent;
    expect(css).toMatch(
      /\.popup-card-settled[^{]*\.popup-card-dialog\s*\{[^}]*opacity:\s*1/,
    );
    // The sheet reveals through keyframes instead; see sheet-reveal.test.js.
    expect(css).toMatch(/\.popup-card-sheet[^{]*\{[^}]*transition:\s*none/);
  });

  it("test_observer_is_disconnected_on_close", async () => {
    await show({ content: { type: "markdown" } });
    await vi.waitFor(() => expect(observers.length).toBeGreaterThan(0));
    close();
    // Exactly one observer per popup: a stale frame from a closed popup must
    // not arm the one that replaced it.
    expect(observers).toHaveLength(1);
    expect(observers.every((observer) => observer.disconnected)).toBe(true);
  });
});
