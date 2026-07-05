import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import Reminder from "@/models/Reminder";
import { REMINDER_SCOPE, REMINDER_TYPE, REMINDER_BASIS, REMINDER_DIRECTION } from "@/lib/constants/statuses";

const SEED_DEFINITIONS: Record<string, Array<Partial<import("@/models/Reminder").IReminder>>> = {
  [REMINDER_SCOPE.INVOICE]: [
    {
      type: REMINDER_TYPE.MANUAL,
      name: "Reminder For Overdue Invoices",
      description: "You can send this reminder to your customers manually, from an overdue invoice's details page.",
      isSystem: true,
    } as any,
    {
      type: REMINDER_TYPE.MANUAL,
      name: "Reminder For Sent Invoices",
      description: "You can send this reminder to your customers manually, from a sent (but not overdue) details page.",
      isSystem: true,
    } as any,
    {
      type: REMINDER_TYPE.AUTOMATED,
      name: "Payment Expected",
      groupLabel: "Reminders Based on Expected Payment Date",
      basis: REMINDER_BASIS.EXPECTED_PAYMENT_DATE,
      offsetDays: 0,
      direction: REMINDER_DIRECTION.AFTER,
      isSystem: true,
    } as any,
    {
      type: REMINDER_TYPE.AUTOMATED,
      name: "Reminder - 1",
      groupLabel: "Reminders Based on Due Date",
      basis: REMINDER_BASIS.DUE_DATE,
      offsetDays: 0,
      direction: REMINDER_DIRECTION.AFTER,
      isSystem: true,
    } as any,
    {
      type: REMINDER_TYPE.AUTOMATED,
      name: "Reminder - 2",
      groupLabel: "Reminders Based on Due Date",
      basis: REMINDER_BASIS.DUE_DATE,
      offsetDays: 0,
      direction: REMINDER_DIRECTION.AFTER,
      isSystem: true,
    } as any,
    {
      type: REMINDER_TYPE.AUTOMATED,
      name: "Reminder - 3",
      groupLabel: "Reminders Based on Due Date",
      basis: REMINDER_BASIS.DUE_DATE,
      offsetDays: 0,
      direction: REMINDER_DIRECTION.AFTER,
      isSystem: true,
    } as any,
  ],
  [REMINDER_SCOPE.BILL]: [
    {
      type: REMINDER_TYPE.AUTOMATED,
      name: "Payment Expected",
      groupLabel: "Reminders Based on Expected Payment Date",
      basis: REMINDER_BASIS.EXPECTED_PAYMENT_DATE,
      offsetDays: 0,
      direction: REMINDER_DIRECTION.BEFORE,
      isSystem: true,
    } as any,
    {
      type: REMINDER_TYPE.AUTOMATED,
      name: "Default",
      groupLabel: "Reminders Based on Due Date",
      description: "Reminder will be sent 0 day(s) before the bill due date.",
      basis: REMINDER_BASIS.DUE_DATE,
      offsetDays: 0,
      direction: REMINDER_DIRECTION.BEFORE,
      isSystem: true,
    } as any,
  ],
};

async function ensureSeeded(tenantId: string, scope: string) {
  const existing = await Reminder.countDocuments({ tenantId, scope, isSystem: true });
  if (existing > 0) return;
  const defs = SEED_DEFINITIONS[scope] || [];
  await Reminder.insertMany(defs.map((d) => ({ ...d, tenantId, scope })));
}

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    await connectDB();
    const tenantId = session.user.tenantId;
    const scope = new URL(request.url).searchParams.get("scope") || REMINDER_SCOPE.INVOICE;
    await ensureSeeded(tenantId, scope);

    const reminders = await Reminder.find({ tenantId, scope }).sort({ createdAt: 1 }).lean();
    return NextResponse.json({ success: true, data: reminders });
  } catch (error: any) {
    console.error("Reminders GET error:", error);
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

    if (!body.name?.trim()) {
      return NextResponse.json({ success: false, message: "Reminder name is required" }, { status: 400 });
    }
    if (!body.scope) {
      return NextResponse.json({ success: false, message: "Scope is required" }, { status: 400 });
    }

    const reminder = await Reminder.create({
      tenantId,
      scope: body.scope,
      type: REMINDER_TYPE.AUTOMATED,
      name: body.name.trim(),
      basis: body.basis || REMINDER_BASIS.DUE_DATE,
      offsetDays: Math.max(0, Number(body.offsetDays) || 0),
      direction: body.direction || REMINDER_DIRECTION.AFTER,
      enabled: !!body.enabled,
      isSystem: false,
    });

    return NextResponse.json({ success: true, data: reminder }, { status: 201 });
  } catch (error: any) {
    console.error("Reminders POST error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
