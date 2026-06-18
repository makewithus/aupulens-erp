import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import CrmApprovalRequest from "@/models/crm/ApprovalRequest";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ success: false }, { status: 401 });

  await dbConnect();
  // Simplified since true linkage depends on Quote -> Account, etc.
  // Assuming frontend calls this, we fetch all for tenant for demo or link to specific record if passed.
  const approvals = await CrmApprovalRequest.find({ tenantId: session.user.tenantId })
    .populate('requested_by_id', 'name')
    .sort({ createdAt: -1 })
    .lean();

  return NextResponse.json({ success: true, data: { approvals } });
}
