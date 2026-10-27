import { safeInternalErrorMessage } from "@/lib/api/safeInternalErrorMessage";
import { NextRequest, NextResponse } from "next/server";
import { requireTenantId } from "@/lib/auth/requireTenantId";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import { buildPostedJournalReport } from "@/lib/accounting/reports";
import { getCachedData, setCachedData } from "@/lib/api/serverCache";

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tenantIdGuard = requireTenantId(session);
    if (tenantIdGuard) return tenantIdGuard;
    const tenantId = (session.user as any).tenantId;
    const { searchParams } = new URL(req.url);
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    const cacheKey = `finance_pl:${tenantId}:${startDate || "all"}:${endDate || "all"}`;
    const cached = getCachedData<any>(cacheKey);
    if (cached) {
      return NextResponse.json(cached);
    }

    await connectDB();

    const report = await buildPostedJournalReport({
      tenantId,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
    });

    const totalIncome = report.income.total;
    const totalExpenses = report.expense.total;
    const summary = report.statementSummary;

    const isProfitAvailable = summary?.profitAvailable ?? (totalIncome === 0 || totalExpenses > 0);
    const payload = {
      income: report.income,
      expense: report.expense,
      netProfit: totalIncome - totalExpenses,
      revenue: summary?.revenue ?? totalIncome,
      cogs: summary?.cogs ?? 0,
      grossProfit: summary?.grossProfit ?? (totalIncome - (summary?.cogs ?? 0)),
      grossMarginPercent: summary?.grossMarginPercent ?? null,
      operatingExpenses: summary?.operatingExpenses ?? totalExpenses,
      operatingIncome: summary?.operatingIncome ?? (totalIncome - totalExpenses),
      otherIncome: summary?.otherIncome ?? 0,
      otherExpenses: summary?.otherExpenses ?? 0,
      profitBeforeTax: summary?.profitBeforeTax ?? (totalIncome - totalExpenses),
      taxExpense: summary?.taxExpense ?? 0,
      profitAvailable: isProfitAvailable,
      profitStatus: isProfitAvailable ? "complete" : "incomplete",
      profitUnavailableReason: summary?.profitUnavailableReason,
      statementSummary: summary,
      accountingBasis: "posted_journal_entries",
      validation: {
        totalDebits: report.totals.debit,
        totalCredits: report.totals.credit,
        trialBalanceBalanced: report.totals.balanced,
      },
    };

    setCachedData(cacheKey, payload, 20_000);
    return NextResponse.json(payload);
  } catch (error: any) {
    console.error("P&L Error:", error);
    return NextResponse.json({ error: safeInternalErrorMessage() }, { status: 500 });
  }
}
