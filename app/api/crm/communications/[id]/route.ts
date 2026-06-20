import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import CrmCommunication from "@/models/crm/Communication";
import { requirePermission } from "@/lib/crm/rbac";

type RouteProps = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, props: RouteProps) {
  const { id } = await props.params;
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ success: false }, { status: 401 });

  await dbConnect();
  const comm = await CrmCommunication.findOne({ _id: id, tenantId: session.user.tenantId }).lean();
  if (!comm) return NextResponse.json({ success: false, message: "Not found" }, { status: 404 });

  return NextResponse.json({ success: true, data: comm });
}

export async function PUT(req: NextRequest, props: RouteProps) {
  const { id } = await props.params;
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ success: false }, { status: 401 });

  try {
    requirePermission(session, "communication.send");
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message }, { status: 403 });
  }

  await dbConnect();
  const body = await req.json();

  const comm = await CrmCommunication.findOneAndUpdate(
    { _id: id, tenantId: session.user.tenantId },
    { $set: body },
    { new: true }
  );

  return NextResponse.json({ success: true, data: comm });
}

export async function DELETE(req: NextRequest, props: RouteProps) {
  const { id } = await props.params;
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ success: false }, { status: 401 });

  try {
    requirePermission(session, "communication.delete");
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message }, { status: 403 });
  }

  await dbConnect();
  await CrmCommunication.deleteOne({ _id: id, tenantId: session.user.tenantId });
  return NextResponse.json({ success: true });
}
