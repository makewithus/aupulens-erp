import { describe, it, expect, beforeEach, vi } from "vitest";
import { stripProtectedFields, PROTECTED_SYSTEM_FIELDS } from "@/lib/api/validateId";
import Invoice from "@/models/finance/Invoice";

// Hoisted mocks for Mongoose models and auth
const {
  authMock,
  customerFindOneAndUpdateMock,
  employeeFindOneMock,
  employeeFindOneAndUpdateMock,
  saleOrderFindOneMock,
  saleOrderFindOneAndUpdateMock,
  crmAccountFindOneAndUpdateMock,
} = vi.hoisted(() => ({
  authMock: vi.fn(),
  customerFindOneAndUpdateMock: vi.fn(),
  employeeFindOneMock: vi.fn(),
  employeeFindOneAndUpdateMock: vi.fn(),
  saleOrderFindOneMock: vi.fn(),
  saleOrderFindOneAndUpdateMock: vi.fn(),
  crmAccountFindOneAndUpdateMock: vi.fn(),
}));

vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/lib/db", () => ({ default: vi.fn().mockResolvedValue({}) }));

vi.mock("@/models/sales/Customer", () => ({
  default: {
    findOneAndUpdate: customerFindOneAndUpdateMock,
  },
}));

vi.mock("@/models/hr/Employee", () => ({
  default: {
    findOne: employeeFindOneMock,
    findOneAndUpdate: employeeFindOneAndUpdateMock,
  },
}));

vi.mock("@/models/sales/SaleOrder", () => ({
  default: {
    findOne: saleOrderFindOneMock,
    findOneAndUpdate: saleOrderFindOneAndUpdateMock,
  },
}));

vi.mock("@/models/crm/Account", () => ({
  default: {
    findOneAndUpdate: crmAccountFindOneAndUpdateMock,
  },
}));

vi.mock("@/lib/crm/rbac", () => ({
  requireRole: vi.fn().mockReturnValue(null),
}));

vi.mock("@/lib/aiRuntime/runtime/safeEmit", () => ({
  safeEmitEvent: vi.fn().mockResolvedValue({}),
}));

import { PATCH as customerPatch } from "@/app/api/sales/customers/[id]/route";
import { PATCH as employeePatch } from "@/app/api/hr/employees/[id]/route";
import { PATCH as saleOrderPatch } from "@/app/api/sales/sale-orders/[id]/route";
import { PUT as crmAccountPut } from "@/app/api/crm/accounts/[id]/route";

