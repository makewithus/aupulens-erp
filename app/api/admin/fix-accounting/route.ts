import { NextResponse } from "next/server";
import connectDB from "@/lib/db";
import Invoice from "@/models/Invoice";
import Expense from "@/models/Expense";
import JournalEntry from "@/models/JournalEntry";
import Account from "@/models/Account";
import { DOCUMENT_STATUS, VOUCHER_TYPE } from "@/lib/constants/statuses";
import { requireMaintenanceAccess } from "@/lib/api/maintenance-guard";
import { createPostedJournalEntry } from "@/lib/accounting/posting";

const roundCurrency = (value: number) => Number(value.toFixed(2));

export async function GET() {
  try {
    const guard = await requireMaintenanceAccess();
    if (guard.error) return guard.error;

    const tenantId = (guard.session!.user as any).tenantId || "default-tenant";
    await connectDB();

    const results = {
      invoicesFixed: 0,
      billsFixed: 0,
      expensesFixed: 0,
      errors: [] as string[],
    };

    // 1. Fix Invoices (Out & In)
    const invoices = await Invoice.find({
      tenantId,
      state: DOCUMENT_STATUS.POSTED,
    }).lean();

    // Cache generic accounts to avoid repeated lookups
    const cashAcc = await Account.findOne({
      tenantId,
      account_type: "asset_cash",
    }).lean<{ _id: any }>();
    const payableAcc = await Account.findOne({
      tenantId,
      account_type: "liability_payable",
    }).lean<{ _id: any }>();
    const receivableAcc = await Account.findOne({
      tenantId,
      account_type: "asset_receivable",
    }).lean<{ _id: any }>();

    for (const inv of invoices) {
      // Check if JE exists by name/ref
      const jeName = `JE/${inv.name}`;
      const existingJE = await JournalEntry.findOne({
              tenantId,
              "header.name": jeName,
            }).lean();

      if (!existingJE) {
        try {
          const isSale = inv.moveType === "out_invoice";
          const journalType = isSale ? "sale" : "purchase";

          // Determine counterpart account
          let counterpartAccountId = isSale
            ? inv.receivableAccountId
            : inv.payableAccountId;

          if (!counterpartAccountId) {
            // Fallback if not set on invoice
            counterpartAccountId = isSale
              ? receivableAcc?._id
              : payableAcc?._id;
          }

          if (!counterpartAccountId) {
            results.errors.push(
              `Skipped Invoice ${inv.name}: No receivable/payable account found.`,
            );
            continue;
          }

          const invoiceLines = inv.invoiceLines || [];
          const subtotal = invoiceLines.reduce(
            (sum: number, line: any) => sum + (Number(line.priceSubtotal) || 0),
            0,
          );
          const total = roundCurrency(Number(inv.amountTotal) || 0);
          let allocated = 0;

          // Construct balanced gross lines. Taxes are allocated across line
          // accounts because this repair route does not know tenant tax accounts.
          const lines = [
            ...invoiceLines.map((line: any, index: number) => {
              const amount =
                index === invoiceLines.length - 1
                  ? roundCurrency(total - allocated)
                  : roundCurrency(
                      subtotal > 0
                        ? ((Number(line.priceSubtotal) || 0) / subtotal) * total
                        : total / Math.max(invoiceLines.length, 1),
                    );
              allocated = roundCurrency(allocated + amount);

              return {
                accountId: line.accountId,
                label: line.name || inv.name,
                debit: isSale ? 0 : amount,
                credit: isSale ? amount : 0,
              };
            }),
            {
              accountId: counterpartAccountId,
              partnerId: inv.partnerId,
              label: `Balance for ${inv.name}`,
              debit: isSale ? total : 0,
              credit: isSale ? 0 : total,
            },
          ];

          await createPostedJournalEntry({
            tenantId,
            header: {
              name: jeName,
              date: inv.invoiceDate || new Date(),
              ref: inv.name,
              journalType: journalType,
            },
            voucherType: isSale ? VOUCHER_TYPE.SALES : VOUCHER_TYPE.PURCHASE,
            lineIds: lines,
            totals: {
              amountUntaxed: inv.amountUntaxed || 0,
              amountTax: inv.amountTax || 0,
              amountTotal: inv.amountTotal || 0,
            },
          });

          if (isSale) results.invoicesFixed++;
          else results.billsFixed++;
        } catch (err: any) {
          console.error(`Failed to fix invoice ${inv.name}:`, err);
          results.errors.push(`Error on Invoice ${inv.name}: ${err.message}`);
        }
      }
    }

    // 2. Fix Expenses
    const expenses = await Expense.find({
      tenantId,
      status: DOCUMENT_STATUS.POSTED,
    }).lean();

    for (const exp of expenses) {
      if (exp.journalEntryId) {
        // If ID is there, verify it exists, otherwise recreate?
        // For simplicity, check if JE exists by ID or similar name logic
        const exists = await JournalEntry.exists({ _id: exp.journalEntryId });
        if (exists) continue;
      }

      // Check by Name convention just in case
      const entryName = `EXP/${exp._id.toString().slice(-6).toUpperCase()}`;
      const existingJE = await JournalEntry.findOne({
              tenantId,
              "header.name": entryName,
            }).lean();

      if (!existingJE) {
        try {
          const creditAccountId =
            exp.paymentAccountId ||
            (exp.paidBy === "company" ? cashAcc?._id : payableAcc?._id);

          if (!creditAccountId) {
            results.errors.push(
              `Skipped Expense ${exp.description}: No credit account found.`,
            );
            continue;
          }

          const journalType = exp.paidBy === "company" ? "cash" : "purchase";

          await createPostedJournalEntry({
            tenantId,
            header: {
              name: entryName,
              date: exp.expenseDate || new Date(),
              ref: exp.description,
              journalType,
            },
            voucherType:
              exp.paidBy === "company" ? VOUCHER_TYPE.PAYMENT : VOUCHER_TYPE.PURCHASE,
            lineIds: [
              {
                accountId: exp.accountId, // Debit Expense
                label: exp.description,
                debit: exp.total,
                credit: 0,
              },
              {
                accountId: creditAccountId, // Credit
                label: `Payment for: ${exp.description}`,
                debit: 0,
                credit: exp.total,
              },
            ],
            totals: {
              amountUntaxed: exp.total - (exp.taxAmount || 0),
              amountTax: exp.taxAmount || 0,
              amountTotal: exp.total,
            },
          });

          // Optionally update expense to link JE (if we want to be thorough)
          // But strict read-only on finding missing JEs is safer.
          // However, if we don't update ID, we might re-create if we only check ID.
          // But we check Name above. So it's fine.

          results.expensesFixed++;
        } catch (err: any) {
          console.error(`Failed to fix expense ${exp.description}:`, err);
          results.errors.push(`Error on Expense ${exp._id}: ${err.message}`);
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: "Accounting fix complete",
      results,
    });
  } catch (error: any) {
    console.error("Accounting Fix Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
