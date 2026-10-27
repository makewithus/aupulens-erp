import { safeInternalErrorMessage } from "@/lib/api/safeInternalErrorMessage";
import { NextRequest, NextResponse } from "next/server";
import { requireTenantId } from "@/lib/auth/requireTenantId";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import ManufacturingOrder from "@/models/manufacturing/ManufacturingOrder";
import BillOfMaterial from "@/models/manufacturing/BillOfMaterial";
import Shipment from "@/models/manufacturing/Shipment";
import { getCachedData, setCachedData } from "@/lib/api/serverCache";

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tenantIdGuard = requireTenantId(session);
    if (tenantIdGuard) return tenantIdGuard;
    const tenantId = (session.user as any).tenantId;

    const isFresh = req.nextUrl.searchParams.get("fresh") === "true";
    const rangeKey = req.nextUrl.searchParams.get("range") || "30d";
    const rangeDays = rangeKey === "7d" ? 7 : rangeKey === "90d" ? 90 : 30;
    const rangeStart = new Date();
    rangeStart.setDate(rangeStart.getDate() - (rangeDays - 1));
    rangeStart.setHours(0, 0, 0, 0);
    const cacheKey = `mfg-analytics-live:${tenantId}:${rangeKey}`;

    if (!isFresh) {
      const cached = getCachedData<any>(cacheKey);
      if (cached) {
        return NextResponse.json(cached);
      }
    }

    await connectDB();

    // 1. Fetch live manufacturing records
    const [
      ordersList,
      totalBomsCount,
      shipmentsList,
      shipmentModesRaw,
    ] = await Promise.all([
      ManufacturingOrder.find({
        tenantId,
        $or: [
          { "header.scheduledDate": { $gte: rangeStart } },
          { "header.scheduledDate": { $exists: false }, createdAt: { $gte: rangeStart } },
          { "header.scheduledDate": null, createdAt: { $gte: rangeStart } },
        ],
      })
        .populate("header.productId", "header.name header.sku")
        .sort({ updatedAt: -1 })
        .lean(),
      BillOfMaterial.countDocuments({ tenantId }),
      Shipment.find({ tenantId, createdAt: { $gte: rangeStart } })
        .select("shipmentType actualDelivery estimatedDelivery createdAt")
        .lean(),
      Shipment.aggregate([
        { $match: { tenantId, createdAt: { $gte: rangeStart } } },
        { $group: { _id: "$shipmentType", count: { $sum: 1 }, totalVal: { $sum: "$totalValue" } } },
      ]),
    ]);

    // 2. Compute Live Operational Metrics
    let finishedQty = 0;
    let inProductionQty = 0;
    let qcPassedQty = 0;
    let qcFailedQty = 0;

    const statusCounts: Record<string, number> = {
      finished: 0,
      in_production: 0,
      qc_pending: 0,
      rework: 0,
      qc_failed: 0,
      qc_passed: 0,
      demand_forecast: 0,
      production_order: 0,
    };

    const dailyOutputMap = new Map<string, { actual: number; target: number; scrap: number }>();

    for (const order of ordersList) {
      const qty = Number(order.header?.quantity) || 0;
      const status = String(order.productionStatus || order.status || "demand_forecast");
      statusCounts[status] = (statusCounts[status] || 0) + 1;

      if (status === "finished" || status === "qc_passed") {
        finishedQty += qty;
      } else if (["in_production", "material_issued", "material_reserved", "production_order"].includes(status)) {
        inProductionQty += qty;
      }
      if (order.qcDetails?.result === "passed") qcPassedQty += qty;
      if (order.qcDetails?.result === "failed") qcFailedQty += qty;

      // Group into dynamic daily execution buckets from actual units
      const orderDate = new Date(order.header?.scheduledDate || order.createdAt);
      const dayKey = orderDate.toISOString().slice(0, 10);
      const currentDay = dailyOutputMap.get(dayKey) || { actual: 0, target: 0, scrap: 0 };
      currentDay.actual += (status === "finished" || status === "qc_passed") ? qty : 0;
      currentDay.target += qty;
      if (status === "rework" || status === "qc_failed") currentDay.scrap += qty;
      dailyOutputMap.set(dayKey, currentDay);
    }

    // Authoritative totals from database
    const finalTotalOutput = finishedQty;
    const finalInProduction = inProductionQty;
    const totalInspectionUnits = qcPassedQty + qcFailedQty;
    const firstPassYield = totalInspectionUnits > 0
      ? Number(((qcPassedQty / totalInspectionUnits) * 100).toFixed(1))
      : null;

    // OEE requires machine runtime and ideal cycle-time readings which these
    // production records do not contain.
    const availabilityRate = null;
    const performanceRate = null;
    const qualityRate = firstPassYield;
    const overallOee = null;

    // Format Daily Output Array directly from live orders
    const dailyOutput = Array.from(dailyOutputMap.entries()).map(([day, val]) => ({
      day,
      actual: val.actual,
      target: val.target,
      scrap: val.scrap,
    })).sort((a, b) => a.day.localeCompare(b.day));

    // 3. Dynamic QC Yield Breakdown from Real Order Statuses
    const passedOrders = statusCounts["qc_passed"] || 0;
    const pendingOrders = statusCounts["qc_pending"] || 0;
    const reworkOrders = (statusCounts["rework"] || 0) + (statusCounts["qc_failed"] || 0);
    const totalQcOrders = passedOrders + pendingOrders + reworkOrders;

    const qcYieldDistribution: Array<{ name: string; value: number; count: number; color: string }> = [];
    if (totalQcOrders > 0) {
      if (passedOrders > 0) {
        qcYieldDistribution.push({
          name: "QC Passed / Accepted",
          value: Math.round((passedOrders / totalQcOrders) * 100),
          count: passedOrders,
          color: "#10b981",
        });
      }
      if (pendingOrders > 0) {
        qcYieldDistribution.push({
          name: "QC Inspection Pending",
          value: Math.round((pendingOrders / totalQcOrders) * 100),
          count: pendingOrders,
          color: "#3b82f6",
        });
      }
      if (reworkOrders > 0) {
        qcYieldDistribution.push({
          name: "QC Rejected / Rework",
          value: Math.round((reworkOrders / totalQcOrders) * 100),
          count: reworkOrders,
          color: "#ef4444",
        });
      }
    }

    // 4. Dynamic Work Center Utilization Mapped to Active Orders
    const workCenters: any[] = [];

    // 5. Dynamic BOM Material Variance from Live BillOfMaterial & Product Models
    // BOM definitions contain planned quantities, but there is no material
    // issue ledger here to calculate actual consumption variance.
    const bomMaterialVariance: any[] = [];

    // 6. Dynamic Freight Logistics Breakdown
    const freightLogistics = shipmentModesRaw.map((s: any) => {
          const modeLabels: Record<string, { name: string; color: string }> = {
            air: { name: "Air Freight", color: "#8b5cf6" },
            sea: { name: "Ocean Container", color: "#06b6d4" },
            road: { name: "Road Freight", color: "#3b82f6" },
            rail: { name: "Express Rail", color: "#f59e0b" },
          };
          const info = modeLabels[s._id] || { name: String(s._id).toUpperCase(), color: "#3b82f6" };
          const pct = shipmentsList.length > 0 ? Math.round((s.count / shipmentsList.length) * 100) : 0;
          return { mode: info.name, shipments: s.count, percentage: pct, color: info.color };
      });

    const comparableShipments = shipmentsList.filter((shipment: any) => shipment.actualDelivery && shipment.estimatedDelivery);
    const onTimeDispatchRate = comparableShipments.length > 0
      ? Number((comparableShipments.filter((shipment: any) => new Date(shipment.actualDelivery).getTime() <= new Date(shipment.estimatedDelivery).getTime()).length / comparableShipments.length * 100).toFixed(1))
      : null;

    const shipmentsByMonth = new Map<string, number>();
    for (const shipment of shipmentsList as any[]) {
      const date = new Date(shipment.createdAt);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      shipmentsByMonth.set(key, (shipmentsByMonth.get(key) || 0) + 1);
    }

    const responsePayload = {
      kpis: {
        overallOee,
        availability: availabilityRate,
        performance: performanceRate,
        qualityRate,
        totalProductionOutput: finalTotalOutput,
        inProductionUnits: finalInProduction,
        onTimeDispatchRate,
        qcFirstPassYield: firstPassYield,
        totalBoms: totalBomsCount,
        totalShipments: shipmentsList.length,
      },
      dailyOutput,
      shipmentsData: Array.from(shipmentsByMonth, ([key, count]) => {
        const [year, month] = key.split("-").map(Number);
        return { _id: { year, month }, count };
      }),
      qcYieldDistribution,
      workCenters,
      bomMaterialVariance,
      freightLogistics,
    };

    setCachedData(cacheKey, responsePayload, 5_000);

    return NextResponse.json(responsePayload);
  } catch (error: any) {
    console.error("Error in manufacturing analytics API:", error);
    return NextResponse.json(
      { error: "Failed to generate dynamic manufacturing analytics", details: safeInternalErrorMessage() },
      { status: 500 }
    );
  }
}
