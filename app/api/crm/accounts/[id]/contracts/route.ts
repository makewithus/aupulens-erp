import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import CrmContract from "@/models/crm/Contract";
import CrmAccount from "@/models/crm/Account";
import { validateObjectId, handleRouteError } from "@/lib/api/validateId";

export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  try {
    const params = await props.params;
    const idGuard = validateObjectId(params.id);
    if (idGuard) return idGuard;

    const session = await auth();
    if (!session?.user?.tenantId) return NextResponse.json({ success: false }, { status: 401 });

    await dbConnect();
    const parentAccount = await CrmAccount.findOne({ _id: params.id, tenantId: session.user.tenantId }).select("_id").lean();
    if (!parentAccount) {
      return NextResponse.json({ success: false, message: "Account not found" }, { status: 404 });
    }

    const field = "account_id";
    const items = await CrmContract.find({ [field]: params.id, tenantId: session.user.tenantId }).lean();
    return NextResponse.json({ success: true, data: items });
  } catch (error) {
    return handleRouteError(error);
  }
}
