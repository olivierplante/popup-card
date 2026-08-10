/**
 * Tests for the modal <dialog> frame.
 *
 * The popup is a real <dialog> opened with showModal(), which is what puts it
 * in the browser's top layer (immune to ancestor transforms and z-index) and
 * makes the rest of the document inert.
 *
 * What these tests CAN check: that we open it as a modal, that every close
 * path runs the full teardown, and that the documented class API survives.
 * What they CANNOT check: focus containment, inertness and top-layer
 * rendering — happy-dom implements the dialog state machine but no layout or
 * focus semantics. Those need a real browser.
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

function overlay() {
  return document.querySelector(".popup-card-overlay");
}

describe("modal dialog frame", () => {
  it("test_overlay_is_an_open_dialog_element", async () => {
    await show({ content: { type: "markdown" } });
    const el = overlay();
    expect(el).not.toBeNull();
    expect(el.tagName).toBe("DIALOG");
    expect(el.open).toBe(true);
  });

  it("test_show_opens_as_modal_not_inline", async () => {
    const showModal = vi.spyOn(window.HTMLDialogElement.prototype, "showModal");
    const inline = vi.spyOn(window.HTMLDialogElement.prototype, "show");
    await show({ content: { type: "markdown" } });
    expect(showModal).toHaveBeenCalledTimes(1);
    expect(inline).not.toHaveBeenCalled();
  });

  it("test_backdrop_child_kept_for_documented_class_api", async () => {
    await show({ content: { type: "markdown" } });
    const backdrop = overlay().querySelector(".popup-card-backdrop");
    expect(backdrop).not.toBeNull();
  });

  it("test_close_closes_dialog_before_removing_it", async () => {
    await show({ content: { type: "markdown" } });
    const el = overlay();
    close();
    expect(el.open).toBe(false);
    expect(overlay()).toBeNull();
  });

  it("test_native_cancel_runs_full_teardown", async () => {
    await show({ content: { type: "markdown" }, background: "rgb(1, 2, 3)" });
    overlay().dispatchEvent(new Event("cancel", { cancelable: true }));
    expect(overlay()).toBeNull();
    expect(document.querySelector("style[data-popup-card-scoped]")).toBeNull();
  });

  it("test_escape_closes_and_tears_down", async () => {
    await show({ content: { type: "markdown" }, background: "rgb(1, 2, 3)" });
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(overlay()).toBeNull();
    expect(document.querySelector("style[data-popup-card-scoped]")).toBeNull();
  });

  it("test_reopening_leaves_a_single_dialog", async () => {
    await show({ content: { type: "markdown" } });
    await show({ content: { type: "markdown" } });
    expect(document.querySelectorAll(".popup-card-overlay").length).toBe(1);
    expect(overlay().open).toBe(true);
  });
});
