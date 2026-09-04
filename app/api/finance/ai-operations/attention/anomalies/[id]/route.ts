import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { requireTenantId } from "@/lib/auth/requireTenantId";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import { bootstrapAiRuntime } from "@/lib/aiRuntime/bootstrap";
import { callTool } from "@/lib/aiRuntime/tools/registry";
import { AI_AUTONOMY_LEVEL } from "@/lib/constants/statuses";

/**
 * The Attention tab's two anomaly-review actions (docs/ai/BRIEF-06-BATCH-E.md Part 0.3) —
 * "Confirm as real" and "Expected — don't flag this again." Unlike the plain
 * AiAttentionItem resolve/snooze route, this one explicitly goes through the `internal_state`
 * tool layer per the brief's own instruction, via `record_anomaly_review` — there is no real
 * `AiWorkflowRun` behind a human's review click, so a synthetic id is used for the tool-call
 * audit record's `runId` reference (the same shape `AiAnomaly.runId` already accepts).
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const tenantIdGuard = requireTenantId(session);
    if (tenantIdGuard) return tenantIdGuard;
    const tenantId = (session.user as any).tenantId;
    const userId = (session.user as any).id;
    await dbConnect();
    bootstrapAiRuntime();

    const { id } = await params;
    const body = await req.json();
    const outcome = body.outcome as "confirmed" | "expected";
    if (outcome !== "confirmed" && outcome !== "expected") {
      return NextResponse.json({ error: "outcome must be 'confirmed' or 'expected'" }, { status: 400 });
    }

    const { result } = await callTool(
      "record_anomaly_review",
      { tenantId, anomalyId: id, outcome, createdBy: userId },
      { tenantId, runId: new mongoose.Types.ObjectId().toString(), requestedAutonomy: AI_AUTONOMY_LEVEL.EXECUTE, userId },
    );

    return NextResponse.json({ result });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
