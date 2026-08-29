import { describe, expect, it, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";
import DocumentPrefix from "@/models/sales/DocumentPrefix";
import { createPrefix, setAsDefault, promoteFallbackDefault, ensureDefaultPrefixes } from "@/lib/sales/documentPrefixes";
import { SALES_DOCUMENT_TYPE_VALUES } from "@/lib/constants/statuses";

describe("DocumentPrefix model + default-uniqueness logic", () => {
  beforeAll(async () => {
    await mongoose.connect("mongodb://localhost:27017/aupulens_test_document_prefix");
    await DocumentPrefix.init();
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  afterEach(async () => {
    await DocumentPrefix.deleteMany({});
  });

  it("enforces a compound unique index on (tenantId, documentType, kind, value)", async () => {
    await DocumentPrefix.create({ tenantId: "t1", documentType: "invoice", kind: "prefix", value: "INV-" });
    await expect(
      DocumentPrefix.create({ tenantId: "t1", documentType: "invoice", kind: "prefix", value: "INV-" }),
    ).rejects.toThrow(/E11000/);
  });

  it("allows the same value across different document types or tenants", async () => {
    await DocumentPrefix.create({ tenantId: "t1", documentType: "invoice", kind: "prefix", value: "A-" });
    await DocumentPrefix.create({ tenantId: "t1", documentType: "purchase", kind: "prefix", value: "A-" });
    await DocumentPrefix.create({ tenantId: "t2", documentType: "invoice", kind: "prefix", value: "A-" });
    const all = await DocumentPrefix.find({}).lean();
    expect(all).toHaveLength(3);
  });

  it("makes the first created prefix the default automatically", async () => {
    const first = await createPrefix({ tenantId: "t1", documentType: "invoice", value: "INV-" });
    expect(first.isDefault).toBe(true);
  });

  it("keeps exactly one default when a second prefix is explicitly created as default", async () => {
    const first = await createPrefix({ tenantId: "t1", documentType: "invoice", value: "INV-" });
    const second = await createPrefix({ tenantId: "t1", documentType: "invoice", value: "TAX-", isDefault: true });

    const refreshedFirst = await DocumentPrefix.findById(first._id).lean();
    expect(refreshedFirst!.isDefault).toBe(false);
    expect(second.isDefault).toBe(true);

    const defaults = await DocumentPrefix.find({ tenantId: "t1", documentType: "invoice", kind: "prefix", isDefault: true }).lean();
    expect(defaults).toHaveLength(1);
  });

  it("does not make a second prefix default unless explicitly requested", async () => {
    await createPrefix({ tenantId: "t1", documentType: "invoice", value: "INV-" });
    const second = await createPrefix({ tenantId: "t1", documentType: "invoice", value: "TAX-" });
    expect(second.isDefault).toBe(false);
  });

  it("setAsDefault flips the default flag and unsets all others", async () => {
    const first = await createPrefix({ tenantId: "t1", documentType: "invoice", value: "INV-" });
    const second = await createPrefix({ tenantId: "t1", documentType: "invoice", value: "TAX-" });

    await setAsDefault("t1", String(second._id));

    const refreshedFirst = await DocumentPrefix.findById(first._id).lean();
    const refreshedSecond = await DocumentPrefix.findById(second._id).lean();
    expect(refreshedFirst!.isDefault).toBe(false);
    expect(refreshedSecond!.isDefault).toBe(true);
  });

  it("promoteFallbackDefault picks the oldest remaining row after the default is deleted", async () => {
    const first = await createPrefix({ tenantId: "t1", documentType: "invoice", value: "INV-" });
    await createPrefix({ tenantId: "t1", documentType: "invoice", value: "TAX-" });
    await DocumentPrefix.findByIdAndDelete(first._id);

    const promoted = await promoteFallbackDefault("t1", "invoice", "prefix");
    expect(promoted!.value).toBe("TAX-");
    expect(promoted!.isDefault).toBe(true);
  });

  it("keeps prefixes and suffixes as independent default sets", async () => {
    const prefix = await createPrefix({ tenantId: "t1", documentType: "invoice", kind: "prefix", value: "INV-" });
    const suffix = await createPrefix({ tenantId: "t1", documentType: "invoice", kind: "suffix", value: "-A" });
    expect(prefix.isDefault).toBe(true);
    expect(suffix.isDefault).toBe(true);
  });

  describe("ensureDefaultPrefixes", () => {
    it("seeds a default PREFIX row for every document type on a brand-new tenant", async () => {
      await ensureDefaultPrefixes("fresh-tenant");
      const rows = await DocumentPrefix.find({ tenantId: "fresh-tenant", kind: "prefix" }).lean();
      expect(rows).toHaveLength(SALES_DOCUMENT_TYPE_VALUES.length);
      expect(rows.every((r) => r.isDefault)).toBe(true);
      const invoiceRow = rows.find((r) => r.documentType === "invoice");
      expect(invoiceRow!.value).toBe("INV-");
    });

    it("is idempotent — running it twice does not create duplicates", async () => {
      await ensureDefaultPrefixes("fresh-tenant-2");
      await ensureDefaultPrefixes("fresh-tenant-2");
      const rows = await DocumentPrefix.find({ tenantId: "fresh-tenant-2", kind: "prefix" }).lean();
      expect(rows).toHaveLength(SALES_DOCUMENT_TYPE_VALUES.length);
    });

    it("does not touch or duplicate a document type that already has a custom prefix", async () => {
      await createPrefix({ tenantId: "t3", documentType: "invoice", value: "CUSTOM-" });
      await ensureDefaultPrefixes("t3");
      const invoiceRows = await DocumentPrefix.find({ tenantId: "t3", documentType: "invoice", kind: "prefix" }).lean();
      expect(invoiceRows).toHaveLength(1);
      expect(invoiceRows[0].value).toBe("CUSTOM-");
      const otherRows = await DocumentPrefix.find({ tenantId: "t3", kind: "prefix" }).lean();
      expect(otherRows).toHaveLength(SALES_DOCUMENT_TYPE_VALUES.length);
    });
  });
});
