import { describe, expect, it, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";
import {
  sumAllocations,
  validateAllocations,
  validateAllocationAmounts,
  applyAllocationsToInvoices,
  reverseAllocationsOnInvoices,
} from "@/lib/sales/paymentAllocation";
import { SalesInvoice as SalesInvoiceModel } from "@/models/SalesInvoice";

const SalesInvoice: any = SalesInvoiceModel;

describe("sumAllocations / validateAllocations (pure)", () => {
  it("sums allocation amounts, ignoring non-numeric input", () => {
    expect(sumAllocations([{ invoiceId: "a", amount: 100 }, { invoiceId: "b", amount: 50 }])).toBe(150);
    expect(sumAllocations([])).toBe(0);
  });

  it("returns unusedAmount as the leftover after allocations, bank charges, and TDS", () => {
    const unused = validateAllocations([{ invoiceId: "a", amount: 60 }], 100, 10, 5);
    expect(unused).toBe(25); // 100 - 10 - 5 - 60
  });

  it("throws when total applied exceeds the net available amount", () => {
    expect(() => validateAllocations([{ invoiceId: "a", amount: 200 }], 100, 0, 0)).toThrow(
      /cannot exceed the amount received/,
    );
  });

  it("accounts for bank charges and TDS reducing the net available amount", () => {
    expect(() => validateAllocations([{ invoiceId: "a", amount: 90 }], 100, 5, 10)).toThrow();
  });

  it("throws on a negative allocation amount", () => {
    expect(() => validateAllocations([{ invoiceId: "a", amount: -10 }], 100, 0, 0)).toThrow(/cannot be negative/);
  });

  it("throws when an allocation row has no invoiceId", () => {
    expect(() => validateAllocations([{ invoiceId: "", amount: 10 }], 100, 0, 0)).toThrow(/requires an invoice/);
  });

  it("allows an allocation that exactly matches the net available amount", () => {
    expect(validateAllocations([{ invoiceId: "a", amount: 100 }], 100, 0, 0)).toBe(0);
  });
});

// Regression tests for the Receivables complaint ("I see the same invoice
// again and I can record payment and the payment for same receipt is
// getting recorded twice"): validateAllocations only ever checked the
// allocation total against the payment's own amountReceived, never against
// what each target invoice actually still owes — so a stale client (double
// submission, a second tab, or a Receivables list that hadn't refreshed
// since an earlier payment) could apply a second full payment to an
// already-settled invoice with nothing on the server to catch it.
describe("validateAllocationAmounts (server-side over-allocation guard)", () => {
  const invoice = (overrides: Partial<Record<string, any>> = {}) => ({
    _id: "inv-1",
    number: "INV-0099",
    totalAmount: 500,
    payments: [],
    ...overrides,
  });

  it("allows an allocation that exactly covers the outstanding balance", () => {
    expect(() =>
      validateAllocationAmounts([{ invoiceId: "inv-1", amount: 500 }], [invoice()]),
    ).not.toThrow();
  });

  it("allows an allocation that covers only the remaining balance after a prior payment", () => {
    expect(() =>
      validateAllocationAmounts(
        [{ invoiceId: "inv-1", amount: 200 }],
        [invoice({ payments: [{ amount: 300 }] })],
      ),
    ).not.toThrow();
  });

  it("rejects a payment applied to an invoice that's already fully paid (the duplicate-payment scenario)", () => {
    expect(() =>
      validateAllocationAmounts(
        [{ invoiceId: "inv-1", amount: 500 }],
        [invoice({ payments: [{ amount: 500 }] })],
      ),
    ).toThrow(/only has ₹0\.00 outstanding/);
  });

  it("rejects an allocation that overshoots the remaining balance even partially", () => {
    expect(() =>
      validateAllocationAmounts(
        [{ invoiceId: "inv-1", amount: 250 }],
        [invoice({ payments: [{ amount: 300 }] })],
      ),
    ).toThrow(/only has ₹200\.00 outstanding/);
  });

  it("ignores allocations for invoices not present in the provided list (handled separately by the caller)", () => {
    expect(() => validateAllocationAmounts([{ invoiceId: "missing", amount: 999 }], [invoice()])).not.toThrow();
  });
});

describe("applyAllocationsToInvoices / reverseAllocationsOnInvoices (DB-backed)", () => {
  const tenantId = "t-payment-alloc";
  const customerId = new mongoose.Types.ObjectId();

  beforeAll(async () => {
    await mongoose.connect("mongodb://localhost:27017/aupulens_test_payment_allocation");
    await SalesInvoice.init();
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  afterEach(async () => {
    await SalesInvoice.deleteMany({});
  });

  const makeInvoice = (overrides: Partial<Record<string, any>> = {}) =>
    SalesInvoice.create({
      tenantId,
      number: "INV-ALLOC-0001",
      customerId,
      status: "saved",
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // not yet due, so reversal settles back to "saved" not "overdue"
      lineItems: [{ name: "Widget", qty: 1, unitPrice: 500, discount: 0, discountMode: "percent", taxRate: 0, lineTotal: 500 }],
      taxableAmount: 500,
      totalAmount: 500,
      ...overrides,
    });

  it("marks an invoice fully paid and tags the payment entry with paymentId", async () => {
    const invoice = await makeInvoice();
    const paymentId = new mongoose.Types.ObjectId().toString();

    await applyAllocationsToInvoices({
      tenantId,
      paymentId,
      paymentNumber: "PAY-000001",
      paymentDate: new Date(),
      mode: "Cash",
      allocations: [{ invoiceId: invoice._id.toString(), amount: 500 }],
    });

    const updated = await SalesInvoice.findById(invoice._id);
    expect(updated.status).toBe("paid");
    expect(updated.payments).toHaveLength(1);
    expect(String(updated.payments[0].paymentId)).toBe(paymentId);
    expect(updated.payments[0].amount).toBe(500);
  });

  it("marks an invoice partially_paid when the allocation is less than the total", async () => {
    const invoice = await makeInvoice();
    await applyAllocationsToInvoices({
      tenantId,
      paymentId: new mongoose.Types.ObjectId().toString(),
      paymentNumber: "PAY-000002",
      paymentDate: new Date(),
      mode: "Cash",
      allocations: [{ invoiceId: invoice._id.toString(), amount: 200 }],
    });

    const updated = await SalesInvoice.findById(invoice._id);
    expect(updated.status).toBe("partially_paid");
  });

  it("reverses a payment's allocations and restores the invoice's prior status", async () => {
    const invoice = await makeInvoice();
    const paymentId = new mongoose.Types.ObjectId().toString();

    await applyAllocationsToInvoices({
      tenantId,
      paymentId,
      paymentNumber: "PAY-000003",
      paymentDate: new Date(),
      mode: "Cash",
      allocations: [{ invoiceId: invoice._id.toString(), amount: 500 }],
    });
    expect((await SalesInvoice.findById(invoice._id)).status).toBe("paid");

    await reverseAllocationsOnInvoices(tenantId, paymentId);

    const reverted = await SalesInvoice.findById(invoice._id);
    expect(reverted.payments).toHaveLength(0);
    expect(reverted.status).toBe("saved");
  });

  it("only reverses the entries tagged with the given paymentId, leaving other payments intact", async () => {
    const invoice = await makeInvoice();
    const paymentIdA = new mongoose.Types.ObjectId().toString();
    const paymentIdB = new mongoose.Types.ObjectId().toString();

    await applyAllocationsToInvoices({
      tenantId,
      paymentId: paymentIdA,
      paymentNumber: "PAY-000004",
      paymentDate: new Date(),
      mode: "Cash",
      allocations: [{ invoiceId: invoice._id.toString(), amount: 200 }],
    });
    await applyAllocationsToInvoices({
      tenantId,
      paymentId: paymentIdB,
      paymentNumber: "PAY-000005",
      paymentDate: new Date(),
      mode: "Cash",
      allocations: [{ invoiceId: invoice._id.toString(), amount: 100 }],
    });

    await reverseAllocationsOnInvoices(tenantId, paymentIdA);

    const updated = await SalesInvoice.findById(invoice._id);
    expect(updated.payments).toHaveLength(1);
    expect(String(updated.payments[0].paymentId)).toBe(paymentIdB);
    expect(updated.status).toBe("partially_paid");
  });

  it("skips an allocation row with a zero amount without error", async () => {
    const invoice = await makeInvoice();
    await applyAllocationsToInvoices({
      tenantId,
      paymentId: new mongoose.Types.ObjectId().toString(),
      paymentNumber: "PAY-000006",
      paymentDate: new Date(),
      mode: "Cash",
      allocations: [{ invoiceId: invoice._id.toString(), amount: 0 }],
    });

    const updated = await SalesInvoice.findById(invoice._id);
    expect(updated.payments).toHaveLength(0);
  });
});
