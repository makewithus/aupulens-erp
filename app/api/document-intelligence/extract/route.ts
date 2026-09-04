import crypto from "node:crypto";
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
import { safeEmitEvent } from "@/lib/aiRuntime/runtime/safeEmit";

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
  let fileHash: string;
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    // Hashed here — the only point the raw bytes exist; ExtractedDocument never stores
    // them (see its own doc comment), and extractContent() converts buffer into text or
    // a base64 data URL, discarding the original reference (docs/ai/BRIEF-02-BATCH-A.md AI-01 step 1).
    fileHash = crypto.createHash("sha256").update(buffer).digest("hex");
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
    fileHash,
  });

  // Duplicate check against existing vendor bills.
  const existing = await loadExistingBills(session.user.tenantId);
  const duplicates = findDuplicates(outcome.data, existing);

  // Additive: lets AI-01 react to new documents on its own, without changing this
  // route's own response shape or behavior at all (docs/ai/BRIEF-02-BATCH-A.md B.2).
  // actingUserId is the real uploader — this is a human-initiated action, not a
  // background/autonomous trigger, so a real acting user genuinely exists here.
  await safeEmitEvent(session.user.tenantId, "document.received", {
    extractedDocumentId: String(doc._id),
    actingUserId: session.user.id,
  });

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
