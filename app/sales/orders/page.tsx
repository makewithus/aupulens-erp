"use client";

import SalesOrdersPage from "@/app/sales/sales-orders/page";

/**
 * Unified Sales Orders Page (SALES-BUG-010 compatibility route).
 * Re-exports the canonical SalesOrdersPage so existing bookmarks and links
 * to /sales/orders display the exact same full orders dataset, custom views,
 * export tools, and lifecycle actions as /sales/sales-orders.
 */
export default function UnifiedSalesOrdersPage() {
  return <SalesOrdersPage />;
}
