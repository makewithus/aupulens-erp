import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import SubscriptionWebhook from "@/models/SubscriptionWebhook";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    await connectDB();
    const { id } = await params;
    const body = await request.json();

    const update: Record<string, any> = {};
    if (body.name !== undefined) update.name = body.name;
    if (body.url !== undefined) update.url = body.url;
    if (body.events !== undefined) update.events = body.events;
    if (body.active !== undefined) update.active = !!body.active;

    const webhook = await SubscriptionWebhook.findOneAndUpdate(
      { _id: id, tenantId: session.user.tenantId },
      { $set: update },
      { new: true },
    );
    if (!webhook) {
      return NextResponse.json({ success: false, message: "Webhook not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: webhook });
  } catch (error: any) {
    console.error("Subscription webhook PATCH error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    await connectDB();
    const { id } = await params;

    const webhook = await SubscriptionWebhook.findOneAndDelete({ _id: id, tenantId: session.user.tenantId });
    if (!webhook) {
      return NextResponse.json({ success: false, message: "Webhook not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Subscription webhook DELETE error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
