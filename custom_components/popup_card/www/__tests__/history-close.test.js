/**
 * Tests for closing the popup with the back button / back gesture, which is
 * what HA's own dialogs do on mobile.
 *
 * Opening pushes one history entry; closing consumes it, so the stack is left
 * exactly as it was found. The entry must never be popped twice: when the user
 * closes BY going back, the entry is already gone.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { close, show } from "../popup-card.js";

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

beforeEach(() => {
  stubHelpers();
  const ha = document.createElement("home-assistant");
  ha.hass = { states: {} };
  document.body.appendChild(ha);
});

afterEach(() => {
  close();
  vi.restoreAllMocks();
  document.body.innerHTML = "";
  delete globalThis.window.loadCardHelpers;
});

describe("back button closes the popup", () => {
  it("test_opening_pushes_one_history_entry", async () => {
    const push = vi.spyOn(window.history, "pushState");
    await show({ content: { type: "markdown" } });
    expect(push).toHaveBeenCalledTimes(1);
    expect(push.mock.calls[0][0]).toMatchObject({ popupCard: true });
  });

  it("test_popstate_closes_and_tears_down", async () => {
    await show({ content: { type: "markdown" }, background: "rgb(1, 2, 3)" });
    window.dispatchEvent(new Event("popstate"));
    expect(overlay()).toBeNull();
    expect(document.querySelector("style[data-popup-card-scoped]")).toBeNull();
  });

  it("test_closing_normally_consumes_the_entry", async () => {
    const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
    await show({ content: { type: "markdown" } });
    close();
    expect(back).toHaveBeenCalledTimes(1);
  });

  it("test_closing_via_back_does_not_pop_twice", async () => {
    const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
    await show({ content: { type: "markdown" } });
    window.dispatchEvent(new Event("popstate"));
    expect(back).not.toHaveBeenCalled();
  });

  it("test_popstate_listener_is_removed_on_close", async () => {
    await show({ content: { type: "markdown" } });
    close();
    // A later popstate (ordinary navigation) must not reach a dead popup.
    expect(() => window.dispatchEvent(new Event("popstate"))).not.toThrow();
    expect(overlay()).toBeNull();
  });

  it("test_reopening_pushes_exactly_one_entry_again", async () => {
    vi.spyOn(window.history, "back").mockImplementation(() => {});
    const push = vi.spyOn(window.history, "pushState");
    await show({ content: { type: "markdown" } });
    await show({ content: { type: "markdown" } });
    // One per open — the first popup's entry was consumed by its close.
    expect(push).toHaveBeenCalledTimes(2);
  });
});
