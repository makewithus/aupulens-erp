import { NextRequest, NextResponse } from "next/server";
import { requireTenantId } from "@/lib/auth/requireTenantId";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import JournalEntry from "@/models/finance/JournalEntry";
import { DOCUMENT_STATUS, VOUCHER_STATUS } from "@/lib/constants/statuses";
import { createPostedJournalEntry } from "@/lib/accounting/posting";
import mongoose from "mongoose";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const userId = (session.user as any).id;
    const tenantIdCheck = requireTenantId(session);
    if (tenantIdCheck) return tenantIdCheck;
    const tenantId = (session.user as any).tenantId;

    await dbConnect();

    // 1. Fetch the original entry
    const originalEntry = await JournalEntry.findOne({ _id: id, tenantId });
    if (!originalEntry) {
      return NextResponse.json({ error: "Original entry not found" }, { status: 404 });
    }

    // 2. Validate states
    if (originalEntry.status !== DOCUMENT_STATUS.POSTED) {
      return NextResponse.json(
        { error: "Only posted journal entries can be reversed." },
        { status: 400 },
      );
    }

    if (originalEntry.isReversed) {
      return NextResponse.json(
        { error: "This journal entry has already been reversed." },
        { status: 400 },
      );
    }

    // 3. Swap debit and credit on lines
    const reversedLines = (originalEntry.lineIds || []).map((line: any) => {
      const lineObj = typeof line.toObject === "function" ? line.toObject() : { ...line };
      // Delete ID to let Mongoose generate new one
      delete lineObj._id;
      return {
        ...lineObj,
        debit: lineObj.credit || 0,
        credit: lineObj.debit || 0,
        label: `Reversal of [${originalEntry.header.name}]: ${lineObj.label || ""}`,
      };
    });

    // 4. Create the reversal journal entry
    const reversalRef = originalEntry.header.name;
    const reversalEntry = await createPostedJournalEntry({
      tenantId,
      header: {
        date: new Date(),
        ref: `REV-${reversalRef}`,
        journalType: originalEntry.header.journalType,
      },
      voucherType: originalEntry.voucherType || "journal",
      lineIds: reversedLines,
      totals: {
        amountUntaxed: originalEntry.totals?.amountUntaxed || 0,
        amountTax: originalEntry.totals?.amountTax || 0,
        amountTotal: originalEntry.totals?.amountTotal || 0,
      },
      createdBy: userId,
    });

    // Link the reversal entry ID to the new entry
    await JournalEntry.updateOne(
      { _id: reversalEntry._id },
      { $set: { reversedEntryId: originalEntry._id } }
    );

    // 5. Update the original entry
    originalEntry.isReversed = true;
    originalEntry.reversalEntryId = reversalEntry._id as mongoose.Types.ObjectId;
    
    // Add chatter
    originalEntry.chatter.push({
      authorId: new mongoose.Types.ObjectId(userId),
      body: `Journal entry reversed by REV ${reversalEntry.header.name}`,
      createdAt: new Date(),
    });
    
    await originalEntry.save();

    return NextResponse.json({
      success: true,
      message: "Journal entry reversed successfully",
      reversalEntry,
    });
  } catch (error: any) {
    console.error("Error reversing journal entry:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
