/**
 * Tests for the header layout options: sticky_header and close_position.
 *
 * sticky_header moves the scroll container from the dialog to the content, so
 * the title and close button stay put while the body scrolls. That also moves
 * which element the swipe-to-close guard has to read: swiping down must only
 * close when the scrollable area is already at the top.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { close, parseConfig, show } from "../popup-card.js";

function stubHelpers() {
  globalThis.window.loadCardHelpers = async () => ({
    createCardElement: () => {
      const el = document.createElement("div");
      el.className = "stub-content-card";
      return el;
    },
  });
}

function touch(type, clientY, from) {
  const target = from || document.querySelector(".popup-card-dialog");
  const event = new Event(type, { bubbles: true, cancelable: true });
  event.touches = [{ clientY }];
  target.dispatchEvent(event);
  return event;
}

/** Drags from `from` (the dialog by default), past the 80px threshold. */
function swipeDown(from) {
  touch("touchstart", 100, from);
  touch("touchmove", 220, from);
  touch("touchend", 220, from);
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

describe("parseConfig — header layout", () => {
  it("test_sticky_header_defaults_to_false", () => {
    expect(parseConfig({ content: {} }).stickyHeader).toBe(false);
  });

  it("test_sticky_header_true_is_honoured", () => {
    expect(parseConfig({ content: {}, sticky_header: true }).stickyHeader).toBe(
      true,
    );
  });

  it("test_sticky_header_false_stays_false", () => {
    expect(
      parseConfig({ content: {}, sticky_header: false }).stickyHeader,
    ).toBe(false);
  });

  it("test_close_position_defaults_to_right", () => {
    expect(parseConfig({ content: {} }).closePosition).toBe("right");
  });

  it("test_close_position_left_is_honoured", () => {
    expect(
      parseConfig({ content: {}, close_position: "left" }).closePosition,
    ).toBe("left");
  });

  it("test_unknown_close_position_falls_back_to_right", () => {
    expect(
      parseConfig({ content: {}, close_position: "sideways" }).closePosition,
    ).toBe("right");
  });
});

describe("sticky header rendering", () => {
  it("test_sticky_class_absent_by_default", async () => {
    await show({ content: { type: "markdown" } });
    const dialog = document.querySelector(".popup-card-dialog");
    expect(dialog.classList.contains("popup-card-sticky")).toBe(false);
  });

  it("test_sticky_class_applied_when_enabled", async () => {
    await show({ content: { type: "markdown" }, sticky_header: true });
    const dialog = document.querySelector(".popup-card-dialog");
    expect(dialog.classList.contains("popup-card-sticky")).toBe(true);
  });

  it("test_close_left_class_applied_when_requested", async () => {
    await show({ content: { type: "markdown" }, close_position: "left" });
    const header = document.querySelector(".popup-card-header");
    expect(header.classList.contains("popup-card-close-left")).toBe(true);
  });

  it("test_close_left_class_absent_by_default", async () => {
    await show({ content: { type: "markdown" } });
    const header = document.querySelector(".popup-card-header");
    expect(header.classList.contains("popup-card-close-left")).toBe(false);
  });
});

describe("swipe guard reads the active scroll container", () => {
  it("test_sticky_scrolled_content_suppresses_swipe_close", async () => {
    vi.useFakeTimers();
    await show({ content: { type: "markdown" }, sticky_header: true });
    // Content is the scroller when sticky: mid-scroll, a downward drag that
    // starts inside it must scroll rather than dismiss.
    const content = document.querySelector(".popup-card-content");
    content.scrollTop = 50;
    swipeDown(content);
    vi.advanceTimersByTime(300);
    expect(document.querySelector(".popup-card-overlay")).not.toBeNull();
    vi.useRealTimers();
  });

  it("test_sticky_at_top_still_closes_on_swipe", async () => {
    vi.useFakeTimers();
    await show({ content: { type: "markdown" }, sticky_header: true });
    const content = document.querySelector(".popup-card-content");
    content.scrollTop = 0;
    swipeDown(content);
    vi.advanceTimersByTime(300);
    expect(document.querySelector(".popup-card-overlay")).toBeNull();
    vi.useRealTimers();
  });

  it("test_non_sticky_reads_dialog_scroll_position", async () => {
    vi.useFakeTimers();
    await show({ content: { type: "markdown" } });
    // Dialog is the scroller when not sticky.
    document.querySelector(".popup-card-dialog").scrollTop = 50;
    swipeDown();
    vi.advanceTimersByTime(300);
    expect(document.querySelector(".popup-card-overlay")).not.toBeNull();
    vi.useRealTimers();
  });
});
