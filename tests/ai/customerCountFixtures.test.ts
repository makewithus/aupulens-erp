import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
vi.mock("@/lib/db", () => ({ default: async () => {} }));
import mongoose from "mongoose";
import { randomUUID } from "crypto";
import Customer from "@/models/sales/Customer";
import Organization from "@/models/admin/Organization";
import { executeErpQuery } from "@/lib/ai/erpQuery";
import { tryErpAssistant, formatErpResult } from "@/lib/ai/erpAssistant";

const tenant280 = `qa-tenant-280-${randomUUID().slice(0, 8)}`;
const tenant2 = `qa-tenant-2-${randomUUID().slice(0, 8)}`;
const userId = new mongoose.Types.ObjectId().toString();

beforeAll(async () => {
  await mongoose.connect(`mongodb://127.0.0.1:27017/aupulens_test_customer_counts_${randomUUID().replaceAll("-", "")}`, {
    serverSelectionTimeoutMS: 5000,
  });
  await Customer.init();
  await Organization.init();

  await Organization.create([
    {
      name: "Tenant 280 Org",
      subdomain: tenant280,
      ownerUserId: userId,
      tier: "enterprise",
      subscriptionStatus: "active",
      settings: { enabledModules: ["sales", "admin", "finance", "inventory"] },
    },
    {
      name: "Tenant 2 Org",
      subdomain: tenant2,
      ownerUserId: userId,
      tier: "enterprise",
      subscriptionStatus: "active",
      settings: { enabledModules: ["sales", "admin", "finance", "inventory"] },
    },
  ]);

  // Tenant 280: Exactly 280 active customer records + 2 inactive customer records
  const customers280 = Array.from({ length: 280 }, (_, i) => ({
    tenantId: tenant280,
    createdBy: userId,
    header: { name: `Customer 280 #${i + 1}`, displayName: `Customer 280 #${i + 1}` },
    isActive: true,
  }));
  await Customer.insertMany(customers280);

  const inactiveCustomers280 = Array.from({ length: 2 }, (_, i) => ({
    tenantId: tenant280,
    createdBy: userId,
    header: { name: `Inactive Customer #${i + 1}`, displayName: `Inactive Customer #${i + 1}` },
    isActive: false,
  }));
  await Customer.insertMany(inactiveCustomers280);

  // Tenant 2: Exactly 2 active customer records
  const customers2 = [
    { tenantId: tenant2, createdBy: userId, header: { name: "Tenant2 Alpha Corp", displayName: "Tenant2 Alpha Corp" }, isActive: true },
    { tenantId: tenant2, createdBy: userId, header: { name: "Tenant2 Beta LLC", displayName: "Tenant2 Beta LLC" }, isActive: true },
  ];
  await Customer.insertMany(customers2);
});

afterAll(async () => {
  if (mongoose.connection.readyState === 1) {
    await mongoose.connection.dropDatabase();
  }
  await mongoose.disconnect();
});

describe("Priority 1 — Deterministic Customer Count & Dual-Tenant Verification", () => {
  it("returns exactly 282 total customer records for tenant-280", async () => {
    const res = await tryErpAssistant({
      tenantId: tenant280,
      userId,
      role: "sales",
      module: "sales",
      conversationId: randomUUID(),
      text: "How many customers do we have?",
      requestId: randomUUID(),
    });
    expect(res?.message).toBe("282 customer records.");
  });

  it("returns exactly 2 customer records for tenant-2", async () => {
    const res = await tryErpAssistant({
      tenantId: tenant2,
      userId,
      role: "sales",
      module: "sales",
      conversationId: randomUUID(),
      text: "How many customers do we have?",
      requestId: randomUUID(),
    });
    expect(res?.message).toBe("2 customer records.");
  });

  it("distinguishes paginated search rows (limit 10) from authoritative total count in tenant-280", async () => {
    const searchResult = await executeErpQuery(
      { tenantId: tenant280, role: "sales" },
      { entity: "customer", operation: "search", limit: 10, offset: 0 }
    );
    expect(searchResult.rows.length).toBe(10);
    expect(searchResult.count).toBe(282);
    const formatted = formatErpResult(searchResult);
    expect(formatted).toContain("Showing 1–10 of 282.");
  });

  it("paginated search in tenant-2 does not show showing suffix when all records fit on page", async () => {
    const searchResult = await executeErpQuery(
      { tenantId: tenant2, role: "sales" },
      { entity: "customer", operation: "search", limit: 10, offset: 0 }
    );
    expect(searchResult.rows.length).toBe(2);
    expect(searchResult.count).toBe(2);
    const formatted = formatErpResult(searchResult);
    expect(formatted).not.toContain("Showing 1–2 of 2");
    expect(formatted).toContain("Tenant2 Alpha Corp");
    expect(formatted).toContain("Tenant2 Beta LLC");
  });

  it("enforces strict cross-tenant isolation: tenant-2 cannot see tenant-280 records", async () => {
    const lookupCrossTenant = await executeErpQuery(
      { tenantId: tenant2, role: "sales" },
      { entity: "customer", operation: "search", name: "Customer 280 #1" }
    );
    expect(lookupCrossTenant.rows.length).toBe(0);
    expect(lookupCrossTenant.count).toBe(0);
  });

  it("enforces strict cross-tenant isolation: tenant-280 cannot see tenant-2 records", async () => {
    const lookupCrossTenant = await executeErpQuery(
      { tenantId: tenant280, role: "sales" },
      { entity: "customer", operation: "search", name: "Tenant2 Alpha Corp" }
    );
    expect(lookupCrossTenant.rows.length).toBe(0);
    expect(lookupCrossTenant.count).toBe(0);
  });

  it("dynamically reflects new customer additions without hardcoding", async () => {
    const beforeCount = await Customer.countDocuments({ tenantId: tenant2 });
    expect(beforeCount).toBe(2);

    const extra = await Customer.create({
      tenantId: tenant2,
      createdBy: userId,
      header: { name: "Tenant2 Gamma Inc", displayName: "Tenant2 Gamma Inc" },
      isActive: true,
    });

    try {
      const res = await tryErpAssistant({
        tenantId: tenant2,
        userId,
        role: "sales",
        module: "sales",
        conversationId: randomUUID(),
        text: "How many customers do we have?",
        requestId: randomUUID(),
      });
      expect(res?.message).toBe("3 customer records.");
    } finally {
      await Customer.deleteOne({ _id: extra._id });
    }
  });
});
