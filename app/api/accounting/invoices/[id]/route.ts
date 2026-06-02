import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import Invoice from "@/models/Invoice";
import JournalEntry from "@/models/JournalEntry";
import Account from "@/models/Account";
import {
  DOCUMENT_STATUS,
  VOUCHER_STATUS,
  VOUCHER_TYPE,
  isValidTransition,
  type DocumentStatus,
} from "@/lib/constants/statuses";
import { validateJournalLinesForPosting } from "@/lib/accounting/journal-validation";
import { createJournalEntry } from "@/lib/accounting/posting";

const roundCurrency = (value: number) => Number(value.toFixed(2));

const normalizeAccountingData = async (
  invoice: any,
  tenantId: string,
): Promise<{ ok: true } | { ok: false; error: string }> => {
  if (!invoice.invoiceLines?.length) {
    return {
      ok: false,
      error: "At least one invoice line is required before posting.",
    };
  }

  if (invoice.moveType === "out_invoice" && !invoice.receivableAccountId) {
    const defaultReceivable = await Account.findOne({
      tenantId,
      account_type: "asset_receivable",
    });
    if (!defaultReceivable) {
      return {
        ok: false,
        error:
          "Receivable account must be set on invoice before posting. No default receivable account found.",
      };
    }
    invoice.receivableAccountId = defaultReceivable._id as any;
  }

  if (invoice.moveType === "in_invoice" && !invoice.payableAccountId) {
    const defaultPayable = await Account.findOne({
      tenantId,
      account_type: "liability_payable",
    });
    if (!defaultPayable) {
      return {
        ok: false,
        error:
          "Payable account must be set on bill before posting. No default payable account found.",
      };
    }
    invoice.payableAccountId = defaultPayable._id as any;
  }

  for (const line of invoice.invoiceLines) {
    if (line.accountId) continue;

    const accountType = invoice.moveType === "out_invoice" ? "income" : "expense";
    const defaultLineAccount = await Account.findOne({
      tenantId,
      account_type: accountType,
    });

    if (!defaultLineAccount) {
      return {
        ok: false,
        error: `One or more lines are missing an account: ${line.name}. No default ${accountType} account found.`,
      };
    }

    line.accountId = defaultLineAccount._id as any;
  }

  return { ok: true };
};

const buildLinePostingEntries = (invoice: any, invoiceName: string) => {
  const lines = invoice.invoiceLines || [];
  const subtotal = lines.reduce(
    (sum: number, line: any) => sum + (Number(line.priceSubtotal) || 0),
    0,
  );
  const total = roundCurrency(Number(invoice.amountTotal) || 0);
  let allocated = 0;

  return lines.map((line: any, index: number) => {
    const amount =
      index === lines.length - 1
        ? roundCurrency(total - allocated)
        : roundCurrency(
            subtotal > 0
              ? ((Number(line.priceSubtotal) || 0) / subtotal) * total
              : total / lines.length,
          );
    allocated = roundCurrency(allocated + amount);

    return {
      accountId: line.accountId,
      label: line.name || invoiceName,
      debit: invoice.moveType === "out_invoice" ? 0 : amount,
      credit: invoice.moveType === "out_invoice" ? amount : 0,
      sourceDocument: invoiceName,
      sourceId: invoice._id,
    };
  });
};

const ensureInvoiceNumber = async (
  invoice: any,
  tenantId: string,
  proposedName?: string,
) => {
  if (proposedName && proposedName.trim()) {
    return proposedName;
  }

  if (invoice.name && invoice.name !== "Draft") {
    return invoice.name;
  }

  const year = new Date().getFullYear();
  const count = await Invoice.countDocuments({
    moveType: invoice.moveType,
    state: DOCUMENT_STATUS.POSTED,
    tenantId,
  });
  const prefix = invoice.moveType === "out_invoice" ? "INV" : "BILL";
  return `${prefix}/${year}/${String(count + 1).padStart(3, "0")}`;
};

const buildJournalPayload = (invoice: any, invoiceName: string, status: DocumentStatus) => ({
  header: {
    name: `JE/${invoiceName}`,
    date: new Date(),
    ref: invoiceName,
    journalType: (invoice.moveType === "out_invoice"
      ? "sale"
      : "purchase") as "sale" | "purchase",
  },
  voucherType:
    invoice.moveType === "out_invoice" ? VOUCHER_TYPE.SALES : VOUCHER_TYPE.PURCHASE,
  voucherStatus:
    status === DOCUMENT_STATUS.POSTED ? VOUCHER_STATUS.POSTED : VOUCHER_STATUS.DRAFT,
  lineIds: [
    ...buildLinePostingEntries(invoice, invoiceName),
    {
      accountId:
        invoice.moveType === "out_invoice"
          ? invoice.receivableAccountId
          : invoice.payableAccountId,
      partnerId: invoice.partnerId,
      label: `Balance for ${invoiceName}`,
      debit: invoice.moveType === "out_invoice" ? invoice.amountTotal : 0,
      credit: invoice.moveType === "out_invoice" ? 0 : invoice.amountTotal,
      maturityDate: invoice.dueDate,
      sourceDocument: invoiceName,
      sourceId: invoice._id,
    },
  ],
  totals: {
    amountUntaxed: invoice.amountUntaxed,
    amountTax: invoice.amountTax,
    amountTotal: invoice.amountTotal,
  },
  status,
  tenantId: invoice.tenantId,
});

