import { NextResponse } from "next/server";
import { requireTenantId } from "@/lib/auth/requireTenantId";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import { ENTITY_STATUS, PAYMENT_STATUS, SALES_INVOICE_STATUS } from "@/lib/constants/statuses";

import { buildPostedJournalReport, buildPostedIncomeExpenseSeries } from "@/lib/accounting/reports";
import { getCachedData, setCachedData } from "@/lib/api/serverCache";

const POSTED_SALES_STATUSES = [
  SALES_INVOICE_STATUS.SAVED,
  SALES_INVOICE_STATUS.PARTIALLY_PAID,
  SALES_INVOICE_STATUS.PAID,
  SALES_INVOICE_STATUS.OVERDUE,
];

export async function GET() {
  try {
    const session = await auth();

    if (
      !session?.user ||
      (session.user.role !== "admin" && session.user.role !== "master-admin")
    ) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();

    const tenantIdGuard = requireTenantId(session);
    if (tenantIdGuard) return tenantIdGuard;
    const tenantId = (session.user as any).tenantId;

    const cacheKey = `admin_dashboard:${tenantId}`;
    const cached = getCachedData<any>(cacheKey);
    if (cached) {
      return NextResponse.json(cached);
    }

    const [
      SalesInvoice,
      SaleOrder,
      Product,
      Customer,
      StockTransfer,
      ManufacturingOrder,
      User,
      Payment,
      StockMove,
      Stock,
    ] = await Promise.all([
      import("@/models/sales/SalesInvoice").then((m) => m.SalesInvoice),
      import("@/models/sales/SaleOrder").then((m) => m.default),
      import("@/models/inventory/Product").then((m) => m.default),
      import("@/models/sales/Customer").then((m) => m.default),
      import("@/models/inventory/StockTransfer").then((m) => m.default),
      import("@/models/manufacturing/ManufacturingOrder").then((m) => m.default),
      import("@/models/auth/User").then((m) => m.default),
      import("@/models/sales/Payment").then((m) => m.default),
      import("@/models/inventory/StockMove").then((m) => m.default),
      import("@/models/inventory/Stock").then((m) => m.default),
    ]);

    const now = new Date();
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastSixMonths = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    // Use the same accounting basis as Finance > P&L. Bills, payments and
    // expense documents may already have posted journals; adding them again
    // would double-count costs and cash movements are not themselves expenses.
    const [ledger, currentLedger, previousLedger, revenueByMonthRows, draftInvoices] = await Promise.all([
      buildPostedJournalReport({ tenantId }),
      buildPostedJournalReport({ tenantId, startDate: currentMonthStart, endDate: new Date(nextMonthStart.getTime() - 1) }),
      buildPostedJournalReport({ tenantId, startDate: prevMonthStart, endDate: new Date(currentMonthStart.getTime() - 1) }),
      buildPostedIncomeExpenseSeries({ tenantId, startDate: lastSixMonths, endDate: new Date(nextMonthStart.getTime() - 1), groupBy: "month" }),
      SalesInvoice.countDocuments({ tenantId, status: SALES_INVOICE_STATUS.DRAFT }),
    ]);
    const totalRevenue = ledger.income.total;
    const totalExpenses = ledger.expense.total;
    const revenueCurrentMonth = currentLedger.income.total;
    const revenuePreviousMonth = previousLedger.income.total;
    const expensesCurrentMonth = currentLedger.expense.total;
    const hasExpenseActivity = Object.values(ledger.expense.accounts).some(
      (account) => account.debit !== 0 || account.credit !== 0,
    );
    // Zero posted expenses is a valid ledger result, not a connection error.
    // Match Finance P&L while retaining the check for an unbalanced ledger.
    const profitAvailable = ledger.totals.balanced;

    // Sales: Orders & Direct Invoices
    const [
      totalSaleOrders,
      ordersCurrentMonth,
      ordersPreviousMonth,
      totalCustomers,
      customersCurrentMonth,
      totalSalesInvoices,
      invoicesCurrentMonth,
      invoicesPreviousMonth,
    ] = await Promise.all([
      SaleOrder.countDocuments({
        tenantId,
      }),
      SaleOrder.countDocuments({
        createdAt: { $gte: currentMonthStart },
        tenantId,
      }),
      SaleOrder.countDocuments({
        createdAt: { $gte: prevMonthStart, $lt: currentMonthStart },
        tenantId,
      }),
      Customer.countDocuments({
        tenantId,
      }),
      Customer.countDocuments({
        createdAt: { $gte: currentMonthStart },
        tenantId,
      }),
      SalesInvoice.countDocuments({
        tenantId,
        status: { $in: POSTED_SALES_STATUSES },
      }),
      SalesInvoice.countDocuments({
        tenantId,
        status: { $in: POSTED_SALES_STATUSES },
        invoiceDate: { $gte: currentMonthStart },
      }),
      SalesInvoice.countDocuments({
        tenantId,
        status: { $in: POSTED_SALES_STATUSES },
        invoiceDate: { $gte: prevMonthStart, $lt: currentMonthStart },
      }),
    ]);

    const totalOrders = totalSaleOrders > 0 ? totalSaleOrders : totalSalesInvoices;
    const effectiveOrdersCurrentMonth = totalSaleOrders > 0 ? ordersCurrentMonth : invoicesCurrentMonth;
    const effectiveOrdersPreviousMonth = totalSaleOrders > 0 ? ordersPreviousMonth : invoicesPreviousMonth;

    // Inventory: Products & Stock Movements / Transfers
    const [totalProducts, publishedProducts, stockTransfersCount, stockMovesCount, stockLedgerCount] =
      await Promise.all([
        Product.countDocuments({
          tenantId,
        }),
        Product.countDocuments({
          status: "published",
          tenantId,
        }),
        StockTransfer.countDocuments({
          tenantId,
        }),
        StockMove.countDocuments({
          tenantId,
        }),
        Stock.countDocuments({
          tenantId,
          isReserved: { $ne: true },
        }),
      ]);

    const totalStockTransfers = stockTransfersCount + stockMovesCount + stockLedgerCount;

    // Manufacturing & Users
    const [totalManufacturingOrders, totalUsers, activeUsers] = await Promise.all([
      ManufacturingOrder.countDocuments({ tenantId }),
      User.countDocuments({ tenantId }),
      User.countDocuments({ tenantId, status: ENTITY_STATUS.ACTIVE }),
    ]);

    const totalPayments = await Payment.countDocuments({
      tenantId,
      status: PAYMENT_STATUS.PAID,
    });
    // Count journals once, including migrated and manual postings. A payment's
    // journal is already included and must not be added a second time.
    const totalTransactions = ledger.activity.postedEntryCount;

    const monthRanges = Array.from({ length: 6 }, (_, idx) => {
      const i = 5 - idx;
      const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
      return { monthStart, monthEnd };
    });
    const revenueByMonth = new Map<string, number>(
      revenueByMonthRows.map((row: any) => [row.date, Number(row.revenue) || 0]),
    );

    const ordersByMonth = await Promise.all(
      monthRanges.map(({ monthStart, monthEnd }) =>
        totalSaleOrders > 0
          ? SaleOrder.countDocuments({
              createdAt: { $gte: monthStart, $lt: monthEnd },
              tenantId,
            })
          : SalesInvoice.countDocuments({
              invoiceDate: { $gte: monthStart, $lt: monthEnd },
              status: { $in: POSTED_SALES_STATUSES },
              tenantId,
            }),
      ),
    );

    // Calculate percentage changes
    const revenueChange = revenuePreviousMonth
      ? ((revenueCurrentMonth - revenuePreviousMonth) / revenuePreviousMonth) *
        100
      : 0;

    const ordersChange = effectiveOrdersPreviousMonth
      ? ((effectiveOrdersCurrentMonth - effectiveOrdersPreviousMonth) / effectiveOrdersPreviousMonth) * 100
      : 0;

    // Build chart data
    const monthNames = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];

    const chartData = [];
    for (let i = 5; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const month = date.getMonth();

      chartData.push({
        month: monthNames[month],
        revenue: revenueByMonth.get(monthNames[month]) ?? 0,
        orders: ordersByMonth[5 - i],
      });
    }

    const summary = {
      finance: {
        totalRevenue,
        revenueCurrentMonth,
        revenueChange: Number(revenueChange.toFixed(1)),
        totalExpenses,
        expensesCurrentMonth,
        netIncome: profitAvailable ? totalRevenue - totalExpenses : null,
        profitAvailable,
        profitUnavailableReason: profitAvailable ? null
          : "The posted ledger is out of balance. Review the finance reports before assessing profit.",
        profitNote: ledger.activity.postedEntryCount === 0
          ? "No accounting entries have been posted yet."
          : !hasExpenseActivity ? "Based on posted entries. No expense entries have been posted yet." : null,
        accountingBasis: "posted_journal_entries",
        period: "All time",
        hasExpenseActivity,
        totalTransactions,
        totalPayments,
        draftInvoices,
      },
      sales: {
        totalOrders,
        ordersCurrentMonth: effectiveOrdersCurrentMonth,
        ordersChange: Number(ordersChange.toFixed(1)),
        totalCustomers,
        newCustomersThisMonth: customersCurrentMonth,
      },
      inventory: {
        totalProducts,
        publishedProducts,
        draftProducts: totalProducts - publishedProducts,
        totalStockTransfers,
      },
      manufacturing: {
        totalManufacturingOrders,
      },
      users: {
        totalUsers,
        activeUsers,
        inactiveUsers: totalUsers - activeUsers,
      },
      chartData,
    };

    const responsePayload = { summary };
    setCachedData(cacheKey, responsePayload, 20_000);
    return NextResponse.json(responsePayload);
  } catch (error) {
    console.error("Error fetching admin dashboard data:", error);
    return NextResponse.json(
      { error: "Failed to fetch dashboard data" },
      { status: 500 },
    );
  }
}
