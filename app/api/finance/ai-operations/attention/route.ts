import { NextRequest, NextResponse } from "next/server";
import { requireTenantId } from "@/lib/auth/requireTenantId";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import AiAttentionItem from "@/models/ai/AiAttentionItem";
import { AI_ATTENTION_STATUS, AI_ATTENTION_PRIORITY_VALUES } from "@/lib/constants/statuses";

const PRIORITY_RANK: Record<string, number> = Object.fromEntries(
  AI_ATTENTION_PRIORITY_VALUES.map((p, i) => [p, i]),
);

/**
 * Read-only listing for the Attention tab (docs/ai/BRIEF-05-BATCH-D.md Task 0.1) — every
 * escalation from every AI workflow, filterable. Actions on individual items live at
 * ./[id]/route.ts (open/resolve/snooze only — no approve-and-post button this batch).
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
    const status = searchParams.get("status") || AI_ATTENTION_STATUS.OPEN;
    const priority = searchParams.get("priority");
    const workflowId = searchParams.get("workflowId");

    const query: Record<string, unknown> = { tenantId };
    if (status !== "all") query.status = status;
    if (priority) query.priority = priority;
    if (workflowId) query.workflowId = workflowId;

    const items = await AiAttentionItem.find(query)
      .sort({ createdAt: -1 })
      .limit(500)
      .populate("owner", "name email")
      .lean();

    items.sort((a, b) => (PRIORITY_RANK[a.priority] ?? 99) - (PRIORITY_RANK[b.priority] ?? 99));

    return NextResponse.json({ items });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
