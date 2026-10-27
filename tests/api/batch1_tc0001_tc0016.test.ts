import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

// ── Hoisted Mocks ────────────────────────────────────────────────────────────
const {
  authMock,
  invoiceFindMock,
  activityLogFindMock,
  activityLogCountMock,
  orgFindOneMock,
  aiUsageFindMock,
  checkTenantModelOverridesMock,
  getGlobalAiUsageCountMock,
  resolveEntitlementsMock,
  orgEntitlementFindOneMock,
  taskFindMock,
  vendorFindMock,
} = vi.hoisted(() => ({
  authMock: vi.fn(),
  invoiceFindMock: vi.fn(),
  activityLogFindMock: vi.fn(),
  activityLogCountMock: vi.fn(),
  orgFindOneMock: vi.fn(),
  aiUsageFindMock: vi.fn(),
  checkTenantModelOverridesMock: vi.fn(),
  getGlobalAiUsageCountMock: vi.fn(),
  resolveEntitlementsMock: vi.fn(),
  orgEntitlementFindOneMock: vi.fn(),
  taskFindMock: vi.fn(),
  vendorFindMock: vi.fn(),
}));

// Mock NextAuth session
vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/lib/db", () => ({ default: vi.fn() }));

// Mock Mongoose models
vi.mock("@/models/finance/Invoice", () => ({
  default: { find: invoiceFindMock },
}));

vi.mock("@/models/admin/ActivityLog", () => ({
  default: {
    find: activityLogFindMock,
    countDocuments: activityLogCountMock,
  },
}));

vi.mock("@/models/admin/Organization", () => ({
  default: { findOne: orgFindOneMock },
}));

vi.mock("@/models/admin/AiUsage", () => ({
  default: { find: aiUsageFindMock },
}));

vi.mock("@/lib/ai/usage", () => ({
  getAiPeriod: vi.fn().mockReturnValue("202610"),
  getGlobalMonthlyCap: vi.fn().mockReturnValue(17000),
  getGlobalAiUsageCount: getGlobalAiUsageCountMock,
}));

vi.mock("@/lib/ai/modelHealth", () => ({
  checkTenantModelOverrides: checkTenantModelOverridesMock,
}));

vi.mock("@/lib/platform/entitlements/resolve", () => ({
  resolveEntitlements: resolveEntitlementsMock,
}));

vi.mock("@/models/platform/OrganizationEntitlement", () => ({
  default: { findOne: orgEntitlementFindOneMock },
}));

vi.mock("@/models/admin/Task", () => ({
  default: { find: taskFindMock },
}));

vi.mock("@/models/admin/Vendor", () => ({
  default: { find: vendorFindMock },
}));

// Handlers under test
import { GET as getInvoices } from "@/app/api/accounting/invoices/route";
import { GET as getActivityLogs } from "@/app/api/activity-logs/route";
import { GET as getAiUsage } from "@/app/api/admin/ai-usage/route";
import { GET as getEntitlements } from "@/app/api/admin/entitlements/route";
import { GET as getOrgSettings } from "@/app/api/admin/org-settings/route";
import { GET as getTasks } from "@/app/api/admin/tasks/route";
import { GET as getVendors } from "@/app/api/admin/vendors/route";

