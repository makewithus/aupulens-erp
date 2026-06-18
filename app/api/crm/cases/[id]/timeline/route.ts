import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import CrmActivity from "@/models/crm/Activity";

export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ success: false }, { status: 401 });
  
  await dbConnect();
  const acts = await CrmActivity.find({ linked_case_id: params.id, tenantId: session.user.tenantId })
    .sort({ activity_date: -1 })
    .populate('performed_by_id', 'name');
    
  return NextResponse.json({ success: true, data: acts });
}
