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
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    await connectDB();

    const report = await buildPostedJournalReport({
      tenantId,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
    });

    const totalIncome = report.income.total;
    const totalExpenses = report.expense.total;

    return NextResponse.json({
      income: report.income,
      expense: report.expense,
      netProfit: totalIncome - totalExpenses,
      accountingBasis: "posted_journal_entries",
      validation: {
        totalDebits: report.totals.debit,
        totalCredits: report.totals.credit,
        trialBalanceBalanced: report.totals.balanced,
      },
    });
  } catch (error: any) {
    console.error("P&L Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
