// Client-safe: no Mongoose model imports here. Server-only cross-collection
// filtering (resolveSpecialFilter) lives in lib/sales/customerViews.server.ts
// so this file can be imported from client components (e.g. the Customers
// list page) without pulling Mongoose into the browser bundle.

export const DEFAULT_CUSTOMER_COLUMNS = [
  "header.displayName",
  "header.companyName",
  "contact_details.email",
  "contact_details.phone",
  "openingBalance",
];

export const AVAILABLE_CUSTOMER_COLUMNS = [
  { key: "header.companyName", label: "Company Name" },
  { key: "contact_details.email", label: "Email" },
  { key: "contact_details.phone", label: "Phone" },
  { key: "openingBalance", label: "Receivables" },
  { key: "currency", label: "Receivables (BCY)" },
  { key: "openingBalance", label: "Unused Credits" },
  { key: "currency", label: "Unused Credits (BCY)" },
  { key: "gstin", label: "Source" },
  { key: "header.firstName", label: "First Name" },
  { key: "header.lastName", label: "Last Name" },
];

// Seeded once per tenant on first list load — mirrors Zoho's default view set.
// Every entry maps to a real, working filter: either a plain Mongo `criteria`
// row the generic interpreter below understands, or a `specialFilter` that
// needs a cross-collection (SalesInvoice) lookup, resolved server-side.
export const SYSTEM_VIEW_DEFINITIONS: {
  name: string;
  criteria?: { field: string; comparator: string; value: string }[];
  specialFilter?: string;
}[] = [
  { name: "All Customers", criteria: [] },
  { name: "Active Customers", criteria: [{ field: "isActive", comparator: "equals", value: "true" }] },
  { name: "CRM Customers", criteria: [{ field: "tags", comparator: "contains", value: "crm" }] },
  { name: "Duplicate Customers", specialFilter: "duplicate" },
  { name: "Inactive Customers", criteria: [{ field: "isActive", comparator: "equals", value: "false" }] },
  {
    name: "Customer Portal Enabled",
    criteria: [{ field: "portalEnabled", comparator: "equals", value: "true" }],
  },
  {
    name: "Customer Portal Disabled",
    criteria: [{ field: "portalEnabled", comparator: "equals", value: "false" }],
  },
  { name: "Overdue Customers", specialFilter: "overdue" },
  { name: "Unpaid Customers", specialFilter: "unpaid" },
];

const FIELD_GETTERS: Record<string, string> = {
  isActive: "isActive",
  portalEnabled: "portalEnabled",
  tags: "tags",
  displayName: "header.displayName",
  companyName: "header.companyName",
  customerType: "header.customerType",
  email: "contact_details.email",
  phone: "contact_details.phone",
  currency: "currency",
  gstin: "gstin",
  pan: "pan",
  openingBalance: "openingBalance",
  createdAt: "createdAt",
};

export function buildMongoFilterFromCriteria(
  criteria: { field: string; comparator: string; value: string }[] = [],
): Record<string, any> {
  const query: Record<string, any> = {};
  for (const c of criteria) {
    const path = FIELD_GETTERS[c.field] || c.field;
    switch (c.comparator) {
      case "equals":
        query[path] = c.value === "true" ? true : c.value === "false" ? false : c.value;
        break;
      case "not_equals":
        query[path] = { $ne: c.value === "true" ? true : c.value === "false" ? false : c.value };
        break;
      case "contains":
        query[path] = { $regex: c.value, $options: "i" };
        break;
      case "greater_than":
        query[path] = { $gt: Number(c.value) };
        break;
      case "less_than":
        query[path] = { $lt: Number(c.value) };
        break;
      case "is_empty":
        query[path] = { $in: [null, "", undefined] };
        break;
      case "is_not_empty":
        query[path] = { $nin: [null, "", undefined] };
        break;
      default:
        break;
    }
  }
  return query;
}
