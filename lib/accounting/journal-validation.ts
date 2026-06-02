import { DOCUMENT_STATUS, VOUCHER_STATUS } from "@/lib/constants/statuses";

export function getJournalLineTotals(lines: any[] = []) {
  return lines.reduce(
    (totals, line) => ({
      debit: totals.debit + (Number(line.debit) || 0),
      credit: totals.credit + (Number(line.credit) || 0),
    }),
    { debit: 0, credit: 0 },
  );
}

export function journalLinesAreBalanced(lines: any[] = []) {
  const totals = getJournalLineTotals(lines);
  return Math.abs(totals.debit - totals.credit) <= 0.01;
}

export function requiresBalancedJournal({
  status,
  voucherStatus,
}: {
  status?: string;
  voucherStatus?: string;
}) {
  return (
    status === DOCUMENT_STATUS.POSTED ||
    voucherStatus === VOUCHER_STATUS.VALIDATED ||
    voucherStatus === VOUCHER_STATUS.PENDING_APPROVAL ||
    voucherStatus === VOUCHER_STATUS.APPROVED ||
    voucherStatus === VOUCHER_STATUS.POSTED
  );
}

export function validateJournalLinesForPosting(lines: any[] = []) {
  if (lines.length < 2) {
    return "At least two journal lines are required";
  }

  const missingAccount = lines.some((line) => !line.accountId);
  if (missingAccount) {
    return "Every journal line must have an account";
  }

  if (!journalLinesAreBalanced(lines)) {
    const totals = getJournalLineTotals(lines);
    return `Journal entry is not balanced. Debit total ${totals.debit.toFixed(
      2,
    )}, credit total ${totals.credit.toFixed(2)}`;
  }

  return null;
}
