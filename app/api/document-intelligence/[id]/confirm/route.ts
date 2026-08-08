import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import ExtractedDocument from "@/models/ExtractedDocument";
import "@/models/Invoice";
import "@/models/Customer";
import { coerceVendorBill, DOC_INTEL_STATUS } from "@/lib/docIntel/extractionSchemas";
import { createDraftBill } from "@/lib/docIntel/billCreate";

// POST /api/document-intelligence/[id]/confirm — create a DRAFT vendor bill from
// the (possibly edited) extraction. Idempotent: a document already confirmed is
// refused so a double-click can't create two bills.
export async function POST(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const session = await auth();
  if (!session?.user?.tenantId || !session.user.id) return NextResponse.json({ success: false }, { status: 401 });

  await dbConnect();
  const doc = await ExtractedDocument.findOne({ _id: id, tenantId: session.user.tenantId });
  if (!doc) return NextResponse.json({ success: false }, { status: 404 });
  if (doc.status === DOC_INTEL_STATUS.CONFIRMED) {
    return NextResponse.json({ success: false, message: "Already confirmed.", createdRecordId: doc.createdRecordId }, { status: 409 });
  }

  const extraction = coerceVendorBill(doc.extraction as Record<string, unknown>);
  if (!extraction.vendorName && !extraction.totalAmount) {
    return NextResponse.json({ success: false, message: "Need at least a vendor name or total to create a bill." }, { status: 422 });
  }

  const result = await createDraftBill(extraction, { tenantId: session.user.tenantId, userId: session.user.id });

  doc.status = DOC_INTEL_STATUS.CONFIRMED;
  doc.createdRecordModel = "Invoice";
  doc.createdRecordId = result.invoiceId;
  await doc.save();

  return NextResponse.json({
    success: true,
    data: { invoiceId: result.invoiceId, name: result.name, message: "Draft vendor bill created. Review and post it in Finance." },
  });
}
