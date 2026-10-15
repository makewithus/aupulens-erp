import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  department: vi.fn(), create: vi.fn(), update: vi.fn(), findUser: vi.fn(), findEmployee: vi.fn(),
}));
vi.mock("@/auth", () => ({ auth: vi.fn(async () => ({ user: { id: "admin-id", role: "admin", tenantId: "starter-org" } })) }));
vi.mock("@/lib/db", () => ({ default: vi.fn() }));
vi.mock("@/lib/platform/entitlements/resolve", () => ({ resolveEntitlements: vi.fn(async () => ({ modules: ["admin", "finance"] })) }));
vi.mock("@/models/hr/Department", () => ({ default: { findOne: mocks.department } }));
vi.mock("@/models/auth/User", () => ({ default: { create: mocks.create, findOneAndUpdate: mocks.update, findOne: mocks.findUser } }));
vi.mock("@/models/hr/Employee", () => ({ default: { findOne: mocks.findEmployee } }));

import { POST } from "@/app/api/users/route";
import { PATCH } from "@/app/api/users/[id]/route";

describe("user department assignment guards", () => {
  beforeEach(() => vi.clearAllMocks());

  for (const method of ["POST", "PATCH"] as const) {
    for (const [label, department] of [
      ["unapproved module", { name: "Manufacturing", code: "MFG", isActive: true }],
      ["inactive department", { name: "Finance", code: "FIN", isActive: false }],
      ["missing or foreign department", null],
    ] as const) {
      it(`${method} rejects ${label} before writing the user`, async () => {
        mocks.department.mockReturnValue({ lean: async () => department });
        const req = new NextRequest("http://localhost/api/users", {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "New User", email: "user@example.test", phone: "1234567890", password: "test-password", role: "admin", department: "Manufacturing" }),
        });
        const res = method === "POST" ? await POST(req) : await PATCH(req, { params: Promise.resolve({ id: "user-id" }) });
        expect(res.status).toBe(403);
        expect((await res.json()).error).toContain("approved modules");
        expect(mocks.department).toHaveBeenCalledWith({ tenantId: "starter-org", name: "Manufacturing" });
        expect(mocks.create).not.toHaveBeenCalled();
        expect(mocks.update).not.toHaveBeenCalled();
      });
    }
  }
});


describe("granular organization user roles", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findUser.mockResolvedValue(null);
    mocks.findEmployee.mockResolvedValue(null);
    mocks.create.mockImplementation(async (data) => ({ ...data, _id: "new-user" }));
    mocks.update.mockReturnValue({ select: async () => ({ _id: "user-id", role: "finance", userRole: "accountant" }) });
  });

  for (const method of ["POST", "PATCH"] as const) {
    it(`${method} stores the selected title with its compatible module access role`, async () => {
      const req = new NextRequest("http://localhost/api/users", {
        method, headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Accountant", email: "accountant@example.test", phone: "123", password: "test-password", role: "accountant" }),
      });
      const res = method === "POST" ? await POST(req) : await PATCH(req, { params: Promise.resolve({ id: "user-id" }) });
      expect(res.status).toBe(method === "POST" ? 201 : 200);
      if (method === "POST") {
        expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ role: "finance", userRole: "accountant" }));
        expect((await res.json()).user.userRole).toBe("accountant");
      } else {
        expect(mocks.update).toHaveBeenCalledWith({ _id: "user-id", tenantId: "starter-org" }, { $set: expect.objectContaining({ role: "finance", userRole: "accountant" }) }, expect.anything());
      }
    });

    it(`${method} blocks a role from a NOT GRANTED module`, async () => {
      const req = new NextRequest("http://localhost/api/users", {
        method, headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "CRM", email: "crm@example.test", phone: "123", password: "test-password", role: "crm-manager" }),
      });
      const res = method === "POST" ? await POST(req) : await PATCH(req, { params: Promise.resolve({ id: "user-id" }) });
      expect(res.status).toBe(403);
      expect(mocks.create).not.toHaveBeenCalled();
      expect(mocks.update).not.toHaveBeenCalled();
    });
  }
});
