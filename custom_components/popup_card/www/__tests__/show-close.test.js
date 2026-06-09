/**
 * Tests for show()/close() — overlay lifecycle, auto-close timer, scoped
 * style injection and teardown.
 *
 * These exercise the real DOM (jsdom). loadCardHelpers + the home-assistant
 * element are stubbed so the content card renders without a live HA instance.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { close, show } from "../popup-card.js";

function stubHelpers() {
  // Minimal card element the helper returns.
  globalThis.window.loadCardHelpers = async () => ({
    createCardElement: () => {
      const el = document.createElement("div");
      el.className = "stub-content-card";
      return el;
    },
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  stubHelpers();
  // A home-assistant element so getHass() has something to read.
  const ha = document.createElement("home-assistant");
  ha.hass = { states: {} };
  document.body.appendChild(ha);
});

afterEach(() => {
  close();
  vi.useRealTimers();
  document.body.innerHTML = "";
  delete globalThis.window.loadCardHelpers;
});

async function flush() {
  // Let the awaited createCard() microtasks resolve.
  await vi.runOnlyPendingTimersAsync();
}

describe("show / close lifecycle", () => {
  it("test_show_appends_overlay_and_renders_content", async () => {
    await show({ title: "Hi", content: { type: "markdown" } });
    expect(document.querySelector(".popup-card-overlay")).not.toBeNull();
    expect(document.querySelector(".stub-content-card")).not.toBeNull();
  });

  it("test_close_removes_overlay", async () => {
    await show({ content: { type: "markdown" } });
    close();
    expect(document.querySelector(".popup-card-overlay")).toBeNull();
  });

  it("test_show_without_content_does_nothing", async () => {
    await show({ title: "no content" });
    expect(document.querySelector(".popup-card-overlay")).toBeNull();
  });
});

describe("auto_close timer", () => {
  it("test_no_auto_close_stays_open", async () => {
    await show({ content: { type: "markdown" } });
    vi.advanceTimersByTime(60000);
    expect(document.querySelector(".popup-card-overlay")).not.toBeNull();
  });

  it("test_auto_close_closes_after_duration", async () => {
    await show({ content: { type: "markdown" }, auto_close: 5 });
    expect(document.querySelector(".popup-card-overlay")).not.toBeNull();
    vi.advanceTimersByTime(4999);
    expect(document.querySelector(".popup-card-overlay")).not.toBeNull();
    vi.advanceTimersByTime(1);
    expect(document.querySelector(".popup-card-overlay")).toBeNull();
  });

  it("test_manual_close_clears_timer_no_stale_fire", async () => {
    await show({ content: { type: "markdown" }, auto_close: 5 });
    close();
    // Re-open a popup with NO auto_close.
    await show({ content: { type: "markdown" } });
    // The previous popup's 5s timer must not close this one.
    vi.advanceTimersByTime(10000);
    expect(document.querySelector(".popup-card-overlay")).not.toBeNull();
  });

  it("test_progress_bar_present_only_with_auto_close", async () => {
    await show({ content: { type: "markdown" } });
    expect(document.querySelector(".popup-card-progress")).toBeNull();
    close();
    await show({ content: { type: "markdown" }, auto_close: 5 });
    expect(document.querySelector(".popup-card-progress")).not.toBeNull();
  });

  it("test_progress_bar_hidden_when_opted_out", async () => {
    await show({
      content: { type: "markdown" },
      auto_close: 5,
      auto_close_progress: false,
    });
    expect(document.querySelector(".popup-card-progress")).toBeNull();
  });

  it("test_timer_still_fires_when_progress_hidden", async () => {
    await show({
      content: { type: "markdown" },
      auto_close: 5,
      auto_close_progress: false,
    });
    expect(document.querySelector(".popup-card-overlay")).not.toBeNull();
    vi.advanceTimersByTime(5000);
    expect(document.querySelector(".popup-card-overlay")).toBeNull();
  });
});

describe("scoped style injection", () => {
  it("test_style_element_injected_and_removed_on_close", async () => {
    await show({
      content: { type: "markdown" },
      background: "rgb(1, 2, 3)",
    });
    const styleEl = document.querySelector("style[data-popup-card-scoped]");
    expect(styleEl).not.toBeNull();
    expect(styleEl.textContent).toContain("rgb(1, 2, 3)");
    close();
    expect(
      document.querySelector("style[data-popup-card-scoped]"),
    ).toBeNull();
  });

  it("test_overlay_carries_unique_scope_class", async () => {
    await show({ content: { type: "markdown" }, background: "black" });
    const overlay = document.querySelector(".popup-card-overlay");
    const scopeClass = [...overlay.classList].find((c) =>
      c.startsWith("popup-card-overlay-"),
    );
    expect(scopeClass).toBeTruthy();
  });
});
