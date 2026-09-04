import { NextRequest, NextResponse } from "next/server";
import { requireTenantId } from "@/lib/auth/requireTenantId";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import AiAttentionItem from "@/models/ai/AiAttentionItem";
import { AI_ATTENTION_STATUS } from "@/lib/constants/statuses";

/**
 * Human actions on one attention item (docs/ai/BRIEF-05-BATCH-D.md Task 0.1) — resolve or
 * snooze only. Explicitly no approve-and-post action this batch: a one-click action that would
 * post money moves through the workflow's own AI-authored tool path, not this route. This is a
 * human closing/deferring their own queue item, not an AI write — a direct, tenant-scoped
 * update here is the same pattern as the pre-existing PeriodClosing route, not a Hard Rule 2
 * violation (that rule governs writes made BY AI code).
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const tenantIdGuard = requireTenantId(session);
    if (tenantIdGuard) return tenantIdGuard;
    const tenantId = (session.user as any).tenantId;
    await dbConnect();

    const { id } = await params;
    const body = await req.json();
    const action = body.action as "resolve" | "snooze" | "dismiss";

    const item = await AiAttentionItem.findOne({ _id: id, tenantId });
    if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (action === "resolve") {
      item.status = AI_ATTENTION_STATUS.RESOLVED;
      item.resolvedAt = new Date();
    } else if (action === "dismiss") {
      item.status = AI_ATTENTION_STATUS.DISMISSED;
      item.resolvedAt = new Date();
    } else if (action === "snooze") {
      const days = Number.isFinite(body.days) && body.days > 0 ? body.days : 3;
      item.due = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    } else {
      return NextResponse.json({ error: "action must be resolve, snooze, or dismiss" }, { status: 400 });
    }

    await item.save();
    return NextResponse.json({ item });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
