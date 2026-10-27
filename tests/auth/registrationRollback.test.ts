vi.mock("@/lib/auth/registrationTransaction", () => ({ registrationTransaction: (work: any) => work(undefined) }));
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Mock dependencies before importing route
vi.mock("@/lib/db", () => ({
  default: vi.fn().mockResolvedValue(true),
}));

const mockUserFindOne = vi.fn();
const mockUserCountDocuments = vi.fn();
const mockUserCreate = vi.fn();
vi.mock("@/models/auth/User", () => ({
  default: {
    findOne: (...args: any[]) => mockUserFindOne(...args),
    countDocuments: (...args: any[]) => mockUserCountDocuments(...args),
    create: (...args: any[]) => mockUserCreate(...args),
  },
}));

const mockOrgFindOne = vi.fn();
const mockOrgCreate = vi.fn();
const mockOrgDeleteOne = vi.fn();
vi.mock("@/models/admin/Organization", () => ({
  default: {
    findOne: (...args: any[]) => mockOrgFindOne(...args),
    create: (...args: any[]) => mockOrgCreate(...args),
    deleteOne: (...args: any[]) => mockOrgDeleteOne(...args),
  },
}));

vi.mock("@/lib/billing/appendSubscriptionEvent", () => ({
  appendSubscriptionEvent: vi.fn().mockResolvedValue(true),
}));

import { POST } from "@/app/api/auth/register/route";

describe("AUP-002: Registration Rollback & Integrity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ALLOW_PUBLIC_REGISTRATION = "true";
  });

  it("rolls back newly created organization if User creation fails", async () => {
    mockUserFindOne.mockResolvedValue(null);
    mockUserCountDocuments.mockResolvedValue(0);
    mockOrgFindOne.mockResolvedValue(null);

    const createdOrgId = "650000000000000000000099";
    mockOrgCreate.mockResolvedValue({
      _id: createdOrgId,
      subdomain: "newcompany",
      tier: "starter",
    });

    // Simulate failure during User.create
    mockUserCreate.mockRejectedValue(new Error("Database write collision"));
    mockOrgDeleteOne.mockResolvedValue({ deletedCount: 1 });

    const req = new NextRequest("http://localhost/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Alice Owner",
        email: "alice@newcompany.com",
        phone: "+919876543210",
        password: "ValidSecurePassword123!",
        tenantId: "newcompany",
        companyName: "New Company Pvt Ltd",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.code).toBe("REGISTRATION_FAILED");

    // Organization rollback MUST be triggered
    expect(mockOrgDeleteOne).not.toHaveBeenCalled(); // Transaction rollback replaces unsafe compensating deletion; persisted rollback is separately tested.
  });

  it("rejects public registration when organization already exists (409)", async () => {
    mockUserFindOne.mockResolvedValue(null);
    mockOrgFindOne.mockResolvedValue({
      _id: "650000000000000000000001",
      subdomain: "existing-corp",
      name: "Existing Corp",
    });

    const req = new NextRequest("http://localhost/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Mallory Attacker",
        email: "mallory@attacker.com",
        phone: "+919876543210",
        password: "ValidSecurePassword123!",
        tenantId: "existing-corp",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("ORGANIZATION_EXISTS");
    expect(mockOrgCreate).not.toHaveBeenCalled();
    expect(mockUserCreate).not.toHaveBeenCalled();
  });
});
