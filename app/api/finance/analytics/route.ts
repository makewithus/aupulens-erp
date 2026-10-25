import { NextResponse } from "next/server";
import { requireTenantId } from "@/lib/auth/requireTenantId";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import {
  buildPostedCashFlowSeries,
  buildPostedIncomeExpenseSeries,
} from "@/lib/accounting/reports";
import { getCachedData, setCachedData } from "@/lib/api/serverCache";

export async function GET() {
  try {
    const session = await auth();

    if (
      !session ||
      !session.user ||
      (session.user.role !== "admin" && session.user.role !== "finance")
    ) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tenantIdGuard = requireTenantId(session);
    if (tenantIdGuard) return tenantIdGuard;
    const tenantId = (session.user as any).tenantId;

    const cacheKey = `finance_analytics:${tenantId}`;
    const cached = getCachedData<any>(cacheKey);
    if (cached) {
      return NextResponse.json(cached);
    }

    await connectDB();

    const now = new Date();
    const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 11, 1);

    const [incomeExpenseSeries, cashFlow] = await Promise.all([
      buildPostedIncomeExpenseSeries({
        tenantId,
        startDate: twelveMonthsAgo,
        groupBy: "month",
      }),
      buildPostedCashFlowSeries({
        tenantId,
        startDate: twelveMonthsAgo,
        groupBy: "month",
      }),
    ]);

    const payload = {
      accountingBasis: "posted_journal_entries",
      revenue: incomeExpenseSeries.map((item) => ({
        month: item.date,
        amount: Math.round(item.revenue),
      })),
      expenses: incomeExpenseSeries.map((item) => ({
        month: item.date,
        amount: Math.round(item.expenses),
      })),
      cashFlow: cashFlow.map((item) => ({
        month: item.date,
        inflow: Math.round(item.inflow),
        outflow: Math.round(item.outflow),
      })),
    };
    setCachedData(cacheKey, payload, 20_000);
    return NextResponse.json(payload);
  } catch (error) {
    console.error("Error fetching finance analytics:", error);
    return NextResponse.json(
      { error: "Failed to fetch analytics" },
      { status: 500 },
    );
  }
}
