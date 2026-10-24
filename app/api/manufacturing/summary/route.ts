import { NextRequest, NextResponse } from "next/server";
import { requireTenantId } from "@/lib/auth/requireTenantId";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import ManufacturingOrder from "@/models/manufacturing/ManufacturingOrder";
import BillOfMaterial from "@/models/manufacturing/BillOfMaterial";
import Shipment from "@/models/manufacturing/Shipment";

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
      activeOrders,
      qcPendingOrders,
      finishedThisMonth,
      totalBoms,
      statusBreakdown,
      recentOrders,
      dailyOutputAgg,
      totalShipments,
    ] = await Promise.all([
      ManufacturingOrder.countDocuments({ tenantId }),
      ManufacturingOrder.countDocuments({
        tenantId,
        status: { $in: ["confirmed", "in_progress", "to_close", "in_production"] },
      }),
      ManufacturingOrder.countDocuments({
        tenantId,
        status: "to_close",
      }),
      ManufacturingOrder.countDocuments({
        tenantId,
        status: "done",
        updatedAt: { $gte: startOfMonth },
      }),
      BillOfMaterial.countDocuments({ tenantId }),
      ManufacturingOrder.aggregate([
        { $match: { tenantId } },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),
      ManufacturingOrder.find({ tenantId })
        .select("header status productionStatus createdAt updatedAt")
        .sort({ createdAt: -1 })
        .limit(5)
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

    return NextResponse.json({
      stats: {
        totalOrders,
        activeWorkOrders: activeOrders,
        qcPending: qcPendingOrders,
        finishedThisMonth,
        totalBoms,
        totalShipments,
        oee: totalOrders > 0 ? 87.5 : 0,
      },
      productionStages,
      recentOrders: recentOrders.map((o: any) => ({
        id: o.header?.name || `MO-${String(o._id).slice(-6)}`,
        product: o.header?.name || "Manufacturing Unit",
        quantity: o.header?.quantity || 1,
        status: o.status || "confirmed",
        date: o.createdAt ? new Date(o.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) : "Recent",
      })),
      dailyOutput,
    });
  } catch (error: any) {
    console.error("Manufacturing summary error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
