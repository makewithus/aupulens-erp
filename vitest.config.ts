import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    include: ["tests/**/*.test.ts"],
    // First DB call in a file pulls in every registered model (lib/dbModels.ts);
    // under vitest transform that can take a few seconds on a loaded machine.
    testTimeout: 20000,
    hookTimeout: 60000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
