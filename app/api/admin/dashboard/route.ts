import { NextResponse } from "next/server";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import { DOCUMENT_STATUS, ENTITY_STATUS } from "@/lib/constants/statuses";

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

    const tenantId = (session.user as any).tenantId || "default-tenant";
    console.log(tenantId)

    const [
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
      import("@/models/Invoice").then((m) => m.default),
      import("@/models/SaleOrder").then((m) => m.default),
      import("@/models/Product").then((m) => m.default),
      import("@/models/Customer").then((m) => m.default),
      import("@/models/StockTransfer").then((m) => m.default),
      import("@/models/ManufacturingOrder").then((m) => m.default),
      import("@/models/User").then((m) => m.default),
      import("@/models/Expense").then((m) => m.default),
      import("@/models/Transaction").then((m) => m.default),
    ]);

    const now = new Date();
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
    const lastSixMonths = new Date(now.getFullYear(), now.getMonth() - 5, 1);

    // Finance: Revenue (using same pattern as finance summary API)
    const outInvoices = await Invoice.find({
      moveType: "out_invoice",
      tenantId,
    }).lean();

    console.log(
      `[Admin Dashboard] Total out_invoices found: ${outInvoices.length}`,
    );
    console.log(
      `[Admin Dashboard] Posted out_invoices: ${outInvoices.filter((inv: any) => inv.state === DOCUMENT_STATUS.POSTED).length}`,
    );

    const totalRevenue = outInvoices
      .filter((inv: any) => inv.state === DOCUMENT_STATUS.POSTED)
      .reduce((sum, inv: any) => {
        const amount = Number(inv.amountTotal) || 0;
        console.log(`[Admin Dashboard] Invoice ${inv.name}: ${amount}`);
        return sum + amount;
      }, 0);

    console.log(`[Admin Dashboard] Total Revenue Calculated: ${totalRevenue}`);

    const draftInvoices = outInvoices.filter(
      (inv: any) => inv.state === DOCUMENT_STATUS.DRAFT,
    ).length;

    const revenueCurrentMonth = outInvoices
      .filter(
        (inv: any) =>
          inv.state === DOCUMENT_STATUS.POSTED &&
          inv.invoiceDate &&
          new Date(inv.invoiceDate) >= currentMonthStart,
      )
      .reduce((sum, inv: any) => sum + (Number(inv.amountTotal) || 0), 0);

    const revenuePreviousMonth = outInvoices
      .filter(
        (inv: any) =>
          inv.state === DOCUMENT_STATUS.POSTED &&
          inv.invoiceDate &&
          new Date(inv.invoiceDate) >= prevMonthStart &&
          new Date(inv.invoiceDate) <= prevMonthEnd,
      )
      .reduce((sum, inv: any) => sum + (Number(inv.amountTotal) || 0), 0);

    // Finance: Expenses (using same pattern as finance summary API)
    const inInvoices = await Invoice.find({
      moveType: "in_invoice",
      tenantId,
    }).lean();

    console.log(
      `[Admin Dashboard] Total in_invoices found: ${inInvoices.length}`,
    );
    console.log(
      `[Admin Dashboard] Posted in_invoices: ${inInvoices.filter((inv: any) => inv.state === DOCUMENT_STATUS.POSTED).length}`,
    );

    const totalExpenses = inInvoices
      .filter((inv: any) => inv.state === DOCUMENT_STATUS.POSTED)
      .reduce((sum, inv: any) => sum + (Number(inv.amountTotal) || 0), 0);

    const expensesCurrentMonth = inInvoices
      .filter(
        (inv: any) =>
          inv.state === DOCUMENT_STATUS.POSTED &&
          inv.invoiceDate &&
          new Date(inv.invoiceDate) >= currentMonthStart,
      )
      .reduce((sum, inv: any) => sum + (Number(inv.amountTotal) || 0), 0);

    console.log(
      `[Admin Dashboard] Total Expenses: ${totalExpenses}, Current Month: ${expensesCurrentMonth}`,
    );

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

    // Manufacturing
    const totalManufacturingOrders = await ManufacturingOrder.countDocuments({
      tenantId,
    });

    // Users
    const totalUsers = await User.countDocuments({ tenantId });
    const activeUsers = await User.countDocuments({
      tenantId,
      status: ENTITY_STATUS.ACTIVE,
    });

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
    const revenueByMonth: any[] = [];
    const ordersByMonth: any[] = [];

    for (let i = 5; i >= 0; i--) {
      const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);

      const monthRevenue = outInvoices
        .filter(
          (inv: any) =>
            inv.state === DOCUMENT_STATUS.POSTED &&
            inv.invoiceDate &&
            new Date(inv.invoiceDate) >= monthStart &&
            new Date(inv.invoiceDate) <= monthEnd,
        )
        .reduce((sum, inv: any) => sum + (Number(inv.amountTotal) || 0), 0);

      const monthOrders = await SaleOrder.countDocuments({
        createdAt: { $gte: monthStart, $lte: monthEnd },
        tenantId,
      });

      revenueByMonth.push(monthRevenue);
      ordersByMonth.push(monthOrders);
    }

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
