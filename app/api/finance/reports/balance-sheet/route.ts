import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import { buildPostedJournalReport } from "@/lib/accounting/reports";

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tenantId = (session.user as any).tenantId || "default-tenant";
    const { searchParams } = new URL(req.url);
    const date = searchParams.get("date");

    await connectDB();

    const report = await buildPostedJournalReport({
      tenantId,
      endDate: date ? new Date(date) : new Date(),
    });

    const currentYearEarnings = report.income.total - report.expense.total;
    const equityAccounts = { ...report.equity.accounts };
    if (Math.abs(currentYearEarnings) > 0.01) {
      equityAccounts.current_year_earnings = {
        id: "current_year_earnings",
        code: "CYE",
        name: "Current Year Earnings",
        accountType: "equity_unaffected",
        internalGroup: "equity",
        debit: currentYearEarnings < 0 ? Math.abs(currentYearEarnings) : 0,
        credit: currentYearEarnings > 0 ? currentYearEarnings : 0,
        amount: currentYearEarnings,
      };
    }

    const equityTotal = Object.values(equityAccounts).reduce(
      (sum, account) => sum + account.amount,
      0,
    );

    return NextResponse.json({
      asset: report.asset,
      liability: report.liability,
      equity: {
        total: equityTotal,
        accounts: equityAccounts,
      },
      retainedEarnings: currentYearEarnings,
      accountingBasis: "posted_journal_entries",
      validation: {
        totalDebits: report.totals.debit,
        totalCredits: report.totals.credit,
        trialBalanceBalanced: report.totals.balanced,
        accountingEquationBalanced:
          Math.abs(report.asset.total - (report.liability.total + equityTotal)) <=
          0.01,
      },
    });
  } catch (error: any) {
    console.error("Balance Sheet Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
