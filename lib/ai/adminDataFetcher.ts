import { issuedInvoiceFilter } from "@/lib/sales/invoiceEligibility";
import SaleOrder from "@/models/sales/SaleOrder";
import InventoryItem from "@/models/inventory/InventoryItem";
import Transaction from "@/models/finance/Transaction";
import Invoice from "@/models/finance/Invoice";
import { SalesInvoice } from "@/models/sales/SalesInvoice";
import Payment from "@/models/sales/Payment";
import User from "@/models/auth/User";
import Shipment from "@/models/manufacturing/Shipment";
import Organization from "@/models/admin/Organization";
import mongoose from "mongoose";

export async function fetchAdminFinanceData(tenantId: string) {
  const [transactions, payments, invoices, salesInvoices] = await Promise.all([
    (Transaction as any).find({ tenantId }).sort({ createdAt: -1 }).limit(10).lean(),
    (Payment as any).find({ tenantId }).sort({ createdAt: -1 }).limit(10).lean(),
    (Invoice as any).find({ tenantId }).sort({ createdAt: -1 }).limit(10).lean(),
    (SalesInvoice as any).find({ tenantId }).sort({ createdAt: -1 }).limit(10).lean(),
  ]);

  const issued = await SalesInvoice.aggregate([
    { $match: { tenantId, ...issuedInvoiceFilter() } },
    { $group: { _id: null, total: { $sum: "$totalAmount" } } },
  ]).exec();
  const totalRevenue = issued[0]?.total || 0;
  const totalTransactions = payments.length > 0 ? payments.length : transactions.length;

  const combinedInvoices = salesInvoices.length > 0 ? salesInvoices : invoices;
  const combinedTransactions = payments.length > 0 ? payments : transactions;

  return {
    summary: {
      totalRevenue,
      revenueBasis: "Issued invoice gross value including tax, excluding drafts/cancellations",
      totalTransactions,
      recentInvoices: combinedInvoices.length,
    },
    recentTransactions: combinedTransactions.slice(0, 5),
    recentInvoices: combinedInvoices.slice(0, 5),
  };
}

export async function fetchAdminSalesData(tenantId: string) {
  const [orders, salesInvoices] = await Promise.all([
    (SaleOrder as any)
      .find({ tenantId })
      .sort({ createdAt: -1 })
      .limit(20)
      .lean(),
    (SalesInvoice as any)
      .find({ tenantId })
      .sort({ createdAt: -1 })
      .limit(20)
      .lean(),
  ]);

  const [totalOrders, issued] = await Promise.all([
    SaleOrder.countDocuments({ tenantId }),
    SalesInvoice.aggregate([
      { $match: { tenantId, ...issuedInvoiceFilter() } },
      { $group: { _id: null, total: { $sum: "$totalAmount" } } },
    ]).exec(),
  ]);
  const totalRevenue = issued[0]?.total || 0;
  const productCounts: Record<string, number> = {};
  if (orders.length > 0) {
    orders.forEach((order: any) => {
      order.orderLines?.forEach((item: any) => {
        const name = item.name || "Unknown";
        productCounts[name] = (productCounts[name] || 0) + (item.productQty || 1);
      });
    });
  } else {
    salesInvoices.forEach((inv: any) => {
      inv.lineItems?.forEach((item: any) => {
        const name = item.name || "Unknown";
        productCounts[name] = (productCounts[name] || 0) + (item.qty || 1);
      });
    });
  }

  const topProducts = Object.entries(productCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([name, count]) => ({ name, count }));

  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - 11, 1);

  const monthlyAgg = await SalesInvoice.aggregate([
        { $match: { tenantId, ...issuedInvoiceFilter(), invoiceDate: { $gte: start } } },
        {
          $group: {
            _id: { year: { $year: "$invoiceDate" }, month: { $month: "$invoiceDate" } },
            total: { $sum: { $ifNull: ["$totalAmount", 0] } },
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
      revenueBasis: "Issued invoice gross value including tax, excluding drafts/cancellations",
      averageOrderValue: totalOrders > 0 ? totalRevenue / totalOrders : 0,
    },
    topProducts,
    recentOrders: (orders.length > 0 ? orders : salesInvoices).slice(0, 5),
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
  const [users, orders, items, org] = await Promise.all([
    User.countDocuments({ tenantId }),
    SaleOrder.countDocuments({ tenantId }),
    InventoryItem.countDocuments({ tenantId }),
    (Organization as any).findOne({
      $or: [
        { subdomain: tenantId },
        ...(mongoose.isValidObjectId(tenantId) ? [{ _id: tenantId }] : []),
      ],
    }).select("name subdomain tier subscriptionStatus").lean(),
  ]);

  return {
    organization: org ? { name: org.name, subdomain: org.subdomain, tier: org.tier, subscriptionStatus: org.subscriptionStatus } : null,
    summary: { totalUsers: users, totalOrders: orders, totalInventoryItems: items },
  };
}
