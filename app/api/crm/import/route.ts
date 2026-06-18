import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import { validateImportPayload } from "@/lib/crm/import/importEngine";
import mongoose from "mongoose";
import CrmAuditLog from "@/models/crm/CrmAuditLog";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ success: false }, { status: 401 });

  await dbConnect();
  const body = await req.json();

  if (!body.entityType || !body.records || !Array.isArray(body.records)) {
    return NextResponse.json({ success: false, message: "Invalid payload" }, { status: 400 });
  }

  const { success, validRecords, errors, duplicatesRemoved } = validateImportPayload(body.records, body.entityType);

  if (!success && body.strict) {
    return NextResponse.json({ success: false, message: "Validation failed", errors }, { status: 422 });
  }

  if (validRecords.length === 0) {
    return NextResponse.json({ success: false, message: "No valid records to import", errors }, { status: 422 });
  }

  // Dynamic Model mapping
  const map: Record<string, string> = { "Lead": "CrmLead", "Contact": "CrmContact", "Account": "CrmAccount", "Opportunity": "CrmOpportunity" };
  const Model = mongoose.models[map[body.entityType]];
  if (!Model) return NextResponse.json({ success: false, message: "Unsupported entity" }, { status: 400 });

  const docsToInsert = validRecords.map(r => ({ ...r, tenantId: session.user.tenantId, createdBy: session.user.id }));
  const inserted = await Model.insertMany(docsToInsert);

  await CrmAuditLog.create({
    tenantId: session.user.tenantId,
    user_id: session.user.id,
    action: "imported",
    record_type: body.entityType,
    record_id: inserted[0]._id, // Storing first as ref
    new_value: `Imported ${inserted.length} records. Removed ${duplicatesRemoved} duplicates.`,
    timestamp: new Date()
  });

  return NextResponse.json({ 
    success: true, 
    insertedCount: inserted.length, 
    duplicatesRemoved, 
    errors 
  }, { status: 201 });
}
