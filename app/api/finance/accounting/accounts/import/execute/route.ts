import { NextResponse } from "next/server";
import { requireTenantId } from "@/lib/auth/requireTenantId";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import Account from "@/models/finance/Account";
import AccountType from "@/models/finance/AccountType";
import * as xlsx from "xlsx";
import { validateSpreadsheetFile } from "@/lib/utils/fileValidation";

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    await connectDB();
    const tenantIdGuard = requireTenantId(session);
    if (tenantIdGuard) return tenantIdGuard;
    const tenantId = session.user.tenantId;

    const formData = await request.formData();
    const file = formData.get("file") as File;
    const mappingStr = formData.get("mapping") as string;
    const duplicateHandling = formData.get("duplicateHandling") as string;

    if (!file || !mappingStr) return NextResponse.json({ error: "Missing file or mapping" }, { status: 400 });

    const fileError = validateSpreadsheetFile(file);
    if (fileError) return NextResponse.json({ error: fileError }, { status: 400 });

    const mapping = JSON.parse(mappingStr);

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const workbook = xlsx.read(buffer, { type: "buffer" });
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];

    // Convert sheet to json (array of objects)
    const rawData = xlsx.utils.sheet_to_json(worksheet) as any[];
    
    let imported = 0;
    let skipped = 0;
    let overwritten = 0;
    let errors = [];

    // Pre-fetch account types to map names to IDs
    const types = await AccountType.find({ tenantId });
    const typeMap = new Map(types.map(t => [t.name.toLowerCase(), t._id]));

    for (let i = 0; i < rawData.length; i++) {
      const row = rawData[i];
      const accountName = row[mapping.accountName];
      const accountCode = row[mapping.accountCode];
      const typeName = row[mapping.accountType];
      const description = row[mapping.description];

      if (!accountName || !typeName) {
        errors.push(`Row ${i + 2}: Missing required fields (Account Name or Account Type)`);
        continue;
      }

      const accountTypeId = typeMap.get(String(typeName).trim().toLowerCase());
      if (!accountTypeId) {
        errors.push(`Row ${i + 2}: Account Type '${typeName}' not found in system`);
        continue;
      }

      const existingAccount = await Account.findOne({
        tenantId,
        $or: [
          { accountName: String(accountName).trim() },
          ...(accountCode ? [{ accountCode: String(accountCode).trim() }] : [])
        ]
      });

      if (existingAccount) {
        if (duplicateHandling === "skip") {
          skipped++;
          continue;
        } else if (duplicateHandling === "overwrite") {
          if (existingAccount.isLocked) {
            errors.push(`Row ${i + 2}: Cannot overwrite locked system account '${accountName}'`);
            skipped++;
            continue;
          }
          await Account.updateOne(
            { _id: existingAccount._id },
            {
              $set: {
                accountName: String(accountName).trim(),
                accountCode: accountCode ? String(accountCode).trim() : undefined,
                accountType: accountTypeId,
                description: description ? String(description) : undefined,
              }
            }
          );
          overwritten++;
          continue;
        }
      }

      try {
        await Account.create({
          tenantId,
          accountName: String(accountName).trim(),
          accountCode: accountCode ? String(accountCode).trim() : undefined,
          accountType: accountTypeId,
          description: description ? String(description) : undefined,
          isLocked: false,
          isActive: true,
          status: "active",
          watchlist: false,
          createdBy: session.user.id,
        });
        imported++;
      } catch (e: any) {
        errors.push(`Row ${i + 2}: ${e.message}`);
      }
    }

    return NextResponse.json({
      success: true,
      imported,
      skipped,
      overwritten,
      errors
    });
  } catch (error) {
    console.error("Account Import Execution Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
