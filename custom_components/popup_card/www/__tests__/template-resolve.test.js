/**
 * Tests for the Jinja walk: which strings in a popup_card config are handed
 * to Home Assistant for rendering, and which are left strictly alone.
 *
 * The rule this file pins down: we render what we own, plus entity-typed keys
 * inside `content`, and never anything a card renders itself. The markdown
 * card's `content` is the case that matters — it is Jinja that HA renders live,
 * so pre-rendering it here would freeze it at open time.
 *
 * resolveTemplates() takes a render function rather than a websocket so the
 * rules can be tested without a connection.
 */

import { describe, expect, it, vi } from "vitest";

import { hasTemplate, resolveTemplates } from "../popup-card.js";

/** Render function that echoes the template back, marked, so substitution is visible. */
const echo = (template) => Promise.resolve(`rendered:${template}`);

/** Render function returning a fixed entity id, for the realistic cases. */
const toEntity = () => Promise.resolve("sensor.resolved");

describe("template detection", () => {
  it("test_detects_expression_and_statement_markers", () => {
    expect(hasTemplate("{{ states('sensor.a') }}")).toBe(true);
    expect(hasTemplate("{% set x = 1 %}{{ x }}")).toBe(true);
    expect(hasTemplate("sensor.{{ base }}_memory")).toBe(true);
  });

  it("test_plain_strings_are_not_templates", () => {
    expect(hasTemplate("sensor.living_room")).toBe(false);
    expect(hasTemplate("")).toBe(false);
  });

  it("test_non_strings_are_not_templates", () => {
    expect(hasTemplate(8)).toBe(false);
    expect(hasTemplate(null)).toBe(false);
    expect(hasTemplate({ a: 1 })).toBe(false);
  });

  it("test_closing_braces_alone_do_not_trigger", () => {
    // Minified CSS in `style:` ends media queries with }} and must not render.
    expect(hasTemplate("@media (max-width:768px){.a{color:red}}")).toBe(false);
  });
});

describe("keys we own", () => {
  it("test_renders_title", async () => {
    const out = await resolveTemplates({ title: "{{ x }}", content: {} }, echo);
    expect(out.title).toBe("rendered:{{ x }}");
  });

  it("test_renders_every_style_key", async () => {
    const config = {
      content: {},
      background: "{{ a }}",
      backdrop: "{{ b }}",
      backdrop_blur: "{{ c }}",
      border_radius: "{{ d }}",
      border: "{{ e }}",
      title_color: "{{ f }}",
    };
    const out = await resolveTemplates(config, echo);
    for (const key of [
      "background",
      "backdrop",
      "backdrop_blur",
      "border_radius",
      "border",
      "title_color",
    ]) {
      expect(out[key]).toMatch(/^rendered:/);
    }
  });

  it("test_renders_raw_style_and_layout_strings", async () => {
    const config = {
      content: {},
      style: "{{ css }}",
      close_position: "{{ side }}",
      presentation: "{{ mode }}",
    };
    const out = await resolveTemplates(config, echo);
    expect(out.style).toBe("rendered:{{ css }}");
    expect(out.close_position).toBe("rendered:{{ side }}");
    expect(out.presentation).toBe("rendered:{{ mode }}");
  });

  it("test_renders_auto_close_so_parse_config_can_coerce_it", async () => {
    const out = await resolveTemplates(
      { content: {}, auto_close: "{{ 8 }}" },
      () => Promise.resolve("8"),
    );
    expect(Number(out.auto_close)).toBe(8);
  });

  it("test_leaves_boolean_keys_untouched", async () => {
    // render_template returns strings, and "false" is not false. Templating
    // these would silently flip them, so they are deliberately excluded.
    const render = vi.fn(echo);
    const config = {
      content: {},
      sticky_header: "{{ x }}",
      auto_close_progress: "{{ y }}",
    };
    const out = await resolveTemplates(config, render);
    expect(out.sticky_header).toBe("{{ x }}");
    expect(out.auto_close_progress).toBe("{{ y }}");
    expect(render).not.toHaveBeenCalled();
  });
});

