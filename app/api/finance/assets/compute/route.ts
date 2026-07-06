import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import Asset from "@/models/Asset";
import JournalEntry from "@/models/JournalEntry";
import { DOCUMENT_STATUS, VOUCHER_TYPE } from "@/lib/constants/statuses";
import { createPostedJournalEntry } from "@/lib/accounting/posting";
import { escapeRegex } from "@/lib/utils/regex";

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const tenantId = (session.user as any).tenantId || "default-tenant";
    const { assetId } = await req.json();

    await dbConnect();

    const asset = await Asset.findOne({ _id: assetId, tenantId });
    if (!asset || asset.status !== DOCUMENT_STATUS.POSTED) {
      return NextResponse.json(
        { error: "Asset not found or not in posted/running state" },
        { status: 404 },
      );
    }

    // Basic Linear Depreciation Logic
    // Depreciation per year = (Original Value - Salvage Value) / Duration
    const annualDepreciation =
      (asset.originalValue - asset.salvageValue) / asset.durationYears;
    const monthlyDepreciation = annualDepreciation / 12;

    // Create a Journal Entry for this month's depreciation
    const baseName = `DEP/${asset.name}/${new Date().toISOString().slice(0, 7)}`;
    let entryName = baseName;

    // Check for existing entries and add sequence if needed to avoid duplicate key error
    // This allows multiple test computations for the same month during demo/testing
    const count = await JournalEntry.countDocuments({
      tenantId,
      "header.name": { $regex: new RegExp(`^${escapeRegex(baseName)}`) },
    });

    if (count > 0) {
      entryName = `${baseName}/${String(count + 1).padStart(2, "0")}`;
    }

    const journalEntry = await createPostedJournalEntry({
      tenantId,
      header: {
        name: entryName,
        date: new Date(),
        ref: asset.name,
        journalType: "general",
      },
      voucherType: VOUCHER_TYPE.JOURNAL,
      lineIds: [
        {
          accountId: asset.accounts.depreciationAccountId,
          label: `Depreciation for ${asset.name}`,
          debit: monthlyDepreciation,
          credit: 0,
        },
        {
          accountId: asset.accounts.assetAccountId,
          label: `Depreciation for ${asset.name}`,
          debit: 0,
          credit: monthlyDepreciation,
        },
      ],
      totals: {
        amountUntaxed: monthlyDepreciation,
        amountTax: 0,
        amountTotal: monthlyDepreciation,
      },
    });

    return NextResponse.json({ success: true, journalEntry });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
