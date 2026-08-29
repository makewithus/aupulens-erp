import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import Workflow from "@/models/studio/Workflow";
import { WORKFLOW_TRIGGER_TYPE } from "@/lib/studio/catalog";
import { validateStep } from "@/lib/studio/catalog";

// GET /api/studio/workflows — list this tenant's workflows.
export async function GET() {
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ success: false }, { status: 401 });
  await dbConnect();
  const workflows = await Workflow.find({ tenantId: session.user.tenantId }).sort({ createdAt: -1 }).lean();
  return NextResponse.json({ success: true, data: workflows });
}

// POST /api/studio/workflows — create a workflow (steps validated against catalog).
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId || !session.user.id) return NextResponse.json({ success: false }, { status: 401 });

  const body = await req.json();
  const name = (body.name as string)?.trim();
  if (!name) return NextResponse.json({ success: false, message: "Name is required." }, { status: 400 });

  const steps = Array.isArray(body.steps) ? body.steps : [];
  for (const s of steps) {
    const err = validateStep(s);
    if (err) return NextResponse.json({ success: false, message: err }, { status: 400 });
  }

  const triggerType = body.triggerType === WORKFLOW_TRIGGER_TYPE.EVENT ? WORKFLOW_TRIGGER_TYPE.EVENT : WORKFLOW_TRIGGER_TYPE.MANUAL;

  await dbConnect();
  const wf = await Workflow.create({
    tenantId: session.user.tenantId,
    name,
    description: body.description || "",
    triggerType,
    eventKey: triggerType === WORKFLOW_TRIGGER_TYPE.EVENT ? String(body.eventKey || "").trim() : undefined,
    conditions: Array.isArray(body.conditions) ? body.conditions : [],
    steps,
    enabled: !!body.enabled,
    version: 1,
    createdBy: session.user.id,
  });

  return NextResponse.json({ success: true, data: wf });
}
