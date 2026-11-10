/**
 * Creation events emitted OUTSIDE a database transaction (the business write has already committed, so the
 * outbox row cannot be atomic with it). Each producer passes `creationDedupeKey(id)`; the sweep's reconciler
 * re-derives the same key from the business document and upserts it, so a lost event is recovered
 * idempotently and a delivered one is never duplicated. Dependency-free on purpose (imported by route handlers).
 */
export const creationDedupeKey = (id: unknown) => `created:${String(id)}`;

/**
 * Deterministic update dedupe key tying an event to a specific document state revision (by timestamp or version).
 * Prevents duplicate events for the same revision on retry.
 */
export const updateDedupeKey = (id: unknown, ts: unknown = Date.now()) => {
  const t = ts instanceof Date ? ts.getTime() : typeof ts === "number" ? ts : String(ts);
  return `updated:${String(id)}:${t}`;
};

export interface ReconciledSource {
  eventKey: string;
  model: string; // registered mongoose model name
  filter?: Record<string, unknown>;
  payload: (doc: { _id: unknown; tenantId?: string; moveType?: string }) => Record<string, unknown>;
}

export const RECONCILED_SOURCES: ReconciledSource[] = [
  { eventKey: "invoice.created", model: "Invoice", filter: { moveType: "out_invoice" }, payload: (d) => ({ invoiceId: String(d._id), moveType: d.moveType }) },
  { eventKey: "bill.created", model: "Invoice", filter: { moveType: "in_invoice" }, payload: (d) => ({ invoiceId: String(d._id), moveType: d.moveType }) },
  { eventKey: "expense.submitted", model: "Expense", payload: (d) => ({ expenseId: String(d._id) }) },
  { eventKey: "bank.transaction.imported", model: "BankStatement", payload: (d) => ({ bankStatementId: String(d._id) }) },
  { eventKey: "document.received", model: "ExtractedDocument", payload: (d) => ({ extractedDocumentId: String(d._id) }) },
  ...["Customer", "Employee", "BankAccount", "Vendor"].map((model) => ({
    eventKey: "master_data.changed",
    model,
    payload: (d: { _id: unknown; tenantId?: string }) => ({ model, id: String(d._id), tenantId: d.tenantId }),
  })),
];
