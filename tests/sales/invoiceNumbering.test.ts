import { describe, expect, it, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";
import Counter from "@/models/shared/Counter";
import DocumentPrefix from "@/models/sales/DocumentPrefix";
import { getDefaultPrefix, getNextSequence, generateInvoiceNumber } from "@/lib/sales/invoiceNumbering";

describe("invoice numbering", () => {
  beforeAll(async () => {
    await mongoose.connect("mongodb://localhost:27017/aupulens_test_invoice_numbering");
    await Counter.init();
    await DocumentPrefix.init();
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  afterEach(async () => {
    await Counter.deleteMany({});
    await DocumentPrefix.deleteMany({});
  });

  it("falls back to INV- when no default prefix is configured", async () => {
    const prefix = await getDefaultPrefix("t1", "invoice");
    expect(prefix).toBe("INV-");
  });

  it("uses the tenant's configured default prefix", async () => {
    await DocumentPrefix.create({ tenantId: "t1", documentType: "invoice", kind: "prefix", value: "TAX-", isDefault: true });
    const prefix = await getDefaultPrefix("t1", "invoice");
    expect(prefix).toBe("TAX-");
  });

  it("increments sequence numbers atomically per (tenantId, prefix)", async () => {
    const seq1 = await getNextSequence("t1", "INV-");
    const seq2 = await getNextSequence("t1", "INV-");
    const seq3 = await getNextSequence("t1", "INV-");
    expect([seq1, seq2, seq3]).toEqual([1, 2, 3]);
  });

  it("keeps sequences independent per tenant and per prefix", async () => {
    const t1Inv = await getNextSequence("t1", "INV-");
    const t2Inv = await getNextSequence("t2", "INV-");
    const t1Tax = await getNextSequence("t1", "TAX-");
    expect(t1Inv).toBe(1);
    expect(t2Inv).toBe(1);
    expect(t1Tax).toBe(1);
  });

  it("is race-safe under concurrent increments (no duplicate sequence numbers)", async () => {
    const results = await Promise.all(Array.from({ length: 25 }, () => getNextSequence("racer", "INV-")));
    const unique = new Set(results);
    expect(unique.size).toBe(25);
    expect(Math.max(...results)).toBe(25);
  });

  it("generateInvoiceNumber pads the sequence and honors an explicit prefix override", async () => {
    const result = await generateInvoiceNumber("t1", "CUSTOM-");
    expect(result.number).toBe("CUSTOM-0001");
    expect(result.prefix).toBe("CUSTOM-");
  });

  it("generateInvoiceNumber uses the tenant default prefix when none is passed", async () => {
    await DocumentPrefix.create({ tenantId: "t9", documentType: "invoice", kind: "prefix", value: "BILL-", isDefault: true });
    const result = await generateInvoiceNumber("t9");
    expect(result.number).toBe("BILL-0001");
  });
});
