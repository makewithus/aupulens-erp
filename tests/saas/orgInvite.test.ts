import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Hoisted mocks ─────────────────────────────────────────────────────────────
const {
  mockAuth,
  mockConnectDB,
  mockRequireOrgAdmin,
  // Organization
  mockOrgFindOne,
  mockOrgFindOneLean,
  // OrgInvite
  mockInviteFindOne,
  mockInviteFindOneLean,
  mockInviteFindOneAndUpdate,
  mockInviteCountDocuments,
  mockInviteUpdateOne,
  // User
  mockUserFindOne,
  mockUserFindOneLean,
  mockUserFindById,
  mockUserFindByIdLean,
  mockUserCountDocuments,
  mockUserCreate,
} = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockConnectDB: vi.fn(),
  mockRequireOrgAdmin: vi.fn(),
  mockOrgFindOne: vi.fn(),
  mockOrgFindOneLean: vi.fn(),
  mockInviteFindOne: vi.fn(),
  mockInviteFindOneLean: vi.fn(),
  mockInviteFindOneAndUpdate: vi.fn(),
  mockInviteCountDocuments: vi.fn(),
  mockInviteUpdateOne: vi.fn(),
  mockUserFindOne: vi.fn(),
  mockUserFindOneLean: vi.fn(),
  mockUserFindById: vi.fn(),
  mockUserFindByIdLean: vi.fn(),
  mockUserCountDocuments: vi.fn(),
  mockUserCreate: vi.fn(),
}));

vi.mock("@/auth", () => ({ auth: mockAuth }));
vi.mock("@/lib/db", () => ({ default: mockConnectDB }));
vi.mock("@/lib/org/rbac", () => ({ requireOrgAdmin: mockRequireOrgAdmin }));

vi.mock("@/models/Organization", () => {
  function Organization() {}
  Organization.findOne = (...args: any[]) => {
    mockOrgFindOne(...args);
    return { lean: mockOrgFindOneLean };
  };
  return { default: Organization };
});

vi.mock("@/models/OrgInvite", () => {
  function OrgInvite() {}
  OrgInvite.findOne = (...args: any[]) => {
    mockInviteFindOne(...args);
    return { lean: mockInviteFindOneLean };
  };
  OrgInvite.findOneAndUpdate = mockInviteFindOneAndUpdate;
  OrgInvite.countDocuments = mockInviteCountDocuments;
  OrgInvite.updateOne = mockInviteUpdateOne;
  return { default: OrgInvite };
});

vi.mock("@/models/User", () => {
  function User() {}
  User.findOne = (...args: any[]) => {
    mockUserFindOne(...args);
    return { lean: mockUserFindOneLean };
  };
  User.findById = (...args: any[]) => {
    mockUserFindById(...args);
    return { lean: mockUserFindByIdLean };
  };
  User.countDocuments = mockUserCountDocuments;
  User.create = mockUserCreate;
  return { default: User };
});

vi.mock("@/lib/constants/statuses", () => ({
  ENTITY_STATUS: { ACTIVE: "active" },
  ENTITY_STATUS_VALUES: ["active", "inactive"],
  INVITE_STATUS: {
    PENDING:  "pending",
    ACCEPTED: "accepted",
    EXPIRED:  "expired",
    REVOKED:  "revoked",
  },
  INVITE_STATUS_VALUES: ["pending", "accepted", "expired", "revoked"],
  ORGANIZATION_TIER: { STARTER: "starter", PROFESSIONAL: "professional", ENTERPRISE: "enterprise" },
  ORGANIZATION_TIER_VALUES: ["starter", "professional", "enterprise"],
  SUBSCRIPTION_STATUS: { TRIAL: "trial" },
  SUBSCRIPTION_STATUS_VALUES: ["trial", "active", "suspended", "cancelled"],
}));

