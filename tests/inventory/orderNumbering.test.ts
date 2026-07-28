import { describe, expect, it, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";
import Counter from "@/models/Counter";
import { generateInventoryOrderNumber } from "@/lib/inventory/orderNumbering";

const tenantId = "t-inventory-order-numbering";

// Issue #9: Inventory Order creation required the user to type a made-up
// order number by hand. This covers the auto-numbering fix.
describe("generateInventoryOrderNumber", () => {
  beforeAll(async () => {
    await mongoose.connect("mongodb://localhost:27017/aupulens_test_inventory_order_numbering");
    await Counter.init();
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  afterEach(async () => {
    await Counter.deleteMany({ tenantId });
  });

  it("generates a sequential ORD-#### number per tenant", async () => {
    const first = await generateInventoryOrderNumber(tenantId);
    const second = await generateInventoryOrderNumber(tenantId);
    expect(first).toBe("ORD-0001");
    expect(second).toBe("ORD-0002");
  });

  it("keeps separate sequences per tenant", async () => {
    const a = await generateInventoryOrderNumber(tenantId);
    const b = await generateInventoryOrderNumber("t-other-tenant");
    expect(a).toBe("ORD-0001");
    expect(b).toBe("ORD-0001");
    await Counter.deleteMany({ tenantId: "t-other-tenant" });
  });

  it("is race-safe under concurrent calls (no duplicate numbers)", async () => {
    const results = await Promise.all(
      Array.from({ length: 10 }, () => generateInventoryOrderNumber(tenantId)),
    );
    expect(new Set(results).size).toBe(10);
  });
});
