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

    const payload = {
      income: report.income,
      expense: report.expense,
      netProfit: totalIncome - totalExpenses,
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
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
