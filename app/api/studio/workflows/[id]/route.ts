import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import Workflow from "@/models/studio/Workflow";
import WorkflowRun from "@/models/studio/WorkflowRun";
import { WORKFLOW_TRIGGER_TYPE, validateStep } from "@/lib/studio/catalog";

export async function GET(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ success: false }, { status: 401 });
  await dbConnect();
  const wf = await Workflow.findOne({ _id: id, tenantId: session.user.tenantId }).lean();
  if (!wf) return NextResponse.json({ success: false }, { status: 404 });
  return NextResponse.json({ success: true, data: wf });
}

// PATCH — update definition. Any change to the definition bumps `version`
// (simple version control); toggling `enabled` alone does not.
export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ success: false }, { status: 401 });

  await dbConnect();
  const wf = await Workflow.findOne({ _id: id, tenantId: session.user.tenantId });
  if (!wf) return NextResponse.json({ success: false }, { status: 404 });

  const body = await req.json();
  let definitionChanged = false;

  if (typeof body.name === "string" && body.name.trim()) { wf.name = body.name.trim(); definitionChanged = true; }
  if (typeof body.description === "string") { wf.description = body.description; definitionChanged = true; }
  if (body.triggerType) {
    wf.triggerType = body.triggerType === WORKFLOW_TRIGGER_TYPE.EVENT ? WORKFLOW_TRIGGER_TYPE.EVENT : WORKFLOW_TRIGGER_TYPE.MANUAL;
    wf.eventKey = wf.triggerType === WORKFLOW_TRIGGER_TYPE.EVENT ? String(body.eventKey || "").trim() : undefined;
    definitionChanged = true;
  }
  if (Array.isArray(body.conditions)) { wf.conditions = body.conditions; definitionChanged = true; }
  if (Array.isArray(body.steps)) {
    for (const s of body.steps) {
      const err = validateStep(s);
      if (err) return NextResponse.json({ success: false, message: err }, { status: 400 });
    }
    wf.steps = body.steps;
    definitionChanged = true;
  }
  // enabled toggle is not a definition change.
  if (typeof body.enabled === "boolean") wf.enabled = body.enabled;

  if (definitionChanged) wf.version += 1;
  await wf.save();
  return NextResponse.json({ success: true, data: wf });
}

export async function DELETE(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ success: false }, { status: 401 });
  await dbConnect();
  const wf = await Workflow.findOne({ _id: id, tenantId: session.user.tenantId });
  if (!wf) return NextResponse.json({ success: false }, { status: 404 });
  await WorkflowRun.deleteMany({ tenantId: session.user.tenantId, workflowId: wf._id });
  await wf.deleteOne();
  return NextResponse.json({ success: true });
}
