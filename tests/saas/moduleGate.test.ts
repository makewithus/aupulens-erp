/**
 * Step 5 — Module access enforcement tests.
 *
 * These are mostly pure unit tests for the helper functions in
 * lib/middleware/moduleGate.ts. No DB, no network, no Mongoose.
 * The injected OrgDataFetcher pattern means middleware integration
 * can be tested with a vi.fn() instead of mocking fetch().
 */

import { describe, it, expect, vi } from "vitest";
import {
  getModuleFromPath,
  isPathAllowlisted,
  isModuleAccessible,
  buildGateDeniedResponse,
  applyModuleGating,
  UNGATED_PREFIXES,
} from "@/lib/middleware/moduleGate";

// ── getModuleFromPath ─────────────────────────────────────────────────────────

describe("getModuleFromPath — module routes", () => {
  it.each([
    ["/admin/dashboard",           "admin"],
    ["/api/admin/users",           "admin"],
    ["/admin",                     "admin"],   // exact prefix
    ["/api/admin",                 "admin"],
    ["/finance/summary",           "finance"],
    ["/api/finance/invoices",      "finance"],
    ["/sales/orders",              "sales"],
    ["/api/sales/quotes",          "sales"],
    ["/inventory/dashboard",       "inventory"],
    ["/api/inventory/items",       "inventory"],
    ["/manufacturing/dashboard",   "manufacturing"],
    ["/api/manufacturing/orders",  "manufacturing"],
    ["/hr/employees",              "hr"],
    ["/api/hr/payroll",            "hr"],
    ["/crm/leads",                 "crm"],
    ["/api/crm/opportunities",     "crm"],
  ] as const)("'%s' → '%s'", (path, expected) => {
    expect(getModuleFromPath(path)).toBe(expected);
  });
});

describe("getModuleFromPath — non-module paths return null", () => {
  it.each([
    "/api/auth/session",
    "/api/auth/org/create",
    "/api/billing/history",
    "/api/tenant/status",
    "/api/internal/org-tier",
    "/api/master-admin/orgs",
    "/auth/admin",
    "/onboarding/signup",
    "/master-admin",
    "/",
    "/unknown/path",
    "/api/users",
  ])("null for '%s'", (path) => {
    expect(getModuleFromPath(path)).toBeNull();
  });
});

describe("getModuleFromPath — prefix boundary correctness", () => {
  it("does not match /adminfoo as admin", () => {
    expect(getModuleFromPath("/adminfoo")).toBeNull();
  });
  it("does not match /api/adminfoo as admin", () => {
    expect(getModuleFromPath("/api/adminfoo")).toBeNull();
  });
  it("matches /admin/anything", () => {
    expect(getModuleFromPath("/admin/settings/security")).toBe("admin");
  });
});

// ── isPathAllowlisted ─────────────────────────────────────────────────────────

describe("isPathAllowlisted — root allowlist entries", () => {
  it("returns true for every UNGATED_PREFIX itself", () => {
    for (const prefix of UNGATED_PREFIXES) {
      expect(isPathAllowlisted(prefix)).toBe(true);
    }
  });
});

describe("isPathAllowlisted — sub-paths of allowlisted routes", () => {
  it.each([
    "/api/auth/session",
    "/api/auth/org/create",
    "/api/auth/org/invite",
    "/api/auth/org/accept",
    "/api/billing/history",
    "/api/ai/memory/search",
    "/api/internal/org-tier",
    "/auth/admin",
    "/auth/finance",
    "/onboarding/signup",
    "/master-admin/orgs",
    "/api/master-admin/users",
    "/api/users/list",
  ])("true for '%s'", (path) => {
    expect(isPathAllowlisted(path)).toBe(true);
  });
});

describe("isPathAllowlisted — module paths are NOT allowlisted", () => {
  it.each([
    "/finance/summary",
    "/api/finance/invoices",
    "/sales/orders",
    "/manufacturing/dashboard",
    "/crm/leads",
    "/hr/employees",
    "/inventory/items",
  ])("false for '%s'", (path) => {
    expect(isPathAllowlisted(path)).toBe(false);
  });
});

// ── isModuleAccessible — tier ceiling ─────────────────────────────────────────

