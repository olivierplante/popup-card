/**
 * Tests for the open animation.
 *
 * HA's dialogs animate the surface from opacity 0 / scale 0.8 to 1 over
 * --ha-dialog-show-duration (200ms, ease), fading only the scrim. We match
 * that so a popup opens the way the rest of HA does.
 *
 * happy-dom resolves no transitions, so the animation itself is asserted
 * against the stylesheet we actually inject (observable to any user via the
 * DOM) plus the class toggle that drives it.
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

describe("open animation", () => {
  it("test_dialog_starts_scaled_down", async () => {
    await show({ content: { type: "markdown" } });
    expect(structuralStyles()).toMatch(/\.popup-card-dialog\s*\{[^}]*scale:\s*0\.8/);
  });

  it("test_settled_state_restores_scale_and_opacity", async () => {
    await show({ content: { type: "markdown" } });
    // The surface reveals on `settled`, not `open`: the scrim shows at once
    // while the surface waits for its content to stop resizing.
    expect(structuralStyles()).toMatch(
      /\.popup-card-overlay\.popup-card-settled\s+\.popup-card-dialog\s*\{[^}]*scale:\s*1/,
    );
  });

  it("test_duration_follows_the_ha_dialog_token", async () => {
    await show({ content: { type: "markdown" } });
    expect(structuralStyles()).toContain("--ha-dialog-show-duration");
  });

  it("test_reduced_motion_is_respected", async () => {
    await show({ content: { type: "markdown" } });
    expect(structuralStyles()).toContain("prefers-reduced-motion");
  });

  it("test_open_class_applied_after_mount", async () => {
    await show({ content: { type: "markdown" } });
    const overlay = document.querySelector(".popup-card-overlay");
    // Two rAFs after append, so the transition has a frame to start from.
    await vi.waitFor(() => expect(overlay.classList.contains("open")).toBe(true));
  });
});
