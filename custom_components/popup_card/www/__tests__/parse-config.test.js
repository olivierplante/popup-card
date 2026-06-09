/**
 * Tests for parseConfig() — normalizing the raw popup_card config into the
 * shape show() consumes (title, content, auto-close timer, style config).
 */

import { describe, expect, it } from "vitest";

import { parseConfig } from "../popup-card.js";

describe("parseConfig", () => {
  it("test_auto_close_absent_defaults_to_no_timer", () => {
    const parsed = parseConfig({ content: { type: "markdown" } });
    expect(parsed.autoCloseMs).toBe(null);
  });

  it("test_auto_close_zero_means_never", () => {
    const parsed = parseConfig({ content: {}, auto_close: 0 });
    expect(parsed.autoCloseMs).toBe(null);
  });

  it("test_auto_close_negative_means_never", () => {
    const parsed = parseConfig({ content: {}, auto_close: -5 });
    expect(parsed.autoCloseMs).toBe(null);
  });

  it("test_auto_close_seconds_converted_to_milliseconds", () => {
    const parsed = parseConfig({ content: {}, auto_close: 8 });
    expect(parsed.autoCloseMs).toBe(8000);
  });

  it("test_auto_close_accepts_numeric_string", () => {
    const parsed = parseConfig({ content: {}, auto_close: "3" });
    expect(parsed.autoCloseMs).toBe(3000);
  });

  it("test_auto_close_fractional_seconds", () => {
    const parsed = parseConfig({ content: {}, auto_close: 1.5 });
    expect(parsed.autoCloseMs).toBe(1500);
  });

  it("test_progress_defaults_to_true", () => {
    const parsed = parseConfig({ content: {}, auto_close: 5 });
    expect(parsed.showProgress).toBe(true);
  });

  it("test_progress_can_be_disabled", () => {
    const parsed = parseConfig({
      content: {},
      auto_close: 5,
      auto_close_progress: false,
    });
    expect(parsed.showProgress).toBe(false);
  });

  it("test_title_and_content_passthrough", () => {
    const content = { type: "entities", entities: [] };
    const parsed = parseConfig({ title: "Lights", content });
    expect(parsed.title).toBe("Lights");
    expect(parsed.content).toBe(content);
  });

  it("test_style_config_collects_discrete_keys_and_raw_style", () => {
    const parsed = parseConfig({
      content: {},
      background: "rgba(20,20,40,0.85)",
      backdrop: "rgba(0,0,0,0.6)",
      backdrop_blur: "8px",
      border_radius: "24px",
      border: "2px solid red",
      title_color: "#0f0",
      style: ".popup-card-dialog { box-shadow: 0 0 40px #8B5CF6; }",
    });
    expect(parsed.styleConfig).toEqual({
      background: "rgba(20,20,40,0.85)",
      backdrop: "rgba(0,0,0,0.6)",
      backdrop_blur: "8px",
      border_radius: "24px",
      border: "2px solid red",
      title_color: "#0f0",
      style: ".popup-card-dialog { box-shadow: 0 0 40px #8B5CF6; }",
    });
  });

  it("test_style_config_omits_unset_keys", () => {
    const parsed = parseConfig({ content: {}, background: "black" });
    expect(parsed.styleConfig).toEqual({ background: "black" });
  });
});
