import { describe, it, expect } from "vitest";
import {
  buildGateDeniedResponse,
  applyModuleGating,
  type OrgDataFetcher,
} from "@/lib/middleware/moduleGate";
import { moduleDenialMessage } from "@/lib/entitlements/moduleDenialMessage";

describe("AUP-012: Module Gate Denial Messages & Actions", () => {
  it("buildGateDeniedResponse returns MODULE_NOT_AVAILABLE and 'upgrade' for plan-restricted modules", () => {
    const res = buildGateDeniedResponse("manufacturing", "starter", "plan_restricted");
    expect(res.code).toBe("MODULE_NOT_AVAILABLE");
    expect(res.requiredAction).toBe("upgrade");
    expect(res.error).toBe("The manufacturing module is not available on your starter plan");
  });

  it("buildGateDeniedResponse returns MODULE_NOT_ENABLED and 'enable_in_settings' for admin-disabled modules", () => {
    const res = buildGateDeniedResponse("manufacturing", "enterprise", "disabled_by_admin");
    expect(res.code).toBe("MODULE_NOT_ENABLED");
    expect(res.requiredAction).toBe("enable_in_settings");
    expect(res.error).toContain("entitled on your enterprise plan but currently disabled by your organization administrator");
  });

  it("applyModuleGating returns MODULE_NOT_ENABLED when Enterprise tier has disabled a module in settings", async () => {
    const mockFetcher: OrgDataFetcher = async (tenantId: string) => ({
      tier: "enterprise",
      enabledModules: ["sales", "finance", "hr"], // manufacturing is omitted/disabled
    });

    const res = await applyModuleGating(
      "/api/manufacturing/orders",
      { role: "admin", tenantId: "ent-tenant" },
      mockFetcher,
      true
    );

    expect(res).not.toBeNull();
    expect(res!.status).toBe(403);
    const body = await res!.json();
    expect(body.code).toBe("MODULE_NOT_ENABLED");
    expect(body.requiredAction).toBe("enable_in_settings");
    expect(body.currentTier).toBe("enterprise");
    expect(body.error).toContain("disabled by your organization administrator");
  });

  it("applyModuleGating returns MODULE_NOT_AVAILABLE when Starter tier tries to access manufacturing", async () => {
    const mockFetcher: OrgDataFetcher = async (tenantId: string) => ({
      tier: "starter",
      enabledModules: ["inventory", "hr"],
    });

    const res = await applyModuleGating(
      "/api/manufacturing/orders",
      { role: "admin", tenantId: "starter-tenant" },
      mockFetcher,
      true
    );

    expect(res).not.toBeNull();
    expect(res!.status).toBe(403);
    const body = await res!.json();
    expect(body.code).toBe("MODULE_NOT_AVAILABLE");
    expect(body.requiredAction).toBe("upgrade");
    expect(body.currentTier).toBe("starter");
  });

  it("reports a project missing from explicit Enterprise assignments as disabled by the organization", async () => {
    const response = await applyModuleGating(
      "/api/projects",
      { role: "admin", tenantId: "enterprise-without-project-assignment" },
      async () => ({ tier: "enterprise", enabledModules: [], resolvedModules: [] }),
      true,
    );

    expect(response?.status).toBe(403);
    expect(await response!.json()).toMatchObject({
      code: "MODULE_NOT_ENABLED",
      module: "project",
      currentTier: "enterprise",
      requiredAction: "enable_in_settings",
    });
  });

  it("shows the organization-disabled reason in the unauthorized UI message", () => {
    expect(moduleDenialMessage("project", "enterprise", "disabled_by_admin")).toBe(
      "The project module is disabled by your organization. Ask an administrator to enable it in settings.",
    );
    expect(moduleDenialMessage("manufacturing", "starter", "plan_restricted")).toContain(
      "not available on your starter plan",
    );
  });
});
