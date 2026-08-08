import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import Workflow from "@/models/Workflow";
import "@/models/crm/Notification";
import { runWorkflow } from "@/lib/studio/actions";

// POST /api/studio/workflows/[id]/run — manual test run with a sample payload.
// Body: { payload?: object }. Persists a WorkflowRun tagged trigger "manual".
export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const session = await auth();
  if (!session?.user?.tenantId || !session.user.id) return NextResponse.json({ success: false }, { status: 401 });

  await dbConnect();
  const wf = await Workflow.findOne({ _id: id, tenantId: session.user.tenantId });
  if (!wf) return NextResponse.json({ success: false }, { status: 404 });

  let payload: Record<string, unknown> = {};
  try {
    const body = await req.json();
    if (body && typeof body.payload === "object" && body.payload) payload = body.payload;
  } catch {
    /* empty body is fine */
  }

  const result = await runWorkflow(wf, payload, { trigger: "manual", userId: session.user.id });
  return NextResponse.json({ success: true, data: result });
}
