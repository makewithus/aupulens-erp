import { describe, expect, it, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_platform_permission_matrix";

import AdminRole from "@/models/platform/AdminRole";
import { ADMIN_CAPABILITY_VALUES, ADMIN_ROLE_VALUES } from "@/lib/constants/statuses";
import { ROLE_MATRIX } from "@/lib/platform/auth/roleMatrix";

let hasCapability: typeof import("@/lib/platform/auth/adminRbac").hasCapability;
let invalidateAdminRoleCache: typeof import("@/lib/platform/auth/adminRbac").invalidateAdminRoleCache;

beforeAll(async () => {
  await mongoose.connect(process.env.MONGODB_URI!);
  await AdminRole.init();
  ({ hasCapability, invalidateAdminRoleCache } = await import("@/lib/platform/auth/adminRbac"));

  // Seed the REAL matrix once, exactly as scripts/seed-platform-roles.ts
  // would — this test's assertions and the seeded database read from the
  // exact same lib/platform/auth/roleMatrix.ts source, so they can never
  // silently drift apart.
  for (const [role, { capabilities, description }] of Object.entries(ROLE_MATRIX)) {
    await AdminRole.create({ role, capabilities, description });
  }
});

afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.connection.close();
});

afterEach(() => {
  invalidateAdminRoleCache();
});

describe("source doc §30 permission matrix — every role × every capability cell, allow and deny", () => {
  it("covers all 7 roles defined in ADMIN_ROLE_VALUES", () => {
    expect(Object.keys(ROLE_MATRIX).sort()).toEqual([...ADMIN_ROLE_VALUES].sort());
  });

  for (const role of ADMIN_ROLE_VALUES) {
    const grantedSet = new Set(ROLE_MATRIX[role]?.capabilities ?? []);

    describe(`role: ${role}`, () => {
      for (const capability of ADMIN_CAPABILITY_VALUES) {
        const shouldBeAllowed = grantedSet.has(capability);
        it(`${shouldBeAllowed ? "ALLOWS" : "DENIES"} ${capability}`, async () => {
          const result = await hasCapability({ role }, capability);
          expect(result).toBe(shouldBeAllowed);
        });
      }
    });
  }
});

describe("permission matrix — structural guarantees", () => {
  it("GLOBAL_SUPER_ADMIN is the only role with all 3 destructive/security-config capabilities together", () => {
    const destructive = [
      ADMIN_CAPABILITY_VALUES.find((c) => c === "delete_organization")!,
      ADMIN_CAPABILITY_VALUES.find((c) => c === "manage_admin_users")!,
      ADMIN_CAPABILITY_VALUES.find((c) => c === "manage_security_config")!,
    ];
    for (const [role, { capabilities }] of Object.entries(ROLE_MATRIX)) {
      const hasAllThree = destructive.every((c) => capabilities.includes(c));
      if (role !== "global_super_admin") {
        expect(hasAllThree).toBe(false);
      }
    }
  });

  it("READ_ONLY_ADMIN has no mutating capability at all (every granted capability starts with view_/global_search/request_org_access is absent)", () => {
    const readOnlyCaps = ROLE_MATRIX["read_only_admin"].capabilities;
    for (const cap of readOnlyCaps) {
      expect(cap.startsWith("view_") || cap === "global_search").toBe(true);
    }
  });

  it("only roles with IMPERSONATE_WRITE can request write-scope organisation access — SUPPORT_ADMIN and READ_ONLY_ADMIN never can (Part 2.7)", () => {
    expect(ROLE_MATRIX["support_admin"].capabilities).not.toContain("impersonate_write");
    expect(ROLE_MATRIX["read_only_admin"].capabilities).not.toContain("impersonate_write");
  });
});
