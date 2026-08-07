import { NextResponse } from "next/server";
import { requireTenantId } from "@/lib/auth/requireTenantId";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import {
  buildPostedCashFlowSeries,
  buildPostedIncomeExpenseSeries,
} from "@/lib/accounting/reports";

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
    await connectDB();

    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    sixMonthsAgo.setDate(1);
    sixMonthsAgo.setHours(0, 0, 0, 0);

    const [incomeExpenseSeries, cashFlow] = await Promise.all([
      buildPostedIncomeExpenseSeries({
        tenantId,
        startDate: sixMonthsAgo,
        groupBy: "month",
      }),
      buildPostedCashFlowSeries({
        tenantId,
        startDate: sixMonthsAgo,
        groupBy: "month",
      }),
    ]);

    return NextResponse.json({
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
    });
  } catch (error) {
    console.error("Error fetching finance analytics:", error);
    return NextResponse.json(
      { error: "Failed to fetch analytics" },
      { status: 500 },
    );
  }
}
