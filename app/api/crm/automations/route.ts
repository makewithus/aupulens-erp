import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import CrmAutomationRule from "@/models/crm/AutomationRule";
import { requirePermission } from "@/lib/crm/rbac";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ success: false }, { status: 401 });

  try {
    requirePermission(session, "manage_workflows");
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message }, { status: 403 });
  }

  await dbConnect();
  const rules = await CrmAutomationRule.find({ tenantId: session.user.tenantId }).lean();

  return NextResponse.json({ success: true, data: rules });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ success: false }, { status: 401 });

  try {
    requirePermission(session, "manage_workflows");
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message }, { status: 403 });
  }

  await dbConnect();
  const body = await req.json();

  const rule = await CrmAutomationRule.create({
    ...body,
    tenantId: session.user.tenantId,
    createdBy: session.user.id
  });

  return NextResponse.json({ success: true, data: rule }, { status: 201 });
}
