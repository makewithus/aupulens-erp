import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import CrmNotification from "@/models/crm/Notification";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ success: false }, { status: 401 });

  await dbConnect();
  const notifications = await CrmNotification.find({ tenantId: session.user.tenantId, userId: session.user.id })
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();

  return NextResponse.json({ success: true, data: notifications });
}

export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ success: false }, { status: 401 });

  await dbConnect();
  const body = await req.json();

  if (body.markAllRead) {
    await CrmNotification.updateMany(
      { tenantId: session.user.tenantId, userId: session.user.id },
      { $set: { isRead: true } }
    );
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ success: false, message: "Invalid action" }, { status: 400 });
}
