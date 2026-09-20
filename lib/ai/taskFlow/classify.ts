/** LLM fallback classification (deterministic rules were unsure). Shared by the route and the live verification script. */
export type LlmVerdict = "create" | "explain" | "other";

export function buildClassifyPrompt(english: string): string {
  return `You route messages for an ERP assistant. Reply with EXACTLY one token and nothing else:
CREATE_SALES_INVOICE — the user wants a sales invoice (a bill sent TO a customer) created. A short message that just names a customer and an amount with "invoice" or "bill" ("Acme invoice 45000", "invoice for Kamal 500", "bill Acme 45k") is a request to create one.
EXPLAIN_SALES_INVOICE — the user asks how to create a sales invoice.
OTHER — anything else: vendor or purchase bills, payments, questions about existing invoices (status, paid, pending, totals), reports, other records.
A "bill" is a sales invoice unless the message mentions a vendor, supplier, purchase or payables, or says the bill is FROM someone. Examples: "can you raise a bill for Acme" -> CREATE_SALES_INVOICE. "steps to make a bill" -> EXPLAIN_SALES_INVOICE. "invoice Acme 500" -> CREATE_SALES_INVOICE. "bill Kamal 2500 for repairs" -> CREATE_SALES_INVOICE. "invoice Acme 500 status" -> OTHER. "raise a purchase bill from Acme" -> OTHER. "how do I make an invoice" -> EXPLAIN_SALES_INVOICE.
Message: """${english.slice(0, 300).replace(/"/g, "'")}"""`;
}

/** Strict: only the three tokens can ever come out, whatever the model (or the user's text) says. */
export function parseClassification(text: string): LlmVerdict | null {
  const t = text.trim().toUpperCase();
  if (t.startsWith("CREATE_SALES_INVOICE")) return "create";
  if (t.startsWith("EXPLAIN_SALES_INVOICE")) return "explain";
  return t.startsWith("OTHER") ? "other" : null;
}
