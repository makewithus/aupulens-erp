import { describe, expect, it, vi, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_route_quotes";

vi.mock("@/auth", () => ({ auth: vi.fn() }));

import { auth } from "@/auth";
import SalesQuotation from "@/models/SalesQuotation";
import { SalesInvoice } from "@/models/SalesInvoice";
import Customer from "@/models/Customer";
import Counter from "@/models/Counter";
import { QUOTE_STATUS } from "@/lib/constants/statuses";
import { makeRequest, mockSession } from "../accounting/_helpers/routeTestUtils";

const LIST_URL = "http://localhost/api/sales/quotes";

let listGET: typeof import("@/app/api/sales/quotes/route").GET;
let listPOST: typeof import("@/app/api/sales/quotes/route").POST;
let convertPOST: typeof import("@/app/api/sales/quotes/[id]/convert-to-invoice/route").POST;

async function makeCustomer(tenantId: string) {
  return Customer.create({
    tenantId,
    header: { name: "Test Co", displayName: "Test Co", is_company: true },
    createdBy: new mongoose.Types.ObjectId(),
  });
}

describe("quotes routes", () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI!);
    await SalesQuotation.init();
    ({ GET: listGET, POST: listPOST } = await import("@/app/api/sales/quotes/route"));
    ({ POST: convertPOST } = await import("@/app/api/sales/quotes/[id]/convert-to-invoice/route"));
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  afterEach(async () => {
    await SalesQuotation.deleteMany({});
    await (SalesInvoice as any).deleteMany({});
    await Customer.deleteMany({});
    await Counter.deleteMany({});
    vi.mocked(auth).mockReset();
  });

  it("GET returns 401 without a session", async () => {
    vi.mocked(auth).mockResolvedValue(null as any);
    const res = await listGET(makeRequest(LIST_URL));
    expect(res.status).toBe(401);
  });

  it("POST requires a customer and at least one line item", async () => {
    vi.mocked(auth).mockResolvedValue(mockSession("route-t1"));
    const res = await listPOST(
      makeRequest(LIST_URL, { method: "POST", body: JSON.stringify({ lineItems: [] }) }),
    );
    expect(res.status).toBe(400);
  });

  it("POST computes totals server-side and auto-generates a quote number", async () => {
    vi.mocked(auth).mockResolvedValue(mockSession("route-t1"));
    const customer = await makeCustomer("route-t1");

    const res = await listPOST(
      makeRequest(LIST_URL, {
        method: "POST",
        body: JSON.stringify({
          customerId: customer._id.toString(),
          lineItems: [{ name: "Service", qty: 2, unitPrice: 500, discount: 0, discountMode: "percent", taxRate: 0 }],
        }),
      }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.totalAmount).toBe(1000);
    expect(body.data.quoteNumber).toBeTruthy();
    expect(body.data.status).toBe(QUOTE_STATUS.DRAFT);
  });

  it("GET only returns the requesting tenant's quotes", async () => {
    vi.mocked(auth).mockResolvedValue(mockSession("route-t1"));
    const customer1 = await makeCustomer("route-t1");
    await SalesQuotation.create({
      tenantId: "route-t1",
      quoteNumber: "QT-0001",
      customerId: customer1._id,
      lineItems: [{ name: "A", qty: 1, unitPrice: 100, discount: 0, discountMode: "percent", taxRate: 0, lineTotal: 100 }],
      totalAmount: 100,
      createdBy: new mongoose.Types.ObjectId(),
    });

    const customer2 = await makeCustomer("route-t2");
    await SalesQuotation.create({
      tenantId: "route-t2",
      quoteNumber: "QT-0002",
      customerId: customer2._id,
      lineItems: [{ name: "B", qty: 1, unitPrice: 200, discount: 0, discountMode: "percent", taxRate: 0, lineTotal: 200 }],
      totalAmount: 200,
      createdBy: new mongoose.Types.ObjectId(),
    });

    const res = await listGET(makeRequest(`${LIST_URL}?status=all`));
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].quoteNumber).toBe("QT-0001");
  });

  it("convert-to-invoice creates a SalesInvoice and marks the quote invoiced", async () => {
    vi.mocked(auth).mockResolvedValue(mockSession("route-t1"));
    const customer = await makeCustomer("route-t1");
    const quote = await SalesQuotation.create({
      tenantId: "route-t1",
      quoteNumber: "QT-0003",
      customerId: customer._id,
      lineItems: [{ name: "A", qty: 1, unitPrice: 1000, discount: 0, discountMode: "percent", taxRate: 0, lineTotal: 1000 }],
      taxableAmount: 1000,
      totalAmount: 1000,
      createdBy: new mongoose.Types.ObjectId(),
    });

    const res = await convertPOST(makeRequest("http://localhost/x", { method: "POST" }), {
      params: Promise.resolve({ id: quote._id.toString() }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.invoice.totalAmount).toBe(1000);

    const updatedQuote = await SalesQuotation.findById(quote._id).lean();
    expect((updatedQuote as any)?.status).toBe(QUOTE_STATUS.INVOICED);
    expect((updatedQuote as any)?.convertedInvoiceId).toBeTruthy();

    // Converting a second time should be rejected, not silently double-invoice.
    const secondRes = await convertPOST(makeRequest("http://localhost/x", { method: "POST" }), {
      params: Promise.resolve({ id: quote._id.toString() }),
    });
    expect(secondRes.status).toBe(409);
  });
});
