/**
 * Digital Business Twin cash-flow projection + late-invoice simulation (6.11).
 * Pure money maths — tested without a DB.
 */
import { describe, it, expect } from "vitest";
import { projectWeeklyCashflow, simulateInvoiceDelay, type Receivable } from "@/lib/twin/cashflow";

const FROM = new Date("2026-08-03T00:00:00Z"); // a Monday

const receivables: Receivable[] = [
  { id: "a", label: "INV-A", amount: 1000, dueDate: "2026-08-05T00:00:00Z" }, // week 0
  { id: "b", label: "INV-B", amount: 2000, dueDate: "2026-08-20T00:00:00Z" }, // ~week 2
  { id: "c", label: "INV-C", amount: 500, dueDate: "2026-07-30T00:00:00Z" },  // overdue → week 0
];

describe("projectWeeklyCashflow", () => {
  it("buckets receivables into the right weeks and accumulates", () => {
    const pts = projectWeeklyCashflow(receivables, FROM, 4, 0);
    expect(pts).toHaveLength(4);
    expect(pts[0].inflow).toBe(1500); // INV-A + overdue INV-C
    expect(pts[2].inflow).toBe(2000); // INV-B
    expect(pts[3].cumulative).toBe(3500); // running total
  });

  it("respects the opening balance", () => {
    const pts = projectWeeklyCashflow([], FROM, 2, 5000);
    expect(pts[0].cumulative).toBe(5000);
    expect(pts[1].cumulative).toBe(5000);
  });

  it("ignores receivables past the horizon", () => {
    const far: Receivable[] = [{ id: "z", amount: 999, dueDate: "2027-01-01T00:00:00Z" }];
    const pts = projectWeeklyCashflow(far, FROM, 4, 0);
    expect(pts.every((p) => p.inflow === 0)).toBe(true);
  });
});

describe("simulateInvoiceDelay", () => {
  it("errors when the invoice isn't among receivables", () => {
    expect(simulateInvoiceDelay(receivables, "missing", 30, FROM, 8)).toMatchObject({ error: expect.any(String) });
  });

  it("lowers the projected cash position during the delay gap", () => {
    // Delay INV-B (week 2) by 21 days → it lands later, dipping cumulative in the gap.
    const res = simulateInvoiceDelay(receivables, "b", 21, FROM, 8, 0);
    expect("delta" in res).toBe(true);
    if ("delta" in res) {
      const maxDip = Math.min(...res.delta.map((d) => d.delta));
      expect(maxDip).toBeLessThan(0); // there IS a dip vs baseline
      expect(res.invoice.id).toBe("b");
      expect(res.summary).toMatch(/lowers the projected cash position/i);
    }
  });

  it("reports no dip when the delay stays within the same window bucket", () => {
    // Delay INV-A by 1 day — same week, no change.
    const res = simulateInvoiceDelay(receivables, "a", 1, FROM, 8, 0);
    if ("delta" in res) expect(Math.min(...res.delta.map((d) => d.delta))).toBe(0);
  });
});
