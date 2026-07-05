// Client-safe: no Mongoose model imports (see lib/sales/customerViews.ts for
// the split-file convention this mirrors). Server-only date-window/compound
// specialFilters live in saleOrderViews.server.ts.
import { buildMongoFilterFromCriteria as buildBase } from "@/lib/sales/customerViews";

// These 5 are always shown, in this order, and are not removable from the
// New View column builder (spec: "each marked with a red asterisk, none
// removable") — unlike Subscriptions/Customers, which only mandate one.
export const MANDATORY_SALE_ORDER_COLUMNS = [
  { key: "header.dateOrder", label: "Date" },
  { key: "header.name", label: "Sales Order#" },
  { key: "header.partnerId.header.displayName", label: "Customer Name" },
  { key: "salesOrderStatus", label: "Order Status" },
  { key: "totals.amountTotal", label: "Amount" },
];

export const AVAILABLE_SALE_ORDER_COLUMNS = [
  { key: "otherInfo.clientOrderRef", label: "Reference#" },
  { key: "invoicingStatus", label: "Invoiced" },
  { key: "shipmentStatus", label: "Shipped" },
  { key: "expectedShipmentDate", label: "Expected Shipment Date" },
  { key: "deliveryMethod", label: "Delivery Method" },
  { key: "header.partnerId.header.companyName", label: "Company Name" },
  { key: "totals.amountTotal", label: "Invoiced Amount" },
];

// The 22 seeded system views (including "All") from the Sales Orders
// "All Sales Orders ▾" dropdown. A handful (Drop Shipped / Backorder /
// Manually Fulfilled) have no dedicated tracking field in this schema yet —
// they're honest, always-empty placeholder views rather than faked data,
// resolved via specialFilter "placeholder_empty" in the server module.
export const SYSTEM_VIEW_DEFINITIONS: {
  name: string;
  criteria?: { field: string; comparator: string; value: string }[];
  specialFilter?: string;
}[] = [
  { name: "All", criteria: [] },
  { name: "Draft", criteria: [{ field: "salesOrderStatus", comparator: "equals", value: "draft" }] },
  { name: "Pending Approval", criteria: [{ field: "salesOrderStatus", comparator: "equals", value: "pending_approval" }] },
  { name: "Approved", criteria: [{ field: "salesOrderStatus", comparator: "equals", value: "approved" }] },
  { name: "Confirmed", criteria: [{ field: "salesOrderStatus", comparator: "equals", value: "confirmed" }] },
  { name: "Overdue", specialFilter: "overdue" },
  { name: "Partially Invoiced", criteria: [{ field: "invoicingStatus", comparator: "equals", value: "partially_invoiced" }] },
  { name: "Invoiced", criteria: [{ field: "invoicingStatus", comparator: "equals", value: "invoiced" }] },
  { name: "For Packaging", criteria: [{ field: "shipmentStatus", comparator: "equals", value: "not_shipped" }] },
  { name: "To be Shipped", specialFilter: "to_be_shipped" },
  { name: "Shipped", criteria: [{ field: "shipmentStatus", comparator: "equals", value: "shipped" }] },
  { name: "For Invoicing", specialFilter: "for_invoicing" },
  { name: "Drop Shipped", specialFilter: "placeholder_empty" },
  { name: "Backorder", specialFilter: "placeholder_empty" },
  { name: "Onhold", criteria: [{ field: "salesOrderStatus", comparator: "equals", value: "on_hold" }] },
  { name: "Fulfilled", criteria: [{ field: "shipmentStatus", comparator: "equals", value: "fulfilled" }] },
  { name: "Manually Fulfilled", specialFilter: "placeholder_empty" },
  { name: "Closed", criteria: [{ field: "salesOrderStatus", comparator: "equals", value: "closed" }] },
  { name: "Void", criteria: [{ field: "salesOrderStatus", comparator: "equals", value: "void" }] },
  { name: "Shipped & Not Invoiced", specialFilter: "shipped_not_invoiced" },
  { name: "Invoiced & Not Shipped", specialFilter: "invoiced_not_shipped" },
  { name: "Customer Viewed", criteria: [{ field: "customerViewed", comparator: "equals", value: "true" }] },
];

const FIELD_GETTERS: Record<string, string> = {
  salesOrderStatus: "salesOrderStatus",
  invoicingStatus: "invoicingStatus",
  shipmentStatus: "shipmentStatus",
  customerViewed: "customerViewed",
  clientOrderRef: "otherInfo.clientOrderRef",
  amount: "totals.amountTotal",
  createdAt: "createdAt",
};

export function buildMongoFilterFromCriteria(
  criteria: { field: string; comparator: string; value: string }[] = [],
): Record<string, any> {
  const remapped = criteria.map((c) => ({ ...c, field: FIELD_GETTERS[c.field] || c.field }));
  return buildBase(remapped);
}
