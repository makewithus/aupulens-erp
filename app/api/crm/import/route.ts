import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import { validateImportPayload } from "@/lib/crm/import/importEngine";
import mongoose from "mongoose";
import CrmAuditLog from "@/models/crm/CrmAuditLog";
import CrmAccount from "@/models/crm/Account";
import "@/models/crm/Lead";
import "@/models/crm/Contact";
import "@/models/crm/Opportunity";
import * as xlsx from "xlsx";

const ALLOWED_EXTENSIONS = ["csv", "tsv", "xls", "xlsx"];

// Maps normalized (lowercased, non-alphanumeric stripped) spreadsheet header
// names to the canonical field names each entity's model/validator expects,
// so users can bring a CSV/XLS(X) with reasonably-named columns.
const HEADER_ALIASES: Record<string, Record<string, string>> = {
  Lead: {
    name: "lead_name",
    leadname: "lead_name",
    company: "company_name",
    companyname: "company_name",
    phone: "phone",
    mobile: "phone",
    email: "email",
    source: "source",
    industry: "industry",
    location: "location",
    priority: "priority",
  },
  Contact: {
    firstname: "first_name",
    lastname: "last_name",
    email: "email",
    mobile: "mobile",
    phone: "mobile",
    designation: "designation",
    company: "account_name",
    companyname: "account_name",
    account: "account_name",
    accountname: "account_name",
  },
  Account: {
    name: "company_name",
    company: "company_name",
    companyname: "company_name",
    industry: "industry",
    website: "website",
    type: "type",
  },
  Opportunity: {
    name: "deal_name",
    dealname: "deal_name",
    amount: "amount",
    value: "amount",
    company: "account_name",
    companyname: "account_name",
    account: "account_name",
    accountname: "account_name",
    stage: "stage",
  },
};

const ENTITY_MODEL_MAP: Record<string, string> = {
  Lead: "CrmLead",
  Contact: "CrmContact",
  Account: "CrmAccount",
  Opportunity: "CrmOpportunity",
};

function normalizeHeader(header: string) {
  return String(header).toLowerCase().replace(/[^a-z0-9]/g, "");
}

function mapRecord(raw: Record<string, any>, entityType: string) {
  const aliases = HEADER_ALIASES[entityType] || {};
  const mapped: Record<string, any> = {};
  for (const [key, value] of Object.entries(raw)) {
    const canonical = aliases[normalizeHeader(key)];
    if (!canonical || value === undefined || value === null || value === "") continue;
    mapped[canonical] = typeof value === "string" ? value.trim() : value;
  }
  return mapped;
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ success: false }, { status: 401 });

  await dbConnect();
  const tenantId = session.user.tenantId;

  const contentType = req.headers.get("content-type") || "";
  let entityType: string;
  let strict: boolean;
  let rawRecords: Record<string, any>[];

  if (contentType.includes("multipart/form-data")) {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    entityType = String(formData.get("entityType") || "");
    strict = formData.get("strict") === "true";

    if (!file) return NextResponse.json({ success: false, message: "No file provided" }, { status: 400 });

    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!ext || !ALLOWED_EXTENSIONS.includes(ext)) {
      return NextResponse.json(
        { success: false, message: "Invalid file format. Only CSV, TSV, or XLS(X) are allowed." },
        { status: 400 },
      );
    }

    let workbook;
    try {
      workbook = xlsx.read(Buffer.from(await file.arrayBuffer()), { type: "buffer" });
    } catch {
      return NextResponse.json(
        { success: false, message: "Could not parse file — is it a valid CSV/TSV/XLS(X) file?" },
        { status: 400 },
      );
    }
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    // raw:false avoids Excel serial-number dates/numbers arriving unformatted
    // (same fix applied to the Sales import routes elsewhere in this repo).
    const parsedRows = xlsx.utils.sheet_to_json(sheet, { raw: false }) as Record<string, any>[];
    rawRecords = parsedRows.map((row) => mapRecord(row, entityType));
  } else {
    const body = await req.json();
    entityType = body.entityType;
    strict = !!body.strict;
    rawRecords = Array.isArray(body.records) ? body.records : [];
  }

  if (!entityType || !ENTITY_MODEL_MAP[entityType] || rawRecords.length === 0) {
    return NextResponse.json({ success: false, message: "Invalid payload" }, { status: 400 });
  }

  const { success, validRecords, errors, duplicatesRemoved } = validateImportPayload(rawRecords, entityType);

  if (!success && strict) {
    return NextResponse.json({ success: false, message: "Validation failed", errors }, { status: 422 });
  }

  if (validRecords.length === 0) {
    return NextResponse.json({ success: false, message: "No valid records to import", errors }, { status: 422 });
  }

  const Model = mongoose.models[ENTITY_MODEL_MAP[entityType]];
  if (!Model) return NextResponse.json({ success: false, message: "Unsupported entity" }, { status: 400 });

  // A flat spreadsheet can't supply Mongo ObjectId refs directly: owner_id
  // defaults to the importing user, and account_id (Contact/Opportunity) is
  // resolved by looking up an existing Account by name — rows that can't be
  // resolved are reported as errors rather than inserted with a missing ref.
  const docsToInsert: any[] = [];
  const resolutionErrors: { row: number; data: any; reasons: string[] }[] = [];

  for (let i = 0; i < validRecords.length; i++) {
    const r = { ...validRecords[i] };
    const doc: Record<string, any> = { ...r, tenantId, createdBy: session.user.id };

    if (entityType === "Lead" || entityType === "Opportunity") {
      doc.owner_id = session.user.id;
    }

    if (entityType === "Contact" || entityType === "Opportunity") {
      const accountName = r.account_name;
      delete doc.account_name;
      if (!accountName) {
        resolutionErrors.push({
          row: i + 2,
          data: r,
          reasons: ["Missing company/account name — required to link this record to an existing Account"],
        });
        continue;
      }
      const account = await CrmAccount.findOne({ tenantId, company_name: accountName });
      if (!account) {
        resolutionErrors.push({ row: i + 2, data: r, reasons: [`Account "${accountName}" not found — create the account first`] });
        continue;
      }
      doc.account_id = account._id;
    }

    docsToInsert.push(doc);
  }

  const allErrors = [...errors, ...resolutionErrors];

  if (docsToInsert.length === 0) {
    return NextResponse.json({ success: false, message: "No valid records to import", errors: allErrors }, { status: 422 });
  }

  const inserted = await Model.insertMany(docsToInsert);

  await CrmAuditLog.create({
    tenantId,
    user_id: session.user.id,
    action: "imported",
    record_type: entityType,
    record_id: inserted[0]._id,
    new_value: `Imported ${inserted.length} records. Removed ${duplicatesRemoved} duplicates.`,
    timestamp: new Date(),
  });

  return NextResponse.json(
    {
      success: allErrors.length === 0,
      insertedCount: inserted.length,
      duplicatesRemoved,
      errors: allErrors,
    },
    { status: 201 },
  );
}
