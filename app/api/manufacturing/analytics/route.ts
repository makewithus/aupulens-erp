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
    const rangeEnd = new Date();
    const rangeStart = new Date(rangeEnd);
    rangeStart.setUTCDate(rangeStart.getUTCDate() - (rangeDays - 1));
    rangeStart.setUTCHours(0, 0, 0, 0);
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
      currentProductionList,
      totalBomsCount,
      shipmentsList,
      shipmentModesRaw,
    ] = await Promise.all([
      ManufacturingOrder.find({
        tenantId,
        $or: [
          { "header.scheduledDate": { $gte: rangeStart, $lte: rangeEnd } },
          { "header.scheduledDate": { $exists: false }, createdAt: { $gte: rangeStart, $lte: rangeEnd } },
          { "header.scheduledDate": null, createdAt: { $gte: rangeStart, $lte: rangeEnd } },
          { finishedAt: { $gte: rangeStart, $lte: rangeEnd } },
          { "qcDetails.inspectedAt": { $gte: rangeStart, $lte: rangeEnd } },
        ],
      })
        .populate("header.productId", "header.name header.sku")
        .sort({ updatedAt: -1 })
        .lean(),
      ManufacturingOrder.find({
        tenantId,
        $or: [
          { productionStatus: { $in: ["material_reserved", "material_issued", "in_production"] } },
          { status: "in_progress", productionStatus: { $exists: false } },
        ],
      }).select("header.quantity").lean(),
      BillOfMaterial.countDocuments({ tenantId }),
      Shipment.find({ tenantId, createdAt: { $gte: rangeStart, $lte: rangeEnd } })
        .select("shipmentType actualDelivery estimatedDelivery createdAt")
        .lean(),
      Shipment.aggregate([
        { $match: { tenantId, createdAt: { $gte: rangeStart, $lte: rangeEnd } } },
        { $group: { _id: "$shipmentType", count: { $sum: 1 }, totalVal: { $sum: "$totalValue" } } },
      ]),
    ]);

    // 2. Compute Live Operational Metrics
    let finishedQty = 0;
    let qcPassedQty = 0;
    let qcFailedQty = 0;
    let qcPassedOrders = 0;
    let qcFailedOrders = 0;
    const dailyOutputMap = new Map<string, { actual: number; target: number; scrap: number }>();
    for (let day = new Date(rangeStart); day <= rangeEnd; day.setUTCDate(day.getUTCDate() + 1)) {
      const dayKey = day.toISOString().slice(0, 10);
      dailyOutputMap.set(dayKey, { actual: 0, target: 0, scrap: 0 });
    }

    const isInRange = (value: Date | string | undefined) => {
      if (!value) return false;
      const date = new Date(value);
      return Number.isFinite(date.getTime()) && date >= rangeStart && date <= rangeEnd;
    };
    const legacyStatusMap: Record<string, string> = {
      done: "finished",
      in_progress: "in_production",
      to_close: "qc_pending",
      draft: "production_order",
      confirmed: "production_order",
    };

    for (const order of ordersList) {
      const qty = Number(order.header?.quantity) || 0;
      const status = String(order.productionStatus || legacyStatusMap[order.status] || "demand_forecast");
      const scheduledDate = order.header?.scheduledDate || order.createdAt;
      const completionDate = order.finishedAt || (status === "finished" ? order.updatedAt : undefined);
      const inspectionDate = order.qcDetails?.inspectedAt || (order.qcDetails?.result ? order.updatedAt : undefined);

      if (isInRange(scheduledDate) && status !== "cancelled") {
        const dayKey = new Date(scheduledDate).toISOString().slice(0, 10);
        const currentDay = dailyOutputMap.get(dayKey);
        if (currentDay) currentDay.target += qty;
      }

      if (status === "finished" && isInRange(completionDate)) {
        finishedQty += qty;
        const dayKey = new Date(completionDate!).toISOString().slice(0, 10);
        const currentDay = dailyOutputMap.get(dayKey);
        if (currentDay) currentDay.actual += qty;
      }

      if (isInRange(inspectionDate) && order.qcDetails?.result === "passed") {
        qcPassedQty += qty;
        qcPassedOrders += 1;
      }
      if (isInRange(inspectionDate) && order.qcDetails?.result === "failed") {
        qcFailedQty += qty;
        qcFailedOrders += 1;
        const dayKey = new Date(inspectionDate!).toISOString().slice(0, 10);
        const currentDay = dailyOutputMap.get(dayKey);
        if (currentDay) currentDay.scrap += qty;
      }
    }
    const inProductionQty = (currentProductionList as any[]).reduce((sum, order: any) => sum + (Number(order.header?.quantity) || 0), 0);

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
    const totalQcOrders = qcPassedOrders + qcFailedOrders;

    const qcYieldDistribution: Array<{ name: string; value: number; count: number; color: string }> = [];
    if (totalQcOrders > 0) {
      if (qcPassedOrders > 0) {
        qcYieldDistribution.push({
          name: "QC Passed",
          value: Math.round((qcPassedOrders / totalQcOrders) * 100),
          count: qcPassedOrders,
          color: "#10b981",
        });
      }
      if (qcFailedOrders > 0) {
        qcYieldDistribution.push({
          name: "QC Failed",
          value: Math.round((qcFailedOrders / totalQcOrders) * 100),
          count: qcFailedOrders,
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
