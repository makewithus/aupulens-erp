/**
 * Step 6 — Google + Microsoft OAuth tests.
 *
 * Tests target resolveOAuthSignIn() from lib/auth/oauthSignIn.ts — the injected-
 * dependency function that holds all OAuth tenant-resolution logic.  No real
 * Google/Microsoft endpoints are hit; getHostname is a simple mock closure and
 * all Mongoose models are stubbed via vi.mock().
 *
 * The signIn callback in auth.ts is a thin wrapper around resolveOAuthSignIn that
 * passes next/headers as the hostname source — that coupling is intentionally not
 * tested here (it would require mocking Next.js internals).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted mocks ─────────────────────────────────────────────────────────────
const {
  mockConnectDB,
  mockUserFindOneLean,
  mockUserUpdateOne,
  mockUserCreate,
  mockUserCountDocuments,
  mockOrgFindOneLean,
  mockInviteFindOneLean,
  mockInviteUpdateOne,
  mockBcryptHash,
} = vi.hoisted(() => ({
  mockConnectDB:          vi.fn(),
  mockUserFindOneLean:    vi.fn(),
  mockUserUpdateOne:      vi.fn(),
  mockUserCreate:         vi.fn(),
  mockUserCountDocuments: vi.fn(),
  mockOrgFindOneLean:     vi.fn(),
  mockInviteFindOneLean:  vi.fn(),
  mockInviteUpdateOne:    vi.fn(),
  mockBcryptHash:         vi.fn(),
}));

vi.mock("@/lib/db",                () => ({ default: mockConnectDB }));
vi.mock("@/lib/constants/statuses", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/constants/statuses")>();
  return {
    ...actual,
    ENTITY_STATUS: { ...actual.ENTITY_STATUS, ACTIVE: "active" },
    INVITE_STATUS: { ...actual.INVITE_STATUS, PENDING: "pending", ACCEPTED: "accepted" },
  };
});

vi.mock("@/models/User", () => {
  function User() {}
  User.findOne = (...args: any[]) => ({ lean: () => mockUserFindOneLean(...args) });
  User.updateOne = (...args: any[])      => mockUserUpdateOne(...args);
  User.create    = (...args: any[])      => mockUserCreate(...args);
  User.countDocuments = (...args: any[]) => mockUserCountDocuments(...args);
  return { default: User };
});

vi.mock("@/models/Organization", () => {
  function Organization() {}
  Organization.findOne = (...args: any[]) => ({ lean: () => mockOrgFindOneLean(...args) });
  return { default: Organization };
});

vi.mock("@/models/OrgInvite", () => {
  function OrgInvite() {}
  OrgInvite.findOne  = (...args: any[]) => ({ lean: () => mockInviteFindOneLean(...args) });
  OrgInvite.updateOne = (...args: any[]) => mockInviteUpdateOne(...args);
  return { default: OrgInvite };
});

vi.mock("bcryptjs", () => ({ default: { hash: mockBcryptHash } }));

// ── System under test ─────────────────────────────────────────────────────────
import { resolveOAuthSignIn } from "@/lib/auth/oauthSignIn";

// ── Test fixtures ─────────────────────────────────────────────────────────────

const TENANT = "acme";
const EMAIL  = "alice@gmail.com";

function getHostname(sub = TENANT) {
  return async () => `${sub}.aupulens.online`;
}

function makeOAuthAccount(provider = "google") {
  return {
    type: "oauth",
    provider,
    providerAccountId: "google-uid-123",
  };
}

function makeOAuthUser(email = EMAIL) {
  return { name: "Alice Smith", email };
}

const activeDbUser = {
  _id: "user-id-1",
  tenantId: TENANT,
  email: EMAIL,
  role: "admin",
  status: "active",
};

const activeOrg = { isActive: true, tier: "starter" };

const pendingInvite = {
  _id: "invite-id-1",
  tenantId: TENANT,
  email: EMAIL,
  role: "finance",
  status: "pending",
  expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
};

// ── Before each: reset all mocks ──────────────────────────────────────────────
beforeEach(() => {
  vi.resetAllMocks();
  mockConnectDB.mockResolvedValue(undefined);
  mockBcryptHash.mockResolvedValue("$2b$12$hashed_random_password");
  mockUserUpdateOne.mockResolvedValue({ modifiedCount: 1 });
  mockInviteUpdateOne.mockResolvedValue({ modifiedCount: 1 });
});

// ── Credentials pass-through ─────────────────────────────────────────────────

describe("resolveOAuthSignIn — credentials pass-through", () => {
  it("returns true immediately for credentials provider (account.type !== 'oauth')", async () => {
    const result = await resolveOAuthSignIn(
      makeOAuthUser(),
      { type: "credentials", provider: "credentials", providerAccountId: "" },
      getHostname()
    );
    expect(result).toBe(true);
    expect(mockConnectDB).not.toHaveBeenCalled();
  });

  it("returns true immediately when account is null", async () => {
    const result = await resolveOAuthSignIn(makeOAuthUser(), null, getHostname());
    expect(result).toBe(true);
  });
});

// ── Hostname / tenant resolution ──────────────────────────────────────────────

describe("resolveOAuthSignIn — tenant resolution", () => {
  it("returns OAuthNoTenant when hostname has no subdomain (apex domain)", async () => {
    const result = await resolveOAuthSignIn(
      makeOAuthUser(),
      makeOAuthAccount(),
      async () => "aupulens.online"
    );
    expect(result).toBe("/auth/admin?error=OAuthNoTenant");
    expect(mockConnectDB).not.toHaveBeenCalled();
  });

  it("returns OAuthNoTenant for plain localhost (no subdomain)", async () => {
    const result = await resolveOAuthSignIn(
      makeOAuthUser(),
      makeOAuthAccount(),
      async () => "localhost:3000"
    );
    expect(result).toBe("/auth/admin?error=OAuthNoTenant");
  });

  it("resolves tenantId correctly from a valid subdomain", async () => {
    mockUserFindOneLean.mockResolvedValue(activeDbUser);
    mockOrgFindOneLean.mockResolvedValue(activeOrg);
    mockUserUpdateOne.mockResolvedValue({});

    const user = makeOAuthUser();
    const result = await resolveOAuthSignIn(user, makeOAuthAccount(), getHostname("acme"));

    expect(result).toBe(true);
    // User must be looked up in the correct tenant
    expect(mockUserFindOneLean).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "acme", email: EMAIL })
    );
  });

  it("returns OAuthNoEmail when OAuth profile has no email", async () => {
    const result = await resolveOAuthSignIn(
      { name: "No Email User", email: undefined },
      makeOAuthAccount(),
      getHostname()
    );
    expect(result).toBe("/auth/admin?error=OAuthNoEmail");
  });
});

// ── Existing user in tenant ───────────────────────────────────────────────────

describe("resolveOAuthSignIn — existing user in tenant", () => {
  it("returns true when user exists and is active", async () => {
    mockUserFindOneLean.mockResolvedValue(activeDbUser);
    mockOrgFindOneLean.mockResolvedValue(activeOrg);
    mockUserUpdateOne.mockResolvedValue({});

    const result = await resolveOAuthSignIn(makeOAuthUser(), makeOAuthAccount(), getHostname());
    expect(result).toBe(true);
  });

  it("stamps user.id, user.role, user.tenantId from DB (same shape as credentials)", async () => {
    mockUserFindOneLean.mockResolvedValue(activeDbUser);
    mockOrgFindOneLean.mockResolvedValue(activeOrg);
    mockUserUpdateOne.mockResolvedValue({});

    const user = makeOAuthUser();
    await resolveOAuthSignIn(user, makeOAuthAccount(), getHostname());

    expect(user).toMatchObject({
      id:       "user-id-1",
      role:     "admin",
      tenantId: TENANT,
    });
  });

  it("links the OAuth provider via $addToSet (idempotent)", async () => {
    mockUserFindOneLean.mockResolvedValue(activeDbUser);
    mockOrgFindOneLean.mockResolvedValue(activeOrg);

    await resolveOAuthSignIn(makeOAuthUser(), makeOAuthAccount("google"), getHostname());

    expect(mockUserUpdateOne).toHaveBeenCalledWith(
      { _id: "user-id-1" },
      {
        $addToSet: {
          oauthProviders: {
            provider: "google",
            providerAccountId: "google-uid-123",
          },
        },
      }
    );
  });

  it("returns OAuthAccountDeactivated when user status is not active", async () => {
    mockUserFindOneLean.mockResolvedValue({ ...activeDbUser, status: "inactive" });

    const result = await resolveOAuthSignIn(makeOAuthUser(), makeOAuthAccount(), getHostname());
    expect(result).toBe("/auth/admin?error=OAuthAccountDeactivated");
    expect(mockUserUpdateOne).not.toHaveBeenCalled();
  });

  it("returns OAuthOrgSuspended when the org is suspended", async () => {
    mockUserFindOneLean.mockResolvedValue(activeDbUser);
    mockOrgFindOneLean.mockResolvedValue({ isActive: false, tier: "starter" });

    const result = await resolveOAuthSignIn(makeOAuthUser(), makeOAuthAccount(), getHostname());
    expect(result).toBe("/auth/admin?error=OAuthOrgSuspended");
    expect(mockUserUpdateOne).not.toHaveBeenCalled();
  });

  it("allows sign-in when org.isActive is undefined (legacy orgs default to active)", async () => {
    mockUserFindOneLean.mockResolvedValue(activeDbUser);
    mockOrgFindOneLean.mockResolvedValue({ tier: "starter" }); // no isActive field
    mockUserUpdateOne.mockResolvedValue({});

    const result = await resolveOAuthSignIn(makeOAuthUser(), makeOAuthAccount(), getHostname());
    expect(result).toBe(true);
  });
});

// ── No account + no invite ────────────────────────────────────────────────────

describe("resolveOAuthSignIn — no account and no valid invite", () => {
  it("returns OAuthNoAccount when no user and no invite (no silent user creation)", async () => {
    mockUserFindOneLean.mockResolvedValue(null);   // no user in this tenant
    mockInviteFindOneLean.mockResolvedValue(null); // no invite

    const result = await resolveOAuthSignIn(makeOAuthUser(), makeOAuthAccount(), getHostname());
    expect(result).toBe("/auth/admin?error=OAuthNoAccount");
    expect(mockUserCreate).not.toHaveBeenCalled();
  });

  it("returns OAuthNoAccount when invite exists but is already expired", async () => {
    mockUserFindOneLean.mockResolvedValue(null);
    mockInviteFindOneLean.mockResolvedValue({
      ...pendingInvite,
      expiresAt: new Date(Date.now() - 1000), // expired 1 second ago
    });

    const result = await resolveOAuthSignIn(makeOAuthUser(), makeOAuthAccount(), getHostname());
    expect(result).toBe("/auth/admin?error=OAuthNoAccount");
    expect(mockUserCreate).not.toHaveBeenCalled();
  });
});

// ── Invite-accept via OAuth ───────────────────────────────────────────────────

describe("resolveOAuthSignIn — valid invite → invite-accept path", () => {
  beforeEach(() => {
    mockUserFindOneLean.mockResolvedValue(null);           // no existing user
    mockInviteFindOneLean.mockResolvedValue(pendingInvite);
    mockOrgFindOneLean.mockResolvedValue(activeOrg);
    mockUserCountDocuments.mockResolvedValue(2);           // 2 existing members (< maxUsers 5)
    mockUserCreate.mockResolvedValue({ _id: "new-user-id", role: "finance", tenantId: TENANT });
  });

  it("returns true after successfully completing the invite-accept path", async () => {
    const result = await resolveOAuthSignIn(makeOAuthUser(), makeOAuthAccount(), getHostname());
    expect(result).toBe(true);
  });

  it("creates a new User in the target tenant with the invite's role", async () => {
    await resolveOAuthSignIn(makeOAuthUser(), makeOAuthAccount(), getHostname());

    expect(mockUserCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        email:    EMAIL,
        role:     "finance",   // from invite
        tenantId: TENANT,
        status:   "active",
      })
    );
  });

  it("creates user with a random unusable password (OAuth-only path)", async () => {
    await resolveOAuthSignIn(makeOAuthUser(), makeOAuthAccount(), getHostname());

    // bcrypt.hash was called → proves a random password was generated
    expect(mockBcryptHash).toHaveBeenCalled();
    const createCall = mockUserCreate.mock.calls[0][0];
    expect(createCall.password).toBe("$2b$12$hashed_random_password");
  });

  it("links the OAuth provider on the new user", async () => {
    await resolveOAuthSignIn(makeOAuthUser(), makeOAuthAccount("google"), getHostname());

    const createCall = mockUserCreate.mock.calls[0][0];
    expect(createCall.oauthProviders).toEqual([
      { provider: "google", providerAccountId: "google-uid-123" },
    ]);
  });

  it("marks the invite as accepted", async () => {
    await resolveOAuthSignIn(makeOAuthUser(), makeOAuthAccount(), getHostname());

    expect(mockInviteUpdateOne).toHaveBeenCalledWith(
      { _id: "invite-id-1" },
      { $set: { status: "accepted" } }
    );
  });

  it("stamps user.id, user.role, user.tenantId from the new user record", async () => {
    const user = makeOAuthUser();
    await resolveOAuthSignIn(user, makeOAuthAccount(), getHostname());

    expect(user).toMatchObject({
      id:       "new-user-id",
      role:     "finance",
      tenantId: TENANT,
    });
  });

  it("returns OAuthSeatCapReached when the org is at capacity", async () => {
    mockUserCountDocuments.mockResolvedValue(5); // maxUsers is 5 on starter

    const result = await resolveOAuthSignIn(makeOAuthUser(), makeOAuthAccount(), getHostname());
    expect(result).toBe("/auth/admin?error=OAuthSeatCapReached");
    expect(mockUserCreate).not.toHaveBeenCalled();
  });

  it("returns OAuthOrgSuspended when org is suspended", async () => {
    mockOrgFindOneLean.mockResolvedValue({ isActive: false, tier: "starter" });

    const result = await resolveOAuthSignIn(makeOAuthUser(), makeOAuthAccount(), getHostname());
    expect(result).toBe("/auth/admin?error=OAuthOrgSuspended");
    expect(mockUserCreate).not.toHaveBeenCalled();
  });

  it("returns OAuthOrgNotFound when org does not exist", async () => {
    mockOrgFindOneLean.mockResolvedValue(null);

    const result = await resolveOAuthSignIn(makeOAuthUser(), makeOAuthAccount(), getHostname());
    expect(result).toBe("/auth/admin?error=OAuthOrgNotFound");
    expect(mockUserCreate).not.toHaveBeenCalled();
  });
});

// ── Cross-tenant safety ───────────────────────────────────────────────────────

describe("resolveOAuthSignIn — cross-tenant isolation", () => {
  it("looks up user scoped to the request tenant, not any tenant", async () => {
    mockUserFindOneLean.mockResolvedValue(null);   // user NOT in "beta" tenant
    mockInviteFindOneLean.mockResolvedValue(null); // no invite in "beta"

    // User is on beta.aupulens.online, not acme.aupulens.online
    const result = await resolveOAuthSignIn(
      makeOAuthUser(),
      makeOAuthAccount(),
      async () => "beta.aupulens.online"
    );

    // Must look up in "beta", not "acme"
    expect(mockUserFindOneLean).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "beta" })
    );
    // Denied because there's no account in "beta"
    expect(result).toBe("/auth/admin?error=OAuthNoAccount");
  });

  it("an OAuth identity valid in org A cannot sign into org B", async () => {
    // Simulate: user exists in acme but is logging into beta
    mockUserFindOneLean.mockResolvedValue(null);   // NOT found in beta
    mockInviteFindOneLean.mockResolvedValue(null); // no invite in beta

    const result = await resolveOAuthSignIn(
      { name: "Alice", email: "alice@gmail.com" },
      makeOAuthAccount(),
      async () => "beta.aupulens.online"
    );

    expect(result).toBe("/auth/admin?error=OAuthNoAccount");
  });

  it("two tenants with same email — each lookup is isolated by tenantId", async () => {
    // Org A lookup returns user; org B lookup returns null
    const userInA = { ...activeDbUser, tenantId: "org-a" };

    mockUserFindOneLean
      .mockResolvedValueOnce(userInA)  // org-a call
      .mockResolvedValueOnce(null);    // org-b call (if called — should not be)

    mockOrgFindOneLean.mockResolvedValue(activeOrg);
    mockUserUpdateOne.mockResolvedValue({});

    const userA = makeOAuthUser();
    const resultA = await resolveOAuthSignIn(userA, makeOAuthAccount(), async () => "org-a.aupulens.online");
    expect(resultA).toBe(true);
    expect((userA as any).tenantId).toBe("org-a");

    mockUserFindOneLean.mockResolvedValue(null);
    mockInviteFindOneLean.mockResolvedValue(null);

    const userB = makeOAuthUser();
    const resultB = await resolveOAuthSignIn(userB, makeOAuthAccount(), async () => "org-b.aupulens.online");
    expect(resultB).toBe("/auth/admin?error=OAuthNoAccount");
  });
});

// ── Providers conditional registration ───────────────────────────────────────

describe("OAuth provider conditional registration", () => {
  it("credentials login is unaffected when OAuth providers are absent", async () => {
    // When env vars are absent, OAuth providers are not registered.
    // resolveOAuthSignIn should pass through credentials (type !== 'oauth').
    const result = await resolveOAuthSignIn(
      makeOAuthUser(),
      { type: "credentials", provider: "credentials", providerAccountId: "" },
      getHostname()
    );
    expect(result).toBe(true);
    expect(mockConnectDB).not.toHaveBeenCalled();
  });

  it("provider id is passed through correctly (google vs microsoft-entra-id)", async () => {
    mockUserFindOneLean.mockResolvedValue(activeDbUser);
    mockOrgFindOneLean.mockResolvedValue(activeOrg);
    mockUserUpdateOne.mockResolvedValue({});

    await resolveOAuthSignIn(
      makeOAuthUser(),
      { type: "oauth", provider: "microsoft-entra-id", providerAccountId: "ms-uid-456" },
      getHostname()
    );

    expect(mockUserUpdateOne).toHaveBeenCalledWith(
      expect.anything(),
      {
        $addToSet: {
          oauthProviders: {
            provider: "microsoft-entra-id",
            providerAccountId: "ms-uid-456",
          },
        },
      }
    );
  });
});
