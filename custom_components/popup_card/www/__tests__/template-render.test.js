/**
 * Tests for show() wiring the Jinja walk to Home Assistant's render_template
 * websocket command.
 *
 * render_template is a subscription that pushes on every change. A popup is
 * short-lived and re-opened constantly, so opening it IS the refresh: we take
 * the first result and unsubscribe immediately, which keeps the teardown that
 * close() has to do unchanged.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { close, show } from "../popup-card.js";

let renderedConfigs = [];
let subscriptions = [];
let unsubscribes = 0;

function stubHelpers() {
  globalThis.window.loadCardHelpers = async () => ({
    createCardElement: (config) => {
      renderedConfigs.push(config);
      const el = document.createElement("div");
      el.className = "stub-content-card";
      return el;
    },
  });
}

/**
 * @param respond called with the template; return {result} or {error} to push,
 *   or null to leave the subscription hanging.
 */
function stubHass(respond) {
  const ha = document.createElement("home-assistant");
  ha.hass = {
    states: {},
    connection: {
      subscribeMessage: (callback, message) => {
        subscriptions.push(message);
        const reply = respond ? respond(message.template) : null;
        if (reply) queueMicrotask(() => callback(reply));
        return Promise.resolve(() => {
          unsubscribes += 1;
        });
      },
    },
  };
  document.body.appendChild(ha);
  return ha;
}

/** A hass with no websocket connection at all. */
function stubHassWithoutConnection() {
  const ha = document.createElement("home-assistant");
  ha.hass = { states: {} };
  document.body.appendChild(ha);
}

beforeEach(() => {
  renderedConfigs = [];
  subscriptions = [];
  unsubscribes = 0;
  stubHelpers();
});

afterEach(() => {
  close();
  document.body.innerHTML = "";
  document.head.innerHTML = "";
  delete globalThis.window.loadCardHelpers;
});

describe("rendering templates through the websocket", () => {
  it("test_resolves_an_entity_template_before_building_the_card", async () => {
    stubHass(() => ({ result: "sensor.nas_memory_usage" }));

    await show({
      content: {
        type: "custom:apexcharts-card",
        series: [{ entity: "{{ 'sensor.nas_state'.replace('_state', '_memory_usage') }}" }],
      },
    });

    expect(renderedConfigs[0].series[0].entity).toBe("sensor.nas_memory_usage");
  });

  it("test_sends_a_render_template_command", async () => {
    stubHass(() => ({ result: "sensor.resolved" }));
    await show({ content: { type: "tile", entity: "{{ x }}" } });
    expect(subscriptions[0].type).toBe("render_template");
    expect(subscriptions[0].template).toBe("{{ x }}");
  });

  it("test_unsubscribes_after_the_first_result", async () => {
    stubHass(() => ({ result: "sensor.resolved" }));
    await show({ content: { type: "tile", entity: "{{ x }}" } });
    expect(unsubscribes).toBe(1);
  });

  it("test_uses_the_resolved_title", async () => {
    stubHass(() => ({ result: "Living room" }));
    await show({ title: "{{ x }}", content: { type: "tile" } });
    expect(document.querySelector(".popup-card-title").textContent).toBe(
      "Living room",
    );
  });

  it("test_opens_no_subscription_when_nothing_is_templated", async () => {
    stubHass(() => ({ result: "unused" }));
    await show({ title: "Plain", content: { type: "tile", entity: "sensor.a" } });
    expect(subscriptions).toEqual([]);
    expect(document.querySelector(".stub-content-card")).not.toBeNull();
  });

  it("test_renders_without_a_websocket_connection", async () => {
    // Degraded rather than broken: the popup still opens, templates stay literal.
    stubHassWithoutConnection();
    await show({ content: { type: "tile", entity: "{{ x }}" } });
    expect(document.querySelector(".popup-card-overlay")).not.toBeNull();
    expect(renderedConfigs[0].entity).toBe("{{ x }}");
  });
});

describe("template errors", () => {
  it("test_shows_the_error_in_the_popup", async () => {
    stubHass(() => ({ error: "UndefinedError: 'foo'", level: "ERROR" }));

    await show({ content: { type: "tile", entity: "{{ foo.bar }}" } });

    const content = document.querySelector(".popup-card-content");
    expect(content.textContent).toContain("UndefinedError");
  });

  it("test_does_not_build_the_card_when_a_template_fails", async () => {
    stubHass(() => ({ error: "boom", level: "ERROR" }));
    await show({ content: { type: "tile", entity: "{{ foo.bar }}" } });
    expect(renderedConfigs).toEqual([]);
  });

  it("test_still_opens_the_popup_on_a_template_error", async () => {
    stubHass(() => ({ error: "boom", level: "ERROR" }));
    await show({ title: "Broken", content: { type: "tile", entity: "{{ x }}" } });
    expect(document.querySelector(".popup-card-overlay")).not.toBeNull();
  });
});

describe("render_templates opt-out through show()", () => {
  it("test_opens_no_subscription_when_disabled", async () => {
    stubHass(() => ({ result: "sensor.resolved" }));
    await show({
      render_templates: false,
      content: { type: "tile", entity: "{{ x }}" },
    });
    expect(subscriptions).toEqual([]);
    expect(renderedConfigs[0].entity).toBe("{{ x }}");
  });

  it("test_still_opens_the_popup_when_disabled", async () => {
    stubHass(() => ({ result: "sensor.resolved" }));
    await show({
      render_templates: false,
      title: "Literal {{ x }}",
      content: { type: "tile", entity: "sensor.a" },
    });
    expect(document.querySelector(".popup-card-title").textContent).toBe(
      "Literal {{ x }}",
    );
  });
});
