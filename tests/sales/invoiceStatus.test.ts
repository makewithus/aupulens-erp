import { describe, expect, it } from "vitest";
import { resolveInvoiceStatus } from "@/lib/sales/invoiceStatus";

describe("resolveInvoiceStatus", () => {
  it("keeps draft and cancelled as explicitly requested regardless of payments", () => {
    expect(resolveInvoiceStatus({ requestedStatus: "draft", totalAmount: 100, payments: [{ amount: 100 }] })).toBe("draft");
    expect(resolveInvoiceStatus({ requestedStatus: "cancelled", totalAmount: 100, payments: [] })).toBe("cancelled");
  });

  it("resolves to paid when markedFullyPaid is set", () => {
    expect(resolveInvoiceStatus({ requestedStatus: "saved", totalAmount: 500, markedFullyPaid: true })).toBe("paid");
  });

  it("resolves to paid when payments sum to at least the total", () => {
    expect(resolveInvoiceStatus({ requestedStatus: "saved", totalAmount: 500, payments: [{ amount: 300 }, { amount: 200 }] })).toBe("paid");
  });

  it("resolves to partially_paid when some but not all has been paid", () => {
    expect(resolveInvoiceStatus({ requestedStatus: "saved", totalAmount: 500, payments: [{ amount: 200 }] })).toBe("partially_paid");
  });

  it("resolves to overdue when unpaid and past the due date", () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    expect(resolveInvoiceStatus({ requestedStatus: "saved", totalAmount: 500, payments: [], dueDate: yesterday })).toBe("overdue");
  });

  it("resolves to saved when unpaid and not yet due", () => {
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    expect(resolveInvoiceStatus({ requestedStatus: "saved", totalAmount: 500, payments: [], dueDate: tomorrow })).toBe("saved");
  });
});
