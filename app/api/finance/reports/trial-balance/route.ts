import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import {
  buildPostedJournalReport,
  type ReportGroup,
} from "@/lib/accounting/reports";

const reportGroups: ReportGroup[] = [
  "asset",
  "liability",
  "equity",
  "income",
  "expense",
  "off_balance",
];

function roundMoney(value: number) {
  return Number(value.toFixed(2));
}

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tenantId = (session.user as any).tenantId || "default-tenant";
    const { searchParams } = new URL(req.url);
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    await connectDB();

    const report = await buildPostedJournalReport({
      tenantId,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
    });

    const accounts = reportGroups.flatMap((groupName) =>
      Object.values(report[groupName].accounts).map((account) => {
        const netDebit = roundMoney(account.debit - account.credit);

        return {
          id: account.id,
          code: account.code,
          name: account.name,
          accountType: account.accountType,
          internalGroup: account.internalGroup,
          debit: roundMoney(account.debit),
          credit: roundMoney(account.credit),
          debitBalance: netDebit > 0 ? netDebit : 0,
          creditBalance: netDebit < 0 ? Math.abs(netDebit) : 0,
        };
      }),
    );

    accounts.sort((a, b) => a.code.localeCompare(b.code));

    const totalDebitBalance = roundMoney(
      accounts.reduce((sum, account) => sum + account.debitBalance, 0),
    );
    const totalCreditBalance = roundMoney(
      accounts.reduce((sum, account) => sum + account.creditBalance, 0),
    );

    return NextResponse.json({
      accountingBasis: "posted_journal_entries",
      period: {
        startDate: startDate || null,
        endDate: endDate || null,
      },
      accounts,
      totals: {
        debit: roundMoney(report.totals.debit),
        credit: roundMoney(report.totals.credit),
        debitBalance: totalDebitBalance,
        creditBalance: totalCreditBalance,
      },
      validation: {
        postedJournalBalanced: report.totals.balanced,
        trialBalanceBalanced:
          Math.abs(totalDebitBalance - totalCreditBalance) <= 0.01,
      },
    });
  } catch (error: any) {
    console.error("Trial Balance Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