// ── Fixtures ──────────────────────────────────────────────────────────────────
function adminSession(overrides: object = {}) {
  return {
    user: { id: "admin-id", tenantId: "acme", role: "admin", email: "admin@acme.com", ...overrides },
  };
}

function financeSession() {
  return { user: { id: "finance-id", tenantId: "acme", role: "finance", email: "fin@acme.com" } };
}

function inviteAcceptorSession(overrides: object = {}) {
  return {
    user: { id: "acceptor-id", tenantId: "otherorgnow", role: "admin", email: "bob@example.com", ...overrides },
  };
}

const fakeOrg = { _id: "org-1", subdomain: "acme", tier: "starter", maxUsers: 5 };

const fakePendingInvite = {
  _id: "inv-1",
  tenantId: "acme",
  email: "bob@example.com",
  role: "finance",
  token: "valid-token-abc",
  status: "pending",
  expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  invitedBy: "admin-id",
};

const fakeAcceptorUser = {
  _id: "acceptor-id",
  name: "Bob",
  email: "bob@example.com",
  phone: "9876543210",
  password: "$2b$12$hashed",
};

const fakeCreatedInvite = { ...fakePendingInvite, _id: "inv-new" };

function makeInviteRequest(body: object) {
  return new NextRequest("http://acme.aupulens.online/api/auth/org/invite", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

function makeAcceptRequest(body: object) {
  return new NextRequest("http://otherorgnow.aupulens.online/api/auth/org/accept", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

// ── Route loaders ─────────────────────────────────────────────────────────────
let INVITE_POST: (req: NextRequest) => Promise<Response>;
let ACCEPT_POST: (req: NextRequest) => Promise<Response>;

beforeEach(async () => {
  vi.resetAllMocks();
  mockConnectDB.mockResolvedValue(undefined);
  mockRequireOrgAdmin.mockReturnValue(undefined); // default: allow
  mockOrgFindOneLean.mockResolvedValue(fakeOrg);
  mockUserCountDocuments.mockResolvedValue(2);        // 2 existing members
  mockInviteCountDocuments.mockResolvedValue(1);      // 1 other pending invite
  mockInviteFindOneAndUpdate.mockResolvedValue(fakeCreatedInvite);
  mockInviteUpdateOne.mockResolvedValue({ modifiedCount: 1 });
  mockInviteFindOneLean.mockResolvedValue(fakePendingInvite);
  mockUserFindOneLean.mockResolvedValue(null);        // not already a member
  mockUserFindByIdLean.mockResolvedValue(fakeAcceptorUser);
  mockUserCreate.mockResolvedValue({ _id: "new-user-id" });

  const inviteMod = await import("@/app/api/auth/org/invite/route");
  INVITE_POST = inviteMod.POST;
  const acceptMod = await import("@/app/api/auth/org/accept/route");
  ACCEPT_POST = acceptMod.POST;
});

// ════════════════════════════════════════════════════════════════════════════════
// POST /api/auth/org/invite
// ════════════════════════════════════════════════════════════════════════════════

describe("POST /api/auth/org/invite — auth guards", () => {
  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await INVITE_POST(makeInviteRequest({ email: "x@y.com", role: "finance" }));
    expect(res.status).toBe(401);
  });

  it("returns 401 when session has no tenantId", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", role: "admin" } });
    const res = await INVITE_POST(makeInviteRequest({ email: "x@y.com", role: "finance" }));
    expect(res.status).toBe(401);
  });

  it("returns 403 when role is not admin (finance user)", async () => {
    mockAuth.mockResolvedValue(financeSession());
    mockRequireOrgAdmin.mockImplementation(() => {
      throw new Error("Forbidden");
    });
    const res = await INVITE_POST(makeInviteRequest({ email: "x@y.com", role: "finance" }));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.message).toMatch(/admin/i);
  });
});

