import { describe, expect, it, vi, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";
import { NextRequest } from "next/server";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_remediation_sys02";

vi.mock("@/auth", () => ({ auth: vi.fn() }));

import { auth } from "@/auth";
import Product from "@/models/inventory/Product";
import Stock from "@/models/inventory/Stock";
import StockTransfer from "@/models/inventory/StockTransfer";
import SaleOrder from "@/models/sales/SaleOrder";
import DeliveryChallan from "@/models/sales/DeliveryChallan";
import Customer from "@/models/sales/Customer";
import JournalEntry from "@/models/finance/JournalEntry";
import Account from "@/models/finance/Account";
import { DOCUMENT_STATUS, SALES_ORDER_STATUS, SALES_ORDER_SHIPMENT_STATUS } from "@/lib/constants/statuses";
import { getOnHandQuantity } from "@/lib/inventory/stockGuard";
import * as inventoryAccounting from "@/lib/accounting/inventory";
import { invalidateServerCache } from "@/lib/api/serverCache";

const TENANT = "kk-metals-sys02";

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

let soPATCH: typeof import("@/app/api/sales/sales-orders/[id]/route").PATCH;

describe("SYS-02: Sales Order Shipment, Stock Deduction & COGS Posting", () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI!);
    await Product.init();
    await Stock.init();
    await StockTransfer.init();
    await SaleOrder.init();
    await DeliveryChallan.init();
    await Customer.init();
    await JournalEntry.init();
    await Account.init();

    ({ PATCH: soPATCH } = await import("@/app/api/sales/sales-orders/[id]/route"));
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
    await SaleOrder.deleteMany({});
    await DeliveryChallan.deleteMany({});
    await Customer.deleteMany({});
    await JournalEntry.deleteMany({});
    await Account.deleteMany({});
    vi.mocked(auth).mockReset();
  });

  it("rejects shipment when stock is insufficient (0 on hand for 5 units)", async () => {
    const session = mockSession(TENANT);
    vi.mocked(auth).mockResolvedValue(session as any);
    const userId = new mongoose.Types.ObjectId(session.user.id);

    // Create product: CLOUD-TEST-PRODUCT-001 with 0 on-hand stock
    const product = await Product.create({
      tenantId: TENANT,
      header: { name: "CLOUD-TEST-PRODUCT-001" },
      tab_general_information: {
        type: "consu",
        standard_price: 600,
        list_price: 1000,
        default_code: "CLOUD-TEST-PRODUCT-001",
      },
      allowNegativeStock: false,
      status: "published",
      createdBy: userId,
    });

    const customer = await Customer.create({
      tenantId: TENANT,
      header: { name: "KK Metals Customer" },
      createdBy: userId,
    });

    const so = await SaleOrder.create({
      tenantId: TENANT,
      header: {
        name: "SO-000001",
        partnerId: customer._id,
        dateOrder: new Date(),
      },
      orderLines: [
        {
          productId: product._id,
          name: "CLOUD-TEST-PRODUCT-001",
          productQty: 5,
          priceUnit: 1000,
          priceSubtotal: 5000,
        },
      ],
      totals: { amountUntaxed: 5000, amountTax: 900, amountTotal: 5900 },
      status: DOCUMENT_STATUS.POSTED,
      salesOrderStatus: SALES_ORDER_STATUS.CONFIRMED,
      shipmentStatus: SALES_ORDER_SHIPMENT_STATUS.NOT_SHIPPED,
      createdBy: userId,
    });

    // Attempt to mark as shipped when on-hand is 0
    const req = new NextRequest(`http://localhost/api/sales/sales-orders/${so._id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shipmentStatus: "shipped" }),
    });

    const res = await soPATCH(req, { params: Promise.resolve({ id: so._id.toString() }) });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.message).toMatch(/Insufficient stock/i);

    // Verify order was NOT marked as shipped
    const freshSO = await SaleOrder.findById(so._id);
    expect(freshSO?.shipmentStatus).toBe(SALES_ORDER_SHIPMENT_STATUS.NOT_SHIPPED);
    expect(freshSO?.deliveryChallanId).toBeUndefined();
  });

  it("successfully ships when stock is available: creates Delivery, stock move, and COGS journal", async () => {
    const session = mockSession(TENANT);
    vi.mocked(auth).mockResolvedValue(session as any);
    const userId = new mongoose.Types.ObjectId(session.user.id);

    // Accounts for COGS: 5100 COGS, 1300 Inventory Valuation
    await Account.create({
      tenantId: TENANT,
      code: "5100",
      name: "Cost of Goods Sold",
      account_type: "expense_direct_cost",
      internal_group: "expense",
      isActive: true,
      createdBy: userId,
    });
    await Account.create({
      tenantId: TENANT,
      code: "1300",
      name: "Inventory Valuation",
      account_type: "asset_current",
      internal_group: "asset",
      isActive: true,
      createdBy: userId,
    });

    const product = await Product.create({
      tenantId: TENANT,
      header: { name: "CLOUD-TEST-PRODUCT-001" },
      tab_general_information: {
        type: "consu",
        standard_price: 600,
        list_price: 1000,
        default_code: "CLOUD-TEST-PRODUCT-001",
      },
      status: "published",
      createdBy: userId,
    });

    // Provide 10 legitimate units in stock ledger
    await Stock.create({
      tenantId: TENANT,
      product: product._id,
      quantity: 10,
      type: "in",
      reference: "PO-GRN-001",
      createdBy: userId,
    });

    expect(await getOnHandQuantity(TENANT, String(product._id))).toBe(10);

    const customer = await Customer.create({
      tenantId: TENANT,
      header: { name: "KK Metals Customer" },
      createdBy: userId,
    });

    const so = await SaleOrder.create({
      tenantId: TENANT,
      header: {
        name: "SO-000001",
        partnerId: customer._id,
        dateOrder: new Date(),
      },
      orderLines: [
        {
          productId: product._id,
          name: "CLOUD-TEST-PRODUCT-001",
          productQty: 5,
          priceUnit: 1000,
          priceSubtotal: 5000,
        },
      ],
      totals: { amountUntaxed: 5000, amountTax: 900, amountTotal: 5900 },
      status: DOCUMENT_STATUS.POSTED,
      salesOrderStatus: SALES_ORDER_STATUS.CONFIRMED,
      shipmentStatus: SALES_ORDER_SHIPMENT_STATUS.NOT_SHIPPED,
      createdBy: userId,
    });

    // Mark as shipped
    const req = new NextRequest(`http://localhost/api/sales/sales-orders/${so._id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shipmentStatus: "shipped" }),
    });

    const res = await soPATCH(req, { params: Promise.resolve({ id: so._id.toString() }) });
    expect(res.status).toBe(200);

    // 1. Delivery Challan created
    const dc = await DeliveryChallan.findOne({ tenantId: TENANT, status: "delivered" });
    expect(dc).toBeDefined();
    expect(dc?.items[0].quantity).toBe(5);

    // 2. Outgoing Stock Transfer created
    const transfer = await StockTransfer.findOne({ tenantId: TENANT, "header.operationType": "outgoing" });
    expect(transfer).toBeDefined();
    expect(transfer?.status).toBe(DOCUMENT_STATUS.POSTED);

    // 3. Stock reduced by 5 units: on hand drops from 10 to 5
    const remainingStock = await getOnHandQuantity(TENANT, String(product._id));
    expect(remainingStock).toBe(5);

    // 4. COGS journal entry posted: 5 units @ ₹600 = ₹3,000
    const cogsJournal = await JournalEntry.findOne({
      tenantId: TENANT,
      "header.ref": "SO-000001/COGS",
    });
    expect(cogsJournal).toBeDefined();
    const lines = cogsJournal?.lineIds || (cogsJournal as any)?.lines || [];
    const debitCOGS = lines.find((l: any) => l.debit === 3000);
    const creditInv = lines.find((l: any) => l.credit === 3000);
    expect(debitCOGS).toBeDefined();
    expect(creditInv).toBeDefined();

    // 5. Order updated
    const updatedSO = await SaleOrder.findById(so._id);
    expect(updatedSO?.shipmentStatus).toBe(SALES_ORDER_SHIPMENT_STATUS.SHIPPED);
    expect(updatedSO?.salesOrderStatus).toBe(SALES_ORDER_STATUS.CLOSED);
    expect(updatedSO?.deliveryChallanId?.toString()).toBe(dc?._id.toString());

    // A repeated shipment request is idempotent and creates no second set of effects.
    const retryReq = new NextRequest(`http://localhost/api/sales/sales-orders/${so._id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shipmentStatus: "shipped" }),
    });
    const retryRes = await soPATCH(retryReq, { params: Promise.resolve({ id: so._id.toString() }) });
    expect(retryRes.status).toBe(200);
    expect(await DeliveryChallan.countDocuments({ tenantId: TENANT })).toBe(1);
    expect(await StockTransfer.countDocuments({ tenantId: TENANT, "header.operationType": "outgoing" })).toBe(1);
    expect(await Stock.countDocuments({ tenantId: TENANT, type: "out", reference: "SO-000001" })).toBe(1);
    expect(await JournalEntry.countDocuments({ tenantId: TENANT, "header.ref": "SO-000001/COGS" })).toBe(1);
  });

  it("rolls back delivery, stock, and order state when COGS posting fails", async () => {
    const session = mockSession(TENANT);
    vi.mocked(auth).mockResolvedValue(session as any);
    const userId = new mongoose.Types.ObjectId(session.user.id);
    const product = await Product.create({
      tenantId: TENANT,
      header: { name: "Rollback Product" },
      tab_general_information: { type: "consu", standard_price: 100, list_price: 200 },
      createdBy: userId,
    });
    await Stock.create({ tenantId: TENANT, product: product._id, quantity: 4, type: "in", reference: "OPENING" });
    const customer = await Customer.create({ tenantId: TENANT, header: { name: "Rollback Customer" }, createdBy: userId });
    const order = await SaleOrder.create({
      tenantId: TENANT,
      header: { name: "SO-ROLLBACK", partnerId: customer._id },
      orderLines: [{ productId: product._id, name: "Rollback Product", productQty: 2, priceUnit: 200, priceSubtotal: 400 }],
      salesOrderStatus: SALES_ORDER_STATUS.CONFIRMED,
      shipmentStatus: SALES_ORDER_SHIPMENT_STATUS.NOT_SHIPPED,
      createdBy: userId,
    });
    const cogsSpy = vi.spyOn(inventoryAccounting, "postStockMoveAccounting").mockRejectedValueOnce(new Error("synthetic COGS failure"));

    try {
      const req = new NextRequest(`http://localhost/api/sales/sales-orders/${order._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shipmentStatus: "shipped" }),
      });
      const res = await soPATCH(req, { params: Promise.resolve({ id: order._id.toString() }) });
      expect(res.status).toBe(500);
      expect((await SaleOrder.findById(order._id))?.shipmentStatus).toBe(SALES_ORDER_SHIPMENT_STATUS.NOT_SHIPPED);
      expect(await DeliveryChallan.countDocuments({ tenantId: TENANT })).toBe(0);
      expect(await StockTransfer.countDocuments({ tenantId: TENANT, "header.operationType": "outgoing" })).toBe(0);
      expect(await Stock.countDocuments({ tenantId: TENANT, type: "out" })).toBe(0);
      expect(await getOnHandQuantity(TENANT, String(product._id))).toBe(4);
    } finally {
      cogsSpy.mockRestore();
    }
  });

  it("serializes concurrent shipments competing for the same product stock", async () => {
    const session = mockSession(TENANT);
    vi.mocked(auth).mockResolvedValue(session as any);
    const userId = new mongoose.Types.ObjectId(session.user.id);
    const product = await Product.create({
      tenantId: TENANT,
      header: { name: "Contended Product" },
      tab_general_information: { type: "consu", standard_price: 10, list_price: 20 },
      createdBy: userId,
    });
    await Stock.create({ tenantId: TENANT, product: product._id, quantity: 5, type: "in", reference: "OPENING" });
    const customer = await Customer.create({ tenantId: TENANT, header: { name: "Contended Customer" }, createdBy: userId });
    const orders = await SaleOrder.create([
      {
        tenantId: TENANT,
        header: { name: "SO-CONTENDED-1", partnerId: customer._id },
        orderLines: [{ productId: product._id, name: "Contended Product", productQty: 4, priceUnit: 20, priceSubtotal: 80 }],
        salesOrderStatus: SALES_ORDER_STATUS.CONFIRMED,
        shipmentStatus: SALES_ORDER_SHIPMENT_STATUS.NOT_SHIPPED,
        createdBy: userId,
      },
      {
        tenantId: TENANT,
        header: { name: "SO-CONTENDED-2", partnerId: customer._id },
        orderLines: [{ productId: product._id, name: "Contended Product", productQty: 4, priceUnit: 20, priceSubtotal: 80 }],
        salesOrderStatus: SALES_ORDER_STATUS.CONFIRMED,
        shipmentStatus: SALES_ORDER_SHIPMENT_STATUS.NOT_SHIPPED,
        createdBy: userId,
      },
    ]);

    const responses = await Promise.all(orders.map((order) => {
      const req = new NextRequest(`http://localhost/api/sales/sales-orders/${order._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shipmentStatus: "shipped" }),
      });
      return soPATCH(req, { params: Promise.resolve({ id: order._id.toString() }) });
    }));

    expect(responses.map((response) => response.status).sort()).toEqual([200, 400]);
    expect(await getOnHandQuantity(TENANT, String(product._id))).toBe(1);
    expect(await DeliveryChallan.countDocuments({ tenantId: TENANT })).toBe(1);
    expect(await Stock.countDocuments({ tenantId: TENANT, type: "out" })).toBe(1);
    expect(await StockTransfer.countDocuments({ tenantId: TENANT, "header.operationType": "outgoing" })).toBe(1);
    expect(await SaleOrder.countDocuments({ tenantId: TENANT, shipmentStatus: SALES_ORDER_SHIPMENT_STATUS.SHIPPED })).toBe(1);
  });
});
