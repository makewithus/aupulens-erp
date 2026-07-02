import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import AiActionProposal from "@/models/AiActionProposal";
import { AI_ACTION_STATUS } from "@/lib/constants/statuses";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.tenantId)
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  if (!mongoose.isValidObjectId(id))
    return NextResponse.json({ success: false, message: "Invalid id" }, { status: 400 });

  await connectDB();
  const proposal = await AiActionProposal.findOneAndUpdate(
    { _id: id, tenantId: session.user.tenantId, status: AI_ACTION_STATUS.PROPOSED },
    { $set: { status: AI_ACTION_STATUS.REJECTED } },
    { new: true },
  );
  if (!proposal) return NextResponse.json({ success: false, message: "Proposal not found or already actioned" }, { status: 404 });

  return NextResponse.json({ success: true, data: proposal });
}
