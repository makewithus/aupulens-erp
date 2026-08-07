/**
 * Finance AI Copilot tests (Scope F): deterministic anomaly detection + the
 * correspondence-draft template fallback. The live AI explanation/draft paths
 * are covered by scripts/verify-finance-ai.ts against real gpt-4o.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockResolve, mockCall } = vi.hoisted(() => ({ mockResolve: vi.fn(), mockCall: vi.fn() }));
vi.mock("@/lib/ai/tenantAi", () => ({ resolveTenantAiSettings: mockResolve, callClaudeForTenant: mockCall }));

import { detectInvoiceAnomalies, explainAnomalies } from "@/lib/finance/anomalyDetection";
import { draftPaymentReminder } from "@/lib/finance/draftCorrespondence";

beforeEach(() => {
  vi.clearAllMocks();
  mockResolve.mockResolvedValue({ tier: "starter", aiSettings: {} });
});

describe("detectInvoiceAnomalies", () => {
  it("flags an amount outlier well above the mean", () => {
    const invoices = [
      ...Array.from({ length: 8 }, (_, i) => ({ _id: `n${i}`, number: `INV-${i}`, totalAmount: 1000, status: "paid" })),
      { _id: "big", number: "INV-BIG", totalAmount: 500000, status: "paid" },
    ];
    const { anomalies } = detectInvoiceAnomalies(invoices);
    expect(anomalies.some((a) => a.type === "amount_outlier" && a.invoiceId === "big")).toBe(true);
  });

  it("flags a duplicate suspect (same customer + amount within 7 days)", () => {
    const base = Date.now();
    const invoices = [
      { _id: "a", number: "A", totalAmount: 5000, invoiceDate: new Date(base - 3 * 864e5), customerId: "cust1" },
      { _id: "b", number: "B", totalAmount: 5000, invoiceDate: new Date(base - 1 * 864e5), customerId: "cust1" },
    ];
    const { anomalies } = detectInvoiceAnomalies(invoices);
    expect(anomalies.some((a) => a.type === "duplicate_suspect")).toBe(true);
  });

  it("does NOT flag same-amount invoices for different customers", () => {
    const base = Date.now();
    const invoices = [
      { _id: "a", number: "A", totalAmount: 5000, invoiceDate: new Date(base - 3 * 864e5), customerId: "cust1" },
      { _id: "b", number: "B", totalAmount: 5000, invoiceDate: new Date(base - 1 * 864e5), customerId: "cust2" },
    ];
    const { anomalies } = detectInvoiceAnomalies(invoices);
    expect(anomalies.some((a) => a.type === "duplicate_suspect")).toBe(false);
  });

  it("flags a long-overdue invoice (>60 days)", () => {
    const invoices = [{ _id: "old", number: "OLD", totalAmount: 100, status: "overdue", invoiceDate: new Date(Date.now() - 90 * 864e5) }];
    const { anomalies } = detectInvoiceAnomalies(invoices);
    expect(anomalies.some((a) => a.type === "long_overdue" && a.severity === "Medium")).toBe(true);
  });

  it("returns no anomalies for a clean, small, uniform set", () => {
    const invoices = [
      { _id: "a", totalAmount: 1000, status: "paid" },
      { _id: "b", totalAmount: 1000, status: "paid" },
    ];
    expect(detectInvoiceAnomalies(invoices).anomalies).toEqual([]);
  });
});

describe("explainAnomalies fallback", () => {
  it("returns the deterministic descriptions (aiUsed:false) when AI is gated", async () => {
    mockCall.mockResolvedValue({ gated: true, code: "AI_DISABLED", error: "off" });
    const report = detectInvoiceAnomalies([{ _id: "old", number: "OLD", totalAmount: 100, status: "overdue", invoiceDate: new Date(Date.now() - 90 * 864e5) }]);
    const out = await explainAnomalies("t1", report);
    expect(out.aiUsed).toBe(false);
    expect(out.summary).toContain("OLD");
  });

  it("short-circuits with no AI call when there are no anomalies", async () => {
    const out = await explainAnomalies("t1", { anomalies: [], stats: { count: 0, mean: 0, stdDev: 0, max: 0 } });
    expect(out.aiUsed).toBe(false);
    expect(mockCall).not.toHaveBeenCalled();
  });
});

describe("draftPaymentReminder fallback", () => {
  it("falls back to a template draft when AI is gated", async () => {
    mockCall.mockResolvedValue({ gated: true, code: "AI_LIMIT_REACHED", error: "cap" });
    const draft = await draftPaymentReminder("t1", { invoiceNumber: "INV-9", amount: 5000, daysOverdue: 45, customerName: "Acme" });
    expect(draft.aiUsed).toBe(false);
    expect(draft.subject).toContain("INV-9");
    expect(draft.body).toContain("Acme");
    expect(draft.body).toContain("45 day(s) overdue");
  });

  it("uses the AI draft when the model returns valid JSON", async () => {
    mockCall.mockResolvedValue({ gated: false, text: JSON.stringify({ subject: "Reminder", body: "Please pay." }) });
    const draft = await draftPaymentReminder("t1", { invoiceNumber: "INV-9", amount: 5000, daysOverdue: 10 });
    expect(draft.aiUsed).toBe(true);
    expect(draft.subject).toBe("Reminder");
  });
});
