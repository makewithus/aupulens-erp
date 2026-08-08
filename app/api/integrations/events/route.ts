import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import IntegrationEvent from "@/models/IntegrationEvent";

// GET /api/integrations/events?integrationId=&limit= — health/activity feed for
// the dashboard, plus a rolled-up success/failure summary (last 24h).
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ success: false }, { status: 401 });

  await dbConnect();
  const { searchParams } = new URL(req.url);
  const integrationId = searchParams.get("integrationId");
  const limit = Math.min(Number(searchParams.get("limit")) || 50, 200);

  const filter: Record<string, unknown> = { tenantId: session.user.tenantId };
  if (integrationId) filter.integrationId = integrationId;

  const events = await IntegrationEvent.find(filter).sort({ createdAt: -1 }).limit(limit).lean();

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const dayAgg = await IntegrationEvent.aggregate([
    { $match: { tenantId: session.user.tenantId, createdAt: { $gte: since } } },
    { $group: { _id: "$status", count: { $sum: 1 } } },
  ]);
  const summary = { success: 0, failed: 0 };
  for (const row of dayAgg) {
    if (row._id === "success") summary.success = row.count;
    if (row._id === "failed") summary.failed = row.count;
  }

  return NextResponse.json({ success: true, data: { events, summary } });
}
