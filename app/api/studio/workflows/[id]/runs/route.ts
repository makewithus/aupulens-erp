import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import WorkflowRun from "@/models/studio/WorkflowRun";

// GET /api/studio/workflows/[id]/runs — run history (debugging) for a workflow.
export async function GET(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ success: false }, { status: 401 });
  await dbConnect();
  const runs = await WorkflowRun.find({ tenantId: session.user.tenantId, workflowId: id })
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();
  return NextResponse.json({ success: true, data: runs });
}
