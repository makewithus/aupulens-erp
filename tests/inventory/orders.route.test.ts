import { describe, expect, it, vi, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_route_inventory_orders";

vi.mock("@/auth", () => ({ auth: vi.fn() }));

import { auth } from "@/auth";
import InventoryOrder from "@/models/InventoryOrder";
import { makeRequest, mockSession } from "../accounting/_helpers/routeTestUtils";

const URL = "http://localhost/api/inventory/orders";

let POST: typeof import("@/app/api/inventory/orders/route").POST;

function inventorySession(tenantId: string) {
  const s = mockSession(tenantId);
  return { ...s, user: { ...s.user, role: "inventory" } };
}

// Regression test for Issue #5's Inventory Orders complaint ("ORDERS IN
// INVENTORY IS NOT USABLE"): the "New Order" form never collected/sent
// unitPrice, totalPrice, totalAmount, or the correctly-named
// expectedDeliveryDate field, so InventoryOrder.create() always threw a
// Mongoose ValidationError that the route swallowed into a generic 500 with
// no detail — every single order creation attempt failed, live-confirmed
// (0 InventoryOrder documents existed in the database at all before this fix).
describe("Inventory Orders route (Issue #5)", () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI!);
    await InventoryOrder.init();
    ({ POST } = await import("@/app/api/inventory/orders/route"));
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  afterEach(async () => {
    await InventoryOrder.deleteMany({});
    vi.mocked(auth).mockReset();
  });

  const validBody = () => ({
    customerName: "Acme Co",
    customerEmail: "acme@example.com",
    warehouse: "Main Warehouse",
    orderDate: "2026-08-01",
    expectedDeliveryDate: "2026-08-15",
    shippingAddress: "123 Street",
    items: [
      { itemCode: "SKU-1", itemName: "Widget", quantity: 5, fulfilledQuantity: 0, unitPrice: 100, totalPrice: 500 },
    ],
    totalQuantity: 5,
    totalAmount: 500,
  });

  it("creates an order successfully when all required fields (price, totals, expectedDeliveryDate) are present", async () => {
    vi.mocked(auth).mockResolvedValue(inventorySession("route-t1") as any);
    const res = await POST(makeRequest(URL, { method: "POST", body: JSON.stringify(validBody()) }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.order.totalAmount).toBe(500);
    expect(body.order.expectedDeliveryDate).toBeTruthy();
    expect(body.order.orderNumber).toMatch(/^ORD-/);
  });

  it("auto-generates an order number when none is provided", async () => {
    vi.mocked(auth).mockResolvedValue(inventorySession("route-t2") as any);
    const res = await POST(makeRequest(URL, { method: "POST", body: JSON.stringify(validBody()) }));
    const body = await res.json();
    expect(body.order.orderNumber).toBe("ORD-0001");
  });

  it("returns a clear 400 (not a bare 500) with the real validation message when required fields are missing", async () => {
    vi.mocked(auth).mockResolvedValue(inventorySession("route-t3") as any);
    const { expectedDeliveryDate, totalAmount, ...incomplete } = validBody();
    const res = await POST(
      makeRequest(URL, {
        method: "POST",
        body: JSON.stringify({ ...incomplete, items: [{ itemCode: "SKU-1", itemName: "Widget", quantity: 5 }] }),
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/required/i);
  });

  it("rejects a duplicate order number for the same tenant with a clear 409", async () => {
    vi.mocked(auth).mockResolvedValue(inventorySession("route-t4") as any);
    await POST(makeRequest(URL, { method: "POST", body: JSON.stringify({ ...validBody(), orderNumber: "ORD-DUP" }) }));
    const res = await POST(makeRequest(URL, { method: "POST", body: JSON.stringify({ ...validBody(), orderNumber: "ORD-DUP" }) }));
    expect(res.status).toBe(409);
  });
});
