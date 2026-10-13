import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_crm_audit_log";

import CrmAuditLogFromCrm, { ICrmAuditLog } from "@/models/crm/CrmAuditLog";
import CrmAuditLogFromRoot from "@/models/CrmAuditLog";

describe("Priority 2: CrmAuditLog Model Registration & Immutability", () => {
  const TENANT = "tenant-crm-audit-test";

  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI!);
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  afterEach(async () => {
    // Direct collection delete to bypass schema immutability hooks during test cleanup
    await mongoose.connection.collection("crmauditlogs").deleteMany({ tenantId: TENANT });
  });

  it("canonical model registration is single and identical across both import paths", () => {
    expect(CrmAuditLogFromCrm).toBeDefined();
    expect(CrmAuditLogFromRoot).toBeDefined();
    // Must be the exact same Mongoose model reference
    expect(CrmAuditLogFromCrm).toBe(CrmAuditLogFromRoot);
    expect(mongoose.models.CrmAuditLog).toBe(CrmAuditLogFromCrm);
  });

  it("creates and retrieves audit log documents with tenant isolation", async () => {
    const recordId = new mongoose.Types.ObjectId();
    const userId = new mongoose.Types.ObjectId();

    const created = await CrmAuditLogFromCrm.create({
      tenantId: TENANT,
      user_id: userId,
      action: "created",
      record_type: "Lead",
      record_id: recordId,
      field_name: "status",
      new_value: "Qualified",
      ip_address: "127.0.0.1",
    });

    expect(created._id).toBeDefined();
    expect(created.action).toBe("created");
    expect(created.timestamp).toBeInstanceOf(Date);

    // Read via root import path
    const fetched = await CrmAuditLogFromRoot.findOne({
      _id: created._id,
      tenantId: TENANT,
    }).lean();

    expect(fetched).not.toBeNull();
    expect(fetched?.record_type).toBe("Lead");
    expect(fetched?.new_value).toBe("Qualified");

    // Cross-tenant read returns null
    const crossTenant = await CrmAuditLogFromCrm.findOne({
      _id: created._id,
      tenantId: "different-tenant",
    }).lean();
    expect(crossTenant).toBeNull();
  });

  it("validates enum actions correctly", async () => {
    const userId = new mongoose.Types.ObjectId();
    const recordId = new mongoose.Types.ObjectId();

    // Invalid action should fail validation
    await expect(
      CrmAuditLogFromCrm.create({
        tenantId: TENANT,
        user_id: userId,
        action: "invalid_action_name_xyz" as any,
        record_type: "Opportunity",
        record_id: recordId,
      })
    ).rejects.toThrow();
  });

  it("immutability pre-hook prevents updateOne", async () => {
    await expect(
      CrmAuditLogFromCrm.updateOne(
        { tenantId: TENANT },
        { $set: { new_value: "Tampered" } }
      )
    ).rejects.toThrow("CrmAuditLog records are immutable.");
  });

  it("immutability pre-hook prevents findOneAndUpdate", async () => {
    await expect(
      CrmAuditLogFromCrm.findOneAndUpdate(
        { tenantId: TENANT },
        { $set: { new_value: "Tampered" } }
      )
    ).rejects.toThrow("CrmAuditLog records are immutable.");
  });

  it("immutability pre-hook prevents deleteOne", async () => {
    await expect(
      CrmAuditLogFromCrm.deleteOne({ tenantId: TENANT })
    ).rejects.toThrow("CrmAuditLog records cannot be deleted.");
  });

  it("immutability pre-hook prevents findOneAndDelete", async () => {
    await expect(
      CrmAuditLogFromCrm.findOneAndDelete({ tenantId: TENANT })
    ).rejects.toThrow("CrmAuditLog records cannot be deleted.");
  });

  it("immutability pre-hook prevents deleteMany", async () => {
    await expect(
      CrmAuditLogFromCrm.deleteMany({ tenantId: TENANT })
    ).rejects.toThrow("CrmAuditLog records cannot be deleted.");
  });
});
