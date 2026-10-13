import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_tenant_indexes";

import InventoryItem from "@/models/inventory/InventoryItem";
import Warehouse from "@/models/inventory/Warehouse";
import LegacyContract from "@/models/legacy/Contract";

describe("Priority 3: Tenant-Scoped Unique Indexes & Tenant Isolation", () => {
  const TENANT_A = "tenant-alpha";
  const TENANT_B = "tenant-beta";
  const userId = new mongoose.Types.ObjectId();

  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI!);
    await InventoryItem.init();
    await Warehouse.init();
    await LegacyContract.init();
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  afterEach(async () => {
    await InventoryItem.deleteMany({ tenantId: { $in: [TENANT_A, TENANT_B] } });
    await Warehouse.deleteMany({ tenantId: { $in: [TENANT_A, TENANT_B] } });
    await LegacyContract.deleteMany({ tenantId: { $in: [TENANT_A, TENANT_B] } });
  });

  describe("InventoryItem (itemCode)", () => {
    it("allows the same itemCode to exist across separate tenants", async () => {
      const itemA = await InventoryItem.create({
        tenantId: TENANT_A,
        itemCode: "SKU-TEST-001",
        name: "Test Widget A",
        category: "Hardware",
        unit: "pcs",
        warehouse: "Main",
        createdBy: userId,
      });

      const itemB = await InventoryItem.create({
        tenantId: TENANT_B,
        itemCode: "SKU-TEST-001",
        name: "Test Widget B",
        category: "Hardware",
        unit: "pcs",
        warehouse: "Main",
        createdBy: userId,
      });

      expect(itemA._id).toBeDefined();
      expect(itemB._id).toBeDefined();
      expect(itemA.itemCode).toBe(itemB.itemCode);
      expect(itemA.tenantId).not.toBe(itemB.tenantId);
    });

    it("rejects duplicate itemCode within the same tenant", async () => {
      await InventoryItem.create({
        tenantId: TENANT_A,
        itemCode: "SKU-DUP-001",
        name: "First Item",
        category: "Hardware",
        unit: "pcs",
        warehouse: "Main",
        createdBy: userId,
      });

      await expect(
        InventoryItem.create({
          tenantId: TENANT_A,
          itemCode: "SKU-DUP-001",
          name: "Second Item (Duplicate)",
          category: "Hardware",
          unit: "pcs",
          warehouse: "Main",
          createdBy: userId,
        })
      ).rejects.toThrow();
    });

    it("ensures tenant-scoped queries cannot retrieve another tenant's records", async () => {
      await InventoryItem.create({
        tenantId: TENANT_A,
        itemCode: "SKU-ISO-A",
        name: "Alpha Item",
        category: "Hardware",
        unit: "pcs",
        warehouse: "Main",
        createdBy: userId,
      });

      await InventoryItem.create({
        tenantId: TENANT_B,
        itemCode: "SKU-ISO-B",
        name: "Beta Item",
        category: "Hardware",
        unit: "pcs",
        warehouse: "Main",
        createdBy: userId,
      });

      const alphaItems = await InventoryItem.find({ tenantId: TENANT_A }).lean();
      expect(alphaItems.length).toBe(1);
      expect(alphaItems[0].itemCode).toBe("SKU-ISO-A");

      const betaItems = await InventoryItem.find({ tenantId: TENANT_B }).lean();
      expect(betaItems.length).toBe(1);
      expect(betaItems[0].itemCode).toBe("SKU-ISO-B");
    });
  });

  describe("Warehouse (warehouseCode)", () => {
    it("allows the same warehouseCode to exist in separate tenants", async () => {
      const whA = await Warehouse.create({
        tenantId: TENANT_A,
        warehouseCode: "WH-NORTH",
        name: "North Hub A",
        capacity: 1000,
        createdBy: userId,
      });

      const whB = await Warehouse.create({
        tenantId: TENANT_B,
        warehouseCode: "WH-NORTH",
        name: "North Hub B",
        capacity: 2000,
        createdBy: userId,
      });

      expect(whA._id).toBeDefined();
      expect(whB._id).toBeDefined();
      expect(whA.warehouseCode).toBe(whB.warehouseCode);
    });

    it("rejects duplicate warehouseCode within the same tenant", async () => {
      await Warehouse.create({
        tenantId: TENANT_A,
        warehouseCode: "WH-DUP",
        name: "Original WH",
        capacity: 500,
        createdBy: userId,
      });

      await expect(
        Warehouse.create({
          tenantId: TENANT_A,
          warehouseCode: "WH-DUP",
          name: "Duplicate WH",
          capacity: 500,
          createdBy: userId,
        })
      ).rejects.toThrow();
    });
  });

  describe("Legacy Contract (contract_number)", () => {
    it("allows the same contract_number across separate tenants", async () => {
      const accountId = new mongoose.Types.ObjectId();

      const ctrA = await LegacyContract.create({
        tenantId: TENANT_A,
        contract_number: "CTR-2026-X",
        account_id: accountId,
        createdBy: userId,
      });

      const ctrB = await LegacyContract.create({
        tenantId: TENANT_B,
        contract_number: "CTR-2026-X",
        account_id: accountId,
        createdBy: userId,
      });

      expect(ctrA._id).toBeDefined();
      expect(ctrB._id).toBeDefined();
      expect(ctrA.contract_number).toBe(ctrB.contract_number);
    });

    it("rejects duplicate contract_number within the same tenant", async () => {
      const accountId = new mongoose.Types.ObjectId();

      await LegacyContract.create({
        tenantId: TENANT_A,
        contract_number: "CTR-DUP-001",
        account_id: accountId,
        createdBy: userId,
      });

      await expect(
        LegacyContract.create({
          tenantId: TENANT_A,
          contract_number: "CTR-DUP-001",
          account_id: accountId,
          createdBy: userId,
        })
      ).rejects.toThrow();
    });
  });
});
