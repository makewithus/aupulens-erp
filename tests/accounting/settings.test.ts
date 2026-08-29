import { describe, expect, it, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";
import AccountingSettings from "@/models/finance/AccountingSettings";
import TaxRate from "@/models/finance/TaxRate";
import CustomField from "@/models/shared/CustomField";

describe("Accounting Setup models", () => {
  beforeAll(async () => {
    await mongoose.connect("mongodb://localhost:27017/aupulens_test_accounting_settings");
    await AccountingSettings.init();
    await TaxRate.init();
    await CustomField.init();
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  afterEach(async () => {
    await AccountingSettings.deleteMany({});
    await TaxRate.deleteMany({});
    await CustomField.deleteMany({});
  });

  describe("AccountingSettings", () => {
    it("seeds sensible defaults for a new tenant", async () => {
      const doc = await AccountingSettings.create({ tenantId: "t1" });
      expect(doc.journals.requireBalancedEntries).toBe(true);
      expect(doc.currency.baseCurrency).toBe("INR");
      expect(doc.currency.enabledCurrencies).toHaveLength(1);
      expect(doc.tds.enabled).toBe(false);
    });

    it("enforces one settings document per tenant", async () => {
      await AccountingSettings.create({ tenantId: "t1" });
      await expect(AccountingSettings.create({ tenantId: "t1" })).rejects.toThrow(/E11000/);

      const t2 = await AccountingSettings.create({ tenantId: "t2" });
      expect(t2.tenantId).toBe("t2");
    });
  });

  describe("TaxRate", () => {
    it("enforces tenant-scoped uniqueness on {type, name}", async () => {
      const userId = new mongoose.Types.ObjectId();
      await TaxRate.create({ tenantId: "t1", name: "GST 18%", type: "gst", ratePercent: 18, createdBy: userId });

      await expect(
        TaxRate.create({ tenantId: "t1", name: "GST 18%", type: "gst", ratePercent: 18, createdBy: userId }),
      ).rejects.toThrow(/E11000/);

      // Same name, different type — allowed (e.g. TDS section vs GST rate can share a label)
      const tds = await TaxRate.create({ tenantId: "t1", name: "GST 18%", type: "tds", ratePercent: 10, createdBy: userId });
      expect(tds.type).toBe("tds");
    });

    it("defaults appliesTo to both and status to active", async () => {
      const doc = await TaxRate.create({
        tenantId: "t1",
        name: "Section 194C",
        type: "tds",
        ratePercent: 1,
        createdBy: new mongoose.Types.ObjectId(),
      });
      expect(doc.appliesTo).toBe("both");
      expect(doc.status).toBe("active");
    });
  });

  describe("CustomField", () => {
    it("enforces tenant-scoped uniqueness on {appliesTo, label}", async () => {
      const userId = new mongoose.Types.ObjectId();
      await CustomField.create({ tenantId: "t1", appliesTo: "account", label: "Cost Center", createdBy: userId });

      await expect(
        CustomField.create({ tenantId: "t1", appliesTo: "account", label: "Cost Center", createdBy: userId }),
      ).rejects.toThrow(/E11000/);

      // Same label, different appliesTo — allowed
      const journalField = await CustomField.create({ tenantId: "t1", appliesTo: "journal", label: "Cost Center", createdBy: userId });
      expect(journalField.appliesTo).toBe("journal");
    });

    it("rejects an invalid fieldType enum value", async () => {
      await expect(
        CustomField.create({
          tenantId: "t1",
          appliesTo: "account",
          label: "Bad Field",
          fieldType: "not_a_type",
          createdBy: new mongoose.Types.ObjectId(),
        }),
      ).rejects.toThrow();
    });
  });
});
