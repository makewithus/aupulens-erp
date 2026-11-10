import { safeInternalErrorMessage } from "@/lib/api/safeInternalErrorMessage";
import { NextRequest, NextResponse } from "next/server";
import { requireTenantId } from "@/lib/auth/requireTenantId";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import ManufacturingOrder from "@/models/manufacturing/ManufacturingOrder";
import BillOfMaterial from "@/models/manufacturing/BillOfMaterial";
import Shipment from "@/models/manufacturing/Shipment";
import Product from "@/models/inventory/Product";
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
      openOrdersList,
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
        .select("shipmentType actualDelivery estimatedDelivery createdAt status")
        .lean(),
      Shipment.aggregate([
        { $match: { tenantId, createdAt: { $gte: rangeStart, $lte: rangeEnd } } },
        { $group: { _id: "$shipmentType", count: { $sum: 1 }, totalVal: { $sum: "$totalValue" } } },
      ]),
      // Everything still open, regardless of the selected range: work in progress is a "right now" figure.
      ManufacturingOrder.find({
        tenantId,
        productionStatus: { $nin: ["finished", "cancelled"] },
        status: { $nin: ["closed", "cancelled", "rejected"] },
      }).select("header.quantity productionStatus").limit(10_000).lean(),
    ]);

    // 2. Compute Live Operational Metrics
    let finishedQty = 0;
    let qcPassedQty = 0;
    let qcFailedQty = 0;
    let qcPassedOrders = 0;
    let qcFailedOrders = 0;
    // Orders scheduled in range (excluding cancelled): how many units were planned vs actually finished.
    let plannedUnits = 0;
    let plannedFinishedUnits = 0;
    // Orders finished in range that carry a schedule date: finished by the end of the scheduled day?
    let finishedWithSchedule = 0;
    let finishedOnTime = 0;
    // Planned vs actually-consumed components, only where consumption was recorded.
    const materialTotals = new Map<string, { planned: number; actual: number }>();
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
        plannedUnits += qty;
        if (status === "finished") plannedFinishedUnits += qty;
        const dayKey = new Date(scheduledDate).toISOString().slice(0, 10);
        const currentDay = dailyOutputMap.get(dayKey);
        if (currentDay) currentDay.target += qty;
      }

      if (status === "finished" && isInRange(completionDate)) {
        finishedQty += qty;
        if (order.header?.scheduledDate) {
          finishedWithSchedule += 1;
          const dueEnd = new Date(order.header.scheduledDate);
          dueEnd.setUTCHours(23, 59, 59, 999);
          if (new Date(completionDate!).getTime() <= dueEnd.getTime()) finishedOnTime += 1;
        }
        for (const component of (order.components_tab || []) as any[]) {
          const consumed = Number(component.consumed) || 0;
          const planned = Number(component.toConsume) || 0;
          if (!component.productId || consumed <= 0 || planned <= 0) continue;
          const key = String(component.productId);
          const totals = materialTotals.get(key) || { planned: 0, actual: 0 };
          totals.planned += planned;
          totals.actual += consumed;
          materialTotals.set(key, totals);
        }
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

    // True OEE needs machine runtime and ideal cycle time, which production orders do not record, so those
    // three keys stay null. The efficiency pillars below use only fields that ARE stored on the orders.
    const availabilityRate = null;
    const performanceRate = null;
    const overallOee = null;
    const qualityRate = firstPassYield;
    const pct = (num: number, den: number) => (den > 0 ? Number(((num / den) * 100).toFixed(1)) : null);
    const scheduleAttainment = pct(plannedFinishedUnits, plannedUnits);
    const onTimeCompletionRate = pct(finishedOnTime, finishedWithSchedule);
    // Composite only when every pillar has data; a missing pillar must not be treated as 100%.
    const overallEfficiency = scheduleAttainment != null && onTimeCompletionRate != null && qualityRate != null
      ? Number(((scheduleAttainment * onTimeCompletionRate * qualityRate) / 10_000).toFixed(1))
      : null;

    // Format Daily Output Array directly from live orders
    const dailyOutput = Array.from(dailyOutputMap.entries()).map(([day, val]) => ({
      day,
      actual: val.actual,
      target: val.target,
      scrap: val.scrap,
    })).sort((a, b) => a.day.localeCompare(b.day));

    // 3. Dynamic QC Yield Breakdown from Real Order Statuses
    const qcPendingOrders = (currentProductionList as any[]).filter(
      (order: any) => order.qcDetails?.result === "pending" || order.status === "qc_pending"
    ).length;
    const totalQcOrders = qcPassedOrders + qcFailedOrders + qcPendingOrders;

    const qcYieldDistribution: Array<{ name: string; value: number; count: number; color: string }> = [];
    if (totalQcOrders > 0) {
      if (qcPassedOrders > 0) {
        qcYieldDistribution.push({
          name: "QC Passed / Accepted",
          value: Math.round((qcPassedOrders / totalQcOrders) * 100),
          count: qcPassedOrders,
          color: "#10b981",
        });
      }
      if (qcPendingOrders > 0) {
        qcYieldDistribution.push({
          name: "QC Inspection Pending",
          value: Math.round((qcPendingOrders / totalQcOrders) * 100),
          count: qcPendingOrders,
          color: "#f59e0b",
        });
      }
      if (qcFailedOrders > 0) {
        qcYieldDistribution.push({
          name: "QC Rejected / Rework",
          value: Math.round((qcFailedOrders / totalQcOrders) * 100),
          count: qcFailedOrders,
          color: "#ef4444",
        });
      }
    }

    // 4. Work in progress by stage. No work-center or capacity records exist, so load is each stage's share of
    // the units currently open, not a percentage of a capacity figure.
    const stageLabels: Record<string, string> = {
      demand_forecast: "Demand Forecast",
      production_order: "Planned",
      material_reserved: "Material Reserved",
      material_issued: "Material Issued",
      in_production: "In Production",
      qc_pending: "QC Pending",
      qc_passed: "QC Passed",
      qc_failed: "QC Failed",
      rework: "Rework",
    };
    const stageTotals = new Map<string, { orders: number; units: number }>();
    let openUnits = 0;
    for (const order of openOrdersList as any[]) {
      const stage = String(order.productionStatus || "demand_forecast");
      const qty = Number(order.header?.quantity) || 0;
      const totals = stageTotals.get(stage) || { orders: 0, units: 0 };
      totals.orders += 1;
      totals.units += qty;
      stageTotals.set(stage, totals);
      openUnits += qty;
    }
    const wipStages = Array.from(stageTotals, ([stage, totals]) => ({
      name: stageLabels[stage] || stage,
      activeJobs: totals.orders,
      units: totals.units,
      load: openUnits > 0 ? Math.round((totals.units / openUnits) * 100) : 0,
    })).sort((a, b) => b.units - a.units);
    const workCenters = wipStages;

    // 5. Material variance: planned (toConsume) vs recorded consumption on orders finished in range.
    const materialIds = Array.from(materialTotals.keys());
    const materialProducts = materialIds.length
      ? await Product.find({ _id: { $in: materialIds }, tenantId }).select("header.name header.uom header.unit").lean()
      : [];
    const productById = new Map((materialProducts as any[]).map((p) => [String(p._id), p]));
    const bomMaterialVariance = Array.from(materialTotals, ([id, totals]) => {
      const product = productById.get(id);
      const variancePct = ((totals.actual - totals.planned) / totals.planned) * 100;
      return {
        item: product?.header?.name || "Unknown material",
        unit: product?.header?.uom || product?.header?.unit || "",
        planned: Number(totals.planned.toFixed(2)),
        actual: Number(totals.actual.toFixed(2)),
        variance: `${variancePct > 0 ? "+" : ""}${variancePct.toFixed(1)}%`,
        status: variancePct > 0 ? "Over plan" : variancePct < 0 ? "Under plan" : "On plan",
        _abs: Math.abs(variancePct),
      };
    }).sort((a, b) => b._abs - a._abs).slice(0, 8).map(({ _abs, ...row }) => row);

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

    // On-time dispatch is judged over shipments whose estimated delivery date has passed: delivered by that
    // day counts as on time; delivered later, or still undelivered after it, counts as late. Delivered
    // shipments with no recorded delivery date can't be judged and are left out.
    const dayOf = (value: unknown) => {
      if (!value) return null;
      const date = new Date(String(value));
      return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : null;
    };
    const today = new Date().toISOString().slice(0, 10);
    let onTimeShipments = 0;
    let lateShipments = 0;
    for (const shipment of shipmentsList as any[]) {
      const due = dayOf(shipment.estimatedDelivery);
      if (!due || due > today || shipment.status === "cancelled") continue;
      const delivered = dayOf(shipment.actualDelivery);
      if (delivered) {
        if (delivered <= due) onTimeShipments += 1;
        else lateShipments += 1;
      } else if (shipment.status !== "delivered" && due < today) {
        lateShipments += 1;
      }
    }
    const dueShipments = onTimeShipments + lateShipments;
    const onTimeDispatchRate = pct(onTimeShipments, dueShipments);

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
        scheduleAttainment,
        onTimeCompletionRate,
        overallEfficiency,
        openOrders: (openOrdersList as any[]).length,
        wipUnits: openUnits,
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
      wipStages,
      bomMaterialVariance,
      freightLogistics,
      // Raw counts behind each ratio so the UI can say exactly why a figure is empty.
      meta: {
        plannedUnits,
        plannedFinishedUnits,
        finishedWithSchedule,
        finishedOnTime,
        qcPassedUnits: qcPassedQty,
        qcInspectedUnits: totalInspectionUnits,
        qcPendingOrders,
        dueShipments,
        onTimeShipments,
      },
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
