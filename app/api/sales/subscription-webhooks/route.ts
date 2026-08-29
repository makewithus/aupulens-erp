import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import SubscriptionWebhook from "@/models/sales/SubscriptionWebhook";
import { generateWebhookSecret } from "@/lib/sales/webhookDispatch";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    await connectDB();
    const webhooks = await SubscriptionWebhook.find({ tenantId: session.user.tenantId })
      .sort({ createdAt: -1 })
      .lean();
    return NextResponse.json({ success: true, data: webhooks });
  } catch (error: any) {
    console.error("Subscription webhooks GET error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    await connectDB();
    const tenantId = session.user.tenantId;
    const body = await request.json();

    if (!body.name?.trim() || !body.url?.trim()) {
      return NextResponse.json({ success: false, message: "Name and URL are required" }, { status: 400 });
    }

    const webhook = await SubscriptionWebhook.create({
      tenantId,
      name: body.name.trim(),
      url: body.url.trim(),
      secret: body.secret?.trim() || generateWebhookSecret(),
      events: Array.isArray(body.events) ? body.events : [],
      active: body.active !== false,
      createdBy: session.user.id,
    });

    return NextResponse.json({ success: true, data: webhook }, { status: 201 });
  } catch (error: any) {
    console.error("Subscription webhooks POST error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
