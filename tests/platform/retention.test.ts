import { describe, expect, it, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_platform_retention";

import Organization from "@/models/admin/Organization";
import RetentionPolicy from "@/models/platform/RetentionPolicy";
import PlatformAuditLog from "@/models/platform/PlatformAuditLog";
import {
  ORGANIZATION_TYPE,
  PLATFORM_EVENT_CATEGORY,
  PLATFORM_EVENT_TYPE,
  PLATFORM_SEVERITY,
} from "@/lib/constants/statuses";

let resolveRetentionDays: typeof import("@/lib/platform/audit/retention").resolveRetentionDays;
let runRetentionSweep: typeof import("@/lib/platform/audit/retention").runRetentionSweep;

async function seedAuditLog(overrides: Partial<{ tenantId: string; eventCategory: string; eventType: string; createdAt: Date }> = {}) {
  const doc = await PlatformAuditLog.create({
    tenantId: overrides.tenantId ?? "acme",
    actorId: "admin-1",
    actorType: "admin",
    actorRole: "global_admin",
    eventCategory: overrides.eventCategory ?? PLATFORM_EVENT_CATEGORY.AUTH,
    eventType: overrides.eventType ?? PLATFORM_EVENT_TYPE.LOGIN_SUCCESS,
    severity: PLATFORM_SEVERITY.INFO,
  });
  if (overrides.createdAt) {
    // Backdate directly in the DB — the model's own guards forbid updateOne/
    // save on an existing doc, so this uses the raw collection, matching how
    // a real old record naturally has an old createdAt rather than being
    // artificially aged by the test.
    await PlatformAuditLog.collection.updateOne({ _id: doc._id }, { $set: { createdAt: overrides.createdAt } });
  }
  return doc;
}

beforeAll(async () => {
  await mongoose.connect(process.env.MONGODB_URI!);
  await Organization.init();
  await RetentionPolicy.init();
  await PlatformAuditLog.init();
  ({ resolveRetentionDays, runRetentionSweep } = await import("@/lib/platform/audit/retention"));
});

afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.connection.close();
});

describe("resolveRetentionDays — most-specific-match resolution (source doc §27)", () => {
  afterEach(async () => {
    await Organization.deleteMany({});
    await RetentionPolicy.deleteMany({});
    await PlatformAuditLog.deleteMany({}).setOptions({ allowRetentionDelete: true });
  });

  it("falls back to the platform default (30 days) when nothing is configured", async () => {
    const days = await resolveRetentionDays("acme", PLATFORM_EVENT_CATEGORY.AUTH, PLATFORM_EVENT_TYPE.LOGIN_SUCCESS);
    expect(days).toBe(30);
  });

  it("uses a filterless RetentionPolicy row as the new platform default", async () => {
    await RetentionPolicy.create({ isDefault: true, retentionDays: 90 });
    const days = await resolveRetentionDays("acme", PLATFORM_EVENT_CATEGORY.AUTH, PLATFORM_EVENT_TYPE.LOGIN_SUCCESS);
    expect(days).toBe(90);
  });

  it("a category-specific policy overrides the filterless default", async () => {
    await RetentionPolicy.create({ isDefault: true, retentionDays: 90 });
    await RetentionPolicy.create({ eventCategory: PLATFORM_EVENT_CATEGORY.SECURITY, retentionDays: 2555 });
    expect(await resolveRetentionDays("acme", PLATFORM_EVENT_CATEGORY.AUTH, PLATFORM_EVENT_TYPE.LOGIN_SUCCESS)).toBe(90);
    expect(await resolveRetentionDays("acme", PLATFORM_EVENT_CATEGORY.SECURITY, PLATFORM_EVENT_TYPE.SECURITY_ALERT_RAISED)).toBe(2555);
  });

  it("an org-type-specific policy is more specific than a category-only policy", async () => {
    await Organization.create({ name: "Acme", subdomain: "acme", ownerUserId: new mongoose.Types.ObjectId(), organizationType: ORGANIZATION_TYPE.ACCOUNTANT_CA_FIRM });
    await RetentionPolicy.create({ eventCategory: PLATFORM_EVENT_CATEGORY.AI, retentionDays: 90 });
    await RetentionPolicy.create({ organizationType: ORGANIZATION_TYPE.ACCOUNTANT_CA_FIRM, eventCategory: PLATFORM_EVENT_CATEGORY.AI, retentionDays: 2555 });

    const days = await resolveRetentionDays("acme", PLATFORM_EVENT_CATEGORY.AI, PLATFORM_EVENT_TYPE.AI_LIMIT_CHANGED);
    expect(days).toBe(2555); // the more specific (org-type + category) policy wins
  });

  it("does not match a policy whose org-type filter doesn't apply to this tenant", async () => {
    await Organization.create({ name: "Acme", subdomain: "acme", ownerUserId: new mongoose.Types.ObjectId(), organizationType: ORGANIZATION_TYPE.SME });
    await RetentionPolicy.create({ organizationType: ORGANIZATION_TYPE.ACCOUNTANT_CA_FIRM, retentionDays: 2555 });
    const days = await resolveRetentionDays("acme", PLATFORM_EVENT_CATEGORY.AUTH, PLATFORM_EVENT_TYPE.LOGIN_SUCCESS);
    expect(days).toBe(30); // the CA-firm-only policy does not apply
  });
});

