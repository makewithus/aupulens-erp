import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import AiActionProposal from "@/models/ai/AiActionProposal";
import { AI_ACTION_TYPE_VALUES } from "@/lib/constants/statuses";
import { buildActionPreview, AiActionError } from "@/lib/accounting/aiActions";

/**
 * Step 1 of the AI confirmation gate: propose an accounting action.
 * Never mutates data — only builds a preview and stores it for confirmation.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId)
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });

  await connectDB();
  try {
    const body = await req.json();
    const { actionType, params } = body;

    if (!actionType || !AI_ACTION_TYPE_VALUES.includes(actionType)) {
      return NextResponse.json({ success: false, message: "Invalid or unsupported action type" }, { status: 400 });
    }

    const preview = await buildActionPreview(actionType, params || {}, session.user.tenantId);

    const proposal = await AiActionProposal.create({
      tenantId: session.user.tenantId,
      userId: session.user.id,
      module: "finance",
      actionType,
      params: params || {},
      preview,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    });

    return NextResponse.json({
      success: true,
      data: { proposalId: proposal._id, actionType, preview, requiresConfirmation: true },
    });
  } catch (error: any) {
    if (error instanceof AiActionError) {
      return NextResponse.json({ success: false, message: error.message }, { status: 400 });
    }
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
