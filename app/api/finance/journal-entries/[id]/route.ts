import { NextRequest, NextResponse } from "next/server";
import { isValidObjectId } from "mongoose";
import { requireTenantId } from "@/lib/auth/requireTenantId";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import JournalEntry from "@/models/finance/JournalEntry";
import { journalPolicy } from "@/lib/accounting/journalPolicy";
import { stripProtectedFields } from "@/lib/api/validateId";
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
import { applySemanticRulesAndClassify } from "@/lib/accounting/smart-rules";
import { assertTransactionNotLocked, TransactionLockError } from "@/lib/accounting/transactionLock";
import { withAccountingTransaction } from "@/lib/accounting/transaction";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (!session)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const role = (session.user as any)?.role;
    if (!["finance", "admin", "master-admin"].includes(role)) {
      return NextResponse.json({ error: "Forbidden: Finance role required" }, { status: 403 });
    }

    const { id } = await params;
    if (!isValidObjectId(id)) {
      return NextResponse.json({ error: "Invalid identifier format" }, { status: 400 });
    }

    const tenantIdGuard = requireTenantId(session);
    if (tenantIdGuard) return tenantIdGuard;
    const tenantId = (session.user as any).tenantId;
    await dbConnect();

    const item = await JournalEntry.findOne({ _id: id, tenantId })
      .populate("lineIds.accountId")
      .populate("lineIds.partnerId").lean();

    if (!item)
      return NextResponse.json({ error: "Entry not found" }, { status: 404 });

    return NextResponse.json(item);
  } catch (error: any) {
    console.error("Journal entry fetch failed", error);
    return NextResponse.json(
      { error: "Unable to fetch journal entry", code: "JOURNAL_ENTRY_FETCH_FAILED" },
      { status: 500 },
    );
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

    const role = (session.user as any)?.role;
    if (!["finance", "admin", "master-admin"].includes(role)) {
      return NextResponse.json({ error: "Forbidden: Finance role required" }, { status: 403 });
    }

    const { id } = await params;
    if (!isValidObjectId(id)) {
      return NextResponse.json({ error: "Invalid identifier format" }, { status: 400 });
    }

    const body = stripProtectedFields(await req.json(), [
      "approvalRequired", "validatedAt", "validatedBy", "ledgerUpdatedAt",
    ]) as Record<string, any>;
    const userId = (session.user as any).id;
    const tenantIdCheck = requireTenantId(session);
    if (tenantIdCheck) return tenantIdCheck;
    const tenantId = (session.user as any).tenantId;

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

    // Apply Smart Rules
    return await withAccountingTransaction(async () => {
      const classification = await applySemanticRulesAndClassify(body, tenantId);
      if (!classification.ok) {
        return NextResponse.json({ error: classification.error }, { status: 400 });
      }

      const existing = await JournalEntry.findOne({ _id: id, tenantId });
      if (!existing)
        return NextResponse.json({ error: "Entry not found" }, { status: 404 });

      try {
        await assertTransactionNotLocked(tenantId, "accountant", existing.header?.date);
        if (body.header?.date) {
          await assertTransactionNotLocked(tenantId, "accountant", body.header.date);
        }
      } catch (lockError) {
        if (lockError instanceof TransactionLockError) {
          return NextResponse.json({ error: lockError.message }, { status: 403 });
        }
        throw lockError;
      }

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

      // AUP-004: All posting transitions must route through the voucher state machine.
      // If client requested status "posted", sync with voucherStatus "posted" to enforce transition validation.
      if (body.status === DOCUMENT_STATUS.POSTED && body.voucherStatus && body.voucherStatus !== VOUCHER_STATUS.POSTED) {
        return NextResponse.json({ error: "Conflicting document and voucher status" }, { status: 400 });
      }
      if (body.status === DOCUMENT_STATUS.POSTED && !body.voucherStatus) {
        body.voucherStatus = VOUCHER_STATUS.POSTED;
      }

      const policyError = await journalPolicy(tenantId, { ...(existing.toObject ? existing.toObject() : existing), lineIds: body.lineIds || existing.lineIds }, role, body.voucherStatus);
      if (policyError) return NextResponse.json({ error: policyError }, { status: 400 });

      // ─── Voucher status transition handling ───
      if (body.voucherStatus && body.voucherStatus !== existing.voucherStatus) {
        const currentStatus = existing.voucherStatus as VoucherStatus;
        const nextStatus = body.voucherStatus as VoucherStatus;

        if (existing.approvalRequired && currentStatus === VOUCHER_STATUS.VALIDATED && nextStatus === VOUCHER_STATUS.APPROVED) {
          return NextResponse.json({ error: "Entry must be submitted for approval first" }, { status: 400 });
        }

        if (!isValidVoucherTransition(currentStatus, nextStatus)) {
          return NextResponse.json(
            {
              error: `Invalid status transition: ${currentStatus} → ${nextStatus}. Entries must follow draft -> validated -> approved -> posted.`,
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

      // AUP-003: Strip protected fields from mass assignment
      delete body._id;
      delete body.tenantId;
      delete body.createdBy;
      delete body.createdAt;

      const item = await JournalEntry.findOneAndUpdate(
        { _id: id, tenantId, voucherStatus: existing.voucherStatus, status: existing.status },
        { $set: body },
        { new: true, runValidators: true },
      );

      if (!item) return NextResponse.json({ error: "Entry changed; reload before retrying" }, { status: 409 });

      return NextResponse.json(item);
    });
  } catch (error: any) {
    console.error("Journal entry update failed", error);
    return NextResponse.json(
      { error: "Unable to update journal entry", code: "JOURNAL_ENTRY_UPDATE_FAILED" },
      { status: 500 },
    );
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

    const role = (session.user as any)?.role;
    if (!["finance", "admin", "master-admin"].includes(role)) {
      return NextResponse.json({ error: "Forbidden: Finance role required" }, { status: 403 });
    }

    const { id } = await params;
    if (!isValidObjectId(id)) {
      return NextResponse.json({ error: "Invalid identifier format" }, { status: 400 });
    }

    const tenantIdCheck = requireTenantId(session);
    if (tenantIdCheck) return tenantIdCheck;
    const tenantId = (session.user as any).tenantId;
    await dbConnect();

    return await withAccountingTransaction(async () => {
      const existing = await JournalEntry.findOne({ _id: id, tenantId });
      if (!existing)
        return NextResponse.json({ error: "Entry not found" }, { status: 404 });

      // Prevent deleting posted/validated vouchers
      const isPostedOrApproved =
        existing.voucherStatus === VOUCHER_STATUS.POSTED ||
        existing.voucherStatus === VOUCHER_STATUS.APPROVED ||
        existing.status === DOCUMENT_STATUS.POSTED;
      if (isPostedOrApproved) {
        return NextResponse.json(
          { error: "Cannot delete posted or approved entries. Post a reversal voucher instead." },
          { status: 400 },
        );
      }

      try {
        await assertTransactionNotLocked(tenantId, "accountant", existing.header?.date);
      } catch (lockError) {
        if (lockError instanceof TransactionLockError) {
          return NextResponse.json({ error: lockError.message }, { status: 403 });
        }
        throw lockError;
      }

      await JournalEntry.findOneAndDelete({ _id: id, tenantId });

      return NextResponse.json({ message: "Entry deleted" });
    });
  } catch (error: any) {
    console.error("Journal entry deletion failed", error);
    return NextResponse.json(
      { error: "Unable to delete journal entry", code: "JOURNAL_ENTRY_DELETE_FAILED" },
      { status: 500 },
    );
  }
}
