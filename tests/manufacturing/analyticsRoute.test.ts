import { describe, expect, it, vi, beforeAll, afterAll } from "vitest";
import mongoose from "mongoose";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_route_mfg_analytics";

vi.mock("@/auth", () => ({ auth: vi.fn() }));

import { auth } from "@/auth";
import ManufacturingOrder from "@/models/manufacturing/ManufacturingOrder";
import Shipment from "@/models/manufacturing/Shipment";
import Product from "@/models/inventory/Product";
import { NextRequest } from "next/server";
import { mockSession } from "../accounting/_helpers/routeTestUtils";

const TENANT = "mfg-analytics-t1";
let GET: typeof import("@/app/api/manufacturing/analytics/route").GET;

const daysAgo = (n: number, hour = 12) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  d.setUTCHours(hour, 0, 0, 0);
  return d;
};

describe("manufacturing analytics: every figure comes from stored records", () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI!);
    ({ GET } = await import("@/app/api/manufacturing/analytics/route"));

    // Raw insert: the Product schema's required fields (createdBy, product type) are irrelevant to this route.
    const ids = (await Product.collection.insertMany([
      { tenantId: TENANT, header: { name: "Steel Rod", uom: "kg" } },
      { tenantId: TENANT, header: { name: "Bolt", uom: "pcs" } },
      { tenantId: TENANT, header: { name: "Frame" } },
    ])).insertedIds;
    const [steel, bolt, frame] = [{ _id: ids[0] }, { _id: ids[1] }, { _id: ids[2] }];
    const order = (name: string, quantity: number, scheduledDate: Date, productionStatus: string, extra: object = {}) => ({
      tenantId: TENANT, status: "draft", productionStatus, header: { name, productId: frame._id, quantity, scheduledDate }, ...extra,
    });
    await ManufacturingOrder.create([
      order("MO1", 100, daysAgo(5, 9), "finished", {
        finishedAt: daysAgo(5), qcDetails: { result: "passed", inspectedAt: daysAgo(5, 13) },
        components_tab: [{ productId: steel._id, toConsume: 100, consumed: 104 }, { productId: bolt._id, toConsume: 200, consumed: 196 }],
      }),
      order("MO2", 50, daysAgo(8, 9), "finished", { finishedAt: daysAgo(6), qcDetails: { result: "failed", inspectedAt: daysAgo(6, 13) } }),
      order("MO3", 80, daysAgo(2, 9), "in_production"),
      order("MO4", 40, daysAgo(-1, 9), "material_reserved"),
      order("MO5", 60, daysAgo(3, 9), "production_order"),
    ] as any[]);

    const day = (n: number | null) => (n === null ? undefined : daysAgo(n).toISOString().slice(0, 10));
    const ship = (n: string, est: number, act: number | null, status: string) => ({
      tenantId: TENANT, shipmentNumber: n, customerName: "C", origin: "A", destination: "B", freightProvider: "F",
      shipmentType: "road", weight: 1, volume: 1, totalValue: 100, status, estimatedDelivery: day(est), actualDelivery: day(act),
    });
    await Shipment.create([
      ship("S1", 10, 11, "delivered"),   // delivered a day early: on time
      ship("S2", 5, 3, "delivered"),     // delivered 2 days late: late
      ship("S3", 4, null, "in-transit"), // still undelivered past its estimate: late
      ship("S4", -5, null, "in-transit"),// not due yet: ignored
      ship("S5", 6, null, "delivered"),  // delivered, no date recorded: can't be judged, ignored
      ship("S6", 3, null, "cancelled"),  // cancelled: ignored
    ] as any[]);
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  it("derives efficiency, WIP, material variance and dispatch from the records", async () => {
    vi.mocked(auth).mockResolvedValue(mockSession(TENANT));
    const res = await GET(new NextRequest("http://localhost/api/manufacturing/analytics?range=30d&fresh=true"));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.kpis).toMatchObject({
      scheduleAttainment: 51.7,   // 150 finished / 290 planned
      onTimeCompletionRate: 50,   // MO1 on time, MO2 late
      qualityRate: 66.7,          // 100 passed / 150 inspected
      overallEfficiency: 17.2,    // 51.7% x 50% x 66.7%
      totalProductionOutput: 150,
      openOrders: 3,
      wipUnits: 180,
      onTimeDispatchRate: 33.3,   // 1 of 3 judged shipments
    });
    expect(body.kpis.overallOee).toBeNull(); // machine runtime is not recorded; must not be invented
    expect(body.meta).toMatchObject({ dueShipments: 3, onTimeShipments: 1 });

    expect(body.wipStages.map((s: any) => [s.name, s.units, s.load])).toEqual([
      ["In Production", 80, 44], ["Planned", 60, 33], ["Material Reserved", 40, 22],
    ]);
    expect(body.bomMaterialVariance).toEqual([
      { item: "Steel Rod", unit: "kg", planned: 100, actual: 104, variance: "+4.0%", status: "Over plan" },
      { item: "Bolt", unit: "pcs", planned: 200, actual: 196, variance: "-2.0%", status: "Under plan" },
    ]);
  });

  it("returns null ratios, not zero or a made-up value, when a tenant has no records", async () => {
    vi.mocked(auth).mockResolvedValue(mockSession("mfg-analytics-empty"));
    const res = await GET(new NextRequest("http://localhost/api/manufacturing/analytics?range=30d&fresh=true"));
    const { kpis, wipStages, bomMaterialVariance } = await res.json();
    expect(kpis).toMatchObject({ scheduleAttainment: null, onTimeCompletionRate: null, qualityRate: null, overallEfficiency: null, onTimeDispatchRate: null, openOrders: 0, wipUnits: 0 });
    expect(wipStages).toEqual([]);
    expect(bomMaterialVariance).toEqual([]);
  });
});
