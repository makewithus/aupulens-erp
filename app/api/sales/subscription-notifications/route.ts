import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import SubscriptionNotificationSetting from "@/models/SubscriptionNotificationSetting";
import { NOTIFICATION_EVENT_LABELS } from "@/lib/sales/subscriptionNotifications";

async function ensureSeeded(tenantId: string) {
  const existing = await SubscriptionNotificationSetting.countDocuments({ tenantId });
  if (existing > 0) return;
  await SubscriptionNotificationSetting.insertMany(
    Object.entries(NOTIFICATION_EVENT_LABELS).map(([eventKey, label]) => ({
      tenantId,
      eventKey,
      label,
      enabled: true,
    })),
  );
}

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    await connectDB();
    const tenantId = session.user.tenantId;
    await ensureSeeded(tenantId);

    const settings = await SubscriptionNotificationSetting.find({ tenantId }).sort({ createdAt: 1 }).lean();
    return NextResponse.json({ success: true, data: settings });
  } catch (error: any) {
    console.error("Subscription notifications GET error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    await connectDB();
    const tenantId = session.user.tenantId;
    const body = await request.json();
    if (!body.eventKey) {
      return NextResponse.json({ success: false, message: "eventKey is required" }, { status: 400 });
    }

    const setting = await SubscriptionNotificationSetting.findOneAndUpdate(
      { tenantId, eventKey: body.eventKey },
      { $set: { enabled: !!body.enabled } },
      { new: true, upsert: true },
    );

    return NextResponse.json({ success: true, data: setting });
  } catch (error: any) {
    console.error("Subscription notifications PATCH error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
