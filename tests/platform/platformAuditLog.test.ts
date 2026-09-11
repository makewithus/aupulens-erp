import { describe, expect, it, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_platform_auditlog";

import PlatformAuditLog from "@/models/platform/PlatformAuditLog";
import {
  PLATFORM_EVENT_CATEGORY,
  PLATFORM_EVENT_TYPE,
  PLATFORM_SEVERITY,
} from "@/lib/constants/statuses";

async function seedLog() {
  return PlatformAuditLog.create({
    actorId: "admin-1",
    actorType: "admin",
    actorRole: "global_admin",
    eventCategory: PLATFORM_EVENT_CATEGORY.AUTH,
    eventType: PLATFORM_EVENT_TYPE.LOGIN_SUCCESS,
    severity: PLATFORM_SEVERITY.INFO,
  });
}

describe("PlatformAuditLog — append-only (Hard Rule 6)", () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI!);
    await PlatformAuditLog.init();
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  afterEach(async () => {
    await PlatformAuditLog.deleteMany({}).setOptions({ allowRetentionDelete: true });
  });

  it("creates successfully with a valid structured event", async () => {
    const log = await seedLog();
    expect(log.eventType).toBe(PLATFORM_EVENT_TYPE.LOGIN_SUCCESS);
  });

  it("rejects an eventCategory/eventType/severity outside the enum", async () => {
    await expect(
      PlatformAuditLog.create({
        actorId: "x",
        actorType: "admin",
        actorRole: "global_admin",
        eventCategory: "not_a_real_category",
        eventType: PLATFORM_EVENT_TYPE.LOGIN_SUCCESS,
        severity: PLATFORM_SEVERITY.INFO,
      }),
    ).rejects.toThrow();
  });

  it("throws on updateOne", async () => {
    const log = await seedLog();
    await expect(
      PlatformAuditLog.updateOne({ _id: log._id }, { $set: { severity: PLATFORM_SEVERITY.CRITICAL } }),
    ).rejects.toThrow(/append-only/);
  });

  it("throws on findOneAndUpdate", async () => {
    const log = await seedLog();
    await expect(
      PlatformAuditLog.findOneAndUpdate({ _id: log._id }, { $set: { severity: PLATFORM_SEVERITY.CRITICAL } }),
    ).rejects.toThrow(/append-only/);
  });

  it("throws on updateMany", async () => {
    await seedLog();
    await expect(
      PlatformAuditLog.updateMany({}, { $set: { severity: PLATFORM_SEVERITY.CRITICAL } }),
    ).rejects.toThrow(/append-only/);
  });

  it("throws on the document instance's own .save() after mutation", async () => {
    const log = await seedLog();
    log.severity = PLATFORM_SEVERITY.CRITICAL;
    // .save() on an existing document goes through updateOne internally in
    // Mongoose's middleware pipeline for this schema — confirm it's blocked.
    await expect(log.save()).rejects.toThrow(/append-only/);
  });

  it("throws on deleteOne", async () => {
    const log = await seedLog();
    await expect(PlatformAuditLog.deleteOne({ _id: log._id })).rejects.toThrow(/append-only/);
  });

  it("throws on findOneAndDelete", async () => {
    const log = await seedLog();
    await expect(PlatformAuditLog.findOneAndDelete({ _id: log._id })).rejects.toThrow(/append-only/);
  });

  it("throws on a plain deleteMany (no retention flag)", async () => {
    await seedLog();
    await expect(PlatformAuditLog.deleteMany({})).rejects.toThrow(/append-only/);
  });

  it("allows deleteMany ONLY when the retention job explicitly opts in via allowRetentionDelete", async () => {
    await seedLog();
    await expect(
      PlatformAuditLog.deleteMany({}).setOptions({ allowRetentionDelete: true }),
    ).resolves.toBeDefined();
    expect(await PlatformAuditLog.countDocuments({})).toBe(0);
  });
});
