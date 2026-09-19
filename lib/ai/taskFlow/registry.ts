/**
 * Declarative field registry for AI-assisted record creation. Adding a target (customer, bill,
 * expense…) is a data entry here — no engine change. The `validation` block mirrors what the REAL
 * route and model enforce; tests/ai/taskFlow/registryDrift.test.ts FAILS the build when either
 * changes without this file changing (see Part 1.4 of BRIEF-SARVAM-2).
 */
import { SALES_INVOICE_STATUS } from "@/lib/constants/statuses";

export type SlotKind = "customer" | "text" | "money" | "quantity" | "date";

export interface SlotDef {
  key: string;
  label: string;
  kind: SlotKind;
  required: boolean;
  /** Optional slots with a default are NOT asked; they show in the summary and can be changed. */
  default?: { value: unknown; display: string };
  /** Should the assistant ask for it even though it is optional (skippable)? */
  askOptional?: boolean;
  ask: string;
  why: string;
  /** Record paths (route body / model) this slot supplies — drift test checks full coverage. */
  satisfies: string[];
  /** Words a user might use to name this slot ("change the amount to …"). */
  aliases: string[];
}

export interface TaskTarget {
  id: string;
  label: string;
  module: string; // module key used by the middleware gate
  /** Roles the middleware allows on this module's routes (drift-tested against middleware.ts). */
  allowedRoles: string[];
  formRoute: string; // real pre-filled form
  recordRoute: (id: string) => string;
  createEndpoint: string; // the real route the execute path goes through
  listEndpoint: string;
  nounRx: RegExp;
  slots: SlotDef[];
  validation: {
    routeSource: string;
    /** body fields the route rejects (400) when missing, for non-draft documents */
    routeRequired: string[];
    /** model-required paths the USER must supply (array items as `arr.field`) */
    modelRequired: string[];
    /** model-required paths the route computes itself (tenantId, number, totals…) */
    modelServerDerived: string[];
    /** arrays whose items are required-only-if-present (charges, payments…) — not user-supplied here */
    modelOptionalArrays: string[];
    modelMin: Record<string, number>;
  };
  howTo: { where: string; steps: string[]; fields: { label: string; meaning: string }[]; tip?: string };
  toPayload(v: Record<string, any>, ctx: { today: string }): Record<string, unknown>;
  toPrefill(v: Record<string, any>, ctx: { today: string }): Record<string, unknown>;
}

export const SALES_INVOICE_TARGET: TaskTarget = {
  id: "invoice",
  label: "invoice",
  module: "sales",
  allowedRoles: ["sales", "admin", "master-admin"],
  formRoute: "/sales/invoices/new",
  recordRoute: (id) => `/sales/invoices/${id}`,
  createEndpoint: "/api/sales/invoices",
  listEndpoint: "/api/sales/invoices",
  nounRx: /\binvoices?\b/i,
  slots: [
    { key: "customer", label: "Customer", kind: "customer", required: true, ask: "Who is this invoice for?", why: "every invoice is billed to a customer", satisfies: ["customerId"], aliases: ["customer", "client", "party", "bill to"] },
    { key: "itemName", label: "Item / service", kind: "text", required: true, ask: "What is being billed — the item or service name?", why: "each invoice line needs a name", satisfies: ["lineItems", "lineItems.name"], aliases: ["item", "product", "service", "description"] },
    { key: "unitPrice", label: "Amount (unit price)", kind: "money", required: true, ask: "What is the amount (price per unit)?", why: "the line needs a price to total the invoice", satisfies: ["lineItems.unitPrice"], aliases: ["amount", "price", "rate", "unit price", "cost"] },
    { key: "quantity", label: "Quantity", kind: "quantity", required: true, default: { value: 1, display: "1" }, ask: "How many units?", why: "quantity multiplies the unit price", satisfies: ["lineItems.qty"], aliases: ["quantity", "qty", "units"] },
    { key: "dueDate", label: "Due date", kind: "date", required: false, askOptional: true, ask: "When is it due? (e.g. \"30 days\", \"next Friday\", or skip)", why: "otherwise the due date is today", satisfies: [], aliases: ["due", "due date", "payment due"] },
  ],
  validation: {
    routeSource: "app/api/sales/invoices/route.ts",
    routeRequired: ["customerId", "lineItems"],
    modelRequired: ["customerId", "lineItems.name", "lineItems.qty", "lineItems.unitPrice"],
    modelServerDerived: ["tenantId", "number", "lineItems.lineTotal", "taxableAmount", "totalAmount"],
    modelOptionalArrays: ["additionalCharges", "payments", "attachments", "taxes.gstBreakup"],
    modelMin: { "lineItems.qty": 1, "lineItems.unitPrice": 0 },
  },
  howTo: {
    where: "Sales → Invoices → New Invoice",
    steps: [
      "Open **Sales → Invoices** and click **New Invoice**.",
      "Pick the **Customer** (or use the + beside the field to add one).",
      "Add a line: the item or service **name**, **quantity** and **unit price**. GST is worked out from the tax rate you choose.",
      "Set the **Invoice date** and **Due date**.",
      "Click **Save as draft** to keep editing, or **Save** to issue it — issuing posts it to your accounts.",
    ],
    fields: [
      { label: "Customer", meaning: "who you are billing" },
      { label: "Item / service", meaning: "what each line is for" },
      { label: "Quantity × Unit price", meaning: "the line total before tax" },
      { label: "Due date", meaning: "when payment is expected" },
    ],
    tip: "Say **create an invoice** and I'll collect the details one question at a time and open the form filled in for you.",
  },
  // The execute path always creates a DRAFT: no GL posting until a person issues it.
  toPayload: (v, { today }) => ({
    status: SALES_INVOICE_STATUS.DRAFT,
    customerId: v.customer.id,
    invoiceDate: today,
    ...(v.dueDate ? { dueDate: v.dueDate } : {}),
    lineItems: [{ name: v.itemName, qty: v.quantity ?? 1, unitPrice: v.unitPrice }],
  }),
  toPrefill: (v, { today }) => ({
    customerId: v.customer.id,
    customerName: v.customer.name,
    invoiceDate: today,
    ...(v.dueDate ? { dueDate: v.dueDate } : {}),
    lineItems: [{ name: v.itemName, qty: v.quantity ?? 1, unitPrice: v.unitPrice }],
  }),
};

export const TASK_TARGETS: Record<string, TaskTarget> = { invoice: SALES_INVOICE_TARGET };
