import { describe, expect, it } from "vitest";
import { getStartOfCurrentDay, isInvoiceOverdue, resolveInvoiceStatus } from "@/lib/sales/invoiceStatus";

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

  it("treats a date-only due date stored at midnight as due through the end of that day", () => {
    const dueDate = new Date("2026-10-26T00:00:00.000Z");
    expect(isInvoiceOverdue(dueDate, new Date("2026-10-26T23:59:59.000Z"))).toBe(false);
    expect(isInvoiceOverdue(dueDate, new Date("2026-10-27T00:00:01.000Z"))).toBe(true);
  });

  it("uses the start of today as the overdue database cutoff", () => {
    const now = new Date("2026-10-26T15:30:00.000Z");
    const cutoff = getStartOfCurrentDay(now);
    expect(cutoff.getTime()).toBeLessThanOrEqual(now.getTime());
    expect(cutoff.getDate()).toBe(now.getDate());
    expect(cutoff.getHours()).toBe(0);
    expect(cutoff.getMinutes()).toBe(0);
  });

  it("SYS-05: is NOT overdue on its due date (26 October 2026)", () => {
    const dueDate = "2026-10-26";
    // Morning of due date
    expect(resolveInvoiceStatus({ requestedStatus: "saved", totalAmount: 500, payments: [], dueDate }, new Date("2026-10-26T10:00:00Z"))).toBe("saved");
    // Afternoon of due date
    expect(resolveInvoiceStatus({ requestedStatus: "saved", totalAmount: 500, payments: [], dueDate }, new Date("2026-10-26T15:30:00+05:30"))).toBe("saved");
    // Near midnight of due date
    expect(resolveInvoiceStatus({ requestedStatus: "saved", totalAmount: 500, payments: [], dueDate }, new Date("2026-10-26T23:59:00+05:30"))).toBe("saved");
    // Day before due date
    expect(resolveInvoiceStatus({ requestedStatus: "saved", totalAmount: 500, payments: [], dueDate }, new Date("2026-10-25T12:00:00Z"))).toBe("saved");
    // Day after due date
    expect(resolveInvoiceStatus({ requestedStatus: "saved", totalAmount: 500, payments: [], dueDate }, new Date("2026-10-27T00:01:00Z"))).toBe("overdue");
    // Partially paid on due date -> partially_paid (not overdue)
    expect(resolveInvoiceStatus({ requestedStatus: "saved", totalAmount: 500, payments: [{ amount: 200 }], dueDate }, new Date("2026-10-26T14:00:00Z"))).toBe("partially_paid");
    // Partially paid day after due date -> overdue
    expect(resolveInvoiceStatus({ requestedStatus: "saved", totalAmount: 500, payments: [{ amount: 200 }], dueDate }, new Date("2026-10-27T00:01:00Z"))).toBe("overdue");
  });
});

