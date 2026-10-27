import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import CrmHandoff from "@/models/crm/Handoff";
import CrmAuditLog from "@/models/crm/CrmAuditLog";
import { validateObjectId, handleRouteError, stripProtectedFields } from "@/lib/api/validateId";

type RouteProps = { params: Promise<{ id: string }> };

export async function PUT(req: NextRequest, props: RouteProps) {
  try {
    const { id } = await props.params;
    const idGuard = validateObjectId(id);
    if (idGuard) return idGuard;

    const session = await auth();
    if (!session?.user?.tenantId) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });

    await dbConnect();
    const body = stripProtectedFields(await req.json());
    const safeUpdates = stripProtectedFields(body);
    const tenantId = session.user.tenantId;

    const handoff = await CrmHandoff.findOne({ _id: id, tenantId });
    if (!handoff) return NextResponse.json({ success: false, message: "Handoff not found" }, { status: 404 });

    const oldStatus = handoff.status;

    if (body.status === "Accepted" && oldStatus !== "Accepted") handoff.acceptedAt = new Date() as any;
    if (body.status === "Rejected" && oldStatus !== "Rejected") handoff.rejectedAt = new Date() as any;
    if (body.status === "Completed" && oldStatus !== "Completed") handoff.completedAt = new Date() as any;

    // Apply updates
    Object.assign(handoff, safeUpdates);
    await handoff.save();

    if (oldStatus !== handoff.status) {
      await CrmAuditLog.create({
        tenantId,
        user_id: session.user.id,
        action: "status_changed",
        record_type: "Handoff",
        record_id: handoff._id,
        old_value: oldStatus,
        new_value: handoff.status,
        timestamp: new Date()
      });
    }

    return NextResponse.json({ success: true, data: handoff });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function GET(req: NextRequest, props: RouteProps) {
  try {
    const { id } = await props.params;
    const idGuard = validateObjectId(id);
    if (idGuard) return idGuard;

    const session = await auth();
    if (!session?.user?.tenantId) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });

    await dbConnect();
    const handoff = await CrmHandoff.findOne({ _id: id, tenantId: session.user.tenantId })
      .populate("fromOwner", "name")
      .populate("toOwner", "name")
      .lean();

    if (!handoff) return NextResponse.json({ success: false, message: "Handoff not found" }, { status: 404 });

    return NextResponse.json({ success: true, data: handoff });
  } catch (error) {
    return handleRouteError(error);
  }
}
