import { NextResponse } from "next/server";
import { requireTenantId } from "@/lib/auth/requireTenantId";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import { DOCUMENT_STATUS, ENTITY_STATUS, PAYMENT_STATE, SALES_INVOICE_STATUS } from "@/lib/constants/statuses";

const POSTED_SALES_STATUSES = [
  SALES_INVOICE_STATUS.SAVED,
  SALES_INVOICE_STATUS.PARTIALLY_PAID,
  SALES_INVOICE_STATUS.PAID,
  SALES_INVOICE_STATUS.OVERDUE,
];

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

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
    const lastSixMonths = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    const [salesInvoiceAgg, purchaseBillAgg, revenueByMonthRows] = await Promise.all([
      (SalesInvoice as any).aggregate([
        { $match: { tenantId } },
        {
          $group: {
            _id: null,
            totalRevenue: {
              $sum: {
                $cond: [{ $in: ["$status", POSTED_SALES_STATUSES] }, { $ifNull: ["$totalAmount", 0] }, 0],
              },
            },
            draftInvoices: {
              $sum: { $cond: [{ $eq: ["$status", SALES_INVOICE_STATUS.DRAFT] }, 1, 0] },
            },
            revenueCurrentMonth: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $in: ["$status", POSTED_SALES_STATUSES] },
                      { $gte: ["$invoiceDate", currentMonthStart] },
                      { $lt: ["$invoiceDate", nextMonthStart] },
                    ],
                  },
                  { $ifNull: ["$totalAmount", 0] },
                  0,
                ],
              },
            },
            revenuePreviousMonth: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $in: ["$status", POSTED_SALES_STATUSES] },
                      { $gte: ["$invoiceDate", prevMonthStart] },
                      { $lt: ["$invoiceDate", currentMonthStart] },
                    ],
                  },
                  { $ifNull: ["$totalAmount", 0] },
                  0,
                ],
              },
            },
          },
        },
      ]),
      (Invoice as any).aggregate([
        {
          $match: {
            tenantId,
            moveType: "in_invoice",
            $or: [
              { state: DOCUMENT_STATUS.POSTED },
              { paymentState: PAYMENT_STATE.PAID },
            ],
          },
        },
        {
          $group: {
            _id: null,
            totalExpenses: { $sum: { $ifNull: ["$amountTotal", 0] } },
            expensesCurrentMonth: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $gte: ["$invoiceDate", currentMonthStart] },
                      { $lt: ["$invoiceDate", nextMonthStart] },
                    ],
                  },
                  { $ifNull: ["$amountTotal", 0] },
                  0,
                ],
              },
            },
          },
        },
      ]),
      (SalesInvoice as any).aggregate([
        {
          $match: {
            tenantId,
            status: { $in: POSTED_SALES_STATUSES },
            invoiceDate: { $gte: lastSixMonths, $lt: nextMonthStart },
          },
        },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m", date: "$invoiceDate" } },
            revenue: { $sum: { $ifNull: ["$totalAmount", 0] } },
          },
        },
      ]),
    ]);

    const salesTotals = salesInvoiceAgg[0] ?? {};
    const purchaseTotals = purchaseBillAgg[0] ?? {};
    const totalRevenue = Number(salesTotals.totalRevenue) || 0;
    const draftInvoices = Number(salesTotals.draftInvoices) || 0;
    const revenueCurrentMonth = Number(salesTotals.revenueCurrentMonth) || 0;
    const revenuePreviousMonth = Number(salesTotals.revenuePreviousMonth) || 0;
    const totalExpenses = Number(purchaseTotals.totalExpenses) || 0;
    const expensesCurrentMonth = Number(purchaseTotals.expensesCurrentMonth) || 0;

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

    // Manufacturing & Users
    const [totalManufacturingOrders, totalUsers, activeUsers] = await Promise.all([
      ManufacturingOrder.countDocuments({ tenantId }),
      User.countDocuments({ tenantId }),
      User.countDocuments({ tenantId, status: ENTITY_STATUS.ACTIVE }),
    ]);

    // Additional Expenses & Transactions
    const [totalExpenseRecords, totalTransactions] = await Promise.all([
      Expense.aggregate([
        { $match: { tenantId } },
        { $group: { _id: null, total: { $sum: { $ifNull: ["$total", "$amount"] } } } },
      ]).then((r) => r[0]?.total || 0),
      Transaction.countDocuments({
        tenantId,
      }),
    ]);

    const monthRanges = Array.from({ length: 6 }, (_, idx) => {
      const i = 5 - idx;
      const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
      return { monthStart, monthEnd };
    });
    const revenueByMonth = new Map<string, number>(
      revenueByMonthRows.map((row: any) => [row._id, Number(row.revenue) || 0]),
    );

    const ordersByMonth = await Promise.all(
      monthRanges.map(({ monthStart, monthEnd }) =>
        SaleOrder.countDocuments({
          createdAt: { $gte: monthStart, $lt: monthEnd },
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
        revenue: revenueByMonth.get(monthKey(date)) ?? 0,
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
