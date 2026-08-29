import { NextResponse } from "next/server";
import { requireTenantId } from "@/lib/auth/requireTenantId";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import { DOCUMENT_STATUS, ENTITY_STATUS, PAYMENT_STATE } from "@/lib/constants/statuses";

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
    console.log(tenantId)

    const [
      SalesInvoice,
      Invoice,
      SaleOrder,
      Product,
      Customer,
      StockTransfer,
      ManufacturingOrder,
      User,
      Expense,
      Transaction,
    ] = await Promise.all([
      import("@/models/sales/SalesInvoice").then((m) => m.SalesInvoice),
      import("@/models/finance/Invoice").then((m) => m.default),
      import("@/models/sales/SaleOrder").then((m) => m.default),
      import("@/models/inventory/Product").then((m) => m.default),
      import("@/models/sales/Customer").then((m) => m.default),
      import("@/models/inventory/StockTransfer").then((m) => m.default),
      import("@/models/manufacturing/ManufacturingOrder").then((m) => m.default),
      import("@/models/auth/User").then((m) => m.default),
      import("@/models/finance/Expense").then((m) => m.default),
      import("@/models/finance/Transaction").then((m) => m.default),
    ]);

    const now = new Date();
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
    const lastSixMonths = new Date(now.getFullYear(), now.getMonth() - 5, 1);

    // Finance: Revenue (using SalesInvoice) & Expenses (vendor bills) — these
    // two finds are independent (different models), so run them together.
    const [outInvoices, inInvoices] = await Promise.all([
      (SalesInvoice as any).find({ tenantId }).lean(),
      (Invoice as any).find({ tenantId, moveType: "in_invoice" }).lean(),
    ]);

    // Valid finalized statuses for SalesInvoice
    const isPostedSales = (inv: any) => ["saved", "partially_paid", "paid", "overdue"].includes(inv.status);
    
    const totalRevenue = outInvoices
      .filter(isPostedSales)
      .reduce((sum: number, inv: any) => sum + (Number(inv.totalAmount) || 0), 0);
      
    const draftInvoices = outInvoices.filter(
      (inv: any) => inv.status === "draft",
    ).length;
    
    const revenueCurrentMonth = outInvoices
      .filter(
        (inv: any) =>
          isPostedSales(inv) &&
          inv.invoiceDate &&
          new Date(inv.invoiceDate) >= currentMonthStart,
      )
      .reduce((sum: number, inv: any) => sum + (Number(inv.totalAmount) || 0), 0);
      
    const revenuePreviousMonth = outInvoices
      .filter(
        (inv: any) =>
          isPostedSales(inv) &&
          inv.invoiceDate &&
          new Date(inv.invoiceDate) >= prevMonthStart &&
          new Date(inv.invoiceDate) <= prevMonthEnd,
      )
      .reduce((sum: number, inv: any) => sum + (Number(inv.totalAmount) || 0), 0);

    const totalExpenses = inInvoices
      .filter(
        (inv: any) =>
          inv.state === DOCUMENT_STATUS.POSTED || inv.paymentState === PAYMENT_STATE.PAID,
      )
      .reduce((sum: number, inv: any) => sum + (Number(inv.amountTotal) || 0), 0);

    const expensesCurrentMonth = inInvoices
      .filter(
        (inv: any) =>
          (inv.state === DOCUMENT_STATUS.POSTED || inv.paymentState === PAYMENT_STATE.PAID) &&
          inv.invoiceDate &&
          new Date(inv.invoiceDate) >= currentMonthStart,
      )
      .reduce((sum: number, inv: any) => sum + (Number(inv.amountTotal) || 0), 0);

    // Sales: Orders
    const [
      totalOrders,
      ordersCurrentMonth,
      ordersPreviousMonth,
      totalCustomers,
      customersCurrentMonth,
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
    ]);

    console.log(
      `[Admin Dashboard] Orders: ${totalOrders}, Customers: ${totalCustomers}`,
    );

    // Inventory: Products & Stock
    const [totalProducts, publishedProducts, totalStockTransfers] =
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
      ]);

    console.log(
      `[Admin Dashboard] Products: ${totalProducts}, Stock Transfers: ${totalStockTransfers}`,
    );

    // Manufacturing & Users
    const [totalManufacturingOrders, totalUsers, activeUsers] = await Promise.all([
      ManufacturingOrder.countDocuments({ tenantId }),
      User.countDocuments({ tenantId }),
      User.countDocuments({ tenantId, status: ENTITY_STATUS.ACTIVE }),
    ]);

    console.log(
      `[Admin Dashboard] Users: ${totalUsers}, Active: ${activeUsers}`,
    );

    // Additional Expenses & Transactions
    const [totalExpenseRecords, totalTransactions] = await Promise.all([
      Expense.aggregate([
        { $match: { tenantId } },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ]).then((r) => r[0]?.total || 0),
      Transaction.countDocuments({
        tenantId,
      }),
    ]);

    // Chart Data: Revenue by month (last 6 months)
    const monthRanges = Array.from({ length: 6 }, (_, idx) => {
      const i = 5 - idx;
      const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
      return { monthStart, monthEnd };
    });

    const revenueByMonth = monthRanges.map(({ monthStart, monthEnd }) =>
      outInvoices
        .filter(
          (inv: any) =>
            isPostedSales(inv) &&
            inv.invoiceDate &&
            new Date(inv.invoiceDate) >= monthStart &&
            new Date(inv.invoiceDate) <= monthEnd,
        )
        .reduce((sum: number, inv: any) => sum + (Number(inv.totalAmount) || 0), 0),
    );

    const ordersByMonth = await Promise.all(
      monthRanges.map(({ monthStart, monthEnd }) =>
        SaleOrder.countDocuments({
          createdAt: { $gte: monthStart, $lte: monthEnd },
          tenantId,
        }),
      ),
    );

    // Calculate percentage changes
    const revenueChange = revenuePreviousMonth
      ? ((revenueCurrentMonth - revenuePreviousMonth) / revenuePreviousMonth) *
        100
      : 0;

    const ordersChange = ordersPreviousMonth
      ? ((ordersCurrentMonth - ordersPreviousMonth) / ordersPreviousMonth) * 100
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
        revenue: revenueByMonth[5 - i],
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
        netIncome: totalRevenue - totalExpenses,
        totalTransactions,
        totalExpenseRecords,
        draftInvoices,
      },
      sales: {
        totalOrders,
        ordersCurrentMonth,
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

    return NextResponse.json({ summary });
  } catch (error) {
    console.error("Error fetching admin dashboard data:", error);
    return NextResponse.json(
      { error: "Failed to fetch dashboard data" },
      { status: 500 },
    );
  }
}