describe("entity keys inside content", () => {
  it("test_renders_entity_string", async () => {
    const config = { content: { type: "tile", entity: "{{ x }}" } };
    const out = await resolveTemplates(config, toEntity);
    expect(out.content.entity).toBe("sensor.resolved");
  });

  it("test_renders_entities_list_of_strings", async () => {
    const config = {
      content: { type: "history-graph", entities: ["{{ x }}", "sensor.plain"] },
    };
    const out = await resolveTemplates(config, toEntity);
    expect(out.content.entities).toEqual(["sensor.resolved", "sensor.plain"]);
  });

  it("test_renders_entity_inside_entities_objects", async () => {
    const config = {
      content: {
        type: "entities",
        entities: [{ entity: "{{ x }}", name: "Keep {{ me }}" }],
      },
    };
    const out = await resolveTemplates(config, toEntity);
    expect(out.content.entities[0].entity).toBe("sensor.resolved");
    // `name` is not an entity key, so it stays literal.
    expect(out.content.entities[0].name).toBe("Keep {{ me }}");
  });

  it("test_renders_entity_at_any_depth", async () => {
    const config = {
      content: {
        type: "vertical-stack",
        cards: [
          { type: "markdown", content: "static" },
          {
            type: "horizontal-stack",
            cards: [{ type: "gauge", entity: "{{ x }}" }],
          },
        ],
      },
    };
    const out = await resolveTemplates(config, toEntity);
    expect(out.content.cards[1].cards[0].entity).toBe("sensor.resolved");
  });

  it("test_renders_series_entity_of_a_custom_card", async () => {
    // apexcharts-card. We never know its schema; the key name is enough.
    const config = {
      content: {
        type: "custom:apexcharts-card",
        series: [{ entity: "{{ x }}" }],
      },
    };
    const out = await resolveTemplates(config, toEntity);
    expect(out.content.series[0].entity).toBe("sensor.resolved");
  });

  it("test_renders_the_remaining_entity_key_names", async () => {
    const config = {
      content: {
        type: "picture-glance",
        entity_id: "{{ a }}",
        camera_image: "{{ b }}",
        image_entity: "{{ c }}",
      },
    };
    const out = await resolveTemplates(config, toEntity);
    expect(out.content.entity_id).toBe("sensor.resolved");
    expect(out.content.camera_image).toBe("sensor.resolved");
    expect(out.content.image_entity).toBe("sensor.resolved");
  });

  it("test_renders_entity_id_given_as_a_list", async () => {
    const config = { content: { type: "markdown", entity_id: ["{{ a }}"] } };
    const out = await resolveTemplates(config, toEntity);
    expect(out.content.entity_id).toEqual(["sensor.resolved"]);
  });

  it("test_supports_partial_interpolation", async () => {
    const render = vi.fn(() => Promise.resolve("sensor.nas_memory_usage"));
    const config = {
      content: { type: "tile", entity: "sensor.{{ base }}_memory_usage" },
    };
    const out = await resolveTemplates(config, render);
    // The whole string goes to HA, not just the expression inside the braces.
    expect(render).toHaveBeenCalledWith("sensor.{{ base }}_memory_usage");
    expect(out.content.entity).toBe("sensor.nas_memory_usage");
  });
});

describe("what we must not touch", () => {
  it("test_leaves_markdown_content_untouched", async () => {
    // HA renders this itself, live. Pre-rendering freezes it at open time.
    const render = vi.fn(echo);
    const config = {
      content: { type: "markdown", content: "{{ states('sensor.a') }}" },
    };
    const out = await resolveTemplates(config, render);
    expect(out.content.content).toBe("{{ states('sensor.a') }}");
    expect(render).not.toHaveBeenCalled();
  });

  it("test_leaves_other_content_strings_untouched", async () => {
    const render = vi.fn(echo);
    const config = {
      content: { type: "tile", name: "{{ x }}", icon: "{{ y }}" },
    };
    const out = await resolveTemplates(config, render);
    expect(out.content.name).toBe("{{ x }}");
    expect(out.content.icon).toBe("{{ y }}");
    expect(render).not.toHaveBeenCalled();
  });

  it("test_leaves_a_nested_markdown_content_untouched", async () => {
    const render = vi.fn(toEntity);
    const config = {
      content: {
        type: "vertical-stack",
        cards: [
          { type: "markdown", content: "{{ states('sensor.a') }}" },
          { type: "tile", entity: "{{ x }}" },
        ],
      },
    };
    const out = await resolveTemplates(config, render);
    expect(out.content.cards[0].content).toBe("{{ states('sensor.a') }}");
    expect(out.content.cards[1].entity).toBe("sensor.resolved");
    expect(render).toHaveBeenCalledTimes(1);
  });
});

