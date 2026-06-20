import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import CrmTask from "@/models/crm/Task";

export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ success: false }, { status: 401 });
  
  await dbConnect();
  const field = 'linked_account_id';
  const items = await CrmTask.find({ [field]: params.id, tenantId: session.user.tenantId }).lean();
  return NextResponse.json({ success: true, data: items });
}
