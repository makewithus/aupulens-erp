import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
vi.mock("@/lib/db", () => ({ default: async () => {} }));
import mongoose from "mongoose";
import { randomUUID } from "crypto";
import Organization from "@/models/admin/Organization";
import Customer from "@/models/sales/Customer";
import Product from "@/models/inventory/Product";
import SalesQuotation from "@/models/sales/SalesQuotation";
import { prepareQuoteDraft, confirmQuoteDraft } from "@/lib/ai/quoteDraft";

const tenantId = `unit-qa-${randomUUID().slice(0, 8)}`;
const userId = new mongoose.Types.ObjectId().toString();

let customer: any;
let boxProduct: any;
let kgProduct: any;

beforeAll(async () => {
  await mongoose.connect(`mongodb://127.0.0.1:27017/aupulens_test_quote_unit_${randomUUID().replaceAll("-", "")}`, {
    serverSelectionTimeoutMS: 5000,
  });
  await Organization.init();
  await Customer.init();
  await Product.init();
  await SalesQuotation.init();

  await Organization.create({
    name: "Unit QA Org",
    subdomain: tenantId,
    ownerUserId: userId,
    tier: "enterprise",
    subscriptionStatus: "active",
    settings: { enabledModules: ["sales", "admin"] },
  });

  customer = await Customer.create({
    tenantId,
    createdBy: userId,
    header: { name: "Himalaya Industrial Supply", displayName: "Himalaya Industrial Supply" },
  });

  boxProduct = await Product.create({
    tenantId,
    createdBy: userId,
    header: { name: "Packaging Box Large", sale_ok: true },
    tab_general_information: {
      type: "consu",
      list_price: 250,
      gstRate: 18,
      uom: "box",
      unit: "box",
      allowFractional: false,
    },
  });

  kgProduct = await Product.create({
    tenantId,
    createdBy: userId,
    header: { name: "Stainless Steel Wire", sale_ok: true },
    tab_general_information: {
      type: "consu",
      list_price: 120,
      gstRate: 18,
      uom: "kg",
      unit: "kg",
      allowFractional: true,
    },
  });
});

afterAll(async () => {
  if (mongoose.connection.readyState === 1) {
    await mongoose.connection.dropDatabase();
  }
  await mongoose.disconnect();
});

describe("Priority 6 — Custom Product Unit Precision & Validation", () => {
  const scope = (cid = randomUUID()) => ({ tenantId, userId, role: "sales", conversationId: cid });

  it("preserves product unit in draft preview and displays itemized unit price", async () => {
    const draft = await prepareQuoteDraft(
      scope(),
      "Create a quote for Himalaya Industrial Supply, 5 Packaging Box Large",
      randomUUID()
    );
    expect(draft.message).toContain("Quantity: 5 boxs");
    expect(draft.message).toContain("Unit price: ₹250 per box");
    // 5 * 250 = 1250 subtotal; 18% tax = 225; total = 1475
    expect(draft.message).toContain("Subtotal: ₹1,250");
    expect(draft.message).toContain("Tax: ₹225");
    expect(draft.message).toContain("Total: ₹1,475");
  });

  it("rejects fractional quantity for indivisible products when allowFractional is false", async () => {
    await expect(
      prepareQuoteDraft(
        scope(),
        "Create a quote for Himalaya Industrial Supply, 2.5 Packaging Box Large",
        randomUUID()
      )
    ).rejects.toMatchObject({
      code: "BUSINESS_RULE",
      message: expect.stringMatching(/measured in boxs and requires a whole number quantity/i),
    });
  });

  it("accepts valid fractional quantities for products configured for fractions (e.g. kg)", async () => {
    const draft = await prepareQuoteDraft(
      scope(),
      "Create a quote for Himalaya Industrial Supply, 3.5 Stainless Steel Wire",
      randomUUID()
    );
    // 3.5 * 120 = 420; 18% tax = 75.60; total = 495.60
    expect(draft.message).toContain("Quantity: 3.5 kgs");
    expect(draft.message).toContain("Unit price: ₹120 per kg");
    expect(draft.message).toContain("Subtotal: ₹420");
    expect(draft.message).toContain("Total: ₹495.6");
  });

  it("saves authoritative unit into lineItems upon confirmation", async () => {
    const s = scope();
    const draft = await prepareQuoteDraft(
      s,
      "Create a quote for Himalaya Industrial Supply, 10 Packaging Box Large",
      randomUUID()
    );
    const quote = await confirmQuoteDraft(s, draft.proposalId);
    expect(quote.status).toBe("draft");
    expect(quote.lineItems[0].name).toBe("Packaging Box Large");
    expect(quote.lineItems[0].qty).toBe(10);
    expect(quote.lineItems[0].unit).toBe("box");

    const saved = await SalesQuotation.findById(quote._id).lean();
    expect(saved?.lineItems[0].unit).toBe("box");
  });

  it("revalidates product unit before confirmation and rejects stale draft if unit changes", async () => {
    const s = scope();
    const draft = await prepareQuoteDraft(
      s,
      "Create a quote for Himalaya Industrial Supply, 4 Stainless Steel Wire",
      randomUUID()
    );
    // Simulate admin changing product unit in catalog
    await Product.updateOne({ _id: kgProduct._id }, { $set: { "tab_general_information.unit": "spool", "tab_general_information.uom": "spool" } });

    try {
      await expect(confirmQuoteDraft(s, draft.proposalId)).rejects.toMatchObject({
        code: "PRICE_CHANGED",
      });
    } finally {
      // Revert product unit
      await Product.updateOne({ _id: kgProduct._id }, { $set: { "tab_general_information.unit": "kg", "tab_general_information.uom": "kg" } });
    }
  });

  it("disambiguates query with prefix priority when multiple catalog products match regex", async () => {
    await Product.create({
      tenantId,
      createdBy: userId,
      header: { name: "Office Ergonomic Chair", sale_ok: true },
      tab_general_information: { type: "consu", list_price: 6500, gstRate: 0, unit: "unit" },
    });
    await Product.create({
      tenantId,
      createdBy: userId,
      header: { name: "Ergonomic Office Chair", sale_ok: true },
      tab_general_information: { type: "consu", list_price: 7499, gstRate: 0, unit: "unit" },
    });

    const draft = await prepareQuoteDraft(
      scope(),
      "qoute for 2 ergonomic chiar to himalaya",
      randomUUID()
    );

    expect(draft.line.name).toBe("Ergonomic Office Chair");
    expect(draft.line.qty).toBe(2);
    expect(draft.line.unitPrice).toBe(7499);
    expect(draft.totals.totalAmount).toBe(14998);
    expect(draft.message).toContain("Item: Ergonomic Office Chair");
    expect(draft.message).toContain("Total: ₹14,998");
  });
});

