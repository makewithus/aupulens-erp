import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import Reminder from "@/models/sales/Reminder";

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
    if (body.enabled !== undefined) update.enabled = !!body.enabled;
    if (body.offsetDays !== undefined) update.offsetDays = Math.max(0, Number(body.offsetDays) || 0);
    if (body.direction !== undefined) update.direction = body.direction;
    if (body.basis !== undefined) update.basis = body.basis;
    if (body.name !== undefined) update.name = body.name;

    const reminder = await Reminder.findOneAndUpdate(
      { _id: id, tenantId: session.user.tenantId },
      { $set: update },
      { new: true },
    );
    if (!reminder) {
      return NextResponse.json({ success: false, message: "Reminder not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: reminder });
  } catch (error: any) {
    console.error("Reminder PATCH error:", error);
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

    const reminder = await Reminder.findOneAndDelete({
      _id: id,
      tenantId: session.user.tenantId,
      isSystem: false,
    });
    if (!reminder) {
      return NextResponse.json(
        { success: false, message: "Reminder not found or cannot be deleted" },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Reminder DELETE error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
