import { NextRequest, NextResponse } from "next/server";
import { requireTenantId } from "@/lib/auth/requireTenantId";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import ManufacturingOrder from "@/models/manufacturing/ManufacturingOrder";
import BillOfMaterial from "@/models/manufacturing/BillOfMaterial";
import Shipment from "@/models/manufacturing/Shipment";

import Product from "@/models/inventory/Product";

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tenantIdGuard = requireTenantId(session);
    if (tenantIdGuard) return tenantIdGuard;
    const tenantId = (session.user as any).tenantId;

    await connectDB();

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [
      totalOrders,
      demandForecast,
      inProduction,
      qcPending,
      rework,
      finished,
      finishedThisMonth,
      totalBoms,
      totalProducts,
      statusBreakdown,
      recentOrdersRaw,
      dailyOutputAgg,
      totalShipments,
    ] = await Promise.all([
      ManufacturingOrder.countDocuments({ tenantId }),
      ManufacturingOrder.countDocuments({
        tenantId,
        $or: [
          { productionStatus: { $in: ["demand_forecast", "production_order"] } },
          { status: { $in: ["draft", "confirmed"] } },
        ],
      }),
      ManufacturingOrder.countDocuments({
        tenantId,
        $or: [
          { productionStatus: { $in: ["material_reserved", "material_issued", "in_production"] } },
          { status: "in_progress" },
        ],
      }),
      ManufacturingOrder.countDocuments({
        tenantId,
        $or: [
          { productionStatus: "qc_pending" },
          { status: "to_close" },
        ],
      }),
      ManufacturingOrder.countDocuments({
        tenantId,
        productionStatus: { $in: ["rework", "qc_failed"] },
      }),
      ManufacturingOrder.countDocuments({
        tenantId,
        $or: [
          { productionStatus: "finished" },
          { status: "done" },
        ],
      }),
      ManufacturingOrder.countDocuments({
        tenantId,
        $or: [
          { productionStatus: "finished" },
          { status: "done" },
        ],
        updatedAt: { $gte: startOfMonth },
      }),
      BillOfMaterial.countDocuments({ tenantId }),
      Product.countDocuments({ tenantId }),
      ManufacturingOrder.aggregate([
        { $match: { tenantId } },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),
      ManufacturingOrder.find({ tenantId })
        .populate("header.productId", "header.name")
        .sort({ createdAt: -1 })
        .limit(10)
        .lean(),
      ManufacturingOrder.aggregate([
        {
          $match: {
            tenantId,
            createdAt: { $gte: thirtyDaysAgo },
          },
        },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
            count: { $sum: 1 },
            quantity: { $sum: { $ifNull: ["$header.quantity", 1] } },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      Shipment.countDocuments({ tenantId }),
    ]);

    const stageMap: Record<string, string> = {
      in_progress: "In Production",
      in_production: "In Production",
      confirmed: "Material Reserved",
      draft: "Planning & Forecast",
      to_close: "QC Inspection",
      done: "Completed Output",
      cancelled: "Scrapped / Cancelled",
    };

    const productionStages = statusBreakdown.map((s: any) => ({
      name: stageMap[s._id] || s._id || "Other",
      value: s.count,
    }));

    const dailyOutput = dailyOutputAgg.map((d: any) => ({
      date: d._id,
      count: d.quantity || d.count,
    }));

    const recentOrders = recentOrdersRaw.map((o: any) => {
      const prodName =
        (typeof o.header?.productId === "object" && o.header?.productId?.header?.name) ||
        o.header?.name ||
        "Manufacturing Unit";
      return {
        _id: String(o._id),
        id: o.header?.name || `MO-${String(o._id).slice(-6)}`,
        name: o.header?.name || `MO-${String(o._id).slice(-6)}`,
        product: prodName,
        quantity: o.header?.quantity || 1,
        status: o.status || "confirmed",
        productionStatus: o.productionStatus || (o.status === "done" ? "finished" : "in_production"),
        createdAt: o.createdAt || new Date(),
        date: o.createdAt
          ? new Date(o.createdAt).toLocaleDateString("en-IN", {
              day: "2-digit",
              month: "short",
            })
          : "Recent",
      };
    });

    const activeWorkOrders = inProduction + qcPending;
    const oee = totalOrders > 0 ? (finished / totalOrders) * 100 : 0;
    const qualityRate = (finished + qcPending) > 0 ? Math.round((finished / (finished + rework + 0.001)) * 100) : 100;

    const statsPayload = {
      totalOrders,
      activeWorkOrders,
      demandForecast,
      inProduction,
      qcPending,
      rework,
      finished,
      finishedThisMonth,
      totalBoms,
      totalProducts,
      totalShipments,
      oee: Number(oee.toFixed(1)),
      qualityRate: Math.min(100, Math.max(0, qualityRate)),
    };

    return NextResponse.json({
      success: true,
      stats: statsPayload,
      summary: {
        demandForecast,
        inProduction,
        qcPending,
        rework,
        finished,
        totalBoms,
        totalProducts,
        totalOrders,
        recentOrders,
      },
      productionStages,
      recentOrders,
      dailyOutput,
    });
  } catch (error: any) {
    console.error("Manufacturing summary error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
