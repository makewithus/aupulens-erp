import { describe, expect, it, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";
import { SignJWT } from "jose";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_platform_session";
process.env.ADMIN_SESSION_SECRET = "a".repeat(40);

import AdminSession from "@/models/platform/AdminSession";
import AdminUser from "@/models/platform/AdminUser";
import { ADMIN_ROLE, ADMIN_USER_STATUS } from "@/lib/constants/statuses";
// adminSessionEdge.ts has no lib/db.ts dependency — safe as a static import.
import { verifyAdminSessionTokenEdge } from "@/lib/platform/auth/adminSessionEdge";
import { makeRequestWithCookie } from "./_helpers/routeTestUtils";

// adminSession.ts (unlike adminSessionEdge.ts) transitively imports lib/db.ts,
// which reads MONGODB_URI eagerly at module-evaluation time — dynamic import
// inside beforeAll, same reasoning as tests/platform/adminRbac.test.ts.
let createAdminSession: typeof import("@/lib/platform/auth/adminSession").createAdminSession;
let getAdminActorFromRequest: typeof import("@/lib/platform/auth/adminSession").getAdminActorFromRequest;
let revokeAdminSession: typeof import("@/lib/platform/auth/adminSession").revokeAdminSession;

async function seedAdmin() {
  return AdminUser.create({
    name: "Test Admin",
    email: `admin-${new mongoose.Types.ObjectId().toString()}@example.com`,
    passwordHash: "irrelevant-for-this-test",
    role: ADMIN_ROLE.GLOBAL_ADMIN,
    status: ADMIN_USER_STATUS.ACTIVE,
    mfaEnabled: true,
  });
}

describe("adminSession — a fully separate session domain from the tenant NextAuth instance", () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI!);
    await AdminUser.init();
    await AdminSession.init();
    ({ createAdminSession, getAdminActorFromRequest, revokeAdminSession } = await import(
      "@/lib/platform/auth/adminSession"
    ));
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  afterEach(async () => {
    await AdminUser.deleteMany({});
    await AdminSession.deleteMany({});
  });

  it("issues a session whose token verifies and resolves to the right actor", async () => {
    const admin = await seedAdmin();
    const { token } = await createAdminSession(
      { id: String(admin._id), email: admin.email, name: admin.name, role: admin.role },
      { ip: "127.0.0.1", userAgent: "vitest" },
    );

    const request = makeRequestWithCookie(
      "http://localhost/api/platform/me",
      `aupulens_admin_session=${encodeURIComponent(token)}`,
    );
    const actor = await getAdminActorFromRequest(request);
    expect(actor).not.toBeNull();
    expect(actor!.id).toBe(String(admin._id));
    expect(actor!.role).toBe(ADMIN_ROLE.GLOBAL_ADMIN);
  });

  it("rejects a revoked session even though its JWT has not expired yet (hostile case)", async () => {
    const admin = await seedAdmin();
    const { token, sessionId } = await createAdminSession(
      { id: String(admin._id), email: admin.email, name: admin.name, role: admin.role },
      {},
    );
    const session = await AdminSession.findById(sessionId);
    await revokeAdminSession(session!.jti, "test revoke");

    const request = makeRequestWithCookie(
      "http://localhost/api/platform/me",
      `aupulens_admin_session=${encodeURIComponent(token)}`,
    );
    const actor = await getAdminActorFromRequest(request);
    expect(actor).toBeNull();
  });

  it("rejects a session for a suspended admin account", async () => {
    const admin = await seedAdmin();
    const { token } = await createAdminSession(
      { id: String(admin._id), email: admin.email, name: admin.name, role: admin.role },
      {},
    );
    admin.status = ADMIN_USER_STATUS.SUSPENDED;
    await admin.save();

    const request = makeRequestWithCookie(
      "http://localhost/api/platform/me",
      `aupulens_admin_session=${encodeURIComponent(token)}`,
    );
    expect(await getAdminActorFromRequest(request)).toBeNull();
  });

  it("rejects a request with no admin cookie at all", async () => {
    const request = makeRequestWithCookie("http://localhost/api/platform/me", "");
    expect(await getAdminActorFromRequest(request)).toBeNull();
  });

  it("hostile case: a token signed with a different secret (simulating a forged/tenant token) never verifies", async () => {
    const forgedSecret = new TextEncoder().encode("b".repeat(40));
    const forgedToken = await new SignJWT({
      sub: "someone",
      jti: "forged-jti",
      email: "x@example.com",
      name: "X",
      role: ADMIN_ROLE.GLOBAL_SUPER_ADMIN,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("1h")
      .sign(forgedSecret);

    expect(await verifyAdminSessionTokenEdge(forgedToken)).toBeNull();
  });

  it("hostile case: an admin session token cannot be reused after logout (revocation) even from a fresh request object", async () => {
    const admin = await seedAdmin();
    const { token, sessionId } = await createAdminSession(
      { id: String(admin._id), email: admin.email, name: admin.name, role: admin.role },
      {},
    );
    const req1 = makeRequestWithCookie(
      "http://localhost/api/platform/me",
      `aupulens_admin_session=${encodeURIComponent(token)}`,
    );
    expect(await getAdminActorFromRequest(req1)).not.toBeNull();

    const session = await AdminSession.findById(sessionId);
    await revokeAdminSession(session!.jti, "logout");

    const req2 = makeRequestWithCookie(
      "http://localhost/api/platform/me",
      `aupulens_admin_session=${encodeURIComponent(token)}`,
    );
    expect(await getAdminActorFromRequest(req2)).toBeNull();
  });
});
