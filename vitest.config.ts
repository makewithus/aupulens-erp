import { defineConfig } from "vitest/config";
import path from "node:path";

if (!process.env.QA_DISPOSABLE_MONGO_PORT && !process.env.CI) {
  process.env.QA_DISPOSABLE_MONGO_PORT = "27184";
}

export default defineConfig({
  oxc: { jsx: { runtime: "automatic" } },
  test: {
    environment: "node",
    globals: false,
    setupFiles: ["tests/setup/resetRateLimits.ts", "tests/setup/unitTransactions.ts", ...(process.env.QA_DISPOSABLE_MONGO_PORT ? ["tests/setup/disposableMongo.ts"] : [])],
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    // Mongo-backed suites run a heavy beforeAll (connect + dozens of Model.init() + dynamic imports of
    // large module graphs — the first DB call in a file pulls in every registered model, lib/dbModels.ts)
    // that all funnel through Vite's single transform server. Under load those sat right at the old 10 s
    // hook / 5 s test defaults and timed out at random (see docs/sarvam/BASELINE.md). Generous limits
    // remove that noise without hiding real failures: a genuinely hung test still fails, just later.
    hookTimeout: 60_000,
    testTimeout: 60_000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
