import { NextResponse } from "next/server";
import { requireTenantId } from "@/lib/auth/requireTenantId";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import Account from "@/models/finance/Account";
import AccountType from "@/models/finance/AccountType";

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    await connectDB();
    const tenantIdGuard = requireTenantId(session);
    if (tenantIdGuard) return tenantIdGuard;
    const tenantId = session.user.tenantId;

    const body = await request.json();
    const { mapping, data, duplicateHandling } = body;

    if (!data || !Array.isArray(data)) {
      return NextResponse.json({ error: "Invalid data format" }, { status: 400 });
    }

    let imported = 0;
    let skipped = 0;
    let overwritten = 0;
    let errors = [];

    // Pre-fetch account types to map names to IDs
    const types = await AccountType.find({ tenantId });
    const typeMap = new Map(types.map(t => [t.name.toLowerCase(), t._id]));

    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const accountName = row[mapping.accountName];
      const accountCode = row[mapping.accountCode];
      const typeName = row[mapping.accountType];
      const description = row[mapping.description];

      if (!accountName || !typeName) {
        errors.push(`Row ${i + 1}: Missing required fields (Account Name or Account Type)`);
        continue;
      }

      const accountTypeId = typeMap.get(typeName.toLowerCase());
      if (!accountTypeId) {
        errors.push(`Row ${i + 1}: Account Type '${typeName}' not found in system`);
        continue;
      }

      const existingAccount = await Account.findOne({
        tenantId,
        $or: [
          { accountName },
          ...(accountCode ? [{ accountCode }] : [])
        ]
      });

      if (existingAccount) {
        if (duplicateHandling === "skip") {
          skipped++;
          continue;
        } else if (duplicateHandling === "overwrite") {
          if (existingAccount.isLocked) {
            errors.push(`Row ${i + 1}: Cannot overwrite locked system account '${accountName}'`);
            skipped++;
            continue;
          }
          await Account.updateOne(
            { _id: existingAccount._id },
            {
              $set: {
                accountName,
                accountCode: accountCode || undefined,
                accountType: accountTypeId,
                description,
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
          accountName,
          accountCode: accountCode || undefined,
          accountType: accountTypeId,
          description,
          isLocked: false,
          isActive: true,
          status: "active",
          watchlist: false,
          createdBy: session.user.id,
        });
        imported++;
      } catch (e: any) {
        errors.push(`Row ${i + 1}: ${e.message}`);
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
    console.error("Account Import Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
