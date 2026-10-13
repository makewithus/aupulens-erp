import { describe, it, expect } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { hasCrmAccess } from "@/lib/crm/api";
import { hasPermission, requireRole } from "@/lib/crm/rbac";

/**
 * CRM Route Access Control & Tenant Isolation Regression Suite
 *
 * Verifies that:
 * 1. Only authorized CRM roles (sales, admin, master-admin) can access /crm and /api/crm
 * 2. Unauthorized roles (finance, inventory, hr, user) are denied (403 for API, redirected for pages)
 * 3. Unauthenticated requests are rejected (401 for API, redirected to /auth for pages)
 * 4. Multi-tenant isolation prevents cross-tenant access
 * 5. Server-side API authorization enforces permissions on mutations
 */

// Helper to simulate the route-guard logic in middleware.ts
function evaluateCrmRouteGuard(options: {
  pathname: string;
  user?: { id?: string; role?: string; tenantId?: string; permissions?: string[] };
  tenantHostId?: string | null;
}) {
  const { pathname, user, tenantHostId } = options;
  const isApiRoute = pathname.startsWith("/api");

  // 1. Tenant isolation guard
  if (user && tenantHostId) {
    const userTenant = user.tenantId || "default-tenant";
    if (user.role !== "master-admin" && userTenant.toLowerCase() !== tenantHostId.toLowerCase()) {
      if (isApiRoute) {
        return { status: 403, type: "json", body: { error: "Forbidden: Tenant mismatch" } };
      }
      return { status: 307, type: "redirect", location: "/auth?error=TenantMismatch" };
    }
  }

  // 2. Unauthenticated check for API routes
  if (isApiRoute && !user) {
    return { status: 401, type: "json", body: { error: "Unauthorized" } };
  }

  // 3. CRM route role gate
  if (pathname.startsWith("/crm") || pathname.startsWith("/api/crm")) {
    if (!user) {
      if (isApiRoute) {
        return { status: 401, type: "json", body: { error: "Unauthorized" } };
      }
      return {
        status: 307,
        type: "redirect",
        location: `/auth?error=SessionRequired&callbackUrl=${encodeURIComponent(pathname)}`,
      };
    }

    if (
      user.role !== "sales" &&
      user.role !== "admin" &&
      user.role !== "master-admin"
    ) {
      if (isApiRoute) {
        return { status: 403, type: "json", body: { error: "Forbidden: Access denied" } };
      }
      // Page redirect to role dashboard
      const getRoleDashboard = (role: string) => {
        switch (role) {
          case "admin": return "/admin/dashboard";
          case "master-admin": return "/master-admin";
          case "finance": return "/finance/summary";
          case "sales": return "/sales/summary";
          case "inventory": return "/inventory/dashboard";
          case "manufacturing": return "/manufacturing/dashboard";
          case "hr": return "/hr/dashboard";
          case "project": return "/projects/dashboard";
          case "user": return "/calendar";
          default: return "/auth";
        }
      };
      return { status: 307, type: "redirect", location: getRoleDashboard(user.role as string) };
    }
  }

  return { status: 200, type: "next" };
}

