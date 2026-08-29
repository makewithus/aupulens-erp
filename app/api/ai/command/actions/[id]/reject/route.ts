import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import AiCommandProposal from "@/models/ai/AiCommandProposal";
import { AI_ACTION_STATUS } from "@/lib/constants/statuses";

/**
 * Reject a proposed Command Center action — marks it rejected so it can never
 * be confirmed/executed. No mutation to business data occurs.
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  if (!mongoose.isValidObjectId(id)) return NextResponse.json({ success: false, message: "Invalid id" }, { status: 400 });

  await connectDB();
  const proposal = await AiCommandProposal.findOne({ _id: id, tenantId: session.user.tenantId });
  if (!proposal) return NextResponse.json({ success: false, message: "Proposal not found" }, { status: 404 });

  if (proposal.status !== AI_ACTION_STATUS.PROPOSED) {
    return NextResponse.json({ success: false, message: `This action is already ${proposal.status}` }, { status: 409 });
  }

  proposal.status = AI_ACTION_STATUS.REJECTED;
  await proposal.save();
  return NextResponse.json({ success: true, data: { proposalId: proposal._id, status: proposal.status } });
}
