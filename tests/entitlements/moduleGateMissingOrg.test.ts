import { describe, it, expect } from "vitest";
import { applyModuleGating } from "@/lib/middleware/moduleGate";

describe("AUP-012: Module Gating & Missing Organization Handling", () => {
  it("fails closed (HTTP 403) for non-legacy tenants when organization lookup returns null on API routes", async () => {
    const user = { role: "admin", tenantId: "custom-tenant-123" };
    const getOrgData = async () => null;

    const res = await applyModuleGating("/api/inventory/items", user, getOrgData, true);

    expect(res).not.toBeNull();
    expect(res?.status).toBe(403);
    const body = await res?.json();
    expect(body.code).toBe("ORGANIZATION_NOT_FOUND");
    expect(body.error).toContain("Organization context not found or invalid");
  });

  it("fails closed with redirect to /unauthorized when organization lookup returns null on UI routes", async () => {
    const user = { role: "admin", tenantId: "custom-tenant-456" };
    const getOrgData = async () => null;

    const res = await applyModuleGating(
      "/inventory/items",
      user,
      getOrgData,
      false,
      "http://localhost:3000/inventory/items",
    );

    expect(res).not.toBeNull();
    expect(res?.status).toBe(307); // NextResponse.redirect status
    const location = res?.headers.get("location");
    expect(location).toContain("/unauthorized");
    expect(location).toContain("reason=invalid_organization");
  });

  it("preserves backward compatibility and returns null for legacy default-tenant", async () => {
    const user = { role: "admin", tenantId: "default-tenant" };
    const getOrgData = async () => null;

    const res = await applyModuleGating("/api/inventory/items", user, getOrgData, true);

    // Default tenant passes through for backward compatibility
    expect(res).toBeNull();
  });

  it("distinguishes plan restrictions from admin disabled modules", async () => {
    const user = { role: "admin", tenantId: "custom-tenant-789" };
    // Starter tier doesn't include manufacturing
    const getOrgData = async () => ({
      tier: "starter",
      enabledModules: ["crm", "sales"],
      subscriptionStatus: "active",
      resolvedModules: ["crm", "sales"],
    });

    const res = await applyModuleGating("/api/manufacturing/work-orders", user, getOrgData, true);

    expect(res).not.toBeNull();
    expect(res?.status).toBe(403);
    const body = await res?.json();
    expect(body.code).toBe("MODULE_NOT_AVAILABLE");
    expect(body.requiredAction).toBe("upgrade");
  });

  it("distinguishes admin disabled modules with MODULE_NOT_ENABLED", async () => {
    const user = { role: "admin", tenantId: "custom-tenant-789" };
    // Enterprise includes manufacturing, but enabledModules explicitly disabled it
    const getOrgData = async () => ({
      tier: "enterprise",
      enabledModules: ["crm", "sales"],
      subscriptionStatus: "active",
      resolvedModules: undefined,
    });

    const res = await applyModuleGating("/api/manufacturing/work-orders", user, getOrgData, true);

    expect(res).not.toBeNull();
    expect(res?.status).toBe(403);
    const body = await res?.json();
    expect(body.code).toBe("MODULE_NOT_ENABLED");
    expect(body.requiredAction).toBe("enable_in_settings");
  });
});
