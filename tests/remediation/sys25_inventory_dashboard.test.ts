import { describe, expect, it, vi, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";
import { NextRequest } from "next/server";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_remediation_sys25";

vi.mock("@/auth", () => ({ auth: vi.fn() }));

import { auth } from "@/auth";
import Product from "@/models/inventory/Product";
import Stock from "@/models/inventory/Stock";
import StockTransfer from "@/models/inventory/StockTransfer";
import ManufacturingOrder from "@/models/manufacturing/ManufacturingOrder";
import { invalidateServerCache } from "@/lib/api/serverCache";

const TENANT = "kk-metals-sys25";

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

let summaryGET: typeof import("@/app/api/inventory/summary/route").GET;
let alertsGET: typeof import("@/app/api/inventory/alerts/route").GET;

describe("SYS-25: Stock-On-Hand, In-Stock Rate & Stock-Out Alerts", () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI!);
    await Product.init();
    await Stock.init();
    await StockTransfer.init();
    await ManufacturingOrder.init();

    ({ GET: summaryGET } = await import("@/app/api/inventory/summary/route"));
    ({ GET: alertsGET } = await import("@/app/api/inventory/alerts/route"));
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
    await ManufacturingOrder.deleteMany({});
    vi.mocked(auth).mockReset();
  });

  it("reports 0% in-stock and generates stock-out alert when a stocked product has zero stock", async () => {
    const session = mockSession(TENANT);
    vi.mocked(auth).mockResolvedValue(session as any);
    const userId = new mongoose.Types.ObjectId(session.user.id);

    // 1. Create a stocked product with 0 stock (no rows in Stock collection)
    await Product.create({
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

    // 2. Call /api/inventory/summary
    const sumRes = await summaryGET();
    expect(sumRes.status).toBe(200);
    const sumData = await sumRes.json();
    const s = sumData.summary;

    expect(s.totalItems.current).toBe(1);
    expect(s.outOfStock.current).toBe(1);
    expect(s.lowStock.current).toBe(1);
    expect(s.inStockRate).toBe(0); // 0% in-stock, NOT 100%!
    expect(s.totalValue.current).toBe(0);

    // 3. Call /api/inventory/alerts
    const alertReq = new NextRequest("http://localhost/api/inventory/alerts");
    const alertRes = await alertsGET(alertReq);
    expect(alertRes.status).toBe(200);
    const alertData = await alertRes.json();

    expect(alertData.kpis.outOfStock).toBe(1);
    expect(alertData.kpis.total).toBe(1);
    expect(alertData.alerts.length).toBe(1);
    expect(alertData.alerts[0].name).toBe("CLOUD-TEST-PRODUCT-001");
    expect(alertData.alerts[0].quantity).toBe(0);
    expect(alertData.alerts[0].status).toBe("out_of_stock");
  });

  it("updates in-stock rate to 100% and resolves stock-out alert when goods are received", async () => {
    invalidateServerCache();
    const session = mockSession(TENANT);
    vi.mocked(auth).mockResolvedValue(session as any);
    const userId = new mongoose.Types.ObjectId(session.user.id);

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

    // Receive 10 units in Stock ledger
    await Stock.create({
      tenantId: TENANT,
      product: product._id,
      quantity: 10,
      type: "in",
      reference: "GRN-001",
      createdBy: userId,
    });

    // Call /api/inventory/summary
    const sumRes = await summaryGET();
    expect(sumRes.status).toBe(200);
    const sumData = await sumRes.json();
    const s = sumData.summary;

    expect(s.totalItems.current).toBe(1);
    expect(s.outOfStock.current).toBe(0);
    expect(s.lowStock.current).toBe(0);
    expect(s.inStockRate).toBe(100); // 100% in-stock now!
    expect(s.totalValue.current).toBe(6000); // 10 units * 600 = 6000
  });
});
