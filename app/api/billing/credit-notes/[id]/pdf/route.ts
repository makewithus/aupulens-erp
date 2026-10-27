import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import mongoose from "mongoose";
import BillingCreditNote from "@/models/billing/BillingCreditNote";
import { generateCreditNotePdf } from "@/lib/billing/billingPdfGenerator";

export async function GET(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const tenantId = session?.user?.tenantId;
  if (!tenantId) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  try {
    const { id } = await props.params;
    await connectDB();
    const query: Record<string, unknown> = { tenantId };
    if (mongoose.Types.ObjectId.isValid(id) && /^[0-9a-fA-F]{24}$/.test(id)) {
      query.$or = [{ _id: id }, { creditNoteNumber: id }];
    } else {
      query.creditNoteNumber = id;
    }
    const note = await BillingCreditNote.findOne(query).lean();
    if (!note) return NextResponse.json({ success: false, error: "Credit note not found or access denied." }, { status: 404 });
    const bytes = await generateCreditNotePdf(note);
    return new NextResponse(Buffer.from(bytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${note.creditNoteNumber}.pdf"`,
        "Cache-Control": "private, no-cache, no-store, must-revalidate",
      },
    });
  } catch {
    return NextResponse.json({ success: false, error: "Credit note could not be generated." }, { status: 500 });
  }
}
