/**
 * Tests for the presentation modes.
 *
 * `centered` is the historical behaviour and stays the default. `sheet`
 * anchors the surface to the bottom of the viewport with rounded top corners
 * and slides it up, which is what HA does on narrow screens.
 *
 * Geometry is not observable here (no layout engine), so these cover the
 * config surface, the class that selects the mode, and the stylesheet
 * contract. The bottom-anchored layout itself is measured in a real browser.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";

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

function structuralStyles() {
  return document.querySelector("#popup-card-styles").textContent;
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
  document.head.innerHTML = "";
  delete globalThis.window.loadCardHelpers;
});

describe("parseConfig — presentation", () => {
  it("test_presentation_defaults_to_centered", () => {
    expect(parseConfig({ content: {} }).presentation).toBe("centered");
  });

  it("test_sheet_is_honoured", () => {
    expect(parseConfig({ content: {}, presentation: "sheet" }).presentation).toBe(
      "sheet",
    );
  });

  it("test_unknown_presentation_falls_back_to_centered", () => {
    expect(
      parseConfig({ content: {}, presentation: "anchored" }).presentation,
    ).toBe("centered");
  });
});

describe("presentation rendering", () => {
  it("test_sheet_class_absent_by_default", async () => {
    await show({ content: { type: "markdown" } });
    const overlay = document.querySelector(".popup-card-overlay");
    expect(overlay.classList.contains("popup-card-sheet")).toBe(false);
  });

  it("test_sheet_class_applied_when_requested", async () => {
    await show({ content: { type: "markdown" }, presentation: "sheet" });
    const overlay = document.querySelector(".popup-card-overlay");
    expect(overlay.classList.contains("popup-card-sheet")).toBe(true);
  });
});

describe("sheet stylesheet contract", () => {
  it("test_sheet_anchors_to_the_bottom", async () => {
    await show({ content: { type: "markdown" }, presentation: "sheet" });
    expect(structuralStyles()).toMatch(
      /\.popup-card-overlay\.popup-card-sheet\s*\{[^}]*align-items:\s*flex-end/,
    );
  });

  it("test_sheet_entrance_is_driven_by_keyframes", async () => {
    await show({ content: { type: "markdown" }, presentation: "sheet" });
    const css = structuralStyles();
    // No starting translate in CSS: the entrance is animated from JS with
    // explicit keyframes, and the surface gets its own compositing layer.
    const sheetRule = css.slice(
      css.indexOf(".popup-card-overlay.popup-card-sheet .popup-card-dialog"),
    );
    expect(sheetRule).not.toMatch(/translate:/);
    expect(sheetRule).toMatch(/will-change:\s*[^;]*transform/);
  });

  it("test_sheet_outranks_the_mobile_fullscreen_rule", async () => {
    await show({ content: { type: "markdown" }, presentation: "sheet" });
    // The <=768px rule sets border-radius: 0 and a full-height dialog. The
    // sheet selector carries two classes, so it wins on specificity wherever
    // it sits in the sheet.
    expect(structuralStyles()).toContain(
      ".popup-card-overlay.popup-card-sheet .popup-card-dialog",
    );
  });

  it("test_sheet_keeps_its_bottom_inset_and_gains_no_top_inset", async () => {
    // The sheet is bottom-anchored at max-height: 90vh, so its top edge never
    // reaches the status bar — unlike the mobile full-screen rule, it must
    // not gain a top inset here. Its bottom inset (for the home indicator)
    // predates this change and must survive it untouched.
    await show({ content: { type: "markdown" }, presentation: "sheet" });
    const css = structuralStyles();
    const start = css.indexOf(
      ".popup-card-overlay.popup-card-sheet .popup-card-dialog {",
    );
    const ruleBody = css.slice(start, css.indexOf("}", start));
    expect(ruleBody).toMatch(
      /padding-bottom:\s*env\(safe-area-inset-bottom,\s*0px\)/,
    );
    expect(ruleBody).not.toMatch(/padding-top:/);
  });
});
