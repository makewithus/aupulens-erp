// Client-safe: no Mongoose model imports here. Server-only cross-collection /
// date-window filtering (resolveSpecialFilter) lives in subscriptionViews.server.ts
// so this file can be imported from client components without pulling Mongoose
// into the browser bundle (see lib/sales/customerViews.ts for the same split).
import { buildMongoFilterFromCriteria as buildBase } from "@/lib/sales/customerViews";

export const DEFAULT_SUBSCRIPTION_COLUMNS = ["profileName", "totalAmount", "status", "nextBillingOn"];

// "Customer Name" (customerId.header.displayName) is always shown as the
// mandatory first list/export column — like AVAILABLE_CUSTOMER_COLUMNS, it is
// intentionally excluded from this pool to avoid a duplicate column.
export const AVAILABLE_SUBSCRIPTION_COLUMNS = [
  { key: "profileName", label: "Plan Name" },
  { key: "totalAmount", label: "Amount" },
  { key: "status", label: "Status" },
  { key: "createdAt", label: "Created On" },
  { key: "activatedOn", label: "Activated On" },
  { key: "lastBilledOn", label: "Last Billed On" },
  { key: "nextBillingOn", label: "Next Billing On" },
  { key: "updatedAt", label: "Last Modified Time" },
];

// The 17 seeded system views from the Subscriptions "All Subscriptions ▾"
// dropdown. Plain criteria rows are handled by the generic interpreter below;
// anything needing "now"-relative date windows or a cross-collection invoice
// lookup is a specialFilter resolved server-side.
export const SYSTEM_VIEW_DEFINITIONS: {
  name: string;
  criteria?: { field: string; comparator: string; value: string }[];
  specialFilter?: string;
}[] = [
  { name: "All", criteria: [] },
  { name: "Active", criteria: [{ field: "status", comparator: "equals", value: "active" }] },
  { name: "Trial", criteria: [{ field: "status", comparator: "equals", value: "trial" }] },
  { name: "Trials Expired in the Previous Week", specialFilter: "trial_expired_prev_week" },
  { name: "Trials Expiring in the Next Week", specialFilter: "trial_expiring_next_week" },
  { name: "Trials Expiring in the Next Seven Days", specialFilter: "trial_expiring_next_7_days" },
  { name: "Dunning", criteria: [{ field: "status", comparator: "equals", value: "dunning" }] },
  { name: "Unpaid", criteria: [{ field: "status", comparator: "equals", value: "unpaid" }] },
  { name: "Subscriptions with Unpaid Invoices", specialFilter: "unpaid_invoices" },
  { name: "Subscriptions with Pending Invoices", specialFilter: "pending_invoices" },
  { name: "Canceled This Month", specialFilter: "canceled_this_month" },
  { name: "Canceled Last Month", specialFilter: "canceled_last_month" },
  {
    name: "Non-Renewing",
    criteria: [
      { field: "status", comparator: "equals", value: "active" },
      { field: "autoRenew", comparator: "equals", value: "false" },
    ],
  },
  { name: "Subscriptions Expiring This Month", specialFilter: "expiring_this_month" },
  { name: "Metered Billing Enabled", criteria: [{ field: "metered", comparator: "equals", value: "true" }] },
  {
    name: "Subscriptions with Unbilled Charges",
    criteria: [{ field: "unbilledCharges", comparator: "greater_than", value: "0" }],
  },
  { name: "Subscriptions for Items", specialFilter: "for_items" },
];

const FIELD_GETTERS: Record<string, string> = {
  status: "status",
  autoRenew: "autoRenew",
  metered: "metered",
  unbilledCharges: "unbilledCharges",
  profileName: "profileName",
  totalAmount: "totalAmount",
  billingFrequency: "billingFrequency",
  createdAt: "createdAt",
};

export function buildMongoFilterFromCriteria(
  criteria: { field: string; comparator: string; value: string }[] = [],
): Record<string, any> {
  const remapped = criteria.map((c) => ({ ...c, field: FIELD_GETTERS[c.field] || c.field }));
  return buildBase(remapped);
}
