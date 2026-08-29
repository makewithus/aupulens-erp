import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import ExtractedDocument from "@/models/ai/ExtractedDocument";
import "@/models/finance/Invoice";
import "@/models/sales/Customer";
import { coerceVendorBill } from "@/lib/docIntel/extractionSchemas";
import { findDuplicates } from "@/lib/docIntel/duplicateCheck";
import { loadExistingBills } from "@/lib/docIntel/billCreate";
import { DOC_INTEL_STATUS } from "@/lib/docIntel/extractionSchemas";

export async function GET(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ success: false }, { status: 401 });
  await dbConnect();
  const doc = await ExtractedDocument.findOne({ _id: id, tenantId: session.user.tenantId }).lean();
  if (!doc) return NextResponse.json({ success: false }, { status: 404 });

  const extraction = coerceVendorBill(doc.extraction as Record<string, unknown>);
  const duplicates = findDuplicates(extraction, await loadExistingBills(session.user.tenantId));
  return NextResponse.json({ success: true, data: { ...doc, extraction, duplicates } });
}

// PATCH — the reviewer edits extracted fields before confirming. Re-coerced so
// numbers/strings stay well-typed regardless of what the client sends.
export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ success: false }, { status: 401 });

  await dbConnect();
  const doc = await ExtractedDocument.findOne({ _id: id, tenantId: session.user.tenantId });
  if (!doc) return NextResponse.json({ success: false }, { status: 404 });
  if (doc.status === DOC_INTEL_STATUS.CONFIRMED) {
    return NextResponse.json({ success: false, message: "This document was already confirmed." }, { status: 409 });
  }

  const body = await req.json();
  if (body.extraction && typeof body.extraction === "object") {
    doc.extraction = coerceVendorBill(body.extraction) as unknown as Record<string, unknown>;
    doc.markModified("extraction");
  }
  await doc.save();
  return NextResponse.json({ success: true, data: { _id: doc._id, extraction: doc.extraction } });
}

export async function DELETE(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ success: false }, { status: 401 });
  await dbConnect();
  const doc = await ExtractedDocument.findOne({ _id: id, tenantId: session.user.tenantId });
  if (!doc) return NextResponse.json({ success: false }, { status: 404 });
  await doc.deleteOne();
  return NextResponse.json({ success: true });
}
