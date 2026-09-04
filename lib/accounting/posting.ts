import type mongoose from "mongoose";
import JournalEntry from "@/models/finance/JournalEntry";
import {
  DOCUMENT_STATUS,
  VOUCHER_STATUS,
  VOUCHER_TYPE_PREFIX,
  type VoucherStatus,
  type VoucherType,
} from "@/lib/constants/statuses";
import {
  getJournalLineTotals,
  requiresBalancedJournal,
  validateJournalLinesForPosting,
} from "@/lib/accounting/journal-validation";
import { safeEmitEvent } from "@/lib/aiRuntime/runtime/safeEmit";

type JournalType = "sale" | "purchase" | "cash" | "bank" | "general";

type JournalHeaderInput = {
  name?: string;
  date?: Date;
  ref?: string;
  journalType: JournalType;
};

export type JournalPostingInput = {
  tenantId: string;
  header: JournalHeaderInput;
  lineIds: any[];
  totals?: {
    currencyId?: string;
    amountUntaxed?: number;
    amountTax?: number;
    amountTotal?: number;
  };
  status?: string;
  voucherType?: VoucherType;
  voucherStatus?: VoucherStatus;
  approvalRequired?: boolean;
  validatedAt?: Date;
  validatedBy?: string | mongoose.Types.ObjectId;
  ledgerUpdatedAt?: Date;
  createdBy?: string | mongoose.Types.ObjectId;
};

function roundCurrency(value: number) {
  return Number(value.toFixed(2));
}

export function sanitizeLineIds(lines: any[] = []) {
  return lines
    .map((line: any) => {
      const cleaned = { ...line };
      if (cleaned.accountId === "") delete cleaned.accountId;
      if (cleaned.partnerId === "") delete cleaned.partnerId;
      if (cleaned.taxId === "") delete cleaned.taxId;
      if (cleaned.sourceId === "") delete cleaned.sourceId;
      return cleaned;
    })
    .filter((line: any) => {
      const hasAccount = !!line.accountId;
      const hasPartner = !!line.partnerId;
      const hasLabel = !!line.label && String(line.label).trim() !== "";
      const hasDebit = !!line.debit && Number(line.debit) !== 0;
      const hasCredit = !!line.credit && Number(line.credit) !== 0;
      return hasAccount || hasPartner || hasLabel || hasDebit || hasCredit;
    });
}

export function normalizeLine(line: any) {
  const debit = roundCurrency(Number(line.debit) || 0);
  const credit = roundCurrency(Number(line.credit) || 0);

  return {
    ...line,
    debit,
    credit,
  };
}

function inferTotals(lines: any[]) {
  const totals = getJournalLineTotals(lines);
  const total = roundCurrency(Math.max(totals.debit, totals.credit));

  return {
    amountUntaxed: total,
    amountTax: 0,
    amountTotal: total,
  };
}

export async function nextJournalEntryName({
  tenantId,
  voucherType,
  journalType,
}: {
  tenantId: string;
  voucherType?: VoucherType;
  journalType: JournalType;
}) {
  const prefix = voucherType
    ? VOUCHER_TYPE_PREFIX[voucherType]
    : journalType.slice(0, 3).toUpperCase();
  const countFilter: Record<string, any> = { tenantId };

  if (voucherType) {
    countFilter.voucherType = voucherType;
  } else {
    countFilter["header.journalType"] = journalType;
  }

  const count = await JournalEntry.countDocuments(countFilter);
  return `${prefix}/${new Date().getFullYear()}/${String(count + 1).padStart(
    4,
    "0",
  )}`;
}

export async function buildJournalEntryPayload(input: JournalPostingInput) {
  const voucherStatus = input.voucherStatus || VOUCHER_STATUS.DRAFT;
  const status =
    voucherStatus === VOUCHER_STATUS.POSTED
      ? DOCUMENT_STATUS.POSTED
      : input.status || DOCUMENT_STATUS.DRAFT;
  const lineIds = sanitizeLineIds(input.lineIds || []).map(normalizeLine);

  if (requiresBalancedJournal({ status, voucherStatus })) {
    const validationError = validateJournalLinesForPosting(lineIds);
    if (validationError) {
      throw new Error(validationError);
    }
  }

  const name =
    input.header.name ||
    (await nextJournalEntryName({
      tenantId: input.tenantId,
      voucherType: input.voucherType,
      journalType: input.header.journalType,
    }));
  const inferredTotals = inferTotals(lineIds);

  return {
    ...input,
    header: {
      ...input.header,
      name,
      date: input.header.date || new Date(),
    },
    voucherStatus,
    status,
    approvalRequired: input.approvalRequired || false,
    validatedAt:
      input.validatedAt ||
      (voucherStatus === VOUCHER_STATUS.POSTED ? new Date() : undefined),
    ledgerUpdatedAt:
      input.ledgerUpdatedAt ||
      (status === DOCUMENT_STATUS.POSTED ? new Date() : undefined),
    lineIds,
    totals: {
      ...inferredTotals,
      ...input.totals,
      amountUntaxed: roundCurrency(
        Number(input.totals?.amountUntaxed ?? inferredTotals.amountUntaxed),
      ),
      amountTax: roundCurrency(Number(input.totals?.amountTax || 0)),
      amountTotal: roundCurrency(
        Number(input.totals?.amountTotal ?? inferredTotals.amountTotal),
      ),
    },
    tenantId: input.tenantId,
  };
}

export async function createJournalEntry(
  input: JournalPostingInput,
) {
  const payload = await buildJournalEntryPayload(input);
  const entry = await JournalEntry.create(payload);

  if (payload.voucherStatus === VOUCHER_STATUS.POSTED) {
    // Additive (docs/ai/BRIEF-02-BATCH-A.md B.2) — see lib/aiRuntime/runtime/safeEmit.ts
    // for why this can never throw or break an existing caller of this function.
    await safeEmitEvent(input.tenantId, "journal.posted", { journalEntryId: String(entry._id) });
  }

  return entry;
}

export async function createPostedJournalEntry(
  input: Omit<JournalPostingInput, "status" | "voucherStatus"> & {
    voucherType: VoucherType;
  },
) {
  return createJournalEntry({
    ...input,
    status: DOCUMENT_STATUS.POSTED,
    voucherStatus: VOUCHER_STATUS.POSTED,
    approvalRequired: false,
  });
}
