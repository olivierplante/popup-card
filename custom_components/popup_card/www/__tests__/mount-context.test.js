/**
 * Tests for mounting the overlay inside the HA context-provider subtree.
 *
 * HA's frontend provides Lit contexts (internationalizationContext,
 * entitiesContext, formattersContext, …) via `contextMixin` on the
 * <home-assistant> root element. Cards consume them by firing a bubbling,
 * composed `context-request` event that must reach an ANCESTOR provider.
 *
 * If the popup overlay is appended to <body>, it sits OUTSIDE that provider
 * subtree (a sibling of <home-assistant>), so relative-time state and
 * registry-backed icons render blank. Mounting the overlay inside the
 * provider's shadow root fixes this. These tests pin that behavior.
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

/** A <home-assistant> element that provides an open shadow root, like the real app. */
function makeShadowHost() {
  const ha = document.createElement("home-assistant");
  ha.attachShadow({ mode: "open" });
  ha.hass = { states: {} };
  document.body.appendChild(ha);
  return ha;
}

beforeEach(() => {
  vi.useFakeTimers();
  stubHelpers();
});

afterEach(() => {
  close();
  vi.useRealTimers();
  document.body.innerHTML = "";
  delete globalThis.window.loadCardHelpers;
});

describe("mount inside context provider", () => {
  it("test_overlay_mounts_into_provider_shadow_root", async () => {
    const host = makeShadowHost();
    await show({ title: "Hi", content: { type: "markdown" } });

    // Overlay + content live inside the provider's shadow root.
    expect(host.shadowRoot.querySelector(".popup-card-overlay")).not.toBeNull();
    expect(host.shadowRoot.querySelector(".stub-content-card")).not.toBeNull();
    // Not appended to <body> (which is outside the provider subtree).
    expect(document.body.querySelector(".popup-card-overlay")).toBeNull();
  });

  it("test_structural_and_scoped_styles_land_in_shadow_root", async () => {
    const host = makeShadowHost();
    await show({ content: { type: "markdown" }, background: "rgb(1, 2, 3)" });

    expect(host.shadowRoot.querySelector("#popup-card-styles")).not.toBeNull();
    const scoped = host.shadowRoot.querySelector("style[data-popup-card-scoped]");
    expect(scoped).not.toBeNull();
    expect(scoped.textContent).toContain("rgb(1, 2, 3)");
    // Shadow encapsulation: styles must NOT leak to document.head.
    expect(document.head.querySelector("#popup-card-styles")).toBeNull();
  });

  it("test_close_tears_down_overlay_and_scoped_style_in_shadow_root", async () => {
    const host = makeShadowHost();
    await show({ content: { type: "markdown" }, background: "black" });
    close();

    expect(host.shadowRoot.querySelector(".popup-card-overlay")).toBeNull();
    expect(
      host.shadowRoot.querySelector("style[data-popup-card-scoped]"),
    ).toBeNull();
  });

  it("test_context_request_from_card_reaches_provider_host", async () => {
    // The whole point of the fix: a context-request fired by a card inside the
    // popup must bubble (composed) to the provider host.
    const host = makeShadowHost();
    await show({ content: { type: "markdown" } });

    const received = [];
    host.addEventListener("context-request", (e) => received.push(e));

    const card = host.shadowRoot.querySelector(".stub-content-card");
    card.dispatchEvent(
      new CustomEvent("context-request", { bubbles: true, composed: true }),
    );

    expect(received.length).toBe(1);
  });

  it("test_falls_back_to_body_when_host_has_no_shadow_root", async () => {
    // Non-standard embeds / tests where the host exposes no shadow root:
    // degrade to <body> rather than failing to render.
    const ha = document.createElement("home-assistant");
    ha.hass = { states: {} };
    document.body.appendChild(ha);

    await show({ content: { type: "markdown" } });
    expect(document.body.querySelector(".popup-card-overlay")).not.toBeNull();
  });
});
