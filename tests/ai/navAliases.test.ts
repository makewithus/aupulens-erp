import { describe, expect, it } from "vitest";
import { resolveNavDestination } from "@/lib/ai/navRoutes";

describe("AI navigation resolves everyday phrasing to real pages", () => {
  it.each([
    ["redirect to services section", "/sales/products"],
    ["services", "/sales/products"],
    ["payroll processing", "/hr/payroll"],
    ["audit logs", "/crm/audit"],
    ["executive view", "/crm/executive"],
    ["take me to sales orders", "/sales/sales-orders"],
  ])("%s -> %s", (q, href) => {
    expect(resolveNavDestination(q)?.href).toBe(href);
  });
  it("returns null for gibberish rather than guessing", () => {
    expect(resolveNavDestination("flibber jabbit")).toBeNull();
  });
});
