import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import AiCommandProposal from "@/models/ai/AiCommandProposal";
import { AI_ACTION_STATUS } from "@/lib/constants/statuses";
import { COMMAND_ACTIONS, CommandActionError, isCommandAction, executeCommandBatch } from "@/lib/ai/commandActions";

/**
 * Step 2 of the generalized Command Center confirm gate: the user has
 * explicitly confirmed the previewed action, so now perform the mutation and
 * write the audit log. This is the ONLY route that mutates — a proposal by
 * itself is inert. Mirrors app/api/finance/accounting/ai-actions/[id]/confirm.
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  if (!mongoose.isValidObjectId(id)) return NextResponse.json({ success: false, message: "Invalid id" }, { status: 400 });

  await connectDB();
  try {
    const proposal = await AiCommandProposal.findOne({ _id: id, tenantId: session.user.tenantId });
    if (!proposal) return NextResponse.json({ success: false, message: "Proposal not found" }, { status: 404 });

    if (proposal.status !== AI_ACTION_STATUS.PROPOSED) {
      return NextResponse.json({ success: false, message: `This action is already ${proposal.status}` }, { status: 409 });
    }
    if (proposal.expiresAt.getTime() < Date.now()) {
      proposal.status = AI_ACTION_STATUS.EXPIRED;
      await proposal.save();
      return NextResponse.json({ success: false, message: "This proposal has expired. Please ask again." }, { status: 410 });
    }
    // ── Batch: run each confirmed step in order (partial progress reported) ──
    if (proposal.actionType === "batch") {
      const steps = ((proposal.params as any)?.steps || []) as { actionType: string; params: any }[];
      const outcome = await executeCommandBatch(steps, session.user.tenantId, session.user.id);
      proposal.status = AI_ACTION_STATUS.EXECUTED;
      proposal.executedAt = new Date();
      await proposal.save();
      if (outcome.failedIndex !== null) {
        const failed = outcome.results[outcome.failedIndex];
        return NextResponse.json(
          { success: false, message: `Completed ${outcome.completed} of ${outcome.total} step(s). Step ${outcome.failedIndex + 1} (${failed.actionType}) failed: ${failed.error}`, data: { outcome } },
          { status: 400 },
        );
      }
      return NextResponse.json({ success: true, data: { proposal, outcome } });
    }

    if (!isCommandAction(proposal.actionType)) {
      return NextResponse.json({ success: false, message: "Unknown action type" }, { status: 400 });
    }

    const def = COMMAND_ACTIONS[proposal.actionType];
    const { resultRef, result } = await def.execute(proposal.params, session.user.tenantId, session.user.id);

    proposal.status = AI_ACTION_STATUS.EXECUTED;
    proposal.resultRef = resultRef;
    proposal.executedAt = new Date();
    await proposal.save();

    return NextResponse.json({ success: true, data: { proposal, result } });
  } catch (error: any) {
    if (error instanceof CommandActionError) {
      return NextResponse.json({ success: false, message: error.message }, { status: 400 });
    }
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
