import SaleOrder from "@/models/sales/SaleOrder";
import InventoryItem from "@/models/inventory/InventoryItem";
import Transaction from "@/models/finance/Transaction";
import Invoice from "@/models/finance/Invoice";
import User from "@/models/auth/User";
import Shipment from "@/models/manufacturing/Shipment";

export async function fetchAdminFinanceData(tenantId: string) {
  const [transactions, invoices] = await Promise.all([
    (Transaction as any).find({ tenantId }).sort({ createdAt: -1 }).limit(10).lean(),
    (Invoice as any).find({ tenantId }).sort({ createdAt: -1 }).limit(10).lean(),
  ]);

  const totalRevenue = invoices.reduce(
    (sum: number, inv: any) => sum + (inv.totalAmount || 0),
    0
  );

  return {
    summary: {
      totalRevenue,
      totalTransactions: transactions.length,
      recentInvoices: invoices.length,
    },
    recentTransactions: transactions.slice(0, 5),
    recentInvoices: invoices.slice(0, 5),
  };
}

export async function fetchAdminSalesData(tenantId: string) {
  const orders = await (SaleOrder as any)
    .find({ tenantId })
    .sort({ createdAt: -1 })
    .limit(20)
    .lean();

  const totalOrders = orders.length;
  const totalRevenue = orders.reduce(
    (sum: number, order: any) => sum + (order.totals?.amountTotal || 0),
    0
  );

  const productCounts: Record<string, number> = {};
  orders.forEach((order: any) => {
    order.orderLines?.forEach((item: any) => {
      const name = item.name || "Unknown";
      productCounts[name] = (productCounts[name] || 0) + (item.productQty || 1);
    });
  });

  const topProducts = Object.entries(productCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([name, count]) => ({ name, count }));

  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - 11, 1);

  const monthlyAgg = await SaleOrder.aggregate([
    { $match: { tenantId, createdAt: { $gte: start } } },
    {
      $group: {
        _id: { year: { $year: "$createdAt" }, month: { $month: "$createdAt" } },
        total: { $sum: { $ifNull: ["$totals.amountTotal", 0] } },
      },
    },
    { $sort: { "_id.year": 1, "_id.month": 1 } },
  ]).exec();

  const monthlyMap: Record<string, number> = {};
  monthlyAgg.forEach((m: any) => {
    const key = `${m._id.year}-${String(m._id.month).padStart(2, "0")}`;
    monthlyMap[key] = m.total;
  });

  const monthlyTotals: { label: string; year: number; month: number; total: number }[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    monthlyTotals.push({
      label: d.toLocaleString("default", { month: "short", year: "numeric" }),
      year: d.getFullYear(),
      month: d.getMonth() + 1,
      total: monthlyMap[key] || 0,
    });
  }

  return {
    summary: {
      totalOrders,
      totalRevenue,
      averageOrderValue: totalOrders > 0 ? totalRevenue / totalOrders : 0,
    },
    topProducts,
    recentOrders: orders.slice(0, 5),
    monthlyTotals,
  };
}

export async function fetchAdminInventoryData(tenantId: string) {
  const items = await InventoryItem.find({ tenantId }).lean();

  const totalItems = items.length;
  const lowStockItems = items.filter(
    (item: any) => item.quantity <= (item.reorderPoint || 10)
  );
  const outOfStock = items.filter((item: any) => item.quantity === 0);

  return {
    summary: {
      totalItems,
      lowStockCount: lowStockItems.length,
      outOfStockCount: outOfStock.length,
      totalValue: items.reduce(
        (sum: number, item: any) =>
          sum + (item.quantity || 0) * (item.unitPrice || 0),
        0
      ),
    },
    lowStockItems: lowStockItems.slice(0, 10),
    recentItems: items.slice(0, 5),
  };
}

export async function fetchAdminManufacturingData(tenantId: string) {
  const shipments = await (Shipment as any)
    .find({ tenantId })
    .sort({ createdAt: -1 })
    .limit(20)
    .lean();

  const statusCounts: Record<string, number> = {};
  shipments.forEach((s: any) => {
    const status = s.status || "Unknown";
    statusCounts[status] = (statusCounts[status] || 0) + 1;
  });

  return {
    summary: { totalShipments: shipments.length, statusBreakdown: statusCounts },
    recentShipments: shipments.slice(0, 5),
  };
}

export async function fetchAdminUsersData(tenantId: string) {
  const users = await (User as any).find({ tenantId }).select("-password").lean();

  const roleCounts: Record<string, number> = {};
  users.forEach((u: any) => {
    const role = u.role || "Unknown";
    roleCounts[role] = (roleCounts[role] || 0) + 1;
  });

  return {
    summary: { totalUsers: users.length, roleBreakdown: roleCounts },
    recentUsers: users.slice(0, 5),
  };
}

export async function fetchAdminGeneralData(tenantId: string) {
  const [users, orders, items] = await Promise.all([
    User.countDocuments({ tenantId }),
    SaleOrder.countDocuments({ tenantId }),
    InventoryItem.countDocuments({ tenantId }),
  ]);

  return { summary: { totalUsers: users, totalOrders: orders, totalInventoryItems: items } };
}
