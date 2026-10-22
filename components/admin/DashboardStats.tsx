"use client";

import {
  ArrowUp,
} from "lucide-react";

import { StatCard } from "./StatCard";

interface DashboardStatsProps {
  summary: any;
  formatCurrency: (value: number) => string;
  enabledModules: readonly string[];
  revenueIndicator: {
    icon: typeof ArrowUp;
    bg: string;
    color: string;
  };
  ordersIndicator: {
    icon: typeof ArrowUp;
    bg: string;
    color: string;
  };
}

export function DashboardStats({
  summary,
  formatCurrency,
  enabledModules,
  revenueIndicator,
  ordersIndicator,
}: DashboardStatsProps) {
  const has = (module: string) => enabledModules.includes(module);

  return (
    <div className="grid grid-cols-1 gap-1 md:grid-cols-2 lg:grid-cols-3">
      {has("finance") && <StatCard
        title="Revenue · Posted"
        value={formatCurrency(summary.finance.totalRevenue)}
        subtitle={`${formatCurrency(summary.finance.revenueCurrentMonth)} this month`}
        rightContent={
          <div
            className={`${revenueIndicator.bg} ${revenueIndicator.color} flex items-center gap-1 px-2 py-1 text-[10px] font-medium`}
          >
            <revenueIndicator.icon className="h-3 w-3" />
            {Math.abs(summary.finance.revenueChange).toFixed(1)}%
          </div>
        }
        footer={
          summary.finance.totalRevenue === 0 ? (
            <div className="border border-amber-500/20 bg-amber-500/10 px-3 py-2">
              <p className="text-[10px] font-medium text-amber-600">
                {summary.finance.draftInvoices > 0
                  ? `⚠ ${summary.finance.draftInvoices} draft invoices need posting`
                  : summary.sales.totalOrders > 0
                    ? `⚠ ${summary.sales.totalOrders} orders pending invoicing`
                    : "⚠ No posted revenue"}
              </p>
            </div>
          ) : null
        }
      />}

      {has("sales") && <StatCard
        title="Orders"
        value={summary.sales.totalOrders}
        subtitle={`${summary.sales.ordersCurrentMonth} this month`}
        rightContent={
          <div
            className={`${ordersIndicator.bg} ${ordersIndicator.color} flex items-center gap-1 px-2 py-1 text-[10px] font-medium`}
          >
            <ordersIndicator.icon className="h-3 w-3" />
            {Math.abs(summary.sales.ordersChange).toFixed(1)}%
          </div>
        }
      />}

      {has("sales") && <StatCard
        title="Customers"
        value={summary.sales.totalCustomers}
        subtitle={`+${summary.sales.newCustomersThisMonth} this month`}
      />}

      {has("inventory") && <StatCard
        title="Products"
        value={summary.inventory.totalProducts}
        subtitle={`${summary.inventory.publishedProducts} published · ${summary.inventory.draftProducts} draft`}
      />}

      {has("manufacturing") && <StatCard
        title="Manufacturing"
        value={summary.manufacturing.totalManufacturingOrders}
        subtitle="Production & Assembly"
      />}

      {has("admin") && <StatCard
        title="Users"
        value={summary.users.totalUsers}
        subtitle={`${summary.users.activeUsers} active · ${summary.users.inactiveUsers} inactive`}
      />}
    </div>
  );
}
