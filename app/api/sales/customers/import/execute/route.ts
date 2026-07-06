import { NextResponse } from "next/server";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import Customer from "@/models/Customer";
import { IMPORT_DUPLICATE_HANDLING } from "@/lib/constants/statuses";
import * as xlsx from "xlsx";
import { validateSpreadsheetFile } from "@/lib/utils/fileValidation";

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    await connectDB();
    const tenantId = session.user.tenantId || "default-tenant";

    const formData = await request.formData();
    const file = formData.get("file") as File;
    const mappingStr = formData.get("mapping") as string;
    const duplicateHandling = (formData.get("duplicateHandling") as string) || IMPORT_DUPLICATE_HANDLING.SKIP;

    if (!file || !mappingStr) {
      return NextResponse.json({ error: "Missing file or mapping" }, { status: 400 });
    }

    const fileError = validateSpreadsheetFile(file);
    if (fileError) return NextResponse.json({ error: fileError }, { status: 400 });

    const mapping = JSON.parse(mappingStr) as Record<string, string>;
    const bytes = await file.arrayBuffer();
    const workbook = xlsx.read(Buffer.from(bytes), { type: "buffer" });
    const rows = xlsx.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]) as any[];

    let imported = 0;
    let skipped = 0;
    let overwritten = 0;
    const errors: string[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const displayName = mapping.displayName ? row[mapping.displayName] : undefined;
      const email = mapping.email ? row[mapping.email] : undefined;

      if (!displayName) {
        errors.push(`Row ${i + 2}: Display Name is required`);
        continue;
      }

      const doc = {
        tenantId,
        header: {
          name: String(displayName).trim(),
          displayName: String(displayName).trim(),
          companyName: mapping.companyName ? String(row[mapping.companyName] || "").trim() : undefined,
          customerType: mapping.customerType ? String(row[mapping.customerType] || "business").trim() : "business",
          is_company: true,
        },
        contact_details: {
          email: email ? String(email).trim().toLowerCase() : undefined,
          phone: mapping.phone ? String(row[mapping.phone] || "").trim() : undefined,
          mobile: mapping.mobile ? String(row[mapping.mobile] || "").trim() : undefined,
        },
        gstin: mapping.gstin ? String(row[mapping.gstin] || "").trim() : undefined,
        pan: mapping.pan ? String(row[mapping.pan] || "").trim() : undefined,
        currency: mapping.currency ? String(row[mapping.currency] || "INR").trim() : "INR",
        openingBalance: mapping.openingBalance ? Number(row[mapping.openingBalance]) || 0 : 0,
        address_tab: {
          type: "invoice" as const,
          street: mapping.billingStreet ? String(row[mapping.billingStreet] || "").trim() : undefined,
          city: mapping.billingCity ? String(row[mapping.billingCity] || "").trim() : undefined,
          state_name: mapping.billingState ? String(row[mapping.billingState] || "").trim() : undefined,
          zip: mapping.billingZip ? String(row[mapping.billingZip] || "").trim() : undefined,
        },
        createdBy: session.user.id,
      };

      const existing = email
        ? await Customer.findOne({ tenantId, "contact_details.email": doc.contact_details.email })
        : await Customer.findOne({ tenantId, "header.displayName": doc.header.displayName });

      if (existing) {
        if (duplicateHandling === IMPORT_DUPLICATE_HANDLING.SKIP) {
          skipped++;
          continue;
        }
        if (duplicateHandling === IMPORT_DUPLICATE_HANDLING.OVERWRITE) {
          await Customer.updateOne({ _id: existing._id }, { $set: doc });
          overwritten++;
          continue;
        }
        // ADD_AS_NEW falls through to create a new record below
      }

      try {
        await Customer.create(doc);
        imported++;
      } catch (e: any) {
        errors.push(`Row ${i + 2}: ${e.message}`);
      }
    }

    return NextResponse.json({ success: true, imported, skipped, overwritten, errors });
  } catch (error) {
    console.error("Customer Import Execution Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
