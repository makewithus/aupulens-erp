import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import CrmCommunication from "@/models/crm/Communication";
import { requirePermission } from "@/lib/crm/rbac";
import { validateObjectId, handleRouteError, stripProtectedFields } from "@/lib/api/validateId";

type RouteProps = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, props: RouteProps) {
  try {
    const { id } = await props.params;
    const idGuard = validateObjectId(id);
    if (idGuard) return idGuard;

    const session = await auth();
    if (!session?.user?.tenantId) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });

    await dbConnect();
    const comm = await CrmCommunication.findOne({ _id: id, tenantId: session.user.tenantId }).lean();
    if (!comm) return NextResponse.json({ success: false, message: "Communication not found" }, { status: 404 });

    return NextResponse.json({ success: true, data: comm });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PUT(req: NextRequest, props: RouteProps) {
  try {
    const { id } = await props.params;
    const idGuard = validateObjectId(id);
    if (idGuard) return idGuard;

    const session = await auth();
    if (!session?.user?.tenantId) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });

    try {
      requirePermission(session, "communication.send");
    } catch (err: any) {
      return NextResponse.json({ success: false, message: err.message }, { status: 403 });
    }

    await dbConnect();
    const body = stripProtectedFields(await req.json());
    const safeUpdates = stripProtectedFields(body);

    const comm = await CrmCommunication.findOneAndUpdate(
      { _id: id, tenantId: session.user.tenantId },
      { $set: safeUpdates },
      { new: true }
    );
    if (!comm) return NextResponse.json({ success: false, message: "Communication not found" }, { status: 404 });

    return NextResponse.json({ success: true, data: comm });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(req: NextRequest, props: RouteProps) {
  try {
    const { id } = await props.params;
    const idGuard = validateObjectId(id);
    if (idGuard) return idGuard;

    const session = await auth();
    if (!session?.user?.tenantId) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });

    try {
      requirePermission(session, "communication.delete");
    } catch (err: any) {
      return NextResponse.json({ success: false, message: err.message }, { status: 403 });
    }

    await dbConnect();
    const result = await CrmCommunication.findOneAndDelete({ _id: id, tenantId: session.user.tenantId });
    if (!result) return NextResponse.json({ success: false, message: "Communication not found" }, { status: 404 });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