describe("Batch 1: TC-0001 to TC-0016 API Verification Suite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── TC-0001 & TC-0002: Accounting Invoices ─────────────────────────────────
  describe("TC-0001 & TC-0002 — Accounting Invoices API", () => {
    it("TC-0001: Authenticated finance user retrieves tenant-scoped invoices (HTTP 200)", async () => {
      authMock.mockResolvedValue({
        user: { id: "u-fin-1", role: "finance", tenantId: "tenant-acme" },
      });

      const mockInvoices = [
        { _id: "inv-1", name: "INV-001", amountTotal: 15000, tenantId: "tenant-acme" },
        { _id: "inv-2", name: "INV-002", amountTotal: 25000, tenantId: "tenant-acme" },
      ];

      const chain = {
        populate: vi.fn().mockReturnThis(),
        sort: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValue(mockInvoices),
      };
      invoiceFindMock.mockReturnValue(chain);

      const req = new NextRequest("http://localhost:3000/api/accounting/invoices");
      const res = await getInvoices(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.items).toHaveLength(2);
      expect(invoiceFindMock).toHaveBeenCalledWith({ tenantId: "tenant-acme" });
      expect(chain.populate).toHaveBeenCalledWith("partnerId");
    });

    it("TC-0001: Handles empty invoice collection without crashing (HTTP 200, empty list)", async () => {
      authMock.mockResolvedValue({
        user: { id: "u-fin-1", role: "finance", tenantId: "tenant-empty" },
      });

      const chain = {
        populate: vi.fn().mockReturnThis(),
        sort: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValue([]),
      };
      invoiceFindMock.mockReturnValue(chain);

      const req = new NextRequest("http://localhost:3000/api/accounting/invoices");
      const res = await getInvoices(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.items).toEqual([]);
      expect(invoiceFindMock).toHaveBeenCalledWith({ tenantId: "tenant-empty" });
    });

    it("TC-0002: Unauthenticated request is rejected before data lookup (HTTP 401)", async () => {
      authMock.mockResolvedValue(null);

      const req = new NextRequest("http://localhost:3000/api/accounting/invoices");
      const res = await getInvoices(req);
      const json = await res.json();

      expect(res.status).toBe(401);
      expect(json.error).toBe("Unauthorized");
      expect(invoiceFindMock).not.toHaveBeenCalled();
    });

    it("TC-0002: Unauthorized role (e.g. sales, hr, user) is denied with HTTP 403 Forbidden", async () => {
      for (const role of ["sales", "hr", "crm", "user", "inventory"]) {
        authMock.mockResolvedValue({
          user: { id: "u-sales", role, tenantId: "tenant-acme" },
        });

        const req = new NextRequest("http://localhost:3000/api/accounting/invoices");
        const res = await getInvoices(req);
        const json = await res.json();

        expect(res.status).toBe(403);
        expect(json.error).toContain("Forbidden");
        expect(invoiceFindMock).not.toHaveBeenCalled();
      }
    });

    it("TC-0002: Rejects request missing tenantId with HTTP 401 per requireTenantId contract", async () => {
      authMock.mockResolvedValue({
        user: { id: "u-no-tenant", role: "finance" },
      });

      const req = new NextRequest("http://localhost:3000/api/accounting/invoices");
      const res = await getInvoices(req);
      const json = await res.json();

      expect(res.status).toBe(401);
      expect(json.error).toContain("tenant context missing");
      expect(invoiceFindMock).not.toHaveBeenCalled();
    });
  });

  // ── TC-0003 & TC-0004: Activity Logs ───────────────────────────────────────
  describe("TC-0003 & TC-0004 — Activity Logs API", () => {
    it("TC-0003: Authenticated admin retrieves tenant-scoped activity logs (HTTP 200)", async () => {
      authMock.mockResolvedValue({
        user: { id: "u-admin-1", role: "admin", tenantId: "tenant-acme" },
      });

      const mockLogs = [
        { _id: "log-1", activity: "user.login", userName: "Admin", timestamp: new Date() },
        { _id: "log-2", activity: "invoice.create", userName: "Admin", timestamp: new Date() },
      ];

      const chain = {
        sort: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        skip: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValue(mockLogs),
      };
      activityLogFindMock.mockReturnValue(chain);
      activityLogCountMock.mockResolvedValue(2);

      const req = new NextRequest("http://localhost:3000/api/activity-logs?limit=50&skip=0");
      const res = await getActivityLogs(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.logs).toHaveLength(2);
      expect(json.total).toBe(2);
      expect(activityLogFindMock).toHaveBeenCalledWith(expect.objectContaining({ tenantId: "tenant-acme" }));
      expect(chain.limit).toHaveBeenCalledWith(50);
      expect(chain.skip).toHaveBeenCalledWith(0);
    });

    it("TC-0003: Sanitizes and clamps malformed pagination parameters safely", async () => {
      authMock.mockResolvedValue({
        user: { id: "u-admin-1", role: "admin", tenantId: "tenant-acme" },
      });

      const chain = {
        sort: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        skip: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValue([]),
      };
      activityLogFindMock.mockReturnValue(chain);
      activityLogCountMock.mockResolvedValue(0);

      // Malformed limit = -50, malformed skip = -10
      const req = new NextRequest("http://localhost:3000/api/activity-logs?limit=-50&skip=-10");
      const res = await getActivityLogs(req);
      expect(res.status).toBe(200);
      expect(chain.limit).toHaveBeenCalledWith(100); // clamped fallback
      expect(chain.skip).toHaveBeenCalledWith(0);   // clamped minimum 0
    });

    it("TC-0004: Unauthenticated request is rejected with HTTP 401 Unauthorized", async () => {
      authMock.mockResolvedValue(null);

      const req = new NextRequest("http://localhost:3000/api/activity-logs");
      const res = await getActivityLogs(req);
      const json = await res.json();

      expect(res.status).toBe(401);
      expect(json.error).toBe("Unauthorized");
      expect(activityLogFindMock).not.toHaveBeenCalled();
    });

    it("TC-0004: Authenticated non-admin user is rejected with HTTP 403 Forbidden (not 401)", async () => {
      authMock.mockResolvedValue({
        user: { id: "u-sales", role: "sales", tenantId: "tenant-acme" },
      });

      const req = new NextRequest("http://localhost:3000/api/activity-logs");
      const res = await getActivityLogs(req);
      const json = await res.json();

      expect(res.status).toBe(403);
      expect(json.error).toBe("Forbidden: admin access required");
      expect(activityLogFindMock).not.toHaveBeenCalled();
    });

    it("TC-0004: Malformed userId parameter returns HTTP 400 Bad Request without throwing CastError", async () => {
      authMock.mockResolvedValue({
        user: { id: "u-admin-1", role: "admin", tenantId: "tenant-acme" },
      });

      const req = new NextRequest("http://localhost:3000/api/activity-logs?userId=invalid-object-id");
      const res = await getActivityLogs(req);
      const json = await res.json();

      expect(res.status).toBe(400);
      expect(json.error).toBe("Invalid userId parameter");
      expect(activityLogFindMock).not.toHaveBeenCalled();
    });
  });

  // ── TC-0005 & TC-0006: Admin AI Usage ──────────────────────────────────────
  describe("TC-0005 & TC-0006 — Admin AI Usage API", () => {
    it("TC-0005: Authenticated admin retrieves tenant AI usage breakdown (HTTP 200)", async () => {
      authMock.mockResolvedValue({
        user: { id: "u-admin-1", role: "admin", tenantId: "tenant-acme" },
      });

      orgFindOneMock.mockReturnValue({
        lean: vi.fn().mockResolvedValue({ tier: "enterprise", settings: { ai: { disabled: false } } }),
      });

      aiUsageFindMock.mockReturnValue({
        sort: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValue([{ period: "202610", count: 1250 }]),
      });

      checkTenantModelOverridesMock.mockResolvedValue({
        deployedChatModels: ["gpt-4o"],
        configured: true,
        overrides: [{ subdomain: "tenant-acme", model: "gpt-4o", valid: true }],
        stale: [],
      });

      getGlobalAiUsageCountMock.mockResolvedValue(5400);

      const res = await getAiUsage();
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.tier).toBe("enterprise");
      expect(json.data.currentUsage).toBe(1250);
      expect(json.data.globalCeiling.used).toBe(5400);
      expect(aiUsageFindMock).toHaveBeenCalledWith(expect.objectContaining({ tenantId: "tenant-acme" }));
    });

    it("TC-0005: Handles zero / empty AI usage gracefully", async () => {
      authMock.mockResolvedValue({
        user: { id: "u-admin-1", role: "admin", tenantId: "tenant-new" },
      });

      orgFindOneMock.mockReturnValue({
        lean: vi.fn().mockResolvedValue(null),
      });

      aiUsageFindMock.mockReturnValue({
        sort: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValue([]),
      });

      checkTenantModelOverridesMock.mockResolvedValue({
        deployedChatModels: ["gpt-4o"],
        configured: true,
        overrides: [],
        stale: [],
      });

      getGlobalAiUsageCountMock.mockResolvedValue(0);

      const res = await getAiUsage();
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.currentUsage).toBe(0);
      expect(json.data.history).toEqual([]);
    });

    it("TC-0006: Unauthenticated request returns HTTP 401", async () => {
      authMock.mockResolvedValue(null);

      const res = await getAiUsage();
      expect(res.status).toBe(401);
      expect(aiUsageFindMock).not.toHaveBeenCalled();
    });

    it("TC-0006: Authenticated non-admin request is denied with HTTP 403 Forbidden", async () => {
      authMock.mockResolvedValue({
        user: { id: "u-finance", role: "finance", tenantId: "tenant-acme" },
      });

      const res = await getAiUsage();
      const json = await res.json();

      expect(res.status).toBe(403);
      expect(json.message).toBe("Forbidden");
      expect(aiUsageFindMock).not.toHaveBeenCalled();
    });
  });

  // ── TC-0007 & TC-0008: Admin Dashboard ─────────────────────────────────────
  describe("TC-0007 & TC-0008 — Admin Dashboard API Security Gate", () => {
    it("TC-0008: Unauthenticated request is rejected immediately with HTTP 401", async () => {
      const { GET: getDashboard } = await import("@/app/api/admin/dashboard/route");
      authMock.mockResolvedValue(null);

      const res = await getDashboard();
      expect(res.status).toBe(401);
    });

    it("TC-0008: Non-admin session is rejected before querying ledger data", async () => {
      const { GET: getDashboard } = await import("@/app/api/admin/dashboard/route");
      authMock.mockResolvedValue({
        user: { id: "u-sales", role: "sales", tenantId: "tenant-acme" },
      });

      const res = await getDashboard();
      expect(res.status).toBe(401);
    });
  });

  // ── TC-0009 & TC-0010: Admin Entitlements ───────────────────────────────────
  describe("TC-0009 & TC-0010 — Admin Entitlements API", () => {
    it("TC-0009: Authenticated admin retrieves resolved organization entitlements (HTTP 200)", async () => {
      authMock.mockResolvedValue({
        user: { id: "u-admin-1", role: "admin", tenantId: "tenant-acme" },
      });

      resolveEntitlementsMock.mockResolvedValue({
        planKey: "pro",
        modules: ["admin", "finance", "sales", "hr"],
        limits: { maxUsers: 50, storageGb: 50 },
        source: "assigned",
      });

      orgEntitlementFindOneMock.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValue({ overrides: { maxUsers: 60 } }),
      });

      const res = await getEntitlements();
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.planKey).toBe("pro");
      expect(json.data.modules).toContain("finance");
      expect(json.data.overrides).toEqual({ maxUsers: 60 });
      expect(resolveEntitlementsMock).toHaveBeenCalledWith("tenant-acme");
      expect(orgEntitlementFindOneMock).toHaveBeenCalledWith({ tenantId: "tenant-acme" });
    });

    it("TC-0010: Unauthenticated request is rejected with HTTP 401", async () => {
      authMock.mockResolvedValue(null);

      const res = await getEntitlements();
      expect(res.status).toBe(401);
      expect(resolveEntitlementsMock).not.toHaveBeenCalled();
    });

    it("TC-0010: Authenticated non-admin is rejected with HTTP 403 Forbidden", async () => {
      authMock.mockResolvedValue({
        user: { id: "u-user", role: "user", tenantId: "tenant-acme" },
      });

      const res = await getEntitlements();
      const json = await res.json();

      expect(res.status).toBe(403);
      expect(json.message).toBe("Forbidden");
      expect(resolveEntitlementsMock).not.toHaveBeenCalled();
    });
  });

  // ── TC-0011 & TC-0012: Organization Settings ───────────────────────────────
  describe("TC-0011 & TC-0012 — Organization Settings API", () => {
    it("TC-0011: Authenticated admin retrieves organization settings safely (HTTP 200)", async () => {
      authMock.mockResolvedValue({
        user: { id: "u-admin-1", role: "admin", tenantId: "tenant-acme" },
      });

      orgFindOneMock.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValue({
          name: "Acme Corp",
          tier: "pro",
          subscriptionStatus: "active",
          settings: { timezone: "Asia/Kolkata", currency: "INR" },
        }),
      });

      resolveEntitlementsMock.mockResolvedValue({
        planKey: "pro",
        modules: ["admin", "finance", "sales"],
        source: "assigned",
      });

      const res = await getOrgSettings();
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.name).toBe("Acme Corp");
      expect(json.data.settings.currency).toBe("INR");
      expect(orgFindOneMock).toHaveBeenCalledWith({ subdomain: "tenant-acme" });
    });

    it("TC-0012: Unauthenticated request returns HTTP 401", async () => {
      authMock.mockResolvedValue(null);

      const res = await getOrgSettings();
      expect(res.status).toBe(401);
      expect(orgFindOneMock).not.toHaveBeenCalled();
    });

    it("TC-0012: Non-admin request returns HTTP 403 Forbidden", async () => {
      authMock.mockResolvedValue({
        user: { id: "u-hr", role: "hr", tenantId: "tenant-acme" },
      });

      const res = await getOrgSettings();
      const json = await res.json();

      expect(res.status).toBe(403);
      expect(json.message).toBe("Forbidden");
      expect(orgFindOneMock).not.toHaveBeenCalled();
    });

    it("TC-0012: Missing organization returns clean HTTP 404 Not Found without leaking details", async () => {
      authMock.mockResolvedValue({
        user: { id: "u-admin-1", role: "admin", tenantId: "tenant-nonexistent" },
      });

      orgFindOneMock.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValue(null),
      });

      const res = await getOrgSettings();
      const json = await res.json();

      expect(res.status).toBe(404);
      expect(json.message).toBe("Organization not found");
    });
  });

  // ── TC-0013 & TC-0014: Admin Tasks ─────────────────────────────────────────
  describe("TC-0013 & TC-0014 — Admin Tasks API", () => {
    it("TC-0013: Authenticated admin retrieves tenant-scoped tasks (HTTP 200)", async () => {
      authMock.mockResolvedValue({
        user: { id: "u-admin-1", role: "admin", tenantId: "tenant-acme" },
      });

      const mockTasks = [
        { _id: "task-1", title: "Review quarterly GST", status: "todo", tenantId: "tenant-acme" },
        { _id: "task-2", title: "Onboard new hire", status: "in_progress", tenantId: "tenant-acme" },
      ];

      const chain = {
        populate: vi.fn().mockReturnThis(),
        sort: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValue(mockTasks),
      };
      taskFindMock.mockReturnValue(chain);

      const req = new NextRequest("http://localhost:3000/api/admin/tasks");
      const res = await getTasks(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.tasks).toHaveLength(2);
      expect(taskFindMock).toHaveBeenCalledWith(expect.objectContaining({ tenantId: "tenant-acme" }));
      expect(chain.populate).toHaveBeenCalledWith("assignee", "name email");
    });

    it("TC-0013: Date range filters are applied inclusively", async () => {
      authMock.mockResolvedValue({
        user: { id: "u-admin-1", role: "admin", tenantId: "tenant-acme" },
      });

      const chain = {
        populate: vi.fn().mockReturnThis(),
        sort: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValue([]),
      };
      taskFindMock.mockReturnValue(chain);

      const req = new NextRequest("http://localhost:3000/api/admin/tasks?dateFrom=2026-10-01&dateTo=2026-10-31");
      const res = await getTasks(req);
      expect(res.status).toBe(200);
      expect(taskFindMock).toHaveBeenCalledWith(expect.objectContaining({
        tenantId: "tenant-acme",
        dueDate: expect.objectContaining({
          $gte: expect.any(Date),
          $lte: expect.any(Date),
        }),
      }));
    });

    it("TC-0014: Unauthenticated request returns HTTP 401", async () => {
      authMock.mockResolvedValue(null);

      const req = new NextRequest("http://localhost:3000/api/admin/tasks");
      const res = await getTasks(req);
      expect(res.status).toBe(401);
      expect(taskFindMock).not.toHaveBeenCalled();
    });

    it("TC-0014: Authenticated non-admin is denied with HTTP 403 Forbidden", async () => {
      authMock.mockResolvedValue({
        user: { id: "u-sales", role: "sales", tenantId: "tenant-acme" },
      });

      const req = new NextRequest("http://localhost:3000/api/admin/tasks");
      const res = await getTasks(req);
      const json = await res.json();

      expect(res.status).toBe(403);
      expect(json.error).toBe("Forbidden: admin access required");
      expect(taskFindMock).not.toHaveBeenCalled();
    });
  });

  // ── TC-0015 & TC-0016: Admin Vendors ───────────────────────────────────────
  describe("TC-0015 & TC-0016 — Admin Vendors API", () => {
    it("TC-0015: Authenticated admin retrieves tenant vendors (HTTP 200)", async () => {
      authMock.mockResolvedValue({
        user: { id: "u-admin-1", role: "admin", tenantId: "tenant-acme" },
      });

      const mockVendors = [
        { _id: "v-1", name: "Reliance Logistics", category: "Logistics", tenantId: "tenant-acme" },
        { _id: "v-2", name: "Tata Steel", category: "Raw Materials", tenantId: "tenant-acme" },
      ];

      const chain = {
        sort: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValue(mockVendors),
      };
      vendorFindMock.mockReturnValue(chain);

      const req = new NextRequest("http://localhost:3000/api/admin/vendors");
      const res = await getVendors(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.vendors).toHaveLength(2);
      expect(vendorFindMock).toHaveBeenCalledWith({ tenantId: "tenant-acme" });
    });

    it("TC-0015: Handles empty vendor directory cleanly (HTTP 200, empty list)", async () => {
      authMock.mockResolvedValue({
        user: { id: "u-admin-1", role: "admin", tenantId: "tenant-empty" },
      });

      const chain = {
        sort: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValue([]),
      };
      vendorFindMock.mockReturnValue(chain);

      const req = new NextRequest("http://localhost:3000/api/admin/vendors");
      const res = await getVendors(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.vendors).toEqual([]);
      expect(vendorFindMock).toHaveBeenCalledWith({ tenantId: "tenant-empty" });
    });

    it("TC-0016: Unauthenticated request returns HTTP 401", async () => {
      authMock.mockResolvedValue(null);

      const req = new NextRequest("http://localhost:3000/api/admin/vendors");
      const res = await getVendors(req);
      expect(res.status).toBe(401);
      expect(vendorFindMock).not.toHaveBeenCalled();
    });

    it("TC-0016: Authenticated non-admin is denied with HTTP 403 Forbidden", async () => {
      authMock.mockResolvedValue({
        user: { id: "u-user", role: "user", tenantId: "tenant-acme" },
      });

      const req = new NextRequest("http://localhost:3000/api/admin/vendors");
      const res = await getVendors(req);
      const json = await res.json();

      expect(res.status).toBe(403);
      expect(json.error).toBe("Forbidden: admin access required");
      expect(vendorFindMock).not.toHaveBeenCalled();
    });
  });
});
