import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import DunningRule from "@/models/DunningRule";

async function ensureDefaultRule(tenantId: string) {
  const existing = await DunningRule.countDocuments({ tenantId });
  if (existing > 0) return;
  await DunningRule.create({
    tenantId,
    name: "Default",
    isDefault: true,
    status: "active",
    criteria: [],
    paymentMethod: "cards",
    autocharge: {
      onSuccessAction: "send_thank_you_email",
      onFailureAction: "send_payment_failure_email",
      retries: [
        { afterDays: 3, action: "send_payment_failure_email" },
        { afterDays: 3, action: "send_payment_failure_email" },
        { afterDays: 3, action: "send_payment_failure_email" },
      ],
      finalSubscriptionAction: "do_nothing",
      finalInvoiceAction: "do_nothing",
    },
    manual: {
      onSuccessAction: "send_thank_you_email",
      onFailureAction: "send_overdue_email",
      retries: [{ afterDays: 7, action: "send_overdue_email" }],
      finalSubscriptionAction: "do_nothing",
      finalInvoiceAction: "do_nothing",
    },
  });
}

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    await connectDB();
    const tenantId = session.user.tenantId;
    await ensureDefaultRule(tenantId);

    const rules = await DunningRule.find({ tenantId }).sort({ isDefault: -1, createdAt: 1 }).lean();
    return NextResponse.json({ success: true, data: rules });
  } catch (error: any) {
    console.error("Dunning rules GET error:", error);
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
      return NextResponse.json({ success: false, message: "Rule Name is required" }, { status: 400 });
    }

    const rule = await DunningRule.create({
      tenantId,
      name: body.name.trim(),
      isDefault: false,
      status: "active",
      criteria: body.criteria || [],
      paymentMethod: body.paymentMethod || "cards",
      autocharge: body.autocharge || {},
      manual: body.manual || {},
      createdBy: session.user.id,
    });

    return NextResponse.json({ success: true, data: rule }, { status: 201 });
  } catch (error: any) {
    console.error("Dunning rules POST error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
