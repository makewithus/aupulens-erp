import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import CrmActivity from "@/models/crm/Activity";
import CrmCase from "@/models/crm/Case";
import { validateObjectId, handleRouteError } from "@/lib/api/validateId";

export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  try {
    const params = await props.params;
    const idGuard = validateObjectId(params.id);
    if (idGuard) return idGuard;

    const session = await auth();
    if (!session?.user?.tenantId) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    
    await dbConnect();
    const parentCase = await CrmCase.findOne({ _id: params.id, tenantId: session.user.tenantId }).select("_id").lean();
    if (!parentCase) {
      return NextResponse.json({ success: false, message: "Case not found" }, { status: 404 });
    }

    const acts = await CrmActivity.find({ linked_case_id: params.id, tenantId: session.user.tenantId })
        .sort({ activity_date: -1 })
        .populate('performed_by_id', 'name').lean();

    return NextResponse.json({ success: true, data: acts });
  } catch (error) {
    return handleRouteError(error);
  }
}
