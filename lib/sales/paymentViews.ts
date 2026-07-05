// Client-safe: no Mongoose model imports (mirrors saleOrderViews.ts's split-file
// convention). Server-only specialFilter resolution lives in paymentViews.server.ts.
import { buildMongoFilterFromCriteria as buildBase } from "@/lib/sales/customerViews";

// Mandatory, non-removable defaults per spec §7.2's New View builder.
export const MANDATORY_PAYMENT_COLUMNS = [
  { key: "paymentDate", label: "Date" },
  { key: "customerId.header.displayName", label: "Customer Name" },
  { key: "mode", label: "Mode" },
  { key: "amountReceived", label: "Amount" },
];

export const AVAILABLE_PAYMENT_COLUMNS = [
  { key: "paymentNumber", label: "Payment#" },
  { key: "reference", label: "Reference#" },
  { key: "invoiceNumbers", label: "Invoice#" },
  { key: "unusedAmount", label: "Unused Amount" },
  { key: "status", label: "Status" },
  { key: "paymentType", label: "Payment Type" },
  { key: "bankCharges", label: "Bank Charges" },
  { key: "createdAt", label: "Created Time" },
  { key: "updatedAt", label: "Last Modified Time" },
];

// The 4 seeded system views from spec §7.2.
export const SYSTEM_VIEW_DEFINITIONS: {
  name: string;
  criteria?: { field: string; comparator: string; value: string }[];
  specialFilter?: string;
}[] = [
  { name: "All Payments", criteria: [] },
  { name: "Draft", criteria: [{ field: "status", comparator: "equals", value: "draft" }] },
  { name: "Paid", criteria: [{ field: "status", comparator: "equals", value: "paid" }] },
  { name: "Void", criteria: [{ field: "status", comparator: "equals", value: "void" }] },
];

const FIELD_GETTERS: Record<string, string> = {
  status: "status",
  paymentType: "paymentType",
  mode: "mode",
  reference: "reference",
  amount: "amountReceived",
  createdAt: "createdAt",
};

export function buildMongoFilterFromCriteria(
  criteria: { field: string; comparator: string; value: string }[] = [],
): Record<string, any> {
  const remapped = criteria.map((c) => ({ ...c, field: FIELD_GETTERS[c.field] || c.field }));
  return buildBase(remapped);
}
