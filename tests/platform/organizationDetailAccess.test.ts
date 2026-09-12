import { describe, expect, it, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_platform_orgdetailaccess";

import AdminAccessRequest from "@/models/platform/AdminAccessRequest";
import { ADMIN_ACCESS_SCOPE, ADMIN_ROLE } from "@/lib/constants/statuses";
import { AdminActor } from "@/lib/platform/auth/types";

let assertOrganizationDetailAccess: typeof import("@/lib/platform/access/status").assertOrganizationDetailAccess;
let AdminAccessGrantRequiredError: typeof import("@/lib/platform/access/status").AdminAccessGrantRequiredError;

function makeActor(role: string, id?: string): AdminActor {
  return {
    id: id ?? new mongoose.Types.ObjectId().toString(),
    email: "actor@example.com",
    name: "Actor",
    role: role as AdminActor["role"],
    sessionId: "test-session",
  };
}

beforeAll(async () => {
  await mongoose.connect(process.env.MONGODB_URI!);
  await AdminAccessRequest.init();
  ({ assertOrganizationDetailAccess, AdminAccessGrantRequiredError } = await import(
    "@/lib/platform/access/status"
  ));
});

afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.connection.close();
});

afterEach(async () => {
  await AdminAccessRequest.deleteMany({});
});

describe("assertOrganizationDetailAccess — Part 0.2: supported access, not standing access", () => {
  it.each([
    ADMIN_ROLE.GLOBAL_SUPER_ADMIN,
    ADMIN_ROLE.GLOBAL_ADMIN,
    ADMIN_ROLE.AI_ADMIN,
    ADMIN_ROLE.BILLING_ADMIN,
    ADMIN_ROLE.READ_ONLY_ADMIN,
  ])("%s has standing detail access with no access request at all", async (role) => {
    await expect(assertOrganizationDetailAccess(makeActor(role), "acme")).resolves.toBeUndefined();
  });

  it("SUPPORT_ADMIN with no approved grant is rejected", async () => {
    const actor = makeActor(ADMIN_ROLE.SUPPORT_ADMIN);
    await expect(assertOrganizationDetailAccess(actor, "acme")).rejects.toThrow(
      AdminAccessGrantRequiredError,
    );
  });

  it("SECURITY_ADMIN with no approved grant is rejected", async () => {
    const actor = makeActor(ADMIN_ROLE.SECURITY_ADMIN);
    await expect(assertOrganizationDetailAccess(actor, "acme")).rejects.toThrow(
      AdminAccessGrantRequiredError,
    );
  });

  it("SUPPORT_ADMIN with a live approved grant for THIS tenant is allowed", async () => {
    const actor = makeActor(ADMIN_ROLE.SUPPORT_ADMIN);
    await AdminAccessRequest.create({
      adminUserId: actor.id,
      tenantId: "acme",
      requestedScope: ADMIN_ACCESS_SCOPE.READ,
      reason: "support ticket",
      status: "approved",
      grantedAt: new Date(),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });
    await expect(assertOrganizationDetailAccess(actor, "acme")).resolves.toBeUndefined();
  });

  it("SUPPORT_ADMIN with an EXPIRED grant is rejected, even though status still says approved", async () => {
    const actor = makeActor(ADMIN_ROLE.SUPPORT_ADMIN);
    await AdminAccessRequest.create({
      adminUserId: actor.id,
      tenantId: "acme",
      requestedScope: ADMIN_ACCESS_SCOPE.READ,
      reason: "support ticket",
      status: "approved",
      grantedAt: new Date(Date.now() - 5 * 60 * 60 * 1000),
      expiresAt: new Date(Date.now() - 60 * 1000),
    });
    await expect(assertOrganizationDetailAccess(actor, "acme")).rejects.toThrow(
      AdminAccessGrantRequiredError,
    );
  });

  it("a grant approved for a DIFFERENT tenant does not authorise this one", async () => {
    const actor = makeActor(ADMIN_ROLE.SUPPORT_ADMIN);
    await AdminAccessRequest.create({
      adminUserId: actor.id,
      tenantId: "globex",
      requestedScope: ADMIN_ACCESS_SCOPE.READ,
      reason: "support ticket",
      status: "approved",
      grantedAt: new Date(),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });
    await expect(assertOrganizationDetailAccess(actor, "acme")).rejects.toThrow(
      AdminAccessGrantRequiredError,
    );
  });

  it("a grant approved for a DIFFERENT admin does not authorise this one", async () => {
    const actor = makeActor(ADMIN_ROLE.SUPPORT_ADMIN);
    const otherAdminId = new mongoose.Types.ObjectId().toString();
    await AdminAccessRequest.create({
      adminUserId: otherAdminId,
      tenantId: "acme",
      requestedScope: ADMIN_ACCESS_SCOPE.READ,
      reason: "support ticket",
      status: "approved",
      grantedAt: new Date(),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });
    await expect(assertOrganizationDetailAccess(actor, "acme")).rejects.toThrow(
      AdminAccessGrantRequiredError,
    );
  });
});