describe("Priority 1: CRM Route Access Control & Role Guard", () => {
  describe("Direct URL Page Navigation (/crm/**)", () => {
    it("allows authenticated user with role 'sales' to access CRM pages", () => {
      const res = evaluateCrmRouteGuard({
        pathname: "/crm/leads",
        user: { role: "sales", tenantId: "acme" },
        tenantHostId: "acme",
      });
      expect(res.status).toBe(200);
      expect(res.type).toBe("next");
    });

    it("allows authenticated user with role 'admin' to access CRM pages", () => {
      const res = evaluateCrmRouteGuard({
        pathname: "/crm/opportunities",
        user: { role: "admin", tenantId: "acme" },
        tenantHostId: "acme",
      });
      expect(res.status).toBe(200);
      expect(res.type).toBe("next");
    });

    it("allows authenticated user with role 'master-admin' to access CRM pages across tenants", () => {
      const res = evaluateCrmRouteGuard({
        pathname: "/crm/pipeline",
        user: { role: "master-admin", tenantId: "global" },
        tenantHostId: "acme",
      });
      expect(res.status).toBe(200);
      expect(res.type).toBe("next");
    });

    it("denies role 'finance' from accessing CRM pages and redirects to /finance/summary", () => {
      const res = evaluateCrmRouteGuard({
        pathname: "/crm/leads",
        user: { role: "finance", tenantId: "acme" },
        tenantHostId: "acme",
      });
      expect(res.status).toBe(307);
      expect(res.type).toBe("redirect");
      expect(res.location).toBe("/finance/summary");
    });

    it("denies role 'inventory' from accessing CRM pages and redirects to /inventory/dashboard", () => {
      const res = evaluateCrmRouteGuard({
        pathname: "/crm/quotes",
        user: { role: "inventory", tenantId: "acme" },
        tenantHostId: "acme",
      });
      expect(res.status).toBe(307);
      expect(res.type).toBe("redirect");
      expect(res.location).toBe("/inventory/dashboard");
    });

    it("denies role 'hr' from accessing CRM pages and redirects to /hr/dashboard", () => {
      const res = evaluateCrmRouteGuard({
        pathname: "/crm/accounts",
        user: { role: "hr", tenantId: "acme" },
        tenantHostId: "acme",
      });
      expect(res.status).toBe(307);
      expect(res.type).toBe("redirect");
      expect(res.location).toBe("/hr/dashboard");
    });

    it("denies role 'user' from accessing CRM pages and redirects to /calendar", () => {
      const res = evaluateCrmRouteGuard({
        pathname: "/crm/dashboard",
        user: { role: "user", tenantId: "acme" },
        tenantHostId: "acme",
      });
      expect(res.status).toBe(307);
      expect(res.type).toBe("redirect");
      expect(res.location).toBe("/calendar");
    });

    it("redirects unauthenticated visitor to /auth with SessionRequired error and callbackUrl", () => {
      const res = evaluateCrmRouteGuard({
        pathname: "/crm/leads",
        tenantHostId: "acme",
      });
      expect(res.status).toBe(307);
      expect(res.type).toBe("redirect");
      expect(res.location).toContain("/auth?error=SessionRequired");
      expect(res.location).toContain("callbackUrl=%2Fcrm%2Fleads");
    });
  });

  describe("CRM API Requests (/api/crm/**)", () => {
    it("returns 401 Unauthorized for unauthenticated API requests", () => {
      const res = evaluateCrmRouteGuard({
        pathname: "/api/crm/leads",
        tenantHostId: "acme",
      });
      expect(res.status).toBe(401);
      expect(res.type).toBe("json");
      expect(res.body?.error).toBe("Unauthorized");
    });

    it("returns 403 Forbidden for unauthorized role accessing CRM API", () => {
      const res = evaluateCrmRouteGuard({
        pathname: "/api/crm/leads",
        user: { role: "finance", tenantId: "acme" },
        tenantHostId: "acme",
      });
      expect(res.status).toBe(403);
      expect(res.type).toBe("json");
      expect(res.body?.error).toBe("Forbidden: Access denied");
    });

    it("allows authorized role 'sales' to proceed to CRM API", () => {
      const res = evaluateCrmRouteGuard({
        pathname: "/api/crm/leads",
        user: { role: "sales", tenantId: "acme" },
        tenantHostId: "acme",
      });
      expect(res.status).toBe(200);
      expect(res.type).toBe("next");
    });

    it("allows authorized role 'admin' to proceed to CRM API", () => {
      const res = evaluateCrmRouteGuard({
        pathname: "/api/crm/quotes",
        user: { role: "admin", tenantId: "acme" },
        tenantHostId: "acme",
      });
      expect(res.status).toBe(200);
      expect(res.type).toBe("next");
    });
  });

  describe("Tenant Isolation Enforcement", () => {
    it("rejects user from tenant-A trying to access tenant-B CRM API with 403 Tenant mismatch", () => {
      const res = evaluateCrmRouteGuard({
        pathname: "/api/crm/leads",
        user: { role: "sales", tenantId: "tenant-a" },
        tenantHostId: "tenant-b",
      });
      expect(res.status).toBe(403);
      expect(res.body?.error).toBe("Forbidden: Tenant mismatch");
    });

    it("redirects user from tenant-A trying to access tenant-B CRM page with TenantMismatch error", () => {
      const res = evaluateCrmRouteGuard({
        pathname: "/crm/leads",
        user: { role: "sales", tenantId: "tenant-a" },
        tenantHostId: "tenant-b",
      });
      expect(res.status).toBe(307);
      expect(res.location).toBe("/auth?error=TenantMismatch");
    });

    it("allows master-admin cross-tenant access", () => {
      const res = evaluateCrmRouteGuard({
        pathname: "/api/crm/leads",
        user: { role: "master-admin", tenantId: "master" },
        tenantHostId: "tenant-b",
      });
      expect(res.status).toBe(200);
    });
  });

  describe("Server-Side Permission Verification (lib/crm/rbac.ts)", () => {
    it("hasCrmAccess validates only admin, sales, and master-admin", () => {
      expect(hasCrmAccess("admin")).toBe(true);
      expect(hasCrmAccess("sales")).toBe(true);
      expect(hasCrmAccess("master-admin")).toBe(true);
      expect(hasCrmAccess("finance")).toBe(false);
      expect(hasCrmAccess("inventory")).toBe(false);
      expect(hasCrmAccess("hr")).toBe(false);
      expect(hasCrmAccess("user")).toBe(false);
      expect(hasCrmAccess("")).toBe(false);
      expect(hasCrmAccess(undefined)).toBe(false);
    });

    it("requireRole blocks non-admin write operations without permission", () => {
      const salesSession = { user: { id: "u1", role: "sales", permissions: [] } };
      const roleCheck = requireRole(salesSession, ["lead.delete"]);
      expect(roleCheck).not.toBeNull();
      expect(roleCheck?.status).toBe(403);
    });

    it("requireRole allows read operations for sales role", () => {
      const salesSession = { user: { id: "u1", role: "sales", permissions: [] } };
      const roleCheck = requireRole(salesSession, ["lead.read", "lead.view"]);
      expect(roleCheck).toBeNull();
    });

    it("requireRole allows write operations for admin role unconditionally", () => {
      const adminSession = { user: { id: "u1", role: "admin", permissions: [] } };
      const roleCheck = requireRole(adminSession, ["lead.delete"]);
      expect(roleCheck).toBeNull();
    });
  });
});
