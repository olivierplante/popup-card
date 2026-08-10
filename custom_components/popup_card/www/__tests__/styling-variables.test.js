/**
 * Tests for the --popup-card-* variable surface.
 *
 * Every frame surface reads a CSS custom property with a documented default,
 * and the discrete config keys write those properties on the popup's scope
 * class rather than emitting one-off declarations.
 *
 * The payoff is that the variables inherit: a user sets them once in their HA
 * theme and every popup follows, including popups they did not author.
 *
 * Precedence, unchanged in spirit and now with one more rung:
 *   theme variables  <  discrete keys  <  raw `style:`
 * Keys win over an inherited theme value because they are set on the overlay
 * itself; raw CSS wins over both because it sets the property directly and is
 * emitted last.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildPopupStyles, close, show } from "../popup-card.js";

const SCOPE = "popup-card-overlay-test";

/** Every variable the frame exposes. A typo here is a silently dead knob. */
const DOCUMENTED_VARIABLES = [
  "--popup-card-background",
  "--popup-card-backdrop",
  "--popup-card-backdrop-filter",
  "--popup-card-radius",
  "--popup-card-border",
  "--popup-card-shadow",
  "--popup-card-width",
  "--popup-card-max-width",
  "--popup-card-max-height",
  "--popup-card-padding",
  "--popup-card-header-padding",
  "--popup-card-title-color",
  "--popup-card-title-size",
  "--popup-card-title-weight",
  "--popup-card-close-color",
  "--popup-card-progress-color",
  "--popup-card-animation-duration",
];

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

describe("variable surface", () => {
  it("test_every_documented_variable_is_consumed", async () => {
    await show({ content: { type: "markdown" } });
    const css = structuralStyles();
    for (const name of DOCUMENTED_VARIABLES) {
      expect(css, `${name} is not read by any rule`).toContain(`var(${name}`);
    }
  });
});

describe("discrete keys write variables", () => {
  it("test_background_key_sets_the_background_variable", () => {
    const css = buildPopupStyles(SCOPE, { background: "rgb(1, 2, 3)" });
    expect(css).toMatch(
      new RegExp(`\\.${SCOPE}[^}]*--popup-card-background:\\s*rgb\\(1, 2, 3\\)`),
    );
  });

  it("test_backdrop_key_sets_the_backdrop_variable", () => {
    const css = buildPopupStyles(SCOPE, { backdrop: "rgba(0,0,0,0.5)" });
    expect(css).toContain("--popup-card-backdrop: rgba(0,0,0,0.5)");
  });

  it("test_backdrop_blur_becomes_a_filter_value", () => {
    const css = buildPopupStyles(SCOPE, { backdrop_blur: "8px" });
    expect(css).toContain("--popup-card-backdrop-filter: blur(8px)");
  });

  it("test_border_radius_key_sets_the_radius_variable", () => {
    const css = buildPopupStyles(SCOPE, { border_radius: "24px" });
    expect(css).toContain("--popup-card-radius: 24px");
  });

  it("test_border_key_sets_the_border_variable", () => {
    const css = buildPopupStyles(SCOPE, { border: "2px solid red" });
    expect(css).toContain("--popup-card-border: 2px solid red");
  });

  it("test_title_color_key_sets_the_title_variable", () => {
    const css = buildPopupStyles(SCOPE, { title_color: "#00ff00" });
    expect(css).toContain("--popup-card-title-color: #00ff00");
  });

  it("test_keys_are_written_on_the_scope_not_globally", () => {
    const css = buildPopupStyles(SCOPE, { background: "black" });
    // A bare `:root` or unscoped rule would leak to every other popup.
    expect(css).not.toContain(":root");
    expect(css).toContain(`.${SCOPE}`);
  });

  it("test_absent_keys_write_nothing", () => {
    const css = buildPopupStyles(SCOPE, {});
    expect(css.trim()).toBe("");
  });
});

describe("themed defaults", () => {
  it("test_background_falls_back_through_the_card_chain", async () => {
    await show({ content: { type: "markdown" } });
    // --ha-card-background is defined by no HA core stylesheet, so stopping
    // there left the popup a dark slab on light themes. The chain has to
    // continue to --card-background-color before any literal.
    expect(structuralStyles()).toMatch(
      /var\(\s*--popup-card-background,\s*var\(\s*--ha-card-background,\s*var\(\s*--card-background-color/,
    );
  });

  it("test_close_button_has_no_hardcoded_white", async () => {
    await show({ content: { type: "markdown" } });
    const css = structuralStyles();
    const closeRule = css.slice(
      css.indexOf(".popup-card-close"),
      css.indexOf(".popup-card-content"),
    );
    // Hardcoded white made the X invisible on light surfaces.
    expect(closeRule).not.toContain("rgba(255, 255, 255, 0.5)");
    expect(closeRule).toContain("var(--popup-card-close-color");
  });
});
