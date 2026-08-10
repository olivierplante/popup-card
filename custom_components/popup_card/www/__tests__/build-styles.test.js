/**
 * Tests for buildPopupStyles() — the scoped stylesheet generated per popup.
 *
 * Precedence contract:
 *   theme variables  <  discrete keys  <  user `style:` block
 *
 * Discrete keys are emitted as --popup-card-* variables on the popup's own
 * scope class, so they beat anything inherited from the theme. The raw
 * `style:` block is emitted last and sets properties directly, so it beats
 * both. Everything is scoped to the unique overlay class, so one popup's
 * styling can never leak onto another.
 *
 * Per-key mappings and the variable defaults are covered in
 * styling-variables.test.js; this file owns scoping and ordering.
 */

import { describe, expect, it } from "vitest";

import { buildPopupStyles } from "../popup-card.js";

const SCOPE = "popup-card-overlay-test";

describe("buildPopupStyles", () => {
  it("test_empty_config_emits_nothing", () => {
    // With no keys and no raw CSS there is nothing to override: the frame's
    // defaults live in the structural stylesheet.
    expect(buildPopupStyles(SCOPE, {}).trim()).toBe("");
  });

  it("test_all_rules_are_scoped_to_the_overlay_class", () => {
    const css = buildPopupStyles(SCOPE, {
      background: "black",
      style: ".popup-card-title { color: red; }",
    });
    const ruleLines = css
      .split("\n")
      .filter((line) => line.includes("{"));
    expect(ruleLines.length).toBeGreaterThan(0);
    for (const line of ruleLines) {
      expect(line).toContain(`.${SCOPE}`);
    }
  });

  it("test_raw_style_emitted_last_so_it_wins", () => {
    const css = buildPopupStyles(SCOPE, {
      background: "red",
      style: ".popup-card-dialog { background: blue; }",
    });
    expect(css.indexOf("blue")).toBeGreaterThan(css.indexOf("red"));
  });

  it("test_raw_style_is_scoped", () => {
    // The user writes plain class selectors; buildPopupStyles must scope them
    // under the overlay class so they cannot leak to other popups.
    const css = buildPopupStyles(SCOPE, {
      style: ".popup-card-dialog { background: blue; }",
    });
    expect(css).toMatch(new RegExp(`\\.${SCOPE}[^{]*\\.popup-card-dialog`));
  });

  it("test_at_rules_pass_through_unscoped", () => {
    // A @media wrapper cannot take a class; its inner selectors are left as
    // written rather than mangled.
    const css = buildPopupStyles(SCOPE, {
      style: "@media (max-width: 400px) { .popup-card-dialog { width: 100%; } }",
    });
    expect(css).toContain("@media (max-width: 400px)");
  });

  it("test_multiple_keys_share_one_scope_block", () => {
    const css = buildPopupStyles(SCOPE, {
      background: "black",
      border: "1px solid red",
      title_color: "white",
    });
    expect(css.match(new RegExp(`\\.${SCOPE}\\s*\\{`, "g")).length).toBe(1);
  });
});
