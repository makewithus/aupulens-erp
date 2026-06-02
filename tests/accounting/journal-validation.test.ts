import { describe, expect, it } from "vitest";
import {
  DOCUMENT_STATUS,
  VOUCHER_STATUS,
  VOUCHER_TYPE,
} from "@/lib/constants/statuses";
import {
  getJournalLineTotals,
  journalLinesAreBalanced,
  validateJournalLinesForPosting,
} from "@/lib/accounting/journal-validation";
import { buildJournalEntryPayload } from "@/lib/accounting/posting";

const debitLine = {
  accountId: "507f1f77bcf86cd799439011",
  label: "Debit",
  debit: 100,
  credit: 0,
};

const creditLine = {
  accountId: "507f1f77bcf86cd799439012",
  label: "Credit",
  debit: 0,
  credit: 100,
};

describe("journal validation", () => {
  it("accepts balanced debit and credit lines", () => {
    const lines = [debitLine, creditLine];

    expect(getJournalLineTotals(lines)).toEqual({ debit: 100, credit: 100 });
    expect(journalLinesAreBalanced(lines)).toBe(true);
    expect(validateJournalLinesForPosting(lines)).toBeNull();
  });

  it("rejects unbalanced posted entries", () => {
    const error = validateJournalLinesForPosting([
      debitLine,
      { ...creditLine, credit: 90 },
    ]);

    expect(error).toContain("not balanced");
  });

  it("normalizes posted journal payloads through the posting service", async () => {
    const payload = await buildJournalEntryPayload({
      tenantId: "tenant-a",
      header: {
        name: "TEST/2026/0001",
        date: new Date("2026-06-01T00:00:00.000Z"),
        ref: "TEST-REF",
        journalType: "general",
      },
      voucherType: VOUCHER_TYPE.JOURNAL,
      voucherStatus: VOUCHER_STATUS.POSTED,
      status: DOCUMENT_STATUS.DRAFT,
      lineIds: [
        { ...debitLine, debit: 100.123 },
        { ...creditLine, credit: 100.123 },
      ],
    });

    expect(payload.status).toBe(DOCUMENT_STATUS.POSTED);
    expect(payload.voucherStatus).toBe(VOUCHER_STATUS.POSTED);
    expect(payload.lineIds[0].debit).toBe(100.12);
    expect(payload.lineIds[1].credit).toBe(100.12);
    expect(payload.totals.amountTotal).toBe(100.12);
    expect(payload.ledgerUpdatedAt).toBeInstanceOf(Date);
  });
});
