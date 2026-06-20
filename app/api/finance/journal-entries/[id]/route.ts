import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import JournalEntry from "@/models/JournalEntry";
import {
  DOCUMENT_STATUS,
  isValidVoucherTransition,
  VOUCHER_STATUS,
  type VoucherStatus,
} from "@/lib/constants/statuses";
import {
  requiresBalancedJournal,
  validateJournalLinesForPosting,
} from "@/lib/accounting/journal-validation";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (!session)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const tenantId = (session.user as any).tenantId || "default-tenant";
    await dbConnect();

    const item = await JournalEntry.findOne({ _id: id, tenantId })
          .populate("lineIds.accountId")
          .populate("lineIds.partnerId").lean();

    if (!item)
      return NextResponse.json({ error: "Entry not found" }, { status: 404 });

    return NextResponse.json(item);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (!session)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const body = await req.json();
    const userId = (session.user as any).id;
    const tenantId = (session.user as any).tenantId || "default-tenant";

    if (body.lineIds && Array.isArray(body.lineIds)) {
      let totalDebit = 0;
      let totalCredit = 0;

      for (const line of body.lineIds) {
        const debit = Number(line.debit) || 0;
        const credit = Number(line.credit) || 0;

        if (debit < 0 || credit < 0) {
          return NextResponse.json(
            { error: "Negative values are not allowed for debit or credit." },
            { status: 400 }
          );
        }
        
        totalDebit += debit;
        totalCredit += credit;
      }

      // Prevent unbalanced entries (allowing tiny float precision variances)
      if (Math.abs(totalDebit - totalCredit) > 0.001) {
        return NextResponse.json(
          { error: `Unbalanced journal entry: Total Debit (${totalDebit.toFixed(2)}) must exactly equal Total Credit (${totalCredit.toFixed(2)}).` },
          { status: 400 }
        );
      }
    }

    await dbConnect();

    const existing = await JournalEntry.findOne({ _id: id, tenantId });
    if (!existing)
      return NextResponse.json({ error: "Entry not found" }, { status: 404 });

    const existingIsPosted =
      existing.voucherStatus === VOUCHER_STATUS.POSTED ||
      existing.status === DOCUMENT_STATUS.POSTED;
    if (
      existingIsPosted &&
      Object.keys(body).some((key) => key !== "chatter")
    ) {
      return NextResponse.json(
        { error: "Posted vouchers are immutable. Create a reversal entry instead." },
        { status: 400 },
      );
    }

    const quickPostRequested =
      body.status === DOCUMENT_STATUS.POSTED &&
      !body.voucherStatus &&
      !existingIsPosted;

    // ─── Voucher status transition handling ───
    if (body.voucherStatus && body.voucherStatus !== existing.voucherStatus) {
      const currentStatus = existing.voucherStatus as VoucherStatus;
      const nextStatus = body.voucherStatus as VoucherStatus;

      if (!isValidVoucherTransition(currentStatus, nextStatus)) {
        return NextResponse.json(
          {
            error: `Invalid status transition: ${currentStatus} → ${nextStatus}`,
          },
          { status: 400 },
        );
      }

      if (nextStatus === VOUCHER_STATUS.VALIDATED) {
        body.validatedAt = new Date();
        body.validatedBy = userId;
      }

      // Approval
      if (nextStatus === VOUCHER_STATUS.APPROVED) {
        body.approvalDetails = {
          ...existing.approvalDetails,
          approvedBy: userId,
          approvedAt: new Date(),
        };
      }

      // Rejection
      if (nextStatus === VOUCHER_STATUS.REJECTED) {
        body.approvalDetails = {
          ...existing.approvalDetails,
          rejectedBy: userId,
          rejectedAt: new Date(),
          reason: body.rejectionReason || "",
        };
      }

      // Post → update ledger timestamp, sync document status
      if (nextStatus === VOUCHER_STATUS.POSTED) {
        body.ledgerUpdatedAt = new Date();
        body.status = DOCUMENT_STATUS.POSTED;
      }

      // Re-draft on rejection
      if (nextStatus === VOUCHER_STATUS.DRAFT && currentStatus === VOUCHER_STATUS.REJECTED) {
        body.validatedAt = null;
        body.validatedBy = null;
        body.approvalDetails = {};
      }
    }

    if (quickPostRequested) {
      body.voucherStatus = VOUCHER_STATUS.POSTED;
      body.status = DOCUMENT_STATUS.POSTED;
      body.ledgerUpdatedAt = body.ledgerUpdatedAt || new Date();
      body.validatedAt = body.validatedAt || new Date();
      body.validatedBy = body.validatedBy || userId;
    }

    const nextVoucherStatus = body.voucherStatus || existing.voucherStatus;
    const nextStatus = body.status || existing.status;
    if (
      body.status === DOCUMENT_STATUS.POSTED &&
      existing.status !== DOCUMENT_STATUS.POSTED
    ) {
      body.ledgerUpdatedAt = body.ledgerUpdatedAt || new Date();
    }
    if (
      requiresBalancedJournal({
        status: nextStatus,
        voucherStatus: nextVoucherStatus,
      })
    ) {
      const lines = body.lineIds || existing.lineIds || [];
      const validationError = validateJournalLinesForPosting(lines);
      if (validationError) {
        return NextResponse.json({ error: validationError }, { status: 400 });
      }
    }

    const item = await JournalEntry.findOneAndUpdate(
      { _id: id, tenantId },
      { $set: body },
      { new: true },
    );

    return NextResponse.json(item);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (!session)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const tenantId = (session.user as any).tenantId || "default-tenant";
    await dbConnect();

    const existing = await JournalEntry.findOne({ _id: id, tenantId });
    if (!existing)
      return NextResponse.json({ error: "Entry not found" }, { status: 404 });

    // Prevent deleting posted/validated vouchers
    if (
      existing.voucherStatus === VOUCHER_STATUS.POSTED ||
      existing.voucherStatus === VOUCHER_STATUS.APPROVED
    ) {
      return NextResponse.json(
        { error: "Cannot delete posted or approved entries" },
        { status: 400 },
      );
    }

    await JournalEntry.findOneAndDelete({ _id: id, tenantId });

    return NextResponse.json({ message: "Entry deleted" });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