const ensureJournalForInvoice = async (
  invoice: any,
  invoiceName: string,
  targetStatus: DocumentStatus,
) => {
  const payload = buildJournalPayload(invoice, invoiceName, targetStatus);
  if (targetStatus === DOCUMENT_STATUS.POSTED) {
    const validationError = validateJournalLinesForPosting(payload.lineIds);
    if (validationError) {
      throw new Error(validationError);
    }
  }

  let journal = invoice.journalId
    ? await JournalEntry.findOne({ _id: invoice.journalId, tenantId: invoice.tenantId })
    : null;

  if (!journal) {
    journal = await createJournalEntry(payload);
    invoice.journalId = journal._id;
    return;
  }

  journal.header = {
    ...journal.header,
    name: `JE/${invoiceName}`,
    ref: invoiceName,
    journalType: invoice.moveType === "out_invoice" ? "sale" : "purchase",
  };
  journal.voucherType = payload.voucherType;
  journal.voucherStatus = payload.voucherStatus;
  journal.lineIds = payload.lineIds;
  journal.totals = {
    amountUntaxed: invoice.amountUntaxed,
    amountTax: invoice.amountTax,
    amountTotal: invoice.amountTotal,
  };
  journal.status = targetStatus;
  if (targetStatus === DOCUMENT_STATUS.POSTED) {
    journal.ledgerUpdatedAt = journal.ledgerUpdatedAt || new Date();
    journal.validatedAt = journal.validatedAt || new Date();
  }
  await journal.save();
};

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = session.user as any;
    const tenantId = user.tenantId || "default-tenant";

    await connectDB();
    const { id } = await params;

    const invoice = await Invoice.findOne({
      _id: id,
      tenantId,
    }).populate("partnerId");

    if (!invoice) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }

    return NextResponse.json(invoice);
  } catch (error: any) {
    console.error("Error fetching invoice:", error);
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

    const user = session.user as any;
    const tenantId = user.tenantId || "default-tenant";

    await connectDB();
    const { id } = await params;
    const body = await req.json();

    // Find the invoice
    const invoice = await Invoice.findOne({ _id: id, tenantId });
    if (!invoice) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }

    const mergedState = (body.state ?? invoice.state) as DocumentStatus;
    const approvalRequired = body.approvalRequired !== false;

    if (body.state && !isValidTransition(invoice.state as DocumentStatus, mergedState)) {
      const canBypassApproval =
        !approvalRequired &&
        mergedState === DOCUMENT_STATUS.POSTED &&
        invoice.state === DOCUMENT_STATUS.DRAFT;

      if (!canBypassApproval) {
        return NextResponse.json(
          {
            error: `Invalid state transition from ${invoice.state} to ${mergedState}`,
          },
          { status: 400 },
        );
      }
    }

    if (
      body.state === DOCUMENT_STATUS.PENDING_APPROVAL ||
      body.state === DOCUMENT_STATUS.APPROVED ||
      body.state === DOCUMENT_STATUS.POSTED
    ) {
      const normalizeResult = await normalizeAccountingData(invoice, tenantId);
      if (normalizeResult.ok === false) {
        return NextResponse.json({ error: normalizeResult.error }, { status: 400 });
      }

      const invoiceName = await ensureInvoiceNumber(invoice, tenantId, body.name);
      body.name = invoiceName;

      const journalTargetStatus =
        body.state === DOCUMENT_STATUS.POSTED
          ? DOCUMENT_STATUS.POSTED
          : body.state === DOCUMENT_STATUS.APPROVED
            ? DOCUMENT_STATUS.APPROVED
            : DOCUMENT_STATUS.PENDING_APPROVAL;

      await ensureJournalForInvoice(invoice, invoiceName, journalTargetStatus);

      if (body.state === DOCUMENT_STATUS.POSTED && approvalRequired && invoice.state !== DOCUMENT_STATUS.APPROVED) {
        return NextResponse.json(
          {
            error:
              "Invoice must be approved before posting to General Ledger. Use pending_approval → approved → posted flow.",
          },
          { status: 400 },
        );
      }
    }

    // Update invoice
    if (body.partnerId === "") {
      return NextResponse.json(
        { error: "Customer (partnerId) cannot be empty" },
        { status: 400 },
      );
    }
    Object.assign(invoice, body);
    await invoice.save();

    return NextResponse.json(invoice);
  } catch (error: any) {
    console.error("Error updating invoice:", error);
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

    const user = session.user as any;
    const tenantId = user.tenantId || "default-tenant";

    await connectDB();
    const { id } = await params;

    const invoice = await Invoice.findOne({ _id: id, tenantId });
    if (!invoice) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }

    if (invoice.state !== DOCUMENT_STATUS.DRAFT) {
      return NextResponse.json(
        { error: "Only draft invoices can be deleted." },
        { status: 400 },
      );
    }

    await Invoice.deleteOne({ _id: id, tenantId });

    return NextResponse.json({ message: "Invoice deleted successfully" });
  } catch (error: any) {
    console.error("Error deleting invoice:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
