import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import Payment from "@/models/Payment";
import {
  validateAllocations,
  validateAllocationAmounts,
  applyAllocationsToInvoices,
  reverseAllocationsOnInvoices,
} from "@/lib/sales/paymentAllocation";
import { postCustomerPaymentJournal, type CustomerPaymentSnapshot } from "@/lib/accounting/payments";
import { PAYMENT_STATUS, SALES_INVOICE_STATUS } from "@/lib/constants/statuses";
import "@/models/Customer";
import { SalesInvoice } from "@/models/SalesInvoice";
import JournalEntry from "@/models/JournalEntry";
import "@/models/Account";

const ZERO_PAYMENT_SNAPSHOT: CustomerPaymentSnapshot = {
  allocatedTotal: 0,
  unusedAmount: 0,
  bankCharges: 0,
  tdsAmount: 0,
};

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    await connectDB();
    const { id } = await params;
    const payment = await (Payment as any)
      .findOne({ _id: id, tenantId: session.user.tenantId })
      .populate("customerId", "header contact_details")
      .populate("allocations.invoiceId", "number totalAmount")
      .populate("depositToAccountId", "name code")
      .lean();

    if (!payment) {
      return NextResponse.json({ success: false, message: "Payment not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true, data: payment });
  } catch (error: any) {
    console.error("Payment GET error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

/**
 * Handles both "edit a draft/re-save" and "void a paid payment". Either way,
 * any previously-applied allocations are reversed first (a no-op if the
 * payment was still a draft), then re-applied if the resulting status is
 * "paid" — this keeps invoice paid/due state correct across edits, not just
 * on first save.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    await connectDB();
    const tenantId = session.user.tenantId;
    const { id } = await params;
    const body = await request.json();

    const payment = await Payment.findOne({ _id: id, tenantId });
    if (!payment) {
      return NextResponse.json({ success: false, message: "Payment not found" }, { status: 404 });
    }

    if (payment.status === PAYMENT_STATUS.PAID) {
      await reverseAllocationsOnInvoices(tenantId, String(payment._id));
    }

    if (body.action === "void") {
      payment.status = PAYMENT_STATUS.VOID;
      try {
        // Posts a reversing entry (mirror-image of whatever was last
        // posted) — never mutates the original journal entry.
        await postCustomerPaymentJournal({
          payment,
          tenantId,
          createdBy: session.user.id,
          current: ZERO_PAYMENT_SNAPSHOT,
        });
      } catch (postingError: any) {
        return NextResponse.json({ success: false, message: postingError.message }, { status: 400 });
      }
      await payment.save();
      return NextResponse.json({ success: true, data: payment });
    }

    const amountReceived = body.amountReceived !== undefined ? Number(body.amountReceived) : payment.amountReceived;
    const bankCharges = body.bankCharges !== undefined ? Number(body.bankCharges) || 0 : payment.bankCharges;
    const taxDeducted = body.taxDeducted !== undefined ? !!body.taxDeducted : payment.taxDeducted;
    const tdsAmount = taxDeducted ? Number(body.tdsAmount ?? payment.tdsAmount) || 0 : 0;
    const allocations = (body.allocations || payment.allocations).filter(
      (a: any) => a.invoiceId && Number(a.amount) > 0,
    );

    let unusedAmount: number;
    try {
      unusedAmount = validateAllocations(allocations, amountReceived, bankCharges, tdsAmount);
    } catch (e: any) {
      return NextResponse.json({ success: false, message: e.message }, { status: 400 });
    }

    const wantsPaid = body.status === PAYMENT_STATUS.PAID;
    let targetInvoices: { _id: any; number: string; status: string }[] = [];
    if (wantsPaid && allocations.length) {
      // Same guard as the create route: a draft/cancelled invoice's status
      // never auto-derives from resolveInvoiceStatus, so allowing it here
      // would silently attach a "paid" payment with no visible effect.
      const invoiceIds = allocations.map((a: any) => a.invoiceId);
      targetInvoices = await (SalesInvoice as any)
        .find({ _id: { $in: invoiceIds }, tenantId })
        .select("_id number status totalAmount payments")
        .lean();
      const blocked = targetInvoices.find(
        (inv: any) => inv.status === SALES_INVOICE_STATUS.DRAFT || inv.status === SALES_INVOICE_STATUS.CANCELLED,
      );
      if (blocked) {
        return NextResponse.json(
          { success: false, message: `Invoice ${blocked.number} is ${blocked.status} and cannot receive a payment.` },
          { status: 400 },
        );
      }
      // This payment's own previous allocations were already reversed above
      // (if it was previously paid), so `payments` here reflects every OTHER
      // payment's contribution — exactly what's needed to validate the new
      // allocation amounts against each invoice's true remaining balance.
      try {
        validateAllocationAmounts(allocations, targetInvoices as any);
      } catch (e: any) {
        return NextResponse.json({ success: false, message: e.message }, { status: 400 });
      }
    }

    payment.customerId = body.customerId || payment.customerId;
    payment.amountReceived = amountReceived;
    payment.bankCharges = bankCharges;
    payment.mode = body.mode || payment.mode;
    payment.depositToAccountId = body.depositToAccountId || payment.depositToAccountId;
    payment.reference = body.reference ?? payment.reference;
    payment.taxDeducted = taxDeducted;
    payment.tdsAccountId = taxDeducted ? body.tdsAccountId ?? payment.tdsAccountId : undefined;
    payment.tdsAmount = tdsAmount;
    payment.allocations = allocations;
    payment.unusedAmount = unusedAmount;
    payment.notes = body.notes ?? payment.notes;
    payment.paymentDate = body.paymentDate ? new Date(body.paymentDate) : payment.paymentDate;
    payment.status = wantsPaid ? PAYMENT_STATUS.PAID : PAYMENT_STATUS.DRAFT;

    // Reconcile the GL to this payment's new state — a no-op (idempotent)
    // if nothing allocation/charge/TDS-relevant actually changed, a full
    // reversal if going from paid back to draft, or a clean reclass entry
    // if only the allocation mix shifted (e.g. previously-unused/excess
    // amount now applied to a newly-added invoice).
    //
    // Journal posting and applying allocations to invoices must be
    // all-or-nothing (see the same fix in the POST route above) — this used
    // to save the payment (with the journal entry already posted) *before*
    // applying allocations, so a failure there (e.g. a SalesInvoice
    // validation error) left a committed "paid" payment with a posted
    // journal entry while the invoice was never actually marked paid.
    const allocatedTotal = allocations.reduce((acc: number, a: any) => acc + (Number(a.amount) || 0), 0);
    const journalEntryCountBefore = payment.journalEntryIds?.length || 0;
    try {
      await postCustomerPaymentJournal({
        payment,
        tenantId,
        createdBy: session.user.id,
        current: wantsPaid
          ? { allocatedTotal, unusedAmount, bankCharges, tdsAmount }
          : ZERO_PAYMENT_SNAPSHOT,
        invoiceNumbers: targetInvoices.map((inv) => inv.number),
      });

      if (payment.status === PAYMENT_STATUS.PAID && allocations.length) {
        await applyAllocationsToInvoices({
          tenantId,
          paymentId: String(payment._id),
          paymentNumber: payment.paymentNumber,
          paymentDate: payment.paymentDate,
          mode: payment.mode,
          allocations,
        });
      }

      await payment.save();
    } catch (postingError: any) {
      const newJournalEntryIds = (payment.journalEntryIds || []).slice(journalEntryCountBefore);
      if (newJournalEntryIds.length) {
        await JournalEntry.deleteMany({ _id: { $in: newJournalEntryIds }, tenantId });
      }
      return NextResponse.json({ success: false, message: postingError.message }, { status: 400 });
    }

    return NextResponse.json({ success: true, data: payment });
  } catch (error: any) {
    console.error("Payment PATCH error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
