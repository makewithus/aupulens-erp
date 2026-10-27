import { describe, it, expect, beforeEach, vi } from "vitest";

const { authMock, findOneMock, findOneAndUpdateMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  findOneMock: vi.fn(),
  findOneAndUpdateMock: vi.fn(),
}));

vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/lib/db", () => ({ default: vi.fn() }));
vi.mock("@/models/auth/User", () => ({
  default: {
    findOne: findOneMock,
    findOneAndUpdate: findOneAndUpdateMock,
  },
}));

import { GET, PATCH } from "@/app/api/profile/route";

describe("AUP-001: Profile Security & Tenant Isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("GET: scopes user lookup to session user id and tenantId", async () => {
    authMock.mockResolvedValue({
      user: { id: "user-alpha", email: "shared@example.com", tenantId: "tenant-alpha" },
    });

    const chain = {
      select: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue({
        _id: "user-alpha",
        name: "Alpha User",
        email: "shared@example.com",
        tenantId: "tenant-alpha",
      }),
    };
    findOneMock.mockReturnValue(chain);

    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(findOneMock).toHaveBeenCalledWith({ _id: "user-alpha", tenantId: "tenant-alpha" });
    expect(json.user.name).toBe("Alpha User");
  });

  it("PATCH: rejects updates when only protected fields are supplied", async () => {
    authMock.mockResolvedValue({
      user: { id: "user-alpha", email: "shared@example.com", tenantId: "tenant-alpha" },
    });

    const req = new Request("http://localhost:3000/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tenantId: "tenant-beta",
        role: "admin",
        permissions: ["all"],
        status: "active",
        tempToken: "hacked",
        passwordResetTokenHash: "hacked_hash",
      }),
    });

    const res = await PATCH(req);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe("No editable profile fields provided");
    expect(findOneAndUpdateMock).not.toHaveBeenCalled();
  });

  it("PATCH: whitelists allowed fields and filters out malicious fields", async () => {
    authMock.mockResolvedValue({
      user: { id: "user-alpha", email: "shared@example.com", tenantId: "tenant-alpha" },
    });

    const chain = {
      select: vi.fn().mockResolvedValue({
        _id: "user-alpha",
        name: "Updated Name",
        phone: "+91 9999999999",
        tenantId: "tenant-alpha",
      }),
    };
    findOneAndUpdateMock.mockReturnValue(chain);

    const req = new Request("http://localhost:3000/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Updated Name",
        phone: "+91 9999999999",
        tenantId: "tenant-attacker", // Malicious field
        role: "admin",              // Malicious field
        status: "suspended",        // Malicious field
      }),
    });

    const res = await PATCH(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(findOneAndUpdateMock).toHaveBeenCalledWith(
      { _id: "user-alpha", tenantId: "tenant-alpha" },
      {
        $set: {
          name: "Updated Name",
          phone: "+91 9999999999",
        },
      },
      expect.objectContaining({ new: true, runValidators: true })
    );
    expect(json.user.name).toBe("Updated Name");
  });

  it("PATCH: never modifies same-email user in another tenant", async () => {
    // Calling from tenant-alpha
    authMock.mockResolvedValue({
      user: { id: "user-alpha", email: "shared@example.com", tenantId: "tenant-alpha" },
    });

    const chain = {
      select: vi.fn().mockResolvedValue({
        _id: "user-alpha",
        name: "Alpha Only",
        tenantId: "tenant-alpha",
      }),
    };
    findOneAndUpdateMock.mockReturnValue(chain);

    const req = new Request("http://localhost:3000/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Alpha Only" }),
    });

    await PATCH(req);

    const calledFilter = findOneAndUpdateMock.mock.calls[0][0];
    expect(calledFilter.tenantId).toBe("tenant-alpha");
    expect(calledFilter.tenantId).not.toBe("tenant-beta");
  });
});
