import { NextResponse } from "next/server";
import { requireTenantId } from "@/lib/auth/requireTenantId";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import { buildPostedJournalReport } from "@/lib/accounting/reports";

export async function GET(req: Request) {
  try {
    const session = await auth();
    if (
      !session ||
      (session.user.role !== "admin" && session.user.role !== "finance")
    ) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tenantIdGuard = requireTenantId(session);
    if (tenantIdGuard) return tenantIdGuard;
    const tenantId = (session.user as any).tenantId;
    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    if (!type || !startDate || !endDate) {
      return NextResponse.json(
        { error: "Missing required parameters" },
        { status: 400 },
      );
    }

    await connectDB();

    const report = await buildPostedJournalReport({
      tenantId,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
    });

    const validation = {
      totalDebits: report.totals.debit,
      totalCredits: report.totals.credit,
      trialBalanceBalanced: report.totals.balanced,
    };

    if (type === "balance-sheet") {
      const currentYearEarnings = report.income.total - report.expense.total;
      const equityTotal = report.equity.total + currentYearEarnings;

      return NextResponse.json({
        report: {
          type: "balance-sheet",
          period: { startDate, endDate },
          assets: {
            accounts: report.asset.accounts,
            total: report.asset.total,
          },
          liabilities: {
            accounts: report.liability.accounts,
            total: report.liability.total,
          },
          equity: {
            accounts: report.equity.accounts,
            retainedEarnings: currentYearEarnings,
            total: equityTotal,
          },
          validation: {
            ...validation,
            accountingEquationBalanced:
              Math.abs(report.asset.total - (report.liability.total + equityTotal)) <=
              0.01,
          },
          accountingBasis: "posted_journal_entries",
        },
      });
    }

    if (type === "income-statement") {
      const revenue = report.income.total;
      const expenses = report.expense.total;

      return NextResponse.json({
        report: {
          type: "income-statement",
          period: { startDate, endDate },
          revenue,
          expenses,
          netIncome: revenue - expenses,
          income: report.income,
          expense: report.expense,
          validation,
          accountingBasis: "posted_journal_entries",
        },
      });
    }

    if (type === "cash-flow") {
      const cashAccounts = Object.values(report.asset.accounts).filter(
        (account) => account.accountType === "asset_cash",
      );
      const inflow = cashAccounts.reduce((sum, account) => sum + account.debit, 0);
      const outflow = cashAccounts.reduce(
        (sum, account) => sum + account.credit,
        0,
      );

      return NextResponse.json({
        report: {
          type: "cash-flow",
          period: { startDate, endDate },
          operating: {
            inflow,
            outflow,
            net: inflow - outflow,
          },
          netCashFlow: inflow - outflow,
          cashAccounts,
          validation,
          accountingBasis: "posted_journal_entries",
        },
      });
    }

    return NextResponse.json({ error: "Invalid report type" }, { status: 400 });
  } catch (error) {
    console.error("Error generating report:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
