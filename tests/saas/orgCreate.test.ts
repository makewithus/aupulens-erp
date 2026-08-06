import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Hoisted mocks ─────────────────────────────────────────────────────────────
const {
  mockAuth,
  mockConnectDB,
  mockOrgFindOne,
  mockOrgFindOneLean,
  mockOrgCreate,
  mockOrgSave,
  mockUserFindById,
  mockUserFindByIdLean,
  mockUserCreate,
} = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockConnectDB: vi.fn(),
  mockOrgFindOne: vi.fn(),
  mockOrgFindOneLean: vi.fn(),
  mockOrgCreate: vi.fn(),
  mockOrgSave: vi.fn(),
  mockUserFindById: vi.fn(),
  mockUserFindByIdLean: vi.fn(),
  mockUserCreate: vi.fn(),
}));

vi.mock("@/auth", () => ({ auth: mockAuth }));
vi.mock("@/lib/db", () => ({ default: mockConnectDB }));

vi.mock("@/models/Organization", () => {
  function Organization() {}
  // findOne returns chainable { lean } — mirrors Mongoose's query object
  Organization.findOne = (...args: any[]) => {
    mockOrgFindOne(...args);
    return { lean: mockOrgFindOneLean };
  };
  Organization.create = mockOrgCreate;
  return { default: Organization };
});

vi.mock("@/models/User", () => {
  function User() {}
  // findById returns chainable { lean }
  User.findById = (...args: any[]) => {
    mockUserFindById(...args);
    return { lean: mockUserFindByIdLean };
  };
  User.create = mockUserCreate;
  return { default: User };
});

vi.mock("@/lib/constants/statuses", () => ({
  ENTITY_STATUS: { ACTIVE: "active" },
  ENTITY_STATUS_VALUES: ["active", "inactive"],
  SUBSCRIPTION_STATUS: { TRIAL: "trial" },
  SUBSCRIPTION_STATUS_VALUES: ["trial", "active", "suspended", "cancelled"],
  ORGANIZATION_TIER: { STARTER: "starter", PROFESSIONAL: "professional", ENTERPRISE: "enterprise" },
  ORGANIZATION_TIER_VALUES: ["starter", "professional", "enterprise"],
  SUBSCRIPTION_EVENT_TYPE: { CREATED: "created", UPGRADED: "upgraded", DOWNGRADED: "downgraded" },
  SUBSCRIPTION_EVENT_TYPE_VALUES: ["created", "upgraded", "downgraded", "renewed", "payment_succeeded", "payment_failed", "canceled"],
}));

// Phase 3: org/create now logs a real billing event on success — irrelevant
// to what this suite is testing (org/user creation + tenant isolation), so
// it's mocked to a no-op like every other cross-cutting dependency here.
vi.mock("@/lib/billing/appendSubscriptionEvent", () => ({
  appendSubscriptionEvent: vi.fn().mockResolvedValue(undefined),
}));

// ── Helper ────────────────────────────────────────────────────────────────────
function makeRequest(body: object) {
  return new NextRequest("http://test.local/api/auth/org/create", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

function sessionFor(overrides: object = {}) {
  return {
    user: { id: "user-abc", tenantId: "existing-org", role: "admin", email: "alice@example.com", ...overrides },
  };
}

const fakeCallerUser = {
  _id: "user-abc",
  name: "Alice",
  email: "alice@example.com",
  phone: "9999999999",
  password: "$2b$12$hashedpassword",
};

const fakeOrg = {
  _id: "org-001",
  name: "New Corp",
  subdomain: "newcorp",
  tier: "starter",
  ownerUserId: "temp-id",
  save: mockOrgSave,
};

const fakeOwnerUser = { _id: "user-new-001" };

// ── Tests ─────────────────────────────────────────────────────────────────────
let POST: (req: NextRequest) => Promise<Response>;

beforeEach(async () => {
  vi.resetAllMocks();
  mockConnectDB.mockResolvedValue(undefined);
  mockOrgFindOneLean.mockResolvedValue(null);
  mockUserFindByIdLean.mockResolvedValue(fakeCallerUser);
  mockOrgCreate.mockResolvedValue({ ...fakeOrg });
  mockUserCreate.mockResolvedValue(fakeOwnerUser);
  mockOrgSave.mockResolvedValue(fakeOrg);
  const mod = await import("@/app/api/auth/org/create/route");
  POST = mod.POST;
});

describe("POST /api/auth/org/create — auth guards", () => {
  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await POST(makeRequest({ name: "Test", subdomain: "test" }));
    expect(res.status).toBe(401);
  });

  it("returns 401 when session has no tenantId", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", role: "admin" } });
    const res = await POST(makeRequest({ name: "Test", subdomain: "test" }));
    expect(res.status).toBe(401);
  });
});

