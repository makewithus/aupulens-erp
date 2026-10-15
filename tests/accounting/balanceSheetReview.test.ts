import { describe, expect, it } from "vitest";
import { getBalanceSheetReviewItems } from "@/lib/accounting/balanceSheetReview";

const account = (
  code: string,
  name: string,
  amount: number,
  normalBalance?: "debit" | "credit",
  internalGroup: "asset" | "liability" | "equity" = "asset",
) => ({
  id: code,
  code,
  name,
  amount,
  debit: 0,
  credit: 0,
  accountType: "test",
  internalGroup,
  normalBalance,
});

describe("getBalanceSheetReviewItems", () => {
  it("distinguishes unusual cash/GST balances from normal contra-asset and retained earnings balances", () => {
    const items = getBalanceSheetReviewItems({
      asset: { accounts: {
        cash: { ...account("1000", "Cash and Bank", -28110503.6), accountType: "asset_cash" },
        accumulatedDepreciation: account("1590", "Accumulated Depreciation", -690000, "credit"),
      } },
      liability: { accounts: { gst: account("2100", "GST Payable", -4571280, "credit", "liability") } },
      equity: { accounts: { retained: account("CYE", "Retained Earnings", -24275500, "credit", "equity") } },
    });

    expect(items).toHaveLength(4);
    expect(items[0]).toMatchObject({ severity: "warning", code: "1000" });
    expect(items[0].message).toMatch(/credit balance.*ledger and bank reconciliation.*overdraft/i);
    expect(items[1]).toMatchObject({ severity: "info", code: "1590" });
    expect(items[1].message).toMatch(/contra.asset.*expected credit/i);
    expect(items[1].message).not.toMatch(/cash|bank/i);
    expect(items[2]).toMatchObject({ severity: "warning", code: "2100" });
    expect(items[2].message).toMatch(/debit balance.*recoverable\/input tax credit.*mapping issue.*incorrect postings/i);
    expect(items[3]).toMatchObject({ severity: "info", code: "CYE" });
    expect(items[3].message).toMatch(/accumulated losses.*cumulative posted profit and loss.*closing journals/i);
  });

  it("flags a debit balance in a contra asset without cash/bank wording", () => {
    const items = getBalanceSheetReviewItems({
      asset: { accounts: { accumulatedDepreciation: account("1590", "Accumulated Depreciation", 50, "credit") } },
      liability: {},
      equity: {},
    });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ severity: "warning", code: "1590" });
    expect(items[0].message).toMatch(/unexpected debit balance for a contra.asset/i);
    expect(items[0].message).not.toMatch(/cash|bank/i);
  });

  it("recognizes legacy accumulated-depreciation accounts when normal_balance was not stored", () => {
    const items = getBalanceSheetReviewItems({
      asset: { accounts: { accumulatedDepreciation: account("1590", "Accumulated Depreciation", -690000) } },
      liability: {},
      equity: {},
    });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ severity: "info", code: "1590" });
    expect(items[0].message).toMatch(/expected credit balance/i);
  });

  it("does not flag normal-side, zero, or non-finite amounts", () => {
    const items = getBalanceSheetReviewItems({
      asset: { accounts: {
        cash: account("1000", "Cash", 500),
        zero: account("1010", "Zero", 0),
        invalid: account("1020", "Invalid", Number.NaN),
      } },
      liability: { accounts: { gst: account("2100", "GST Payable", 120, "credit", "liability") } },
      equity: { accounts: { capital: account("3000", "Capital", 2500, "credit", "equity") } },
    });

    expect(items).toEqual([]);
  });
});
