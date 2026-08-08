/**
 * Navigation resolver — the AI Command Center must only ever navigate to REAL
 * app routes (derived from the actual sidebar configs), never an AI-guessed URL
 * that 404s (the "/admin/leads" bug).
 */
import { describe, it, expect } from "vitest";
import { NAV_DESTINATIONS, resolveNavDestination, topNavSuggestions } from "@/lib/ai/navRoutes";

describe("NAV_DESTINATIONS", () => {
  it("is built from real routes (all start with '/', deduped)", () => {
    expect(NAV_DESTINATIONS.length).toBeGreaterThan(0);
    const hrefs = NAV_DESTINATIONS.map((d) => d.href);
    expect(hrefs.every((h) => h.startsWith("/"))).toBe(true);
    expect(new Set(hrefs).size).toBe(hrefs.length); // no dupes
  });
  it("includes the real leads route (the one that used to 404 as /admin/leads)", () => {
    expect(NAV_DESTINATIONS.some((d) => d.href === "/crm/leads")).toBe(true);
    expect(NAV_DESTINATIONS.some((d) => d.href === "/admin/leads")).toBe(false);
  });
});

describe("resolveNavDestination", () => {
  it("resolves 'go to leads' to the real /crm/leads (not /admin/leads)", () => {
    expect(resolveNavDestination("go to leads")?.href).toBe("/crm/leads");
    expect(resolveNavDestination("leads")?.href).toBe("/crm/leads");
    expect(resolveNavDestination("open the leads page")?.href).toBe("/crm/leads");
  });
  it("resolves other common destinations to real routes", () => {
    const cust = resolveNavDestination("go to customers");
    expect(cust?.href).toMatch(/^\/(sales|crm)\//);
    const inv = resolveNavDestination("open invoices");
    expect(inv?.href).toContain("invoices");
    const emp = resolveNavDestination("show me employees");
    expect(emp?.href).toContain("employees");
  });
  it("tolerates a wrong AI-guessed URL by resolving the meaningful token", () => {
    // Even if the model passes "/admin/leads", the resolver lands on the real page.
    expect(resolveNavDestination("/admin/leads")?.href).toBe("/crm/leads");
  });
  it("returns null for nonsense so the caller can avoid a bad redirect", () => {
    expect(resolveNavDestination("asdfqwer zxcv")).toBeNull();
    expect(resolveNavDestination("")).toBeNull();
  });
});

describe("topNavSuggestions", () => {
  it("returns a non-empty friendly list", () => {
    const s = topNavSuggestions();
    expect(s.length).toBeGreaterThan(0);
  });
});
