/**
 * Tests for swipe-to-close gesture handling and the global init listener.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { close, initPopupCard, show } from "../popup-card.js";

function stubHelpers() {
  globalThis.window.loadCardHelpers = async () => ({
    createCardElement: () => {
      const el = document.createElement("div");
      el.className = "stub-content-card";
      return el;
    },
  });
}

function touch(type, clientY) {
  const dialog = document.querySelector(".popup-card-dialog");
  const event = new Event(type, { bubbles: true, cancelable: true });
  event.touches = [{ clientY }];
  dialog.dispatchEvent(event);
  return event;
}

beforeEach(() => {
  stubHelpers();
  const ha = document.createElement("home-assistant");
  ha.hass = { states: {} };
  document.body.appendChild(ha);
});

afterEach(() => {
  close();
  document.body.innerHTML = "";
  delete globalThis.window.loadCardHelpers;
});

describe("swipe to close", () => {
  it("test_swipe_past_threshold_closes", async () => {
    vi.useFakeTimers();
    await show({ content: { type: "markdown" } });
    touch("touchstart", 100);
    touch("touchmove", 200); // delta 100 > 80 threshold
    touch("touchend", 200);
    // close() runs after a 200ms transition timeout.
    vi.advanceTimersByTime(200);
    expect(document.querySelector(".popup-card-overlay")).toBeNull();
    vi.useRealTimers();
  });

  it("test_small_swipe_snaps_back_and_stays_open", async () => {
    await show({ content: { type: "markdown" } });
    touch("touchstart", 100);
    touch("touchmove", 130); // delta 30 — below threshold
    touch("touchend", 130);
    const dialog = document.querySelector(".popup-card-dialog");
    expect(dialog).not.toBeNull();
    // Snap-back clears the drag transform.
    expect(dialog.style.transform).toBe("");
  });

  it("test_touchmove_without_start_is_ignored", async () => {
    await show({ content: { type: "markdown" } });
    // No touchstart — move should be a no-op (no transform applied).
    touch("touchmove", 300);
    const dialog = document.querySelector(".popup-card-dialog");
    expect(dialog.style.transform).toBe("");
  });
});

describe("initPopupCard", () => {
  it("test_ll_custom_event_opens_popup", async () => {
    initPopupCard();
    document.body.dispatchEvent(
      new CustomEvent("ll-custom", {
        bubbles: true,
        detail: { popup_card: { content: { type: "markdown" } } },
      }),
    );
    // show() is async; wait for the overlay to be appended.
    await vi.waitFor(() =>
      expect(document.querySelector(".popup-card-overlay")).not.toBeNull(),
    );
  });

  it("test_ll_custom_without_popup_card_is_ignored", async () => {
    initPopupCard();
    document.body.dispatchEvent(
      new CustomEvent("ll-custom", { bubbles: true, detail: {} }),
    );
    await Promise.resolve();
    expect(document.querySelector(".popup-card-overlay")).toBeNull();
  });
});
