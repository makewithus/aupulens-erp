/**
 * AI context sanitizer — prevents internal identifiers (Mongo ObjectIds,
 * partnerId/customerId/etc.) from leaking into AI prompts and therefore into
 * user-facing answers (the reported "partnerId: 6a4a9081…" garbage).
 */
import { describe, it, expect } from "vitest";
import { sanitizeForAi, safeContextJson } from "@/lib/ai/sanitizeContext";

describe("sanitizeForAi", () => {
  it("drops id-like keys (_id, partnerId, anything ending in Id/_id)", () => {
    const out: any = sanitizeForAi({
      _id: "6a4a9081680241bc79f8f4de",
      partnerId: "6a215dc202e80e4219f412c0",
      customerId: "x",
      opportunity_id: "y",
      receivableAccountId: "z",
      name: "Acme Server Rack",
      amount: 5000,
    });
    expect(out._id).toBeUndefined();
    expect(out.partnerId).toBeUndefined();
    expect(out.customerId).toBeUndefined();
    expect(out.opportunity_id).toBeUndefined();
    expect(out.receivableAccountId).toBeUndefined();
    expect(out.name).toBe("Acme Server Rack");
    expect(out.amount).toBe(5000);
  });

  it("drops bare ObjectId-looking string values anywhere", () => {
    const out: any = sanitizeForAi({ ref: "6a4a9081680241bc79f8f4de", note: "real note" });
    expect(out.ref).toBeUndefined();
    expect(out.note).toBe("real note");
  });

  it("caps array length and recurses into nested records", () => {
    const orders = Array.from({ length: 50 }, (_, i) => ({ _id: "6a4a9081680241bc79f8f4de", number: `SO-${i}`, amount: i }));
    const out: any = sanitizeForAi({ summary: { total: 50 }, orders }, { maxArray: 6 });
    expect(out.orders.length).toBe(6);
    expect(out.orders[0]._id).toBeUndefined();
    expect(out.orders[0].number).toBe("SO-0");
    expect(out.summary.total).toBe(50);
  });

  it("safeContextJson never contains a 24-hex ObjectId", () => {
    const json = safeContextJson({ recent: [{ _id: "6a4a9081680241bc79f8f4de", partnerId: "6a215dc202e80e4219f412c0", name: "X" }], summary: { totalOrders: 3 } });
    expect(/[a-f0-9]{24}/i.test(json)).toBe(false);
    expect(json).toContain("totalOrders");
    expect(json).toContain("X");
  });

  it("preserves primitives and plain nested structure", () => {
    const out = sanitizeForAi({ summary: { totalRevenue: 12345, currency: "INR", flags: { paid: true } } });
    expect(out).toEqual({ summary: { totalRevenue: 12345, currency: "INR", flags: { paid: true } } });
  });
});
