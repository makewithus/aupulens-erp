import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import CrmActivity from "@/models/crm/Activity";
import CrmAuditLog from "@/models/crm/CrmAuditLog";
import { validateObjectId, handleRouteError, stripProtectedFields } from "@/lib/api/validateId";

export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  try {
    const params = await props.params;
    const idGuard = validateObjectId(params.id);
    if (idGuard) return idGuard;

    const session = await auth();
    if (!session?.user?.tenantId) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    await dbConnect();

    const activity = await CrmActivity.findOne({ _id: params.id, tenantId: session.user.tenantId }).populate('performed_by_id', 'name').lean();
    if (!activity) return NextResponse.json({ success: false, message: "Activity not found" }, { status: 404 });
    return NextResponse.json({ success: true, data: activity });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PUT(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  try {
    const params = await props.params;
    const idGuard = validateObjectId(params.id);
    if (idGuard) return idGuard;

    const session = await auth();
    if (!session?.user?.tenantId) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    await dbConnect();

    const body = stripProtectedFields(await req.json());
    const safeUpdates = stripProtectedFields(body);

    const activity = await CrmActivity.findOneAndUpdate(
      { _id: params.id, tenantId: session.user.tenantId },
      safeUpdates,
      { new: true }
    );
    if (!activity) return NextResponse.json({ success: false, message: "Activity not found" }, { status: 404 });

    await CrmAuditLog.create({
      tenantId: session.user.tenantId,
      user_id: session.user.id,
      action: 'updated',
      record_type: 'Activity',
      record_id: params.id,
      timestamp: new Date()
    });

    return NextResponse.json({ success: true, data: activity });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  try {
    const params = await props.params;
    const idGuard = validateObjectId(params.id);
    if (idGuard) return idGuard;

    const session = await auth();
    if (!session?.user?.tenantId) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    await dbConnect();

    const activity = await CrmActivity.findOneAndDelete({ _id: params.id, tenantId: session.user.tenantId });
    if (!activity) return NextResponse.json({ success: false, message: "Activity not found" }, { status: 404 });

    await CrmAuditLog.create({
      tenantId: session.user.tenantId,
      user_id: session.user.id,
      action: 'deleted',
      record_type: 'Activity',
      record_id: params.id,
      timestamp: new Date()
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
