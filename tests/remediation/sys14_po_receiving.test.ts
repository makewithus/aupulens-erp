import { describe, expect, it, vi, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";
import { NextRequest } from "next/server";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_remediation_sys14";

vi.mock("@/auth", () => ({ auth: vi.fn() }));

import { auth } from "@/auth";
import Product from "@/models/inventory/Product";
import Stock from "@/models/inventory/Stock";
import StockTransfer from "@/models/inventory/StockTransfer";
import PurchaseOrder from "@/models/finance/PurchaseOrder";
import Customer from "@/models/sales/Customer";
import { DOCUMENT_STATUS } from "@/lib/constants/statuses";
import { getOnHandQuantity } from "@/lib/inventory/stockGuard";
import { invalidateServerCache } from "@/lib/api/serverCache";

const TENANT = "kk-metals-sys14";

function mockSession(tenantId: string, role = "admin") {
  return {
    user: {
      id: new mongoose.Types.ObjectId().toString(),
      email: "rajesh@gmail.com",
      name: "Rajesh",
      role,
      tenantId,
    },
    expires: new Date(Date.now() + 86400000).toISOString(),
  };
}

let poReceivePOST: typeof import("@/app/api/finance/purchase-orders/[id]/receive/route").POST;

describe("SYS-14: Purchase Order Receiving & Stock Movement", () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI!);
    await Product.init();
    await Stock.init();
    await StockTransfer.init();
    await PurchaseOrder.init();
    await Customer.init();

    ({ POST: poReceivePOST } = await import("@/app/api/finance/purchase-orders/[id]/receive/route"));
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  afterEach(async () => {
    invalidateServerCache();
    await Product.deleteMany({});
    await Stock.deleteMany({});
    await StockTransfer.deleteMany({});
    await PurchaseOrder.deleteMany({});
    await Customer.deleteMany({});
    vi.mocked(auth).mockReset();
  });

  it("receives 10 units for a posted purchase order, creates incoming transfer and increases stock by 10", async () => {
    const session = mockSession(TENANT);
    vi.mocked(auth).mockResolvedValue(session as any);
    const userId = new mongoose.Types.ObjectId(session.user.id);

    // 1. Create product: CLOUD-TEST-PRODUCT-001 with 0 initial stock
    const product = await Product.create({
      tenantId: TENANT,
      header: { name: "CLOUD-TEST-PRODUCT-001" },
      tab_general_information: {
        type: "consu",
        standard_price: 600,
        list_price: 1000,
        default_code: "CLOUD-TEST-PRODUCT-001",
        uom: "units",
      },
      status: "published",
      createdBy: userId,
    });

    const initialStock = await getOnHandQuantity(TENANT, String(product._id));
    expect(initialStock).toBe(0);

    // 2. Create supplier
    const supplier = await Customer.create({
      tenantId: TENANT,
      header: { name: "Steel Raw Vendor" },
      isSupplier: true,
      createdBy: userId,
    });

    // 3. Create posted purchase order PO/2026/0001 with 10 units ordered
    const po = await PurchaseOrder.create({
      tenantId: TENANT,
      name: "PO/2026/0001",
      partnerId: supplier._id,
      dateOrder: new Date(),
      status: DOCUMENT_STATUS.POSTED,
      orderLines: [
        {
          productId: product._id,
          name: "CLOUD-TEST-PRODUCT-001",
          productQty: 10,
          receivedQty: 0,
          billedQty: 0,
          priceUnit: 600,
          taxIds: [],
          priceSubtotal: 6000,
        },
      ],
      totals: { amountUntaxed: 6000, amountTax: 0, amountTotal: 6000 },
      createdBy: userId,
    });

    // 4. Receive 10 units via POST /api/finance/purchase-orders/[id]/receive
    const receivePayload = {
      lines: [
        {
          productId: product._id.toString(),
          receiveQty: 10,
        },
      ],
    };

    const req = new NextRequest(`http://localhost/api/finance/purchase-orders/${po._id}/receive`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(receivePayload),
    });

    const res = await poReceivePOST(req, { params: Promise.resolve({ id: po._id.toString() }) });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.receivedCount).toBe(10);
    expect(data.stockTransfer).toBeDefined();
    expect(data.stockTransfer.header.operationType).toBe("incoming");
    expect(data.stockTransfer.status).toBe(DOCUMENT_STATUS.POSTED);

    // 5. Verify stock on hand is now 10
    const newStock = await getOnHandQuantity(TENANT, String(product._id));
    expect(newStock).toBe(10);

    // 6. Verify PO lines updated
    const updatedPO = await PurchaseOrder.findById(po._id);
    expect(updatedPO?.orderLines[0].receivedQty).toBe(10);
    expect(updatedPO?.stockTransferIds?.length).toBe(1);
  });

  it("supports partial receipts and rejects receiving more than remaining receivable quantity", async () => {
    const session = mockSession(TENANT);
    vi.mocked(auth).mockResolvedValue(session as any);
    const userId = new mongoose.Types.ObjectId(session.user.id);

    const product = await Product.create({
      tenantId: TENANT,
      header: { name: "Metal Bar" },
      tab_general_information: { type: "consu", standard_price: 100 },
      createdBy: userId,
    });

    const supplier = await Customer.create({
      tenantId: TENANT,
      header: { name: "Bar Supplier" },
      isSupplier: true,
      createdBy: userId,
    });

    const po = await PurchaseOrder.create({
      tenantId: TENANT,
      name: "PO/2026/0002",
      partnerId: supplier._id,
      dateOrder: new Date(),
      status: DOCUMENT_STATUS.POSTED,
      orderLines: [
        {
          productId: product._id,
          name: "Metal Bar",
          productQty: 10,
          receivedQty: 0,
          billedQty: 0,
          priceUnit: 100,
          taxIds: [],
          priceSubtotal: 1000,
        },
      ],
      totals: { amountUntaxed: 1000, amountTax: 0, amountTotal: 1000 },
      createdBy: userId,
    });

    // 1. Partial receipt of 6 units
    const req1 = new NextRequest(`http://localhost/api/finance/purchase-orders/${po._id}/receive`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lines: [{ productId: product._id.toString(), receiveQty: 6 }] }),
    });
    const res1 = await poReceivePOST(req1, { params: Promise.resolve({ id: po._id.toString() }) });
    expect(res1.status).toBe(200);
    expect(await getOnHandQuantity(TENANT, String(product._id))).toBe(6);

    // 2. Attempt excess receipt of 5 units (only 4 remaining)
    const req2 = new NextRequest(`http://localhost/api/finance/purchase-orders/${po._id}/receive`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lines: [{ productId: product._id.toString(), receiveQty: 5 }] }),
    });
    const res2 = await poReceivePOST(req2, { params: Promise.resolve({ id: po._id.toString() }) });
    expect(res2.status).toBe(400);
    const errData = await res2.json();
    expect(errData.message).toMatch(/exceeds remaining quantity/i);

    // 3. Receive remaining 4 units
    const req3 = new NextRequest(`http://localhost/api/finance/purchase-orders/${po._id}/receive`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lines: [{ productId: product._id.toString(), receiveQty: 4 }] }),
    });
    const res3 = await poReceivePOST(req3, { params: Promise.resolve({ id: po._id.toString() }) });
    expect(res3.status).toBe(200);
    expect(await getOnHandQuantity(TENANT, String(product._id))).toBe(10);
  });

  it("does not over-receive when two requests compete for the same remaining PO quantity", async () => {
    const session = mockSession(TENANT);
    vi.mocked(auth).mockResolvedValue(session as any);
    const userId = new mongoose.Types.ObjectId(session.user.id);
    const product = await Product.create({
      tenantId: TENANT,
      header: { name: "Concurrent Receipt Product" },
      tab_general_information: { type: "consu", standard_price: 10 },
      createdBy: userId,
    });
    const supplier = await Customer.create({ tenantId: TENANT, header: { name: "Concurrent Receipt Supplier" }, isSupplier: true, createdBy: userId });
    const po = await PurchaseOrder.create({
      tenantId: TENANT,
      name: "PO-CONCURRENT-RECEIPT",
      partnerId: supplier._id,
      dateOrder: new Date(),
      status: DOCUMENT_STATUS.POSTED,
      orderLines: [{ productId: product._id, name: "Concurrent Receipt Product", productQty: 5, receivedQty: 0, priceUnit: 10, priceSubtotal: 50 }],
      totals: { amountUntaxed: 50, amountTax: 0, amountTotal: 50 },
      createdBy: userId,
    });

    const responses = await Promise.all([1, 2].map(() => {
      const req = new NextRequest(`http://localhost/api/finance/purchase-orders/${po._id}/receive`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lines: [{ lineIndex: 0, receiveQty: 4 }] }),
      });
      return poReceivePOST(req, { params: Promise.resolve({ id: po._id.toString() }) });
    }));

    expect(responses.map((response) => response.status).sort()).toEqual([200, 400]);
    expect((await PurchaseOrder.findById(po._id))?.orderLines[0].receivedQty).toBe(4);
    expect(await getOnHandQuantity(TENANT, String(product._id))).toBe(4);
    expect(await StockTransfer.countDocuments({ tenantId: TENANT, "header.operationType": "incoming" })).toBe(1);
  });
});
