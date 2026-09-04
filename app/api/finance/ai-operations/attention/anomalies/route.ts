import { NextRequest, NextResponse } from "next/server";
import { requireTenantId } from "@/lib/auth/requireTenantId";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import AiAnomaly, { AI_ANOMALY_STATUS } from "@/models/ai/AiAnomaly";

/**
 * Read-only listing of AI-15's investigation records for the Attention tab's "Anomalies to
 * review" section (docs/ai/BRIEF-06-BATCH-E.md Part 0.3). Silent anomalies never became
 * `AiAttentionItem` rows (Chunk 5, by design), so without this listing a human has no surface to
 * review them from at all — and without a review, `AiDetectorHealth.precision` can never move
 * off `null`. Every open anomaly is listed here regardless of `silent`, since reviewing one is
 * exactly what the silent-until-proven mechanism depends on.
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
    const detectorId = searchParams.get("detectorId");

    const query: Record<string, unknown> = { tenantId, status: AI_ANOMALY_STATUS.OPEN };
    if (detectorId) query.detectorId = detectorId;

    const items = await AiAnomaly.find(query).sort({ createdAt: -1 }).limit(200).lean();
    return NextResponse.json({ items });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
