vi.mock("@/lib/auth/registrationTransaction", () => ({ registrationTransaction: (work: any) => work(undefined) }));
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const { findOneOrgMock, createOrgMock, countUserMock, findOneUserMock, createUserMock, appendSubMock } = vi.hoisted(() => ({
  findOneOrgMock: vi.fn(),
  createOrgMock: vi.fn(),
  countUserMock: vi.fn(),
  findOneUserMock: vi.fn(),
  createUserMock: vi.fn(),
  appendSubMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ default: vi.fn() }));
vi.mock("@/models/admin/Organization", () => ({
  default: {
    findOne: findOneOrgMock,
    create: createOrgMock,
  },
}));
vi.mock("@/models/auth/User", () => ({
  default: {
    findOne: findOneUserMock,
    countDocuments: countUserMock,
    create: createUserMock,
  },
}));
vi.mock("@/lib/billing/appendSubscriptionEvent", () => ({
  appendSubscriptionEvent: appendSubMock,
}));
vi.mock("@/lib/accounting/coa-seeder", () => ({
  seedChartOfAccounts: vi.fn().mockResolvedValue({}),
}));
vi.mock("@/lib/accounting/coa-feature-seeder", () => ({
  seedNewChartOfAccounts: vi.fn().mockResolvedValue({}),
}));

import { POST } from "@/app/api/auth/register/route";
import { NextRequest } from "next/server";

describe("AUP-002: Registration Security & Tenant Isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("ALLOW_PUBLIC_REGISTRATION", "true");
    findOneUserMock.mockResolvedValue(null);
  });
  afterEach(() => vi.unstubAllEnvs());

  it("rejects public registration targeting an existing organization with 409 Conflict", async () => {
    // Existing organization in DB
    const existingOrg = {
      _id: "org-alpha-id",
      subdomain: "tenant-alpha",
      ownerUserId: "original-owner-id",
      save: vi.fn(),
    };
    findOneOrgMock.mockResolvedValue(existingOrg);

    const req = new NextRequest("http://localhost:3000/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Attacker User",
        email: "attacker@example.com",
        phone: "+91 9999999999",
        password: "password123",
        subdomain: "tenant-alpha",
      }),
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.code).toBe("ORGANIZATION_EXISTS");
    expect(json.error).toContain("An organization with this subdomain already exists");
    expect(createUserMock).not.toHaveBeenCalled();
    expect(existingOrg.ownerUserId).toBe("original-owner-id"); // Ownership untouched!
  });

  it("creates a new organization and assigns ownership when subdomain does not exist", async () => {
    findOneOrgMock.mockResolvedValue(null); // No existing org
    countUserMock.mockResolvedValue(0);

    const savedOrg = {
      _id: "new-org-id",
      subdomain: "new-company",
      ownerUserId: "temp-owner",
      tier: "starter",
      save: vi.fn().mockResolvedValue(true),
    };
    createOrgMock.mockResolvedValue(savedOrg);

    const createdUser = {
      _id: "new-user-id",
      name: "Founder User",
      email: "founder@newcompany.com",
      phone: "+91 9999999999",
      role: "admin",
      status: "active",
      tenantId: "new-company",
    };
    createUserMock.mockResolvedValue(createdUser);

    const req = new NextRequest("http://localhost:3000/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Founder User",
        email: "founder@newcompany.com",
        phone: "+91 9999999999",
        password: "password123",
        subdomain: "new-company",
        companyName: "New Company Inc",
      }),
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(createOrgMock).toHaveBeenCalled();
    expect(savedOrg.ownerUserId).toBe("new-user-id"); // Assigned only for newly created org
    expect(savedOrg.save).toHaveBeenCalled();
    expect(json.user.email).toBe("founder@newcompany.com");
  });
});
