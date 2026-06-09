/**
 * Tests for buildPopupStyles() — the scoped stylesheet generated per popup.
 *
 * Precedence contract (Option 1): rules are emitted in the order
 *   base defaults  <  discrete keys  <  user `style:` block
 * All at equal specificity (single class under the same scope), so later
 * rules win. The user's raw CSS therefore always overrides discrete keys,
 * which override the base defaults.
 */

import { describe, expect, it } from "vitest";

import { buildPopupStyles } from "../popup-card.js";

const SCOPE = "popup-card-overlay-test";

describe("buildPopupStyles", () => {
  it("test_empty_config_emits_only_base_defaults", () => {
    const css = buildPopupStyles(SCOPE, {});
    // Base dialog background default present.
    expect(css).toContain(".popup-card-dialog");
    // No user style block, no discrete-key overrides.
    expect(css).not.toContain("box-shadow: 0 0 40px");
  });

  it("test_all_rules_are_scoped_to_the_overlay_class", () => {
    const css = buildPopupStyles(SCOPE, { background: "black" });
    // Every selector must be prefixed with the unique overlay scope so a
    // popup's styles can never leak onto another popup.
    const selectorLines = css
      .split("\n")
      .filter((line) => line.includes(".popup-card-"));
    expect(selectorLines.length).toBeGreaterThan(0);
    for (const line of selectorLines) {
      expect(line).toContain(`.${SCOPE}`);
    }
  });

  it("test_background_key_emitted_after_base", () => {
    const css = buildPopupStyles(SCOPE, { background: "rgb(1, 2, 3)" });
    expect(css).toContain("rgb(1, 2, 3)");
    // The keyed background must appear AFTER the base default so it wins.
    const baseIdx = css.indexOf("--ha-card-background");
    const keyedIdx = css.indexOf("rgb(1, 2, 3)");
    expect(keyedIdx).toBeGreaterThan(baseIdx);
  });

  it("test_backdrop_key_targets_backdrop", () => {
    const css = buildPopupStyles(SCOPE, { backdrop: "rgba(0,0,0,0.5)" });
    expect(css).toMatch(/\.popup-card-backdrop[^}]*rgba\(0,0,0,0\.5\)/s);
  });

  it("test_backdrop_blur_emits_backdrop_filter", () => {
    const css = buildPopupStyles(SCOPE, { backdrop_blur: "8px" });
    expect(css).toMatch(/backdrop-filter:\s*blur\(8px\)/);
    expect(css).toMatch(/-webkit-backdrop-filter:\s*blur\(8px\)/);
  });

  it("test_border_radius_key", () => {
    const css = buildPopupStyles(SCOPE, { border_radius: "24px" });
    expect(css).toMatch(/\.popup-card-dialog[^}]*border-radius:\s*24px/s);
  });

  it("test_border_key", () => {
    const css = buildPopupStyles(SCOPE, { border: "2px solid red" });
    expect(css).toMatch(/\.popup-card-dialog[^}]*border:\s*2px solid red/s);
  });

  it("test_title_color_key", () => {
    const css = buildPopupStyles(SCOPE, { title_color: "#00ff00" });
    expect(css).toMatch(/\.popup-card-title[^}]*color:\s*#00ff00/s);
  });

  it("test_raw_style_emitted_last_so_it_wins", () => {
    const css = buildPopupStyles(SCOPE, {
      background: "red",
      style: ".popup-card-dialog { background: blue; }",
    });
    const keyedIdx = css.indexOf("red");
    const rawIdx = css.indexOf("blue");
    expect(rawIdx).toBeGreaterThan(keyedIdx);
  });

  it("test_raw_style_is_scoped", () => {
    // The user writes plain class selectors; buildPopupStyles must scope them
    // under the overlay class so they cannot leak to other popups.
    const css = buildPopupStyles(SCOPE, {
      style: ".popup-card-dialog { background: blue; }",
    });
    expect(css).toMatch(
      new RegExp(`\\.${SCOPE}[^{]*\\.popup-card-dialog`),
    );
  });
});
