/**
 * Vitest configuration for the popup_card frontend tests.
 *
 * The card is a single plain-JS ES module (popup-card.js) — no build step,
 * no TypeScript, no lit. Tests import its exported functions directly and
 * exercise them against the environment's DOM.
 */

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // happy-dom, not jsdom: jsdom implements no <dialog> methods at any
    // version (showModal/close are undefined), and the popup is a real modal
    // <dialog>. happy-dom implements the dialog state machine — showModal,
    // close, `open` reflection, the close event, returnValue.
    //
    // What it still cannot check: focus containment, inertness, top-layer
    // rendering, and any layout. Those need a real browser.
    environment: "happy-dom",
    globals: true,
    setupFiles: ["__tests__/setup.js"],
    include: ["__tests__/**/*.test.js"],
    passWithNoTests: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      include: ["popup-card.js"],
      exclude: ["__tests__/**"],
      thresholds: {
        lines: 80,
        functions: 80,
        statements: 80,
        branches: 70,
      },
    },
  },
});
