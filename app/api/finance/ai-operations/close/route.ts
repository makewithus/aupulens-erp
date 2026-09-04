import { NextRequest, NextResponse } from "next/server";
import { requireTenantId } from "@/lib/auth/requireTenantId";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import AiCloseState from "@/models/ai/AiCloseState";

/**
 * Read-only render of AI-13's computed readiness (docs/ai/BRIEF-05-BATCH-D.md Task 0.1) — this
 * route never triggers a recomputation and never writes anything (A.2 / Hard Rule 4 extends to
 * this surface too: the Close tab only ever displays state AI-13 already computed on its own
 * schedule). `?period=YYYY-MM` selects a specific period; omitted defaults to the most recent.
 */
export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const tenantIdGuard = requireTenantId(session);
    if (tenantIdGuard) return tenantIdGuard;
    const tenantId = (session.user as any).tenantId;
    await dbConnect();

    const { searchParams } = new URL(req.url);
    const period = searchParams.get("period");

    const query: Record<string, unknown> = { tenantId };
    if (period) query.period = period;

    const state = await AiCloseState.findOne(query).sort({ period: -1 }).lean();
    const periods = await AiCloseState.find({ tenantId }).sort({ period: -1 }).limit(24).select("period computedAt readiness.status").lean();

    return NextResponse.json({ state, periods });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