describe("walk behaviour", () => {
  it("test_does_not_mutate_the_original_config", async () => {
    const config = { content: { type: "tile", entity: "{{ x }}" } };
    await resolveTemplates(config, toEntity);
    expect(config.content.entity).toBe("{{ x }}");
  });

  it("test_never_renders_when_nothing_is_templated", async () => {
    const render = vi.fn(echo);
    const config = {
      title: "Plain",
      content: { type: "tile", entity: "sensor.a" },
    };
    const out = await resolveTemplates(config, render);
    expect(render).not.toHaveBeenCalled();
    expect(out).toEqual(config);
  });

  it("test_starts_every_render_before_any_resolves", async () => {
    // Parallel, not sequential: one round trip for the whole config.
    let started = 0;
    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    const render = () => {
      started += 1;
      return gate.then(() => "sensor.resolved");
    };
    const config = {
      title: "{{ a }}",
      background: "{{ b }}",
      content: {
        type: "entities",
        entities: ["{{ c }}", "{{ d }}"],
      },
    };
    const pending = resolveTemplates(config, render);
    await Promise.resolve();
    expect(started).toBe(4);
    release();
    await pending;
  });

  it("test_rejects_when_a_render_fails", async () => {
    const render = () => Promise.reject(new Error("boom"));
    const config = { content: { type: "tile", entity: "{{ x }}" } };
    await expect(resolveTemplates(config, render)).rejects.toThrow("boom");
  });
});

describe("untemplated configs are left strictly alone", () => {
  it("test_returns_the_original_object_when_nothing_is_templated", async () => {
    // Not a clone: a config dispatched from JS may carry values a plain-data
    // clone would flatten, and an untemplated config has no reason to be
    // reshaped at all.
    const config = { content: { type: "tile", entity: "sensor.a" } };
    const out = await resolveTemplates(config, echo);
    expect(out).toBe(config);
  });

  it("test_preserves_non_plain_values_when_nothing_is_templated", async () => {
    const marker = new Date(0);
    const config = { content: { type: "tile", entity: "sensor.a", when: marker } };
    const out = await resolveTemplates(config, echo);
    expect(out.content.when).toBe(marker);
  });
});

describe("render_templates opt-out", () => {
  it("test_false_skips_rendering_entirely", async () => {
    // The escape hatch: if our walk ever collides with a card that renders its
    // own Jinja under an entity-typed key, the whole pass can be turned off.
    const render = vi.fn(echo);
    const config = {
      render_templates: false,
      title: "{{ a }}",
      content: { type: "tile", entity: "{{ b }}" },
    };
    const out = await resolveTemplates(config, render);
    expect(render).not.toHaveBeenCalled();
    expect(out.title).toBe("{{ a }}");
    expect(out.content.entity).toBe("{{ b }}");
  });

  it("test_false_returns_the_original_object", async () => {
    const config = { render_templates: false, content: { entity: "{{ b }}" } };
    const out = await resolveTemplates(config, echo);
    expect(out).toBe(config);
  });

  it("test_absent_still_renders", async () => {
    const config = { content: { type: "tile", entity: "{{ b }}" } };
    const out = await resolveTemplates(config, toEntity);
    expect(out.content.entity).toBe("sensor.resolved");
  });

  it("test_true_still_renders", async () => {
    const config = {
      render_templates: true,
      content: { type: "tile", entity: "{{ b }}" },
    };
    const out = await resolveTemplates(config, toEntity);
    expect(out.content.entity).toBe("sensor.resolved");
  });

  it("test_only_an_explicit_false_disables_it", async () => {
    // Never a bare falsy check: 0 and "" are not an opt-out.
    for (const value of [0, "", null, "false"]) {
      const config = {
        render_templates: value,
        content: { type: "tile", entity: "{{ b }}" },
      };
      const out = await resolveTemplates(config, toEntity);
      expect(out.content.entity).toBe("sensor.resolved");
    }
  });
});
