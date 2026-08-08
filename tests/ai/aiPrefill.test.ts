/**
 * AI form pre-fill hand-off — the store used by the "AI fills the real form,
 * you click Create" flow. Verifies stash/consume, target scoping, and that a
 * consumed stash is cleared (so a stale draft can't resurface).
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { stashPrefill, consumePrefill } from "@/lib/ai/aiPrefill";

// jsdom provides sessionStorage; if not, shim a minimal one.
beforeEach(() => {
  if (typeof sessionStorage === "undefined") {
    const store = new Map<string, string>();
    (globalThis as any).sessionStorage = {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
    };
  }
  sessionStorage.clear();
});

describe("aiPrefill", () => {
  it("stashes and consumes a payload", () => {
    stashPrefill({ target: "lead", route: "/crm/leads", data: { lead_name: "Arjun" }, suggestions: ["Phone looks short"] });
    const p = consumePrefill("lead");
    expect(p?.target).toBe("lead");
    expect(p?.route).toBe("/crm/leads");
    expect(p?.data.lead_name).toBe("Arjun");
    expect(p?.suggestions).toEqual(["Phone looks short"]);
  });

  it("clears the stash once consumed (no stale resurfacing)", () => {
    stashPrefill({ target: "lead", route: "/crm/leads", data: {} });
    expect(consumePrefill("lead")).not.toBeNull();
    expect(consumePrefill("lead")).toBeNull();
  });

  it("does not consume a stash meant for a different target", () => {
    stashPrefill({ target: "customer", route: "/sales/customers", data: {} });
    expect(consumePrefill("lead")).toBeNull();
    // still available for its real target
    expect(consumePrefill("customer")?.target).toBe("customer");
  });

  it("returns null when nothing is stashed", () => {
    expect(consumePrefill()).toBeNull();
    expect(consumePrefill("lead")).toBeNull();
  });

  it("never throws if storage is broken", () => {
    const orig = globalThis.sessionStorage;
    (globalThis as any).sessionStorage = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); }, removeItem: () => {} };
    expect(() => stashPrefill({ target: "lead", route: "/crm/leads", data: {} })).not.toThrow();
    expect(consumePrefill("lead")).toBeNull();
    (globalThis as any).sessionStorage = orig;
  });
});
