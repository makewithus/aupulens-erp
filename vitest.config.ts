import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    include: ["tests/**/*.test.ts"],
    // Mongo-backed suites run a heavy beforeAll (connect + dozens of Model.init() + dynamic imports of
    // large module graphs) that all funnel through Vite's single transform server. Under load those sat
    // right at the old 10 s hook / 5 s test defaults and timed out at random (see docs/sarvam/BASELINE.md).
    // Generous limits remove that noise without hiding real failures: a genuinely hung test still fails.
    hookTimeout: 30_000,
    testTimeout: 15_000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
