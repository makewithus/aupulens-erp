import { describe, expect, it, vi, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_route_einvoices";
process.env.ENCRYPTION_KEY = "MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTIzNDU2Nzg5MDE="; // test-only 32-byte base64 key

vi.mock("@/auth", () => ({ auth: vi.fn() }));

import { auth } from "@/auth";
import EInvoice from "@/models/sales/EInvoice";
import EinvoiceGspCredential from "@/models/sales/EinvoiceGspCredential";
import { SalesInvoice } from "@/models/sales/SalesInvoice";
import "@/models/sales/Customer";
import { EINVOICE_STATUS, GSP_CONNECTION_STATUS } from "@/lib/constants/statuses";
import { makeRequest, mockSession } from "../accounting/_helpers/routeTestUtils";

const LIST_URL = "http://localhost/api/sales/e-invoices";
const CONNECT_URL = "http://localhost/api/sales/e-invoices/gsp/connect";
const STATUS_URL = "http://localhost/api/sales/e-invoices/gsp/status";
const DISCONNECT_URL = "http://localhost/api/sales/e-invoices/gsp/disconnect";

let listGET: typeof import("@/app/api/sales/e-invoices/route").GET;
let connectPOST: typeof import("@/app/api/sales/e-invoices/gsp/connect/route").POST;
let statusGET: typeof import("@/app/api/sales/e-invoices/gsp/status/route").GET;
let disconnectPOST: typeof import("@/app/api/sales/e-invoices/gsp/disconnect/route").POST;
let generatePOST: typeof import("@/app/api/sales/e-invoices/[invoiceId]/generate/route").POST;

describe("e-invoices routes", () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI!);
    await EInvoice.init();
    await EinvoiceGspCredential.init();
    ({ GET: listGET } = await import("@/app/api/sales/e-invoices/route"));
    ({ POST: connectPOST } = await import("@/app/api/sales/e-invoices/gsp/connect/route"));
    ({ GET: statusGET } = await import("@/app/api/sales/e-invoices/gsp/status/route"));
    ({ POST: disconnectPOST } = await import("@/app/api/sales/e-invoices/gsp/disconnect/route"));
    ({ POST: generatePOST } = await import("@/app/api/sales/e-invoices/[invoiceId]/generate/route"));
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  afterEach(async () => {
    await EInvoice.deleteMany({});
    await EinvoiceGspCredential.deleteMany({});
    await (SalesInvoice as any).deleteMany({});
    vi.mocked(auth).mockReset();
  });

  it("GET list returns 401 without a session", async () => {
    vi.mocked(auth).mockResolvedValue(null as any);
    const res = await listGET(makeRequest(LIST_URL));
    expect(res.status).toBe(401);
  });

  it("GET list only returns the requesting tenant's e-invoices, filtered by status", async () => {
    vi.mocked(auth).mockResolvedValue(mockSession("route-t1"));
    const invoice = await (SalesInvoice as any).create({
      tenantId: "route-t1",
      number: "INV-0001",
      customerId: new mongoose.Types.ObjectId(),
      taxableAmount: 100,
      totalAmount: 118,
      lineItems: [],
    });

    await EInvoice.create({
      tenantId: "route-t1",
      invoiceId: invoice._id,
      amount: 118,
      status: EINVOICE_STATUS.SUCCESS,
      createdBy: new mongoose.Types.ObjectId(),
    });
    await EInvoice.create({
      tenantId: "route-t2",
      invoiceId: new mongoose.Types.ObjectId(),
      amount: 50,
      status: EINVOICE_STATUS.SUCCESS,
      createdBy: new mongoose.Types.ObjectId(),
    });

    const res = await listGET(makeRequest(`${LIST_URL}?status=all&range=all`));
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].tenantId).toBe("route-t1");

    const pendingRes = await listGET(makeRequest(`${LIST_URL}?status=${EINVOICE_STATUS.PENDING}&range=all`));
    const pendingBody = await pendingRes.json();
    expect(pendingBody.data).toHaveLength(0);
  });

  it("GSP connect encrypts and stores credentials, status reflects connected, disconnect removes them", async () => {
    vi.mocked(auth).mockResolvedValue(mockSession("route-t1"));

    const connectRes = await connectPOST(
      makeRequest(CONNECT_URL, { method: "POST", body: JSON.stringify({ username: "API_USER1", password: "Secret123!" }) }),
    );
    expect(connectRes.status).toBe(200);

    const stored = await EinvoiceGspCredential.findOne({ tenantId: "route-t1" }).lean();
    expect(stored?.status).toBe(GSP_CONNECTION_STATUS.CONNECTED);
    expect(stored?.encryptedPassword).not.toContain("Secret123!");

    const statusRes = await statusGET();
    const statusBody = await statusRes.json();
    expect(statusBody.data.status).toBe(GSP_CONNECTION_STATUS.CONNECTED);

    const disconnectRes = await disconnectPOST();
    expect(disconnectRes.status).toBe(200);
    const afterDisconnect = await EinvoiceGspCredential.findOne({ tenantId: "route-t1" });
    expect(afterDisconnect).toBeNull();
  });

  it("GSP connect rejects a missing password with 400", async () => {
    vi.mocked(auth).mockResolvedValue(mockSession("route-t1"));
    const res = await connectPOST(makeRequest(CONNECT_URL, { method: "POST", body: JSON.stringify({ username: "API_USER1" }) }));
    expect(res.status).toBe(400);
  });

  it("generate requires an active GSP connection", async () => {
    vi.mocked(auth).mockResolvedValue(mockSession("route-t1"));
    const invoice = await (SalesInvoice as any).create({
      tenantId: "route-t1",
      number: "INV-0002",
      customerId: new mongoose.Types.ObjectId(),
      taxableAmount: 100,
      totalAmount: 118,
      lineItems: [],
    });

    const res = await generatePOST(makeRequest(`http://localhost/x`, { method: "POST" }), {
      params: Promise.resolve({ invoiceId: invoice._id.toString() }),
    });
    expect(res.status).toBe(422);
  });

  it("generate creates a success EInvoice record and flags the invoice once GSP is connected", async () => {
    vi.mocked(auth).mockResolvedValue(mockSession("route-t1"));
    await connectPOST(
      makeRequest(CONNECT_URL, { method: "POST", body: JSON.stringify({ username: "API_USER1", password: "Secret123!" }) }),
    );

    const invoice = await (SalesInvoice as any).create({
      tenantId: "route-t1",
      number: "INV-0003",
      customerId: new mongoose.Types.ObjectId(),
      taxableAmount: 100,
      totalAmount: 118,
      lineItems: [],
    });

    const res = await generatePOST(makeRequest(`http://localhost/x`, { method: "POST" }), {
      params: Promise.resolve({ invoiceId: invoice._id.toString() }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.status).toBe(EINVOICE_STATUS.SUCCESS);
    expect(body.data.irn).toBeTruthy();

    const updatedInvoice = await (SalesInvoice as any).findById(invoice._id).lean();
    expect((updatedInvoice as any)?.eInvoice).toBe(true);
  });
});
