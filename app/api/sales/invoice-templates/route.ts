import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/db";
import { auth } from "@/auth";
import { InvoiceTemplate } from "@/models/sales/InvoiceTemplate";
import { DocumentSettings } from "@/models/sales/DocumentSettings";
import { ensureInvoiceTemplatesSeeded } from "@/lib/invoiceTemplates";

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    await connectDB();
    await ensureInvoiceTemplatesSeeded();

    const { searchParams } = new URL(request.url);
    const category = searchParams.get("category") || "invoice";

    const [templates, settings] = await Promise.all([
      (InvoiceTemplate as any).find({ tenantId: { $exists: false }, category }).sort({ name: 1 }).lean(),
      (DocumentSettings as any).findOne({ tenantId: session.user.tenantId }).lean(),
    ]);

    const defaultTemplateId = (settings as any)?.defaultTemplates?.[category] || null;

    return NextResponse.json({
      success: true,
      data: templates.map((t: any) => ({ ...t, isSelected: defaultTemplateId ? String(t._id) === String(defaultTemplateId) : t.isDefault })),
    });
  } catch (error: any) {
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
    const body = await request.json();
    if (!body.templateId || !body.category) {
      return NextResponse.json({ success: false, message: "templateId and category are required" }, { status: 400 });
    }

    const settings = await (DocumentSettings as any).findOneAndUpdate(
      { tenantId: session.user.tenantId },
      { $set: { [`defaultTemplates.${body.category}`]: body.templateId } },
      { new: true, upsert: true },
    );

    return NextResponse.json({ success: true, data: settings });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
