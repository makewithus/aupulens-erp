import { describe, expect, it, vi } from "vitest";
import { PAYMENT_STATE } from "@/lib/constants/statuses";
import {
  derivePaymentState,
  getPaymentResidualForPosting,
} from "@/lib/accounting/payments";

describe("payment state derivation", () => {
  it("marks invoices paid when residual is effectively zero", () => {
    expect(
      derivePaymentState({
        residual: 0.01,
        total: 500,
      }),
    ).toBe(PAYMENT_STATE.PAID);
  });

  it("marks invoices partial when some balance remains", () => {
    expect(
      derivePaymentState({
        residual: 125,
        total: 500,
      }),
    ).toBe(PAYMENT_STATE.PARTIAL);
  });

  it("marks fully unpaid overdue invoices using due date", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-01T00:00:00.000Z"));

    expect(
      derivePaymentState({
        residual: 500,
        total: 500,
        dueDate: new Date("2026-05-01T00:00:00.000Z"),
      }),
    ).toBe(PAYMENT_STATE.OVERDUE);

    vi.useRealTimers();
  });

  it("marks fully unpaid future-due invoices as not paid", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-01T00:00:00.000Z"));

    expect(
      derivePaymentState({
        residual: 500,
        total: 500,
        dueDate: new Date("2026-07-01T00:00:00.000Z"),
      }),
    ).toBe(PAYMENT_STATE.NOT_PAID);

    vi.useRealTimers();
  });

  it("repairs legacy unpaid invoices that stored zero residual", () => {
    expect(
      getPaymentResidualForPosting({
        amountResidual: 0,
        amountTotal: 750,
        paymentState: PAYMENT_STATE.NOT_PAID,
      }),
    ).toBe(750);
  });

  it("keeps paid invoices closed even when total is positive", () => {
    expect(
      getPaymentResidualForPosting({
        amountResidual: 0,
        amountTotal: 750,
        paymentState: PAYMENT_STATE.PAID,
      }),
    ).toBe(0);
  });
});
