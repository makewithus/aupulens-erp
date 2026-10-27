/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import mongoose from "mongoose";
import "@/lib/dbModels";

describe("tenant authority across registered schemas", () => {
  it("makes every tenantId schema field immutable", async () => {
    const files = import.meta.glob("../../models/**/*.ts");
    for (const load of Object.values(files)) await load();
    const missing: string[] = [];
    let checked = 0;
    for (const name of mongoose.modelNames()) {
      const field = mongoose.model(name).schema.path("tenantId");
      if (!field) continue;
      checked++;
      if (field.options.immutable !== true) missing.push(name);
    }
    expect(checked).toBeGreaterThan(100);
    expect(missing).toEqual([]);
  });
});
