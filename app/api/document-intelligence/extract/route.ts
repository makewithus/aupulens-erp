import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import ExtractedDocument from "@/models/ai/ExtractedDocument";
import "@/models/finance/Invoice";
import "@/models/sales/Customer";
import { validateDocument, extractContent } from "@/lib/docIntel/textExtract";
import { extractDocument } from "@/lib/docIntel/extractor";
import { DOC_INTEL_TYPE, DOC_INTEL_TYPE_VALUES, DOC_INTEL_STATUS } from "@/lib/docIntel/extractionSchemas";
import { findDuplicates } from "@/lib/docIntel/duplicateCheck";
import { loadExistingBills } from "@/lib/docIntel/billCreate";

// POST /api/document-intelligence/extract — upload a document, run OCR/extraction,
// persist the structured result, and return it with any duplicate warnings.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId || !session.user.id) {
    return NextResponse.json({ success: false }, { status: 401 });
  }

  const form = await req.formData();
  const file = form.get("file") as File | null;
  const docType = ((form.get("docType") as string) || DOC_INTEL_TYPE.VENDOR_BILL) as (typeof DOC_INTEL_TYPE_VALUES)[number];

  if (!file) return NextResponse.json({ success: false, message: "No file provided." }, { status: 400 });
  if (!DOC_INTEL_TYPE_VALUES.includes(docType)) {
    return NextResponse.json({ success: false, message: "Unsupported document type." }, { status: 400 });
  }
  const fileError = validateDocument(file.name);
  if (fileError) return NextResponse.json({ success: false, message: fileError }, { status: 400 });

  let content;
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    content = await extractContent(file.name, buffer);
  } catch (err) {
    return NextResponse.json({ success: false, message: err instanceof Error ? err.message : "Could not read document." }, { status: 400 });
  }

  const outcome = await extractDocument(session.user.tenantId, docType, content);
  // NOTE: `in`-operator narrowing (not `!outcome.ok`) — this project runs with
  // strictNullChecks:false, under which negated-discriminant narrowing resolves
  // to the wrong union branch. Presence checks narrow reliably in both modes.
  if (!("data" in outcome)) {
    const status = outcome.gated ? 402 : 502;
    return NextResponse.json({ success: false, message: outcome.error, gated: outcome.gated }, { status });
  }

  await dbConnect();
  const doc = await ExtractedDocument.create({
    tenantId: session.user.tenantId,
    docType,
    fileName: file.name,
    status: DOC_INTEL_STATUS.EXTRACTED,
    extraction: outcome.data as unknown as Record<string, unknown>,
    aiConfidence: outcome.data.confidence,
    createdBy: session.user.id,
  });

  // Duplicate check against existing vendor bills.
  const existing = await loadExistingBills(session.user.tenantId);
  const duplicates = findDuplicates(outcome.data, existing);

  return NextResponse.json({
    success: true,
    data: {
      _id: doc._id,
      docType,
      fileName: doc.fileName,
      status: doc.status,
      extraction: outcome.data,
      duplicates,
    },
  });
}