describe("runRetentionSweep — deletes only rows past their window, and audits its own deletion", () => {
  afterEach(async () => {
    await Organization.deleteMany({});
    await RetentionPolicy.deleteMany({});
    await PlatformAuditLog.deleteMany({}).setOptions({ allowRetentionDelete: true });
  });

  it("deletes rows older than the resolved retention window, keeps newer ones", async () => {
    await RetentionPolicy.create({ isDefault: true, retentionDays: 30 });
    const old = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000); // 40 days ago
    const recent = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000); // 5 days ago
    await seedAuditLog({ tenantId: "acme", createdAt: old });
    await seedAuditLog({ tenantId: "acme", createdAt: recent });

    await runRetentionSweep();

    // The sweep itself adds one new row (its own RETENTION_DELETION_EXECUTED
    // audit event, per source doc §27) — the surviving ORIGINAL row is the
    // recent one; the old one is gone.
    const remainingOriginal = await PlatformAuditLog.find({
      tenantId: "acme",
      eventType: { $ne: PLATFORM_EVENT_TYPE.RETENTION_DELETION_EXECUTED },
    });
    expect(remainingOriginal).toHaveLength(1);
    expect(remainingOriginal[0].createdAt.getTime()).toBeCloseTo(recent.getTime(), -3);
  });

  it("deletion by retention IS ITSELF an audited event — provable even though the deleted rows are gone", async () => {
    await RetentionPolicy.create({ isDefault: true, retentionDays: 30 });
    const old = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);
    await seedAuditLog({ tenantId: "acme", createdAt: old });

    await runRetentionSweep();

    const auditOfDeletion = await PlatformAuditLog.findOne({
      tenantId: "acme",
      eventType: PLATFORM_EVENT_TYPE.RETENTION_DELETION_EXECUTED,
    });
    expect(auditOfDeletion).not.toBeNull();
    expect(auditOfDeletion!.metadata?.count).toBe(1);
  });

  it("leaves rows within the retention window completely untouched across tenants", async () => {
    await RetentionPolicy.create({ isDefault: true, retentionDays: 30 });
    await seedAuditLog({ tenantId: "acme" });
    await seedAuditLog({ tenantId: "globex" });

    const result = await runRetentionSweep();

    expect(result.rowsDeleted).toBe(0);
    expect(await PlatformAuditLog.countDocuments({})).toBeGreaterThanOrEqual(2);
  });

  it("is idempotent — running twice in a row does not error or double-delete", async () => {
    await RetentionPolicy.create({ isDefault: true, retentionDays: 30 });
    const old = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);
    await seedAuditLog({ tenantId: "acme", createdAt: old });

    await runRetentionSweep();
    const secondResult = await runRetentionSweep();
    expect(secondResult.rowsDeleted).toBe(0); // nothing left to delete
  });
});
