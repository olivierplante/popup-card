/**
 * Vitest configuration for the popup_card frontend tests.
 *
 * The card is a single plain-JS ES module (popup-card.js) — no build step,
 * no TypeScript, no lit. Tests import its exported functions directly and
 * exercise them against jsdom's DOM.
 */

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
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
