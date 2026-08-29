import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import AiCommandProposal from "@/models/ai/AiCommandProposal";
import { COMMAND_ACTIONS, COMMAND_ACTION_TYPES, CommandActionError, isCommandAction } from "@/lib/ai/commandActions";

/**
 * Step 1 of the generalized Command Center confirm gate: propose an action.
 * Builds a read-only preview and stores it for confirmation — NEVER mutates
 * data. Mirrors app/api/finance/accounting/ai-actions (POST).
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });

  await connectDB();
  try {
    const { actionType, params } = await req.json();
    if (!actionType || !isCommandAction(actionType)) {
      return NextResponse.json({ success: false, message: `Unsupported action. Supported: ${COMMAND_ACTION_TYPES.join(", ")}` }, { status: 400 });
    }

    const def = COMMAND_ACTIONS[actionType];
    const { summary, preview } = await def.buildPreview(params || {}, session.user.tenantId);

    const proposal = await AiCommandProposal.create({
      tenantId: session.user.tenantId,
      userId: session.user.id,
      module: def.module,
      actionType,
      destructive: def.destructive,
      params: params || {},
      preview,
      summary,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    });

    return NextResponse.json({
      success: true,
      data: { proposalId: proposal._id, actionType, module: def.module, destructive: def.destructive, summary, preview, requiresConfirmation: true },
    });
  } catch (error: any) {
    if (error instanceof CommandActionError) {
      return NextResponse.json({ success: false, message: error.message }, { status: 400 });
    }
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