describe("AUP-003: Mass Assignment Prevention Matrix", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("marks finance invoice tenant ownership immutable at the model layer", () => {
    expect(Invoice.schema.path("tenantId").options.immutable).toBe(true);
  });

  describe("Unit: stripProtectedFields helper", () => {
    it("strips all system-protected fields from an arbitrary payload", () => {
      const payload = {
        _id: "507f1f77bcf86cd799439011",
        tenantId: "evil-tenant",
        organizationId: "evil-org",
        orgId: "evil-org",
        createdBy: "attacker-user",
        createdAt: new Date(),
        updatedAt: new Date(),
        isOwner: true,
        isSystemSeeded: true,
        isDemo: true,
        approvalDetails: { approved: true },
        // Permitted fields
        name: "Acme Corp",
        description: "Standard business",
        amount: 5000,
      };

      const sanitized = stripProtectedFields(payload);

      for (const field of PROTECTED_SYSTEM_FIELDS) {
        expect(sanitized).not.toHaveProperty(field);
      }
      expect(sanitized).toEqual({
        name: "Acme Corp",
        description: "Standard business",
        amount: 5000,
      });
    });

    it("supports additional module-specific protected keys", () => {
      const payload = {
        balance: 1000000,
        role: "admin",
        title: "Senior VP",
      };

      const sanitized = stripProtectedFields(payload, ["balance", "role"]);

      expect(sanitized).not.toHaveProperty("balance");
      expect(sanitized).not.toHaveProperty("role");
      expect(sanitized).toEqual({ title: "Senior VP" });
    });

    it("strips protected values in nested objects, arrays, dotted paths and update operators", () => {
      const payload = {
        name: "Allowed",
        profile: { displayName: "User", tenantId: "foreign-tenant", nested: { createdBy: "attacker" } },
        items: [{ label: "safe", _id: "attacker-id", fields: { approvalDetails: { approvedBy: "attacker" } } }],
        "metadata.tenantId": "foreign-tenant",
        $set: { role: "admin", safe: true },
      };

      const sanitized = stripProtectedFields(payload);
      expect(sanitized).toEqual({
        name: "Allowed",
        profile: { displayName: "User", nested: {} },
        items: [{ label: "safe", fields: {} }],
      });
      expect(payload.profile.tenantId).toBe("foreign-tenant");
    });

    it("handles non-object and empty inputs gracefully", () => {
      expect(stripProtectedFields(null as any)).toEqual({});
      expect(stripProtectedFields(undefined as any)).toEqual({});
      expect(stripProtectedFields("test" as any)).toEqual({});
    });
  });

  describe("Integration: Customer Update Route", () => {
    it("strips tenantId and protected fields when updating a customer", async () => {
      authMock.mockResolvedValue({
        user: { id: "user-1", role: "admin", tenantId: "tenant-legit" },
      });

      customerFindOneAndUpdateMock.mockResolvedValue({
        _id: "507f1f77bcf86cd799439011",
        name: "Updated Customer",
        tenantId: "tenant-legit",
      });

      const validId = "507f1f77bcf86cd799439011";
      const req = new Request(`http://localhost:3000/api/sales/customers/${validId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Updated Customer",
          tenantId: "evil-tenant",
          isOwner: true,
          createdBy: "hacker",
        }),
      });

      const res = await customerPatch(req, { params: Promise.resolve({ id: validId }) });
      expect(res.status).toBe(200);

      expect(customerFindOneAndUpdateMock).toHaveBeenCalled();
      const [, updateDoc] = customerFindOneAndUpdateMock.mock.calls[0];
      expect(updateDoc.$set).toHaveProperty("name", "Updated Customer");
      expect(updateDoc.$set).not.toHaveProperty("tenantId");
      expect(updateDoc.$set).not.toHaveProperty("isOwner");
      expect(updateDoc.$set).not.toHaveProperty("createdBy");
    });
  });

  describe("Integration: Employee Update Route", () => {
    it("strips tenantId and protected fields when updating employee profile", async () => {
      authMock.mockResolvedValue({
        user: { id: "user-1", role: "admin", tenantId: "tenant-legit" },
      });

      employeeFindOneMock.mockResolvedValue({
        _id: "507f1f77bcf86cd799439011",
        tenantId: "tenant-legit",
        firstName: "Jane",
        lastName: "Doe",
      });

      const chain = {
        populate: vi.fn().mockReturnThis(),
      };
      employeeFindOneAndUpdateMock.mockReturnValue(chain);
      (chain as any).then = (fn: any) =>
        fn({
          _id: "507f1f77bcf86cd799439011",
          tenantId: "tenant-legit",
          firstName: "Jane",
          lastName: "Smith",
        });

      const validId = "507f1f77bcf86cd799439011";
      const req = new Request(`http://localhost:3000/api/hr/employees/${validId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: "Jane",
          lastName: "Smith",
          tenantId: "hacked-tenant",
          createdBy: "attacker",
          isDemo: false,
        }),
      });

      const res = await employeePatch(req as any, { params: Promise.resolve({ id: validId }) });
      expect(res.status).toBe(200);

      expect(employeeFindOneAndUpdateMock).toHaveBeenCalled();
      const [, updateDoc] = employeeFindOneAndUpdateMock.mock.calls[0];
      expect(updateDoc.$set).toHaveProperty("lastName", "Smith");
      expect(updateDoc.$set).not.toHaveProperty("tenantId");
      expect(updateDoc.$set).not.toHaveProperty("createdBy");
      expect(updateDoc.$set).not.toHaveProperty("isDemo");
    });
  });

  describe("Integration: Sale Order Update Route", () => {
    it("strips tenantId and protected fields when updating a sale order", async () => {
      authMock.mockResolvedValue({
        user: { id: "user-1", role: "admin", tenantId: "tenant-legit" },
      });

      saleOrderFindOneMock.mockResolvedValue({
        _id: "507f1f77bcf86cd799439011",
        tenantId: "tenant-legit",
      });

      saleOrderFindOneAndUpdateMock.mockResolvedValue({
        _id: "507f1f77bcf86cd799439011",
        tenantId: "tenant-legit",
        toObject: () => ({ _id: "507f1f77bcf86cd799439011", tenantId: "tenant-legit" }),
      });

      const validId = "507f1f77bcf86cd799439011";
      const req = new Request(`http://localhost:3000/api/sales/sale-orders/${validId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId: "evil-tenant",
          createdBy: "attacker",
          note: "Order confirmed by phone",
        }),
      });

      const res = await saleOrderPatch(req, { params: Promise.resolve({ id: validId }) });
      expect(res.status).toBe(200);

      expect(saleOrderFindOneAndUpdateMock).toHaveBeenCalled();
      const [, updateDoc] = saleOrderFindOneAndUpdateMock.mock.calls[0];
      expect(updateDoc.$set).toHaveProperty("note", "Order confirmed by phone");
      expect(updateDoc.$set).not.toHaveProperty("tenantId");
      expect(updateDoc.$set).not.toHaveProperty("createdBy");
    });
  });

  describe("Integration: CRM Account Update Route", () => {
    it("strips tenantId and protected fields when updating a CRM account", async () => {
      authMock.mockResolvedValue({
        user: { id: "user-1", role: "admin", tenantId: "tenant-legit" },
      });

      crmAccountFindOneAndUpdateMock.mockResolvedValue({
        _id: "507f1f77bcf86cd799439011",
        tenantId: "tenant-legit",
        company_name: "Enterprise Client",
      });

      const validId = "507f1f77bcf86cd799439011";
      const req = new Request(`http://localhost:3000/api/crm/accounts/${validId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_name: "Enterprise Client",
          tenantId: "evil-tenant",
          createdBy: "attacker",
        }),
      });

      const res = await crmAccountPut(req as any, { params: Promise.resolve({ id: validId }) });
      expect(res.status).toBe(200);

      expect(crmAccountFindOneAndUpdateMock).toHaveBeenCalled();
      const [, updateDoc] = crmAccountFindOneAndUpdateMock.mock.calls[0];
      expect(updateDoc.$set).toHaveProperty("company_name", "Enterprise Client");
      expect(updateDoc.$set).not.toHaveProperty("tenantId");
      expect(updateDoc.$set).not.toHaveProperty("createdBy");
    });
  });
});
