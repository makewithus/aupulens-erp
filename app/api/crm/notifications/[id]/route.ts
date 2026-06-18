import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import CrmNotification from "@/models/crm/Notification";

export async function PUT(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ success: false }, { status: 401 });

  await dbConnect();
  
  await CrmNotification.findOneAndUpdate(
    { _id: params.id, tenantId: session.user.tenantId, user_id: session.user.id },
    { $set: { read: true } }
  );

  return NextResponse.json({ success: true });
}
