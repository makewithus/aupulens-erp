import { describe, expect, it, vi, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";
import { NextRequest } from "next/server";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_remediation_sys11";

vi.mock("@/auth", () => ({ auth: vi.fn() }));

import { auth } from "@/auth";
import SaleOrder from "@/models/sales/SaleOrder";
import DeliveryChallan from "@/models/sales/DeliveryChallan";
import Customer from "@/models/sales/Customer";
import { DOCUMENT_STATUS, SALES_ORDER_STATUS, SALES_ORDER_SHIPMENT_STATUS } from "@/lib/constants/statuses";
import { invalidateServerCache } from "@/lib/api/serverCache";

const TENANT = "kk-metals-sys11";

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

let summaryGET: typeof import("@/app/api/sales/summary/route").GET;

describe("SYS-11: Deliveries Pending Calculation in Sales Summary", () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI!);
    await SaleOrder.init();
    await DeliveryChallan.init();
    await Customer.init();

    ({ GET: summaryGET } = await import("@/app/api/sales/summary/route"));
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  afterEach(async () => {
    invalidateServerCache();
    await SaleOrder.deleteMany({});
    await DeliveryChallan.deleteMany({});
    await Customer.deleteMany({});
    vi.mocked(auth).mockReset();
  });

  it("reports 1 Deliveries Pending when a sales order is awaiting shipment, and 0 after shipment", async () => {
    const session = mockSession(TENANT);
    vi.mocked(auth).mockResolvedValue(session as any);
    const userId = new mongoose.Types.ObjectId(session.user.id);

    const customer = await Customer.create({
      tenantId: TENANT,
      header: { name: "Pending Delivery Customer" },
      createdBy: userId,
    });

    // 1. Create an unshipped sales order
    const so = await SaleOrder.create({
      tenantId: TENANT,
      header: {
        name: "SO-PENDING-001",
        partnerId: customer._id,
        dateOrder: new Date(),
      },
      orderLines: [
        {
          name: "Item A",
          productQty: 2,
          priceUnit: 500,
          priceSubtotal: 1000,
        },
      ],
      totals: { amountUntaxed: 1000, amountTax: 0, amountTotal: 1000 },
      status: DOCUMENT_STATUS.POSTED,
      salesOrderStatus: SALES_ORDER_STATUS.CONFIRMED,
      shipmentStatus: SALES_ORDER_SHIPMENT_STATUS.NOT_SHIPPED,
      createdBy: userId,
    });

    // Cross-tenant unshipped order should NOT affect this tenant
    await SaleOrder.create({
      tenantId: "other-tenant",
      header: { name: "SO-FOREIGN-001", partnerId: customer._id, dateOrder: new Date() },
      status: DOCUMENT_STATUS.POSTED,
      shipmentStatus: SALES_ORDER_SHIPMENT_STATUS.NOT_SHIPPED,
      createdBy: userId,
    });

    // Query sales summary
    const res1 = await summaryGET();
    expect(res1.status).toBe(200);
    const data1 = await res1.json();
    expect(data1.deliveriesPending).toBe(1);

    // Invalidate cache before the second read
    invalidateServerCache();

    // 2. Mark order as shipped
    await SaleOrder.updateOne(
      { _id: so._id },
      {
        shipmentStatus: SALES_ORDER_SHIPMENT_STATUS.SHIPPED,
        salesOrderStatus: SALES_ORDER_STATUS.CLOSED,
      }
    );

    // Query sales summary again
    const res2 = await summaryGET();
    expect(res2.status).toBe(200);
    const data2 = await res2.json();
    expect(data2.deliveriesPending).toBe(0);
  });
});
