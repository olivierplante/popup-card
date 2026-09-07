/**
 * Tests for swipe-to-close gesture handling and the global init listener.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { close, initPopupCard, parseConfig, show } from "../popup-card.js";

function stubHelpers() {
  globalThis.window.loadCardHelpers = async () => ({
    createCardElement: () => {
      const el = document.createElement("div");
      el.className = "stub-content-card";
      return el;
    },
  });
}

function touch(type, clientY, options = {}) {
  const { clientX = 0, target } = options;
  const dispatchTarget = target || document.querySelector(".popup-card-dialog");
  const event = new Event(type, { bubbles: true, cancelable: true });
  event.touches = [{ clientX, clientY }];
  dispatchTarget.dispatchEvent(event);
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

describe("swipe axis lock (issue #14)", () => {
  it("test_horizontal_dominant_move_applies_no_transform_and_does_not_close", async () => {
    await show({ content: { type: "markdown" } });
    touch("touchstart", 100, { clientX: 100 });
    // dx=30, dy=15 — horizontal-dominant, but dy alone clears the 10px drag
    // threshold, so a broken axis lock would still arm a drag here.
    const moveEvent = touch("touchmove", 115, { clientX: 130 });
    touch("touchend", 115, { clientX: 130 });
    const dialog = document.querySelector(".popup-card-dialog");
    expect(dialog.style.transform).toBe("");
    expect(moveEvent.defaultPrevented).toBe(false);
    expect(document.querySelector(".popup-card-overlay")).not.toBeNull();
  });

  it("test_vertical_dominant_move_still_drags_and_closes_past_80px", async () => {
    vi.useFakeTimers();
    await show({ content: { type: "markdown" } });
    touch("touchstart", 100, { clientX: 100 });
    touch("touchmove", 200, { clientX: 105 }); // dx=5, dy=100
    touch("touchend", 200, { clientX: 105 });
    vi.advanceTimersByTime(200);
    expect(document.querySelector(".popup-card-overlay")).toBeNull();
    vi.useRealTimers();
  });

  it("test_locked_horizontal_axis_holds_through_a_curved_flick", async () => {
    await show({ content: { type: "markdown" } });
    touch("touchstart", 100, { clientX: 100 });
    touch("touchmove", 102, { clientX: 130 }); // dx=30, dy=2 -> locks horizontal
    touch("touchmove", 200, { clientX: 130 }); // now dy=100, dx unchanged
    touch("touchend", 200, { clientX: 130 });
    const dialog = document.querySelector(".popup-card-dialog");
    expect(dialog.style.transform).toBe("");
    expect(document.querySelector(".popup-card-overlay")).not.toBeNull();
  });

  it("test_new_touch_after_a_horizontal_one_can_still_close", async () => {
    vi.useFakeTimers();
    await show({ content: { type: "markdown" } });
    touch("touchstart", 100, { clientX: 100 });
    touch("touchmove", 102, { clientX: 130 }); // horizontal, first gesture
    touch("touchend", 102, { clientX: 130 });
    // A fresh gesture must not inherit the previous one's locked axis.
    touch("touchstart", 100, { clientX: 100 });
    touch("touchmove", 200, { clientX: 100 }); // pure vertical
    touch("touchend", 200, { clientX: 100 });
    vi.advanceTimersByTime(200);
    expect(document.querySelector(".popup-card-overlay")).toBeNull();
    vi.useRealTimers();
  });

  it("test_touch_starting_at_clientY_zero_can_still_arm_a_drag", async () => {
    vi.useFakeTimers();
    await show({ content: { type: "markdown" } });
    touch("touchstart", 0, { clientX: 0 });
    touch("touchmove", 100, { clientX: 0 });
    touch("touchend", 100, { clientX: 0 });
    vi.advanceTimersByTime(200);
    expect(document.querySelector(".popup-card-overlay")).toBeNull();
    vi.useRealTimers();
  });

  it("test_gesture_state_does_not_leak_across_popups", async () => {
    await show({ content: { type: "markdown" } });
    touch("touchstart", 100, { clientX: 100 });
    touch("touchmove", 150, { clientX: 100 }); // arms a drag, sets a transform
    // Closed mid-drag (auto-close / back gesture / Escape), not via touchend.
    close();
    await show({ content: { type: "markdown" } });
    const dialog = document.querySelector(".popup-card-dialog");
    // No touchstart for this new popup — a leaked touchStartY/isDragging would
    // otherwise let this bare touchmove drag it.
    touch("touchmove", 999, { clientX: 100 });
    expect(dialog.style.transform).toBe("");
  });
});

describe("gesture-control bail (issue #14)", () => {
  function appendControl(tag, attrs) {
    const el = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
    document.querySelector(".popup-card-content").appendChild(el);
    return el;
  }

  it("test_touchstart_on_role_slider_never_arms_the_drag", async () => {
    await show({ content: { type: "markdown" } });
    const slider = appendControl("div", { role: "slider" });
    touch("touchstart", 100, { target: slider });
    touch("touchmove", 300, { target: slider });
    const dialog = document.querySelector(".popup-card-dialog");
    expect(dialog.style.transform).toBe("");
    expect(document.querySelector(".popup-card-overlay")).not.toBeNull();
  });

  it("test_touchstart_on_input_range_never_arms_the_drag", async () => {
    await show({ content: { type: "markdown" } });
    const range = appendControl("input", { type: "range" });
    touch("touchstart", 100, { target: range });
    touch("touchmove", 300, { target: range });
    const dialog = document.querySelector(".popup-card-dialog");
    expect(dialog.style.transform).toBe("");
  });

  it("test_touchstart_on_role_switch_never_arms_the_drag", async () => {
    await show({ content: { type: "markdown" } });
    const switchEl = appendControl("div", { role: "switch" });
    touch("touchstart", 100, { target: switchEl });
    touch("touchmove", 300, { target: switchEl });
    const dialog = document.querySelector(".popup-card-dialog");
    expect(dialog.style.transform).toBe("");
  });

  it("test_touch_on_a_node_without_a_control_in_its_path_still_drags", async () => {
    vi.useFakeTimers();
    await show({ content: { type: "markdown" } });
    const plain = appendControl("div", { class: "plain-row" });
    touch("touchstart", 100, { target: plain });
    touch("touchmove", 200, { target: plain });
    touch("touchend", 200, { target: plain });
    vi.advanceTimersByTime(200);
    expect(document.querySelector(".popup-card-overlay")).toBeNull();
    vi.useRealTimers();
  });

  it("test_control_match_on_the_dialog_itself_does_not_bail", async () => {
    vi.useFakeTimers();
    await show({ content: { type: "markdown" } });
    // The walk stops at (never checks) the dialog itself, so a match there
    // must not bail the gesture.
    document.querySelector(".popup-card-dialog").setAttribute("role", "slider");
    touch("touchstart", 100);
    touch("touchmove", 200);
    touch("touchend", 200);
    vi.advanceTimersByTime(200);
    expect(document.querySelector(".popup-card-overlay")).toBeNull();
    vi.useRealTimers();
  });
});

describe("swipe_to_close config key (issue #14)", () => {
  it("test_swipe_to_close_false_attaches_no_drag_behavior", async () => {
    await show({ content: { type: "markdown" }, swipe_to_close: false });
    touch("touchstart", 100);
    touch("touchmove", 200);
    touch("touchend", 200);
    const dialog = document.querySelector(".popup-card-dialog");
    expect(dialog.style.transform).toBe("");
    expect(document.querySelector(".popup-card-overlay")).not.toBeNull();
  });

  it("test_swipe_to_close_false_still_allows_the_close_button", async () => {
    await show({ content: { type: "markdown" }, swipe_to_close: false });
    document.querySelector(".popup-card-close").click();
    expect(document.querySelector(".popup-card-overlay")).toBeNull();
  });

  it("test_swipe_to_close_false_still_allows_escape", async () => {
    await show({ content: { type: "markdown" }, swipe_to_close: false });
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(document.querySelector(".popup-card-overlay")).toBeNull();
  });

  it("test_swipe_to_close_true_keeps_current_behavior", async () => {
    vi.useFakeTimers();
    await show({ content: { type: "markdown" }, swipe_to_close: true });
    touch("touchstart", 100);
    touch("touchmove", 200);
    touch("touchend", 200);
    vi.advanceTimersByTime(200);
    expect(document.querySelector(".popup-card-overlay")).toBeNull();
    vi.useRealTimers();
  });

  it("test_swipe_to_close_absent_keeps_current_behavior", async () => {
    vi.useFakeTimers();
    await show({ content: { type: "markdown" } });
    touch("touchstart", 100);
    touch("touchmove", 200);
    touch("touchend", 200);
    vi.advanceTimersByTime(200);
    expect(document.querySelector(".popup-card-overlay")).toBeNull();
    vi.useRealTimers();
  });

  it("test_parse_config_swipe_to_close_false_only_for_explicit_false", () => {
    expect(parseConfig({ content: {}, swipe_to_close: false }).swipeToClose).toBe(
      false,
    );
  });

  it("test_parse_config_swipe_to_close_true_for_absent_true_or_other_values", () => {
    expect(parseConfig({ content: {} }).swipeToClose).toBe(true);
    expect(parseConfig({ content: {}, swipe_to_close: true }).swipeToClose).toBe(
      true,
    );
    expect(
      parseConfig({ content: {}, swipe_to_close: "nonsense" }).swipeToClose,
    ).toBe(true);
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
