import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import {
  computeAndStoreAccountHealth,
  refreshAllAccountHealth,
} from "@/lib/crm/accountHealth";
import CrmAccount from "@/models/crm/Account";

// ─── GET /api/crm/health?account_id=<id> ─────────────────────────────────────
// Returns health score for a single account or distribution for entire tenant
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId)
    return NextResponse.json({ success: false }, { status: 401 });

  await dbConnect();
  const url = new URL(req.url);
  const accountId = url.searchParams.get("account_id");

  if (accountId) {
    const result = await computeAndStoreAccountHealth(
      accountId,
      session.user.tenantId,
      session.user.id
    );
    return NextResponse.json({ success: true, data: result });
  }

  // Tenant-wide distribution
  const [distribution, accounts] = await Promise.all([
    CrmAccount.aggregate([
      { $match: { tenantId: session.user.tenantId } },
      {
        $bucket: {
          groupBy: "$account_health_score",
          boundaries: [0, 25, 50, 75, 101],
          default: "Unknown",
          output: { count: { $sum: 1 } },
        },
      },
    ]),
    CrmAccount.find({ tenantId: session.user.tenantId })
      .select("company_name account_health_score status")
      .sort({ account_health_score: 1 })
      .lean()
  ]);

  return NextResponse.json({
    success: true,
    data: { distribution, accounts },
  });
}

// ─── POST /api/crm/health — Trigger full refresh ──────────────────────────────
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId)
    return NextResponse.json({ success: false }, { status: 401 });

  await dbConnect();
  const result = await refreshAllAccountHealth(
    session.user.tenantId,
    session.user.id
  );
  return NextResponse.json({ success: true, data: result });
}
