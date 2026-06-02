import type mongoose from "mongoose";
import Account from "@/models/Account";
import JournalEntry from "@/models/JournalEntry";
import { VOUCHER_TYPE } from "@/lib/constants/statuses";
import { createPostedJournalEntry } from "@/lib/accounting/posting";

type InventoryAccountRole = "inventory" | "grni" | "cogs" | "equity";

type StockMoveAccountingResult = {
  journalEntryId?: mongoose.Types.ObjectId;
  debitAccount?: string;
  creditAccount?: string;
  totalValue: number;
};

const accountPreference: Record<InventoryAccountRole, string[]> = {
  inventory: ["asset_current", "asset_non_current"],
  grni: ["liability_current", "liability_payable"],
  cogs: ["expense_direct_cost", "expense"],
  equity: ["equity", "equity_unaffected"],
};

function roundCurrency(value: number) {
  return Number(value.toFixed(2));
}

async function resolveAccount(tenantId: string, role: InventoryAccountRole) {
  for (const account_type of accountPreference[role]) {
    const account = await Account.findOne({ tenantId, account_type });
    if (account) return account;
  }

  throw new Error(
    `No ${role} account configured. Create one of: ${accountPreference[role].join(", ")}.`,
  );
}

function getMoveValue(move: any) {
  return roundCurrency(
    (move.lines || []).reduce((sum: number, line: any) => {
      const qty = Number(line.done || line.demand) || 0;
      const unitCost = Number(line.unitCost) || 0;
      return sum + qty * unitCost;
    }, 0),
  );
}

export async function postStockMoveAccounting({
  move,
  tenantId,
}: {
  move: any;
  tenantId: string;
}): Promise<StockMoveAccountingResult> {
  if (move.accounting?.journalEntryId) {
    return {
      journalEntryId: move.accounting.journalEntryId,
      debitAccount: move.accounting.debitAccount,
      creditAccount: move.accounting.creditAccount,
      totalValue: Number(move.valuation?.totalValue) || getMoveValue(move),
    };
  }

  const existingEntry = await JournalEntry.findOne({
    tenantId,
    "header.ref": move.reference,
    voucherType: VOUCHER_TYPE.JOURNAL,
  });
  if (existingEntry) {
    return {
      journalEntryId: existingEntry._id as mongoose.Types.ObjectId,
      debitAccount: move.accounting?.debitAccount,
      creditAccount: move.accounting?.creditAccount,
      totalValue: Number(existingEntry.totals?.amountTotal) || 0,
    };
  }

  const totalValue = roundCurrency(Number(move.valuation?.totalValue) || getMoveValue(move));
  if (totalValue <= 0) {
    throw new Error("Stock move valuation must be greater than zero before accounting can be created.");
  }

  const inventoryAccount = await resolveAccount(tenantId, "inventory");
  const grniAccount = await resolveAccount(tenantId, "grni");
  const cogsAccount = await resolveAccount(tenantId, "cogs");
  const equityAccount = await resolveAccount(tenantId, "equity");

  let debitAccount = inventoryAccount;
  let creditAccount = grniAccount;
  let journalType: "purchase" | "sale" | "general" = "purchase";

  if (move.moveType === "outgoing") {
    debitAccount = cogsAccount;
    creditAccount = inventoryAccount;
    journalType = "sale";
  }

  if (move.moveType === "adjustment") {
    const totalQuantity = (move.lines || []).reduce(
      (sum: number, line: any) => sum + (Number(line.done || line.demand) || 0),
      0,
    );

    if (totalQuantity < 0) {
      debitAccount = cogsAccount;
      creditAccount = inventoryAccount;
    } else {
      debitAccount = inventoryAccount;
      creditAccount = equityAccount;
    }
    journalType = "general";
  }

  if (move.moveType === "internal") {
    return {
      totalValue,
      debitAccount: inventoryAccount.name,
      creditAccount: inventoryAccount.name,
    };
  }

  const lineIds = [
    {
      accountId: debitAccount._id,
      label: `Inventory move ${move.reference}`,
      debit: totalValue,
      credit: 0,
      sourceDocument: move.reference,
      sourceId: move._id,
    },
    {
      accountId: creditAccount._id,
      label: `Inventory move ${move.reference}`,
      debit: 0,
      credit: totalValue,
      sourceDocument: move.reference,
      sourceId: move._id,
    },
  ];

  const journalEntry = await createPostedJournalEntry({
    tenantId,
    header: {
      name: `STK/${move.reference}`,
      date: move.effectiveDate || new Date(),
      ref: move.reference,
      journalType,
    },
    voucherType: VOUCHER_TYPE.JOURNAL,
    lineIds,
    totals: {
      amountUntaxed: totalValue,
      amountTax: 0,
      amountTotal: totalValue,
    },
  });

  return {
    journalEntryId: journalEntry._id as mongoose.Types.ObjectId,
    debitAccount: debitAccount.name,
    creditAccount: creditAccount.name,
    totalValue,
  };
}
