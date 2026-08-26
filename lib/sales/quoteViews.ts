// Client-safe: no Mongoose model imports here — mirrors lib/sales/customerViews.ts.

export const SYSTEM_VIEW_DEFINITIONS: {
  name: string;
  criteria?: { field: string; comparator: string; value: string }[];
}[] = [
  { name: "All Quotes", criteria: [] },
  { name: "Draft Quotes", criteria: [{ field: "status", comparator: "equals", value: "draft" }] },
  { name: "Sent Quotes", criteria: [{ field: "status", comparator: "equals", value: "sent" }] },
  { name: "Accepted Quotes", criteria: [{ field: "status", comparator: "equals", value: "accepted" }] },
  { name: "Rejected Quotes", criteria: [{ field: "status", comparator: "equals", value: "rejected" }] },
  { name: "Invoiced Quotes", criteria: [{ field: "status", comparator: "equals", value: "invoiced" }] },
];

const FIELD_GETTERS: Record<string, string> = {
  status: "status",
  quoteNumber: "quoteNumber",
  totalAmount: "totalAmount",
  quoteDate: "quoteDate",
  expiryDate: "expiryDate",
};

export function buildMongoFilterFromCriteria(
  criteria: { field: string; comparator: string; value: string }[] = [],
): Record<string, any> {
  const query: Record<string, any> = {};
  for (const c of criteria) {
    const path = FIELD_GETTERS[c.field] || c.field;
    switch (c.comparator) {
      case "equals":
        query[path] = c.value;
        break;
      case "not_equals":
        query[path] = { $ne: c.value };
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
      default:
        break;
    }
  }
  return query;
}