describe("isModuleAccessible — starter tier", () => {
  const orgModules: string[] = []; // empty → use tier ceiling only

  it("admin accessible on starter", () =>
    expect(isModuleAccessible("admin", "starter", orgModules)).toBe(true));
  it("hr accessible on starter", () =>
    expect(isModuleAccessible("hr", "starter", orgModules)).toBe(true));
  it("inventory accessible on starter", () =>
    expect(isModuleAccessible("inventory", "starter", orgModules)).toBe(true));
  it("finance NOT accessible on starter", () =>
    expect(isModuleAccessible("finance", "starter", orgModules)).toBe(false));
  it("sales NOT accessible on starter", () =>
    expect(isModuleAccessible("sales", "starter", orgModules)).toBe(false));
  it("crm NOT accessible on starter", () =>
    expect(isModuleAccessible("crm", "starter", orgModules)).toBe(false));
  it("manufacturing NOT accessible on starter (enterprise-only)", () =>
    expect(isModuleAccessible("manufacturing", "starter", orgModules)).toBe(false));
});

describe("isModuleAccessible — professional tier", () => {
  const orgModules: string[] = [];

  it("finance accessible on professional", () =>
    expect(isModuleAccessible("finance", "professional", orgModules)).toBe(true));
  it("sales accessible on professional", () =>
    expect(isModuleAccessible("sales", "professional", orgModules)).toBe(true));
  it("crm accessible on professional", () =>
    expect(isModuleAccessible("crm", "professional", orgModules)).toBe(true));
  it("manufacturing NOT accessible on professional", () =>
    expect(isModuleAccessible("manufacturing", "professional", orgModules)).toBe(false));
});

describe("isModuleAccessible — enterprise tier", () => {
  const orgModules: string[] = [];

  it("manufacturing accessible on enterprise", () =>
    expect(isModuleAccessible("manufacturing", "enterprise", orgModules)).toBe(true));
  it("all standard modules accessible on enterprise", () => {
    const modules = ["admin", "hr", "inventory", "finance", "sales", "crm", "manufacturing"];
    for (const mod of modules) {
      expect(isModuleAccessible(mod, "enterprise", orgModules)).toBe(true);
    }
  });
});

describe("isModuleAccessible — unknown/null tier falls back to starter", () => {
  it("undefined tier → starter limits", () =>
    expect(isModuleAccessible("finance", undefined, [])).toBe(false));
  it("null tier → starter limits", () =>
    expect(isModuleAccessible("finance", null, [])).toBe(false));
  it("unknown string tier → starter limits", () =>
    expect(isModuleAccessible("finance", "ultra" as any, [])).toBe(false));
  it("unknown tier still allows starter modules", () =>
    expect(isModuleAccessible("admin", "ultra" as any, [])).toBe(true));
});

// ── isModuleAccessible — org settings narrowing ───────────────────────────────

describe("isModuleAccessible — org settings intersection", () => {
  it("module in tier AND in org settings → accessible", () => {
    expect(isModuleAccessible("hr", "starter", ["admin", "hr", "inventory"])).toBe(true);
  });

  it("module in tier but NOT in org settings → blocked", () => {
    expect(isModuleAccessible("hr", "starter", ["admin", "inventory"])).toBe(false);
  });

  it("module not in tier but listed in org settings → still blocked (tier is the ceiling)", () => {
    expect(isModuleAccessible("manufacturing", "starter", ["manufacturing"])).toBe(false);
  });

  it("empty org settings → tier ceiling only (migration safety for pre-Step5 orgs)", () => {
    expect(isModuleAccessible("hr", "starter", [])).toBe(true);
    expect(isModuleAccessible("finance", "starter", [])).toBe(false);
  });
});

// ── buildGateDeniedResponse ───────────────────────────────────────────────────

describe("buildGateDeniedResponse — 403 body shape", () => {
  it("includes all required keys", () => {
    const body = buildGateDeniedResponse("manufacturing", "starter");
    expect(body.code).toBe("MODULE_NOT_AVAILABLE");
    expect(body.module).toBe("manufacturing");
    expect(body.currentTier).toBe("starter");
    expect(body.requiredAction).toBe("upgrade");
    expect(typeof body.error).toBe("string");
  });

  it("error string names the blocked module", () => {
    const { error } = buildGateDeniedResponse("finance", "starter");
    expect(String(error).toLowerCase()).toContain("finance");
  });

  it("error string names the current tier", () => {
    const { error } = buildGateDeniedResponse("finance", "starter");
    expect(String(error).toLowerCase()).toContain("starter");
  });

  it("requiredAction is 'upgrade'", () => {
    expect(buildGateDeniedResponse("crm", "professional").requiredAction).toBe("upgrade");
  });
});