describe("POST /api/auth/org/create — validation", () => {
  beforeEach(() => mockAuth.mockResolvedValue(sessionFor()));

  it("returns 400 when name is missing", async () => {
    const res = await POST(makeRequest({ subdomain: "newcorp" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/required/i);
  });

  it("returns 400 when subdomain is missing", async () => {
    const res = await POST(makeRequest({ name: "New Corp" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid subdomain (uppercase + special chars)", async () => {
    const res = await POST(makeRequest({ name: "New Corp", subdomain: "New_Corp!" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/dns/i);
  });

  it("returns 400 for single-character subdomain (too short for regex)", async () => {
    // /^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])$/ requires at least 3 chars
    const res = await POST(makeRequest({ name: "X", subdomain: "x" }));
    expect(res.status).toBe(400);
  });
});

describe("POST /api/auth/org/create — duplicate subdomain", () => {
  beforeEach(() => mockAuth.mockResolvedValue(sessionFor()));

  it("returns 409 when subdomain is already taken", async () => {
    mockOrgFindOneLean.mockResolvedValue({ subdomain: "taken" });
    const res = await POST(makeRequest({ name: "Corp", subdomain: "taken" }));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/already taken/i);
  });
});

describe("POST /api/auth/org/create — successful creation", () => {
  beforeEach(() => mockAuth.mockResolvedValue(sessionFor()));

  it("returns 201 with correct response shape", async () => {
    const res = await POST(makeRequest({ name: "New Corp", subdomain: "newcorp" }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.message).toBe("Organization created successfully");
    expect(body.organization.subdomain).toBe("newcorp");
    expect(body.organization.tier).toBe("starter");
    expect(body.organization.url).toContain("newcorp.aupulens.online");
  });

  it("normalizes subdomain to lowercase", async () => {
    await POST(makeRequest({ name: "New Corp", subdomain: "  NewCorp  " }));
    expect(mockOrgFindOne).toHaveBeenCalledWith({ subdomain: "newcorp" });
    expect(mockOrgCreate).toHaveBeenCalledWith(
      expect.objectContaining({ subdomain: "newcorp" })
    );
  });

  it("org is created without explicit tier (schema default handles it)", async () => {
    await POST(makeRequest({ name: "New Corp", subdomain: "newcorp" }));
    const createArg = mockOrgCreate.mock.calls[0][0];
    expect(createArg.tier).toBeUndefined();
  });

  it("looks up caller User by session.user.id", async () => {
    await POST(makeRequest({ name: "New Corp", subdomain: "newcorp" }));
    expect(mockUserFindById).toHaveBeenCalledWith("user-abc");
  });

  it("creates new User in new org with caller email and role=admin", async () => {
    await POST(makeRequest({ name: "New Corp", subdomain: "newcorp" }));
    expect(mockUserCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "alice@example.com",
        role: "admin",
        tenantId: "newcorp",
        password: fakeCallerUser.password,
      })
    );
  });

  it("updates org ownerUserId with new User _id after creation", async () => {
    await POST(makeRequest({ name: "New Corp", subdomain: "newcorp" }));
    expect(mockOrgSave).toHaveBeenCalled();
  });

  it("returns 404 when caller user is not found in DB", async () => {
    mockUserFindByIdLean.mockResolvedValue(null);
    const res = await POST(makeRequest({ name: "New Corp", subdomain: "newcorp" }));
    expect(res.status).toBe(404);
  });
});

describe("POST /api/auth/org/create — tenant isolation", () => {
  beforeEach(() => mockAuth.mockResolvedValue(sessionFor()));

  it("new User is scoped to the new subdomain as tenantId", async () => {
    await POST(makeRequest({ name: "Acme Corp", subdomain: "acme" }));
    const userCreateArg = mockUserCreate.mock.calls[0][0];
    expect(userCreateArg.tenantId).toBe("acme");
  });

  it("subdomain uniqueness check queries by subdomain only (org has no tenantId)", async () => {
    await POST(makeRequest({ name: "Acme Corp", subdomain: "acme" }));
    expect(mockOrgFindOne).toHaveBeenCalledWith({ subdomain: "acme" });
    const callArg = mockOrgFindOne.mock.calls[0][0];
    expect(callArg.tenantId).toBeUndefined();
  });
});
