import { describe, expect, it, vi, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_route_payment_atomicity";

vi.mock("@/auth", () => ({ auth: vi.fn() }));

import { auth } from "@/auth";
import Customer from "@/models/Customer";
import { SalesInvoice } from "@/models/SalesInvoice";
import Payment from "@/models/Payment";
import JournalEntry from "@/models/JournalEntry";
import Account from "@/models/Account";
import { ensureChartOfAccounts } from "@/lib/accounting/coa-seeder";
import { makeRequest, mockSession } from "../accounting/_helpers/routeTestUtils";

const URL = "http://localhost/api/sales/payments";
const TENANT = "t-payment-atomicity";

let POST: typeof import("@/app/api/sales/payments/route").POST;
let PATCH: typeof import("@/app/api/sales/payments/[id]/route").PATCH;

async function makeCustomer() {
  return Customer.create({
    tenantId: TENANT,
    header: { name: "Atomicity Co", displayName: "Atomicity Co", is_company: true },
    createdBy: new mongoose.Types.ObjectId(),
  });
}

async function makeInvoice(customerId: mongoose.Types.ObjectId, overrides: Partial<Record<string, any>> = {}) {
  return (SalesInvoice as any).create({
    tenantId: TENANT,
    number: `INV-ATOMIC-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    customerId,
    invoiceDate: new Date("2026-07-01"),
    dueDate: new Date("2026-07-15"),
    lineItems: [{ name: "Widget", qty: 1, unitPrice: 1000, discount: 0, discountMode: "percent", taxRate: 0, taxableValue: 1000, lineTotal: 1000 }],
    taxableAmount: 1000,
    totalDiscount: 0,
    totalAmount: 1000,
    status: "saved",
    payments: [],
    createdBy: new mongoose.Types.ObjectId(),
    ...overrides,
  });
}

// Regression test for Issue #9's reported bug: "Recording an invoice
// payment throws SalesInvoice Validation Failed... but the payment still
// posts (often multiple times) in the background, while the invoice still
// shows overdue." Root cause: applyAllocationsToInvoices ran after the
// journal entry (and, on the POST route, the Payment doc) were already
// committed, and outside the try/catch guarding that posting — so a
// validation error while saving the invoice left a "paid" Payment with a
// real posted JournalEntry, but the invoice itself never updated.
describe("Sales Payments route — posting atomicity (Issue #9)", () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI!);
    await Customer.init();
    await SalesInvoice.init();
    await Payment.init();
    await JournalEntry.init();
    ({ POST } = await import("@/app/api/sales/payments/route"));
    ({ PATCH } = await import("@/app/api/sales/payments/[id]/route"));
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  afterEach(async () => {
    await Customer.deleteMany({ tenantId: TENANT });
    await (SalesInvoice as any).deleteMany({ tenantId: TENANT });
    await Payment.deleteMany({ tenantId: TENANT });
    await JournalEntry.deleteMany({ tenantId: TENANT });
    vi.mocked(auth).mockReset();
  });

  it("rolls back the Payment and its journal entry when applying the allocation fails validation (create)", async () => {
    const session = mockSession(TENANT);
    vi.mocked(auth).mockResolvedValue(session as any);
    await ensureChartOfAccounts(TENANT, session.user.id);
    const bankAccount = await Account.findOne({ tenantId: TENANT, code: "1120" });

    const customer = await makeCustomer();
    const invoice = await makeInvoice(customer._id);

    // Corrupt the invoice so re-saving it inside applyAllocationsToInvoices
    // throws a real Mongoose ValidationError — bypass schema validation on
    // the write itself (as some stale/legacy data or a race could) so the
    // document exists in a state that only fails validation on next .save().
    await SalesInvoice.collection.updateOne(
      { _id: invoice._id },
      { $unset: { "lineItems.0.name": "" } },
    );

    const body = {
      customerId: String(customer._id),
      amountReceived: 1000,
      depositToAccountId: String(bankAccount!._id),
      mode: "Cash",
      status: "paid",
      allocations: [{ invoiceId: String(invoice._id), amount: 1000 }],
    };

    const res = await POST(makeRequest(URL, { method: "POST", body: JSON.stringify(body) }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.success).toBe(false);

    // Nothing should have been left committed.
    const paymentCount = await Payment.countDocuments({ tenantId: TENANT });
    expect(paymentCount).toBe(0);
    const journalCount = await JournalEntry.countDocuments({ tenantId: TENANT });
    expect(journalCount).toBe(0);

    // And the invoice itself must still show its original (unpaid) status —
    // not silently left in a half-updated state either.
    const reloadedInvoice = await (SalesInvoice as any).findById(invoice._id).select("status payments").lean();
    expect((reloadedInvoice as any)!.status).not.toBe("paid");
    expect((reloadedInvoice as any)!.payments).toHaveLength(0);
  });

  it("succeeds normally and posts exactly once when nothing fails (control case)", async () => {
    const session = mockSession(TENANT);
    vi.mocked(auth).mockResolvedValue(session as any);
    await ensureChartOfAccounts(TENANT, session.user.id);
    const bankAccount = await Account.findOne({ tenantId: TENANT, code: "1120" });

    const customer = await makeCustomer();
    const invoice = await makeInvoice(customer._id);

    const body = {
      customerId: String(customer._id),
      amountReceived: 1000,
      depositToAccountId: String(bankAccount!._id),
      mode: "Cash",
      status: "paid",
      allocations: [{ invoiceId: String(invoice._id), amount: 1000 }],
    };

    const res = await POST(makeRequest(URL, { method: "POST", body: JSON.stringify(body) }));
    expect(res.status).toBe(201);

    const paymentCount = await Payment.countDocuments({ tenantId: TENANT });
    expect(paymentCount).toBe(1);
    const journalCount = await JournalEntry.countDocuments({ tenantId: TENANT });
    expect(journalCount).toBe(1);

    const reloadedInvoice = await (SalesInvoice as any).findById(invoice._id).lean();
    expect((reloadedInvoice as any)!.status).toBe("paid");
  });

  it("rolls back a newly-posted journal entry (not the invoice's prior state) when applying the allocation fails validation on edit", async () => {
    const session = mockSession(TENANT);
    vi.mocked(auth).mockResolvedValue(session as any);
    await ensureChartOfAccounts(TENANT, session.user.id);
    const bankAccount = await Account.findOne({ tenantId: TENANT, code: "1120" });

    const customer = await makeCustomer();
    const invoice = await makeInvoice(customer._id);

    const payment = await Payment.create({
      tenantId: TENANT,
      customerId: customer._id,
      paymentNumber: `PAY-ATOMIC-${Date.now()}`,
      paymentDate: new Date("2026-07-10"),
      amountReceived: 1000,
      bankCharges: 0,
      tdsAmount: 0,
      depositToAccountId: bankAccount!._id,
      allocations: [],
      unusedAmount: 0,
      status: "draft",
      createdBy: new mongoose.Types.ObjectId(),
    });

    await SalesInvoice.collection.updateOne(
      { _id: invoice._id },
      { $unset: { "lineItems.0.name": "" } },
    );

    const res = await PATCH(
      makeRequest(`${URL}/${payment._id}`, {
        method: "PATCH",
        body: JSON.stringify({
          status: "paid",
          allocations: [{ invoiceId: String(invoice._id), amount: 1000 }],
        }),
      }),
      { params: Promise.resolve({ id: String(payment._id) }) },
    );

    expect(res.status).toBe(400);

    const reloadedPayment = await Payment.findById(payment._id).lean();
    expect((reloadedPayment as any)!.status).toBe("draft"); // never persisted as paid
    expect((reloadedPayment as any)!.journalEntryIds || []).toHaveLength(0);

    const journalCount = await JournalEntry.countDocuments({ tenantId: TENANT });
    expect(journalCount).toBe(0); // the entry posted during this failed attempt was rolled back
  });
});