// ── applyModuleGating — pass-through (null) cases ────────────────────────────

const starterOrg  = { tier: "starter",      enabledModules: [] };
const proOrg      = { tier: "professional", enabledModules: [] };
const enterpriseOrg = { tier: "enterprise", enabledModules: [] };

function makeUser(overrides: object = {}) {
  return { id: "u1", role: "admin", tenantId: "acme", ...overrides };
}

describe("applyModuleGating — pass-through cases (returns null)", () => {
  it("unauthenticated (null user) → null; does not call fetcher", async () => {
    const fetcher = vi.fn().mockResolvedValue(starterOrg);
    expect(await applyModuleGating("/finance/summary", null, fetcher)).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("user without tenantId → null; does not call fetcher", async () => {
    const fetcher = vi.fn().mockResolvedValue(starterOrg);
    expect(await applyModuleGating("/finance/summary", { role: "admin" }, fetcher)).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("master-admin bypasses module gate on any path", async () => {
    const fetcher = vi.fn().mockResolvedValue(starterOrg);
    const res = await applyModuleGating(
      "/manufacturing/dashboard",
      makeUser({ role: "master-admin" }),
      fetcher
    );
    expect(res).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("/api/auth/* is always ungated (even on starter)", async () => {
    const fetcher = vi.fn().mockResolvedValue(starterOrg);
    expect(await applyModuleGating("/api/auth/session", makeUser(), fetcher)).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("/api/auth/org/create is always ungated", async () => {
    const fetcher = vi.fn().mockResolvedValue(starterOrg);
    expect(await applyModuleGating("/api/auth/org/create", makeUser(), fetcher)).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("/api/billing/* is always ungated (user must be able to upgrade)", async () => {
    const fetcher = vi.fn().mockResolvedValue(starterOrg);
    expect(await applyModuleGating("/api/billing/history", makeUser(), fetcher)).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("/master-admin/* is always ungated", async () => {
    const fetcher = vi.fn().mockResolvedValue(starterOrg);
    expect(await applyModuleGating("/master-admin/orgs", makeUser({ role: "master-admin" }), fetcher)).toBeNull();
  });

  it("/api/internal/* is always ungated (internal platform calls)", async () => {
    const fetcher = vi.fn().mockResolvedValue(starterOrg);
    expect(await applyModuleGating("/api/internal/org-tier", makeUser(), fetcher)).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("non-module path → null; does not call fetcher", async () => {
    const fetcher = vi.fn().mockResolvedValue(starterOrg);
    expect(await applyModuleGating("/api/tenant/status", makeUser(), fetcher)).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("org fetch returns null → fail open, null returned", async () => {
    const fetcher = vi.fn().mockResolvedValue(null);
    expect(await applyModuleGating("/finance/summary", makeUser(), fetcher)).toBeNull();
  });

  it("admin module on starter → allowed (admin is in all tiers)", async () => {
    const fetcher = vi.fn().mockResolvedValue(starterOrg);
    expect(await applyModuleGating("/admin/dashboard", makeUser(), fetcher)).toBeNull();
  });

  it("hr module on starter → allowed", async () => {
    const fetcher = vi.fn().mockResolvedValue(starterOrg);
    expect(await applyModuleGating("/hr/employees", makeUser(), fetcher)).toBeNull();
  });

  it("module in tier AND in org settings → null (allowed)", async () => {
    const fetcher = vi.fn().mockResolvedValue({ tier: "starter", enabledModules: ["admin", "hr"] });
    expect(await applyModuleGating("/hr/employees", makeUser(), fetcher)).toBeNull();
  });

  it("finance accessible on professional → null", async () => {
    const fetcher = vi.fn().mockResolvedValue(proOrg);
    expect(await applyModuleGating("/finance/summary", makeUser(), fetcher)).toBeNull();
  });

  it("manufacturing accessible on enterprise → null", async () => {
    const fetcher = vi.fn().mockResolvedValue(enterpriseOrg);
    expect(await applyModuleGating("/manufacturing/dashboard", makeUser(), fetcher)).toBeNull();
  });
});

// ── applyModuleGating — 403 cases ────────────────────────────────────────────

describe("applyModuleGating — 403 responses", () => {
  it("finance on starter → 403", async () => {
    const fetcher = vi.fn().mockResolvedValue(starterOrg);
    const res = await applyModuleGating("/finance/summary", makeUser(), fetcher);
    expect(res?.status).toBe(403);
  });

  it("403 body has correct shape for MODULE_NOT_AVAILABLE", async () => {
    const fetcher = vi.fn().mockResolvedValue(starterOrg);
    const res = await applyModuleGating("/api/manufacturing/orders", makeUser(), fetcher);
    const body = await res!.json();
    expect(body.code).toBe("MODULE_NOT_AVAILABLE");
    expect(body.module).toBe("manufacturing");
    expect(body.currentTier).toBe("starter");
    expect(body.requiredAction).toBe("upgrade");
    expect(typeof body.error).toBe("string");
  });

  it("module allowed by tier but disabled in org settings → 403", async () => {
    // org turned off hr in their settings even though starter includes it
    const fetcher = vi.fn().mockResolvedValue({ tier: "starter", enabledModules: ["admin", "inventory"] });
    const res = await applyModuleGating("/hr/employees", makeUser(), fetcher);
    expect(res?.status).toBe(403);
  });

  it("manufacturing blocked on professional (enterprise-only)", async () => {
    const fetcher = vi.fn().mockResolvedValue(proOrg);
    const res = await applyModuleGating("/manufacturing/dashboard", makeUser(), fetcher);
    expect(res?.status).toBe(403);
    const body = await res!.json();
    expect(body.currentTier).toBe("professional");
    expect(body.module).toBe("manufacturing");
  });

  it("crm blocked on starter (professional+ feature)", async () => {
    const fetcher = vi.fn().mockResolvedValue(starterOrg);
    const res = await applyModuleGating("/crm/leads", makeUser(), fetcher);
    expect(res?.status).toBe(403);
  });

  it("sales blocked on starter", async () => {
    const fetcher = vi.fn().mockResolvedValue(starterOrg);
    const res = await applyModuleGating("/api/sales/quotes", makeUser(), fetcher);
    expect(res?.status).toBe(403);
  });
});

// ── applyModuleGating — tenant isolation ─────────────────────────────────────

describe("applyModuleGating — tenant isolation", () => {
  it("fetcher is called with the session tenantId, not a hardcoded value", async () => {
    const fetcher = vi.fn().mockResolvedValue(starterOrg);
    await applyModuleGating("/hr/employees", makeUser({ tenantId: "globex" }), fetcher);
    expect(fetcher).toHaveBeenCalledWith("globex");
    expect(fetcher).not.toHaveBeenCalledWith("acme");
  });

  it("org A's enterprise modules do not affect org B on starter", async () => {
    const fetcherA = vi.fn().mockResolvedValue(enterpriseOrg);
    const fetcherB = vi.fn().mockResolvedValue(starterOrg);

    // Org A (enterprise) can access manufacturing
    const resA = await applyModuleGating(
      "/manufacturing/dashboard",
      makeUser({ tenantId: "org-a" }),
      fetcherA
    );
    expect(resA).toBeNull(); // allowed

    // Org B (starter) cannot access manufacturing
    const resB = await applyModuleGating(
      "/manufacturing/dashboard",
      makeUser({ tenantId: "org-b" }),
      fetcherB
    );
    expect(resB?.status).toBe(403);

    expect(fetcherA).toHaveBeenCalledWith("org-a");
    expect(fetcherB).toHaveBeenCalledWith("org-b");
  });

  it("two orgs on same tier but different org settings have independent access", async () => {
    // Both on starter, but org-x narrowed modules
    const fetcherFull    = vi.fn().mockResolvedValue({ tier: "starter", enabledModules: [] });
    const fetcherNarrowed = vi.fn().mockResolvedValue({ tier: "starter", enabledModules: ["admin"] });

    // Org with full starter access can reach /hr
    const resOrgFull = await applyModuleGating("/hr/employees", makeUser({ tenantId: "full" }), fetcherFull);
    expect(resOrgFull).toBeNull();

    // Org with narrowed settings cannot reach /hr
    const resOrgNarrowed = await applyModuleGating("/hr/employees", makeUser({ tenantId: "narrow" }), fetcherNarrowed);
    expect(resOrgNarrowed?.status).toBe(403);
  });
});
