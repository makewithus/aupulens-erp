import { describe, it, expect } from "vitest";
import { parseErpIntent, normalizeErpText } from "@/lib/ai/erpIntent";
import { erpQuerySchema } from "@/lib/ai/erpQuery";
import { validateQuoteInput } from "@/lib/sales/quoteValidation";
import { computeInvoiceTotals } from "@/lib/sales/invoiceMath";

describe("ERP intent and financial validation", () => {
  it("keeps a P&L analysis request primary when it also asks to identify missing data", () => {
    expect(parseErpIntent("Analyse the company's profit or loss for October 2026. Show revenue, expenses, cost of goods sold, and net profit or loss. Use available posted financial records only, and explicitly identify any missing data.")).toMatchObject({ type: "profit_loss" });
    expect(parseErpIntent("Which accounting records or mappings are missing?")).toEqual({ type: "missing_accounting_records" });
  });
  it.each([
    ["hw many invocies r overdue", { entity: "invoice", operation: "count", status: "overdue" }],
    ["rajesh kumr pending paymnt", { entity: "invoice", customer: "rajesh kumar", status: "unpaid" }],
    ["Rajesh ka kitna payment pending hai?", { entity: "invoice", customer: "Rajesh", status: "unpaid" }],
    ["What's the status of SO-000019?", { entity: "sales_order", identifier: "SO-000019" }],
    ["How much do customers still owe me?", { type: "customer_receivables" }],
    ["What is our biggest invoice?", { entity: "invoice", sort: "amount_desc", status: "issued", limit: 1 }],
    ["How many customers do we have?", { entity: "customer", operation: "count" }],
    ["Show quotes for Himalaya Fitness Studio", { entity: "quote", customer: "Himalaya Fitness Studio" }],
  ])("recognizes %s", (text, expected) => expect(parseErpIntent(text as string)).toMatchObject(expected));
  it("preserves identifiers", () => expect(normalizeErpText("INV-9999 SO-000019")).toBe("INV-9999 SO-000019"));
  it("refuses bulk deletion", () => expect(parseErpIntent("delete all draft invoices")).toBe("refuse"));
  it("recognizes quote typo", () => expect(parseErpIntent("qoute for 2 ergonomic chiar to himalaya")).toBe("quote_draft"));
  it("rejects operators and unbounded queries", () => {
    expect(erpQuerySchema.safeParse({ entity: "invoice", operation: "search", $where: "x" }).success).toBe(false);
    expect(erpQuerySchema.safeParse({ entity: "invoice", operation: "search", limit: 500 }).success).toBe(false);
  });
  const line = { name: "Chair", qty: 2.5, unitPrice: 7499, discount: 0, discountMode: "percent" as const, taxRate: 18 };
  it.each([0, -1, NaN, Infinity])("rejects quantity %s", qty => expect(validateQuoteInput({ lineItems: [{ ...line, qty }] }).length).toBeGreaterThan(0));
  it.each([-1, 100.01, 150, Infinity])("rejects discount %s", discount => expect(validateQuoteInput({ lineItems: [{ ...line, discount }] }).length).toBeGreaterThan(0));
  it("accepts fractional and 100% boundary; canonical math includes taxes and rounding", () => {
    expect(validateQuoteInput({ lineItems: [line] })).toEqual([]);
    expect(validateQuoteInput({ lineItems: [{ ...line, discount: 100 }] })).toEqual([]);
    expect(computeInvoiceTotals({ lineItems: [line], roundOff: true })).toMatchObject({ subtotal: 18747.5, totalTax: 3374.55, totalAmount: 22122 });
    expect(computeInvoiceTotals({ lineItems: [{ ...line, discount: 100 }] }).totalAmount).toBe(0);
  });
});
