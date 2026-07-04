import { describe, expect, it, vi, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_route_customer_views";

vi.mock("@/auth", () => ({ auth: vi.fn() }));

import { auth } from "@/auth";
import SalesView from "@/models/SalesView";
import Customer from "@/models/Customer";
import { makeRequest, mockSession } from "../accounting/_helpers/routeTestUtils";

const VIEWS_URL = "http://localhost/api/sales/customer-views";
const CUSTOMERS_URL = "http://localhost/api/sales/customers";

let viewsGET: typeof import("@/app/api/sales/customer-views/route").GET;
let viewsPOST: typeof import("@/app/api/sales/customer-views/route").POST;
let customersGET: typeof import("@/app/api/sales/customers/route").GET;

describe("customer views + filtered list", () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI!);
    await SalesView.init();
    await Customer.init();
    ({ GET: viewsGET, POST: viewsPOST } = await import("@/app/api/sales/customer-views/route"));
    ({ GET: customersGET } = await import("@/app/api/sales/customers/route"));
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  afterEach(async () => {
    await SalesView.deleteMany({});
    await Customer.deleteMany({});
    vi.mocked(auth).mockReset();
  });

  it("GET seeds the 9 system views on first call and is idempotent on the second", async () => {
    vi.mocked(auth).mockResolvedValue(mockSession("route-t1"));
    const first = await viewsGET();
    const firstBody = await first.json();
    expect(firstBody.data.filter((v: any) => v.isSystem)).toHaveLength(9);

    const second = await viewsGET();
    const secondBody = await second.json();
    expect(secondBody.data.filter((v: any) => v.isSystem)).toHaveLength(9);
  });

  it("plain GET /customers with no params stays backward compatible ({ items } array of everything)", async () => {
    vi.mocked(auth).mockResolvedValue(mockSession("route-t1"));
    await Customer.create({
      tenantId: "route-t1",
      header: { name: "A", displayName: "A", is_company: true },
      createdBy: new mongoose.Types.ObjectId(),
    });
    const res = await customersGET(makeRequest(CUSTOMERS_URL));
    const body = await res.json();
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.items).toHaveLength(1);
  });

  it("a custom view's criteria actually filters the customers list", async () => {
    vi.mocked(auth).mockResolvedValue(mockSession("route-t1"));
    await Customer.create({
      tenantId: "route-t1",
      header: { name: "Active One", displayName: "Active One", is_company: true },
      isActive: true,
      createdBy: new mongoose.Types.ObjectId(),
    });
    await Customer.create({
      tenantId: "route-t1",
      header: { name: "Inactive One", displayName: "Inactive One", is_company: true },
      isActive: false,
      createdBy: new mongoose.Types.ObjectId(),
    });

    const createRes = await viewsPOST(
      makeRequest(VIEWS_URL, {
        method: "POST",
        body: JSON.stringify({
          name: "My Active Only",
          criteria: [{ field: "isActive", comparator: "equals", value: "true" }],
          columns: [],
        }),
      }),
    );
    const createBody = await createRes.json();
    expect(createRes.status).toBe(201);

    const res = await customersGET(makeRequest(`${CUSTOMERS_URL}?viewId=${createBody.data._id}`));
    const body = await res.json();
    expect(body.items).toHaveLength(1);
    expect(body.items[0].header.displayName).toBe("Active One");
  });
});
