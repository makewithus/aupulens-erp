import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import AiActionProposal from "@/models/AiActionProposal";
import { AI_ACTION_STATUS } from "@/lib/constants/statuses";
import { executeAction, AiActionError } from "@/lib/accounting/aiActions";

/**
 * Step 2 of the AI confirmation gate: the user has explicitly confirmed the
 * previewed action, so now actually perform the mutation.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.tenantId)
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  if (!mongoose.isValidObjectId(id))
    return NextResponse.json({ success: false, message: "Invalid id" }, { status: 400 });

  await connectDB();
  try {
    const proposal = await AiActionProposal.findOne({ _id: id, tenantId: session.user.tenantId });
    if (!proposal) return NextResponse.json({ success: false, message: "Proposal not found" }, { status: 404 });

    if (proposal.status !== AI_ACTION_STATUS.PROPOSED) {
      return NextResponse.json({ success: false, message: `This action is already ${proposal.status}` }, { status: 409 });
    }
    if (proposal.expiresAt.getTime() < Date.now()) {
      proposal.status = AI_ACTION_STATUS.EXPIRED;
      await proposal.save();
      return NextResponse.json({ success: false, message: "This proposal has expired. Please ask again." }, { status: 410 });
    }

    const { resultRef, result } = await executeAction(proposal.actionType, proposal.params, session.user.tenantId, session.user.id);

    proposal.status = AI_ACTION_STATUS.EXECUTED;
    proposal.resultRef = resultRef;
    proposal.executedAt = new Date();
    await proposal.save();

    return NextResponse.json({ success: true, data: { proposal, result } });
  } catch (error: any) {
    if (error instanceof AiActionError) {
      return NextResponse.json({ success: false, message: error.message }, { status: 400 });
    }
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
