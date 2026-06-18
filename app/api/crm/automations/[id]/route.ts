import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import CrmAutomationRule from "@/models/crm/AutomationRule";
import { requirePermission } from "@/lib/crm/rbac";

type RouteProps = { params: Promise<{ id: string }> };

export async function PUT(req: NextRequest, props: RouteProps) {
  const { id } = await props.params;
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ success: false }, { status: 401 });

  try {
    requirePermission(session, "manage_workflows");
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message }, { status: 403 });
  }

  await dbConnect();
  const body = await req.json();

  const rule = await CrmAutomationRule.findOneAndUpdate(
    { _id: id, tenantId: session.user.tenantId },
    { $set: body },
    { new: true }
  );

  return NextResponse.json({ success: true, data: rule });
}

export async function DELETE(req: NextRequest, props: RouteProps) {
  const { id } = await props.params;
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ success: false }, { status: 401 });

  try {
    requirePermission(session, "manage_workflows");
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message }, { status: 403 });
  }

  await dbConnect();
  await CrmAutomationRule.deleteOne({ _id: id, tenantId: session.user.tenantId });

  return NextResponse.json({ success: true });
}
