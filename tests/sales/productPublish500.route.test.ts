import { describe, expect, it, vi, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_route_product_publish500";

vi.mock("@/auth", () => ({ auth: vi.fn() }));

import { auth } from "@/auth";
import Product from "@/models/Product";
import InventoryItem from "@/models/InventoryItem";
import { makeRequest, mockSession } from "../accounting/_helpers/routeTestUtils";

const LIST_URL = "http://localhost/api/sales/products";

let POST: typeof import("@/app/api/sales/products/route").POST;
let PATCH: typeof import("@/app/api/sales/products/[id]/route").PATCH;

// Regression test for Issue #5: publishing a product left with an
// unselected (empty-string) Income/Expense Account, or a pricelist item
// with no pricelist picked, threw a raw Mongoose CastError ("" can't cast
// to ObjectId) that wasn't caught by the routes' `error.name ===
// "ValidationError"` handling — surfacing as a bare 500 "Internal server
// error" with no explanation, especially on the edit/PATCH path used by
// "Save as Draft" -> later "Publish".
describe("Sales Products routes — no 500 on unset optional account fields (Issue #5)", () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI!);
    await (Product as any).init();
    ({ POST } = await import("@/app/api/sales/products/route"));
    ({ PATCH } = await import("@/app/api/sales/products/[id]/route"));
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  afterEach(async () => {
    await (Product as any).deleteMany({});
    vi.mocked(auth).mockReset();
  });

  it("POST: publishing with an empty-string Income Account succeeds instead of 500ing", async () => {
    vi.mocked(auth).mockResolvedValue(mockSession("route-t1"));
    const res = await POST(
      makeRequest(LIST_URL, {
        method: "POST",
        body: JSON.stringify({
          header: { name: "Widget" },
          status: "published",
          tab_general_information: { type: "consu" },
          tab_accounting: { cost_and_revenue: { property_account_income_id: "" } },
        }),
      }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.product.tab_accounting?.cost_and_revenue?.property_account_income_id).toBeUndefined();

    // Regression: the auto-created InventoryItem used a hardcoded
    // "out_of_stock" (underscore) status that doesn't match the real
    // STOCK_LEVEL_STATUS enum ("out-of-stock", hyphenated), so this silently
    // failed validation every time (swallowed by the route's own inner
    // try/catch) and no stock record was ever created for a new product.
    const invItem = await InventoryItem.findOne({ tenantId: "route-t1", name: "Widget" }).lean();
    expect(invItem).not.toBeNull();
    expect((invItem as any)?.status).toBe("out-of-stock");
  });

  it("PATCH: publishing a draft with an empty-string Expense Account succeeds instead of 500ing", async () => {
    vi.mocked(auth).mockResolvedValue(mockSession("route-t2"));
    const draft = await (Product as any).create({
      tenantId: "route-t2",
      header: { name: "Widget" },
      status: "draft",
      tab_general_information: { type: "consu" },
      createdBy: new mongoose.Types.ObjectId(),
    });

    const res = await PATCH(
      makeRequest(`${LIST_URL}/${draft._id}`, {
        method: "PATCH",
        body: JSON.stringify({
          status: "published",
          tab_accounting: { cost_and_revenue: { property_account_expense_id: "" } },
        }),
      }),
      { params: Promise.resolve({ id: String(draft._id) }) },
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.product.status).toBe("published");
  });

  it("PATCH: a genuinely invalid (non-empty, malformed) ObjectId still returns a clear 400, not a bare 500", async () => {
    vi.mocked(auth).mockResolvedValue(mockSession("route-t3"));
    const draft = await (Product as any).create({
      tenantId: "route-t3",
      header: { name: "Widget" },
      status: "draft",
      tab_general_information: { type: "consu" },
      createdBy: new mongoose.Types.ObjectId(),
    });

    const res = await PATCH(
      makeRequest(`${LIST_URL}/${draft._id}`, {
        method: "PATCH",
        body: JSON.stringify({
          tab_accounting: { cost_and_revenue: { property_account_income_id: "not-a-valid-id" } },
        }),
      }),
      { params: Promise.resolve({ id: String(draft._id) }) },
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/invalid value/i);
  });

  it("POST: an empty-string pricelist_id on a pricelist item is dropped rather than 500ing", async () => {
    vi.mocked(auth).mockResolvedValue(mockSession("route-t4"));
    const res = await POST(
      makeRequest(LIST_URL, {
        method: "POST",
        body: JSON.stringify({
          header: { name: "Widget" },
          status: "published",
          tab_general_information: { type: "consu" },
          tab_prices: { pricelist_item_ids: [{ pricelist_id: "", fixed_price: 10 }] },
        }),
      }),
    );
    expect(res.status).toBe(201);
  });
});
