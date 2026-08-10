/**
 * The sheet's entrance is animated with explicit keyframes, not a CSS
 * transition.
 *
 * A CSS transition derives its start value from computed style at the moment
 * it starts, so a layout change mid-flight lets the engine re-derive it. That
 * matches what a real iPhone showed: the surface passing above its resting
 * place and settling back, with the overlay, the page scroll and the viewport
 * all provably steady. WebKit also has documented trouble with transitions on
 * top-layer dialogs, and with accelerated transitions interrupted by layout.
 *
 * Explicit keyframes cannot be re-derived, and the surface is given its own
 * compositing layer so layout cannot perturb it.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { close, show } from "../popup-card.js";

let animateSpy;

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
  animateSpy = vi.fn(() => ({ finished: Promise.resolve(), cancel() {} }));
  globalThis.window.Element.prototype.animate = animateSpy;
  stubHelpers();
  const ha = document.createElement("home-assistant");
  ha.hass = { states: {} };
  document.body.appendChild(ha);
});

afterEach(() => {
  close();
  document.body.innerHTML = "";
  document.head.innerHTML = "";
  delete globalThis.window.Element.prototype.animate;
  delete globalThis.window.loadCardHelpers;
});

describe("sheet entrance", () => {
  it("test_sheet_animates_with_explicit_keyframes", async () => {
    await show({ content: { type: "markdown" }, presentation: "sheet" });
    await vi.waitFor(() => expect(animateSpy).toHaveBeenCalled());

    const [keyframes] = animateSpy.mock.calls[0];
    // From below, to its resting place: both ends stated outright, so no
    // mid-flight layout change can reinterpret them.
    expect(keyframes[0].translate).toMatch(/^0 \d+px$/);
    expect(keyframes[keyframes.length - 1].translate).toBe("0 0");
  });

  it("test_centered_popup_does_not_use_keyframes", async () => {
    await show({ content: { type: "markdown" } });
    await vi.waitFor(() =>
      expect(
        document.querySelector(".popup-card-overlay").classList.contains(
          "popup-card-settled",
        ),
      ).toBe(true),
    );
    // Centered mode scales in via CSS, which has never misbehaved.
    expect(animateSpy).not.toHaveBeenCalled();
  });

  it("test_no_animation_when_the_rise_is_zero", async () => {
    await show({
      content: { type: "markdown" },
      presentation: "sheet",
      style: ".popup-card-dialog { --popup-card-sheet-rise: 0px; }",
    });
    await vi.waitFor(() =>
      expect(
        document.querySelector(".popup-card-overlay").classList.contains(
          "popup-card-settled",
        ),
      ).toBe(true),
    );
    expect(animateSpy).not.toHaveBeenCalled();
  });

  it("test_sheet_gets_its_own_compositing_layer", async () => {
    await show({ content: { type: "markdown" }, presentation: "sheet" });
    const css = structuralStyles();
    const sheetRule = css.slice(
      css.indexOf(".popup-card-overlay.popup-card-sheet .popup-card-dialog"),
    );
    expect(sheetRule).toMatch(/will-change:\s*[^;]*transform/);
  });

  it("test_css_transition_does_not_double_animate_the_sheet", async () => {
    await show({ content: { type: "markdown" }, presentation: "sheet" });
    // Keyframes own the entrance; a transition running alongside would fight
    // it and reintroduce exactly the interruption we are avoiding.
    expect(structuralStyles()).toMatch(
      /\.popup-card-sheet[^{]*\.popup-card-dialog\s*\{[^}]*transition:\s*none/,
    );
  });
});