describe("POST /api/auth/org/invite — input validation", () => {
  beforeEach(() => mockAuth.mockResolvedValue(adminSession()));

  it("returns 400 when email is missing", async () => {
    const res = await INVITE_POST(makeInviteRequest({ role: "finance" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when role is missing", async () => {
    const res = await INVITE_POST(makeInviteRequest({ email: "bob@example.com" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for an invalid email format", async () => {
    const res = await INVITE_POST(makeInviteRequest({ email: "not-an-email", role: "finance" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toMatch(/invalid email/i);
  });
});

describe("POST /api/auth/org/invite — maxUsers cap", () => {
  beforeEach(() => mockAuth.mockResolvedValue(adminSession()));

  it("returns 403 with upgrade message when org is at capacity", async () => {
    // 4 members + 1 pending (excluding this email) = 5 = maxUsers = 5 → reject
    mockUserCountDocuments.mockResolvedValue(4);
    mockInviteCountDocuments.mockResolvedValue(1);
    const res = await INVITE_POST(makeInviteRequest({ email: "new@example.com", role: "finance" }));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.upgradeRequired).toBe(true);
    expect(body.message).toMatch(/upgrade/i);
  });

  it("allows re-invite when pending invite for same email already exists (no new seat)", async () => {
    // 3 members + 2 pending (excl. this email's existing invite) = 5 → at cap
    // But the email being re-invited was already in the pending count, so excluding it: 4 < 5 → allow
    mockUserCountDocuments.mockResolvedValue(3);
    mockInviteCountDocuments.mockResolvedValue(1); // excludes the re-invited email
    const res = await INVITE_POST(makeInviteRequest({ email: "bob@example.com", role: "finance" }));
    expect(res.status).toBe(201);
  });

  it("pending count query excludes the email being invited", async () => {
    mockAuth.mockResolvedValue(adminSession());
    await INVITE_POST(makeInviteRequest({ email: "BOB@example.com", role: "finance" }));
    // Verify the countDocuments call excluded the normalized email
    expect(mockInviteCountDocuments).toHaveBeenCalledWith(
      expect.objectContaining({ email: { $ne: "bob@example.com" } })
    );
  });
});

describe("POST /api/auth/org/invite — invite creation", () => {
  beforeEach(() => mockAuth.mockResolvedValue(adminSession()));

  it("returns 201 with token, email, role, expiresAt, inviteLink", async () => {
    const res = await INVITE_POST(makeInviteRequest({ email: "bob@example.com", role: "finance" }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.token).toBeTruthy();
    expect(body.data.email).toBe("bob@example.com");
    expect(body.data.role).toBe("finance");
    expect(body.data.expiresAt).toBeTruthy();
    expect(body.data.inviteLink).toContain("acme.aupulens.online");
    expect(body.data.emailDeliveryDeferred).toBe(true);
  });

  it("uses findOneAndUpdate (upsert) — refreshes existing invite for same email", async () => {
    await INVITE_POST(makeInviteRequest({ email: "bob@example.com", role: "hr" }));
    expect(mockInviteFindOneAndUpdate).toHaveBeenCalledWith(
      { tenantId: "acme", email: "bob@example.com" },
      expect.objectContaining({
        $set: expect.objectContaining({ status: "pending", role: "hr" }),
        $setOnInsert: { tenantId: "acme", email: "bob@example.com" },
      }),
      { upsert: true, new: true }
    );
  });

  it("normalizes email to lowercase", async () => {
    await INVITE_POST(makeInviteRequest({ email: "  BOB@EXAMPLE.COM  ", role: "finance" }));
    const callArg = mockInviteFindOneAndUpdate.mock.calls[0][0];
    expect(callArg.email).toBe("bob@example.com");
  });

  it("sets invitedBy to the admin's user id", async () => {
    await INVITE_POST(makeInviteRequest({ email: "bob@example.com", role: "finance" }));
    const setArg = mockInviteFindOneAndUpdate.mock.calls[0][1].$set;
    expect(setArg.invitedBy).toBe("admin-id");
  });

  it("scopes all DB reads to tenantId (tenant isolation)", async () => {
    await INVITE_POST(makeInviteRequest({ email: "bob@example.com", role: "finance" }));
    expect(mockOrgFindOne).toHaveBeenCalledWith({ subdomain: "acme" });
    expect(mockUserCountDocuments).toHaveBeenCalledWith({ tenantId: "acme" });
    expect(mockInviteCountDocuments).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "acme" })
    );
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// POST /api/auth/org/accept
// ════════════════════════════════════════════════════════════════════════════════

describe("POST /api/auth/org/accept — auth guards", () => {
  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await ACCEPT_POST(makeAcceptRequest({ token: "valid-token-abc" }));
    expect(res.status).toBe(401);
  });

  it("returns 401 when session has no tenantId", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", role: "admin", email: "x@y.com" } });
    const res = await ACCEPT_POST(makeAcceptRequest({ token: "valid-token-abc" }));
    expect(res.status).toBe(401);
  });

  it("returns 400 when token is missing", async () => {
    mockAuth.mockResolvedValue(inviteAcceptorSession());
    const res = await ACCEPT_POST(makeAcceptRequest({}));
    expect(res.status).toBe(400);
  });
});

describe("POST /api/auth/org/accept — token validation", () => {
  beforeEach(() => mockAuth.mockResolvedValue(inviteAcceptorSession()));

  it("returns 404 for an unknown token", async () => {
    mockInviteFindOneLean.mockResolvedValue(null);
    const res = await ACCEPT_POST(makeAcceptRequest({ token: "fake-token" }));
    expect(res.status).toBe(404);
  });

  it("returns 410 for an expired token (past expiresAt)", async () => {
    mockInviteFindOneLean.mockResolvedValue({
      ...fakePendingInvite,
      expiresAt: new Date(Date.now() - 1000), // 1 second in the past
    });
    const res = await ACCEPT_POST(makeAcceptRequest({ token: "valid-token-abc" }));
    expect(res.status).toBe(410);
    const body = await res.json();
    expect(body.message).toMatch(/expired/i);
  });

  it("returns 410 for a token with status=expired", async () => {
    mockInviteFindOneLean.mockResolvedValue({ ...fakePendingInvite, status: "expired" });
    const res = await ACCEPT_POST(makeAcceptRequest({ token: "valid-token-abc" }));
    expect(res.status).toBe(410);
  });

  it("returns 409 for an already-accepted token", async () => {
    mockInviteFindOneLean.mockResolvedValue({ ...fakePendingInvite, status: "accepted" });
    const res = await ACCEPT_POST(makeAcceptRequest({ token: "valid-token-abc" }));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.message).toMatch(/already been accepted/i);
  });

  it("returns 410 for a revoked token", async () => {
    mockInviteFindOneLean.mockResolvedValue({ ...fakePendingInvite, status: "revoked" });
    const res = await ACCEPT_POST(makeAcceptRequest({ token: "valid-token-abc" }));
    expect(res.status).toBe(410);
    const body = await res.json();
    expect(body.message).toMatch(/revoked/i);
  });
});

describe("POST /api/auth/org/accept — email mismatch", () => {
  it("returns 403 when logged-in email does not match invite email", async () => {
    // Invite was sent to bob@example.com but alice is logged in
    mockAuth.mockResolvedValue(inviteAcceptorSession({ email: "alice@example.com" }));
    const res = await ACCEPT_POST(makeAcceptRequest({ token: "valid-token-abc" }));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.message).toContain("bob@example.com");
  });
});

describe("POST /api/auth/org/accept — maxUsers cap at accept time", () => {
  beforeEach(() => mockAuth.mockResolvedValue(inviteAcceptorSession()));

  it("returns 403 when org is full at accept time", async () => {
    // 5 members already = maxUsers = 5 → no room even though invite exists
    mockUserCountDocuments.mockResolvedValue(5);
    const res = await ACCEPT_POST(makeAcceptRequest({ token: "valid-token-abc" }));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.upgradeRequired).toBe(true);
    expect(body.message).toMatch(/limit/i);
  });
});

describe("POST /api/auth/org/accept — successful acceptance", () => {
  beforeEach(() => mockAuth.mockResolvedValue(inviteAcceptorSession()));

  it("returns 201 and creates User in target tenant", async () => {
    const res = await ACCEPT_POST(makeAcceptRequest({ token: "valid-token-abc" }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.tenantId).toBe("acme");
    expect(body.data.role).toBe("finance");
  });

  it("creates User with correct tenantId, email, and role from invite", async () => {
    await ACCEPT_POST(makeAcceptRequest({ token: "valid-token-abc" }));
    expect(mockUserCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "bob@example.com",
        role: "finance",
        tenantId: "acme",
        password: fakeAcceptorUser.password,
      })
    );
  });

  it("marks invite as accepted after user creation", async () => {
    await ACCEPT_POST(makeAcceptRequest({ token: "valid-token-abc" }));
    expect(mockInviteUpdateOne).toHaveBeenCalledWith(
      { token: "valid-token-abc" },
      { $set: { status: "accepted" } }
    );
  });

  it("response includes workspace URL", async () => {
    const res = await ACCEPT_POST(makeAcceptRequest({ token: "valid-token-abc" }));
    const body = await res.json();
    expect(body.data.workspaceUrl).toContain("acme.aupulens.online");
  });

  it("attach-existing path: user already in target org → 200 without creating new User", async () => {
    // User already exists in acme tenant (e.g., added via master-admin before)
    mockUserFindOneLean.mockResolvedValue({ _id: "existing-member", email: "bob@example.com" });
    const res = await ACCEPT_POST(makeAcceptRequest({ token: "valid-token-abc" }));
    expect(res.status).toBe(200);
    expect(mockUserCreate).not.toHaveBeenCalled();
    const body = await res.json();
    expect(body.data.alreadyMember).toBe(true);
    // invite is still marked accepted
    expect(mockInviteUpdateOne).toHaveBeenCalledWith(
      { token: "valid-token-abc" },
      { $set: { status: "accepted" } }
    );
  });
});

describe("POST /api/auth/org/accept — tenant isolation", () => {
  beforeEach(() => mockAuth.mockResolvedValue(inviteAcceptorSession()));

  it("invite lookup uses token only (tenantId resolved from invite, not session)", async () => {
    await ACCEPT_POST(makeAcceptRequest({ token: "valid-token-abc" }));
    // Token lookup does NOT use the acceptor's session tenantId
    expect(mockInviteFindOne).toHaveBeenCalledWith({ token: "valid-token-abc" });
    const callArg = mockInviteFindOne.mock.calls[0][0];
    expect(callArg.tenantId).toBeUndefined();
  });

  it("new User is created in invite.tenantId, not in the acceptor's current tenantId", async () => {
    // Acceptor is currently in "otherorgnow", invite is for "acme"
    await ACCEPT_POST(makeAcceptRequest({ token: "valid-token-abc" }));
    const createArg = mockUserCreate.mock.calls[0][0];
    expect(createArg.tenantId).toBe("acme");
    expect(createArg.tenantId).not.toBe("otherorgnow");
  });

  it("maxUsers and existing-member checks use invite.tenantId", async () => {
    await ACCEPT_POST(makeAcceptRequest({ token: "valid-token-abc" }));
    expect(mockOrgFindOne).toHaveBeenCalledWith({ subdomain: "acme" });
    expect(mockUserCountDocuments).toHaveBeenCalledWith({ tenantId: "acme" });
    expect(mockUserFindOne).toHaveBeenCalledWith({ tenantId: "acme", email: "bob@example.com" });
  });
});
