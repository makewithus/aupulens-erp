import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import Invoice from "@/models/Invoice";
import JournalEntry from "@/models/JournalEntry";
import Account from "@/models/Account";
import {
  DOCUMENT_STATUS,
  PAYMENT_STATE,
  VOUCHER_STATUS,
  VOUCHER_TYPE,
  isValidTransition,
  type DocumentStatus,
} from "@/lib/constants/statuses";
import { validateJournalLinesForPosting } from "@/lib/accounting/journal-validation";
import { ensureChartOfAccounts } from "@/lib/accounting/coa-seeder";
import { postInvoicePayment } from "@/lib/accounting/payments";
import { createPostedJournalEntry } from "@/lib/accounting/posting";

const roundCurrency = (value: number) => Number(value.toFixed(2));

async function ensureBillPostingJournal(
  currentBill: any,
  tenantId: string,
  createdByUserId: string,
) {
  if (!currentBill.invoiceLines?.length) {
    throw new Error("At least one bill line is required before posting.");
  }

  await ensureChartOfAccounts(tenantId, createdByUserId);

  let payableAccountId = currentBill.payableAccountId;
  if (!payableAccountId) {
    const defaultPayable = await Account.findOne({
      tenantId,
      account_type: "liability_payable",
    });
    if (!defaultPayable) {
      throw new Error("Payable account is required before posting.");
    }
    payableAccountId = defaultPayable._id;
    currentBill.payableAccountId = defaultPayable._id;
  }

  for (const line of currentBill.invoiceLines || []) {
    if (line.accountId) continue;
    const expenseAccount = await Account.findOne({
      tenantId,
      account_type: "expense",
    });
    if (!expenseAccount) {
      throw new Error(
        `Line account missing for ${line.name || "bill line"}. Configure an expense account first.`,
      );
    }
    line.accountId = expenseAccount._id as any;
  }

  const subtotal = currentBill.invoiceLines.reduce(
    (sum: number, line: any) => sum + (Number(line.priceSubtotal) || 0),
    0,
  );
  const total = roundCurrency(Number(currentBill.amountTotal) || 0);
  let allocated = 0;
  const expenseLines = currentBill.invoiceLines.map((line: any, index: number) => {
    const amount =
      index === currentBill.invoiceLines.length - 1
        ? roundCurrency(total - allocated)
        : roundCurrency(
            subtotal > 0
              ? ((Number(line.priceSubtotal) || 0) / subtotal) * total
              : total / currentBill.invoiceLines.length,
          );
    allocated = roundCurrency(allocated + amount);

    return {
      accountId: line.accountId,
      label: line.name || currentBill.name,
      debit: amount,
      credit: 0,
      sourceDocument: currentBill.name,
      sourceId: currentBill._id,
    };
  });

  const lineIds = [
    ...expenseLines,
    {
      accountId: payableAccountId,
      partnerId: currentBill.partnerId,
      label: `Payable for ${currentBill.name}`,
      debit: 0,
      credit: total,
      maturityDate: currentBill.dueDate,
      sourceDocument: currentBill.name,
      sourceId: currentBill._id,
    },
  ];

  const validationError = validateJournalLinesForPosting(lineIds);
  if (validationError) {
    throw new Error(validationError);
  }

  const entryName = `JE/${currentBill.name}`;
  const existingEntry = await JournalEntry.findOne({
    "header.ref": currentBill.name,
    tenantId,
  });

  if (existingEntry) {
    if (existingEntry.status === DOCUMENT_STATUS.POSTED) {
      currentBill.journalId = existingEntry._id;
      return existingEntry;
    }

    existingEntry.lineIds = lineIds;
    existingEntry.totals = {
      amountUntaxed: currentBill.amountUntaxed,
      amountTax: currentBill.amountTax,
      amountTotal: currentBill.amountTotal,
    };
    existingEntry.voucherType = VOUCHER_TYPE.PURCHASE;
    existingEntry.voucherStatus = VOUCHER_STATUS.POSTED;
    existingEntry.status = DOCUMENT_STATUS.POSTED;
    existingEntry.ledgerUpdatedAt = new Date();
    await existingEntry.save();
    currentBill.journalId = existingEntry._id;
    return existingEntry;
  }

  const journalEntry = await createPostedJournalEntry({
    tenantId,
    header: {
      name: entryName,
      date: new Date(),
      ref: currentBill.name,
      journalType: "purchase",
    },
    voucherType: VOUCHER_TYPE.PURCHASE,
    lineIds,
    totals: {
      amountUntaxed: currentBill.amountUntaxed,
      amountTax: currentBill.amountTax,
      amountTotal: currentBill.amountTotal,
    },
    createdBy: createdByUserId,
  });

  currentBill.journalId = journalEntry._id;
  return journalEntry;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tenantId = (session.user as any).tenantId || "default-tenant";
    const { id } = await params;
    await dbConnect();

    const item = await Invoice.findOne({ _id: id, tenantId }).populate(
      "partnerId",
      "header.name contact_details.email",
    );

    if (!item) {
      return NextResponse.json({ error: "Bill not found" }, { status: 404 });
    }

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
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tenantId = (session.user as any).tenantId || "default-tenant";
    const { id } = await params;
    const body = await req.json();

    await dbConnect();

    // Get current bill to check status change
    const currentBill = await Invoice.findOne({ _id: id, tenantId });
    if (!currentBill) {
      return NextResponse.json({ error: "Bill not found" }, { status: 404 });
    }

    if (body.poMatchStatus === "mismatch") {
      body.manualReviewRequired = true;
      body.state = DOCUMENT_STATUS.DRAFT;
    }

    if (body.poMatchStatus === "matched") {
      body.manualReviewRequired = false;
      if (!body.state && currentBill.state === DOCUMENT_STATUS.DRAFT) {
        body.state = DOCUMENT_STATUS.PENDING_APPROVAL;
      }
    }

    if (body.status === "paid" && !body.paymentState) {
      body.paymentState = PAYMENT_STATE.PAID;
    }

    if (body.paymentState === PAYMENT_STATE.IN_PAYMENT && !body.paymentScheduledDate) {
      body.paymentScheduledDate = new Date();
    }

    if (body.paymentState === PAYMENT_STATE.PAID && !body.paidDate) {
      body.paidDate = new Date();
    }

    const targetState = (body.state ?? currentBill.state) as DocumentStatus;
    if (body.state && !isValidTransition(currentBill.state as DocumentStatus, targetState)) {
      return NextResponse.json(
        {
          error: `Invalid state transition from ${currentBill.state} to ${targetState}`,
        },
        { status: 400 },
      );
    }

    if (
      (body.state === DOCUMENT_STATUS.PENDING_APPROVAL ||
        body.state === DOCUMENT_STATUS.APPROVED ||
        body.state === DOCUMENT_STATUS.POSTED) &&
      (body.poMatchStatus ?? currentBill.poMatchStatus) !== "matched"
    ) {
      return NextResponse.json(
        {
          error: "PO matching is required before AP invoice approval and posting.",
        },
        { status: 400 },
      );
    }

    if (body.state === DOCUMENT_STATUS.POSTED && currentBill.state !== DOCUMENT_STATUS.POSTED) {
      if (currentBill.state !== DOCUMENT_STATUS.APPROVED) {
        return NextResponse.json(
          {
            error:
              "Bill must be approved before posting to ledger.",
          },
          { status: 400 },
        );
      }

      await ensureBillPostingJournal(currentBill, tenantId, session.user.id);
      currentBill.state = DOCUMENT_STATUS.POSTED;
      await currentBill.save();
      body.state = DOCUMENT_STATUS.POSTED;
    }

    const wantsPaymentPosting =
      body.paymentState === PAYMENT_STATE.PAID || body.paymentAmount !== undefined;

    if (wantsPaymentPosting) {
      if (currentBill.state !== DOCUMENT_STATUS.POSTED) {
        if (currentBill.state !== DOCUMENT_STATUS.APPROVED) {
          return NextResponse.json(
            {
              error:
                "Bill must be approved and posted before payment execution.",
            },
            { status: 400 },
          );
        }

        await ensureBillPostingJournal(currentBill, tenantId, session.user.id);
        currentBill.state = DOCUMENT_STATUS.POSTED;
      }

      await postInvoicePayment({
        invoice: currentBill,
        tenantId,
        createdBy: session.user.id,
        amount:
          body.paymentAmount !== undefined
            ? Number(body.paymentAmount)
            : undefined,
        paymentDate: body.paidDate ? new Date(body.paidDate) : new Date(),
        paymentAccountId: body.paymentAccountId,
        reference: body.reference,
      });

      body.state = currentBill.state;
      body.amountResidual = currentBill.amountResidual;
      body.paymentState = currentBill.paymentState;
      if (currentBill.paidDate) body.paidDate = currentBill.paidDate;
      await currentBill.save();
    }

    const bill = await Invoice.findOneAndUpdate(
      { _id: id, tenantId },
      { $set: body },
      { new: true },
    );

    if (bill) {
      try {
        const { runPOMatching } = await import("@/lib/accounting/matching");
        await runPOMatching(String(bill._id), tenantId);
      } catch (matchError) {
        console.error("Auto-matching failed on bill update:", matchError);
      }
    }

    const finalBill = await Invoice.findOne({ _id: id, tenantId }).populate(
      "partnerId",
      "header.name contact_details.email",
    );

    return NextResponse.json({ success: true, item: finalBill || bill });
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
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tenantId = (session.user as any).tenantId || "default-tenant";
    const { id } = await params;
    await dbConnect();

    const bill = await Invoice.findOneAndDelete({ _id: id, tenantId });

    if (!bill) {
      return NextResponse.json({ error: "Bill not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
