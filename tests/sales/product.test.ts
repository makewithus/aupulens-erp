import { describe, expect, it, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";
import Product from "@/models/inventory/Product";

// Regression coverage for the test-team "Publish Product returns Internal
// Server Error" bug: the model previously reused the shared DOCUMENT_STATUS
// enum (draft/pending_approval/approved/posted/...), which has no
// "published" value, so every publish attempt failed Mongoose validation.
describe("Product model status", () => {
  beforeAll(async () => {
    await mongoose.connect("mongodb://localhost:27017/aupulens_test_product");
    await (Product as any).init();
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  afterEach(async () => {
    await (Product as any).deleteMany({});
  });

  const baseDoc = (overrides: Partial<Record<string, any>> = {}) => ({
    tenantId: "t1",
    header: { name: "Widget", sale_ok: true, purchase_ok: true },
    tab_general_information: { type: "consu", list_price: 100, standard_price: 50 },
    createdBy: new mongoose.Types.ObjectId(),
    ...overrides,
  });

  it("defaults to draft", async () => {
    const doc = await (Product as any).create(baseDoc());
    expect(doc.status).toBe("draft");
  });

  it("accepts published as a real status", async () => {
    const doc = await (Product as any).create(baseDoc({ status: "published" }));
    expect(doc.status).toBe("published");
  });

  it("rejects a DOCUMENT_STATUS-style value that isn't a real product status", async () => {
    await expect((Product as any).create(baseDoc({ status: "approved" }))).rejects.toThrow();
  });

  it("allows publishing a draft product via update", async () => {
    const doc = await (Product as any).create(baseDoc());
    doc.status = "published";
    await expect(doc.save()).resolves.not.toThrow();
  });
});
