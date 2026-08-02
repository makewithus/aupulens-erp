import { describe, expect, it, vi, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_route_invoice_linetotal";

vi.mock("@/auth", () => ({ auth: vi.fn() }));

import { auth } from "@/auth";
import Customer from "@/models/Customer";
import { SalesInvoice } from "@/models/SalesInvoice";
import SalesQuotation from "@/models/SalesQuotation";
import JournalEntry from "@/models/JournalEntry";
import Payment from "@/models/Payment";
import { QUOTE_STATUS } from "@/lib/constants/statuses";
import { makeRequest, mockSession } from "../accounting/_helpers/routeTestUtils";

const URL = "http://localhost/api/sales/invoices";
const TENANT = "t-invoice-linetotal";

let POST: typeof import("@/app/api/sales/invoices/route").POST;
let PATCH: typeof import("@/app/api/sales/invoices/[id]/route").PATCH;
let convertPOST: typeof import("@/app/api/sales/quotes/[id]/convert-to-invoice/route").POST;

async function makeCustomer() {
  return Customer.create({
    tenantId: TENANT,
    header: { name: "LineTotal Co", displayName: "LineTotal Co", is_company: true },
    createdBy: new mongoose.Types.ObjectId(),
  });
}

// Regression test for a live QA-reported bug: "SalesInvoice validation
// failed: lineItems.0.lineTotal: Path `lineTotal` is required" — thrown
// both when saving a brand new invoice and when recording a payment against
// an existing one. Root cause: InvoiceForm.tsx only ever computed lineTotal
// client-side for display, never included it in the saved payload, and
// neither the create nor edit route computed/injected it either — so every
// invoice created through the real UI had this schema-required field
// silently missing. It didn't surface until the *next* write to that
// document (e.g. applying a payment, which re-validates the whole
// document), which is why the same error appeared on two seemingly
// unrelated screens.
describe("Sales Invoices routes — lineTotal is always computed server-side (live QA bug)", () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI!);
    await Customer.init();
    await SalesInvoice.init();
    await SalesQuotation.init();
    await JournalEntry.init();
    ({ POST } = await import("@/app/api/sales/invoices/route"));
    ({ PATCH } = await import("@/app/api/sales/invoices/[id]/route"));
    ({ POST: convertPOST } = await import("@/app/api/sales/quotes/[id]/convert-to-invoice/route"));
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  afterEach(async () => {
    await Customer.deleteMany({ tenantId: TENANT });
    await (SalesInvoice as any).deleteMany({ tenantId: TENANT });
    await SalesQuotation.deleteMany({ tenantId: TENANT });
    await JournalEntry.deleteMany({ tenantId: TENANT });
    await Payment.deleteMany({ tenantId: TENANT });
    vi.mocked(auth).mockReset();
  });

  it("POST creates successfully and computes lineTotal even though the client never sends it (matches the real InvoiceForm payload shape)", async () => {
    vi.mocked(auth).mockResolvedValue(mockSession(TENANT) as any);
    const customer = await makeCustomer();

    const res = await POST(
      makeRequest(URL, {
        method: "POST",
        body: JSON.stringify({
          customerId: String(customer._id),
          invoiceDate: "2026-08-01",
          dueDate: "2026-08-15",
          lineItems: [{ name: "Widget", hsn: "", qty: 2, unitPrice: 1000, discount: 0, discountMode: "percent", taxRate: 18 }],
          status: "saved",
        }),
      }),
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.lineItems[0].lineTotal).toBeCloseTo(2360); // 2000 + 18% GST
  });

  it("a payment can be recorded against an invoice afterward (re-save no longer fails validation)", async () => {
    vi.mocked(auth).mockResolvedValue(mockSession(TENANT) as any);
    const customer = await makeCustomer();
    const createRes = await POST(
      makeRequest(URL, {
        method: "POST",
        body: JSON.stringify({
          customerId: String(customer._id),
          invoiceDate: "2026-08-01",
          dueDate: "2026-08-15",
          lineItems: [{ name: "Widget", qty: 1, unitPrice: 1000, discount: 0, discountMode: "percent", taxRate: 0 }],
          status: "saved",
        }),
      }),
    );
    const invoice = (await createRes.json()).data;

    const doc = await (SalesInvoice as any).findById(invoice._id);
    doc.payments.push({ amount: 500, date: new Date(), mode: "Cash", notes: "test" });
    await expect(doc.save()).resolves.not.toThrow();
  });

  it("PATCH (edit) also computes lineTotal server-side", async () => {
    vi.mocked(auth).mockResolvedValue(mockSession(TENANT) as any);
    const customer = await makeCustomer();
    const createRes = await POST(
      makeRequest(URL, {
        method: "POST",
        body: JSON.stringify({
          customerId: String(customer._id),
          invoiceDate: "2026-08-01",
          dueDate: "2026-08-15",
          lineItems: [{ name: "Widget", qty: 1, unitPrice: 1000, discount: 0, discountMode: "percent", taxRate: 0 }],
          status: "saved",
        }),
      }),
    );
    const invoice = (await createRes.json()).data;

    const patchRes = await PATCH(
      makeRequest(`${URL}/${invoice._id}`, {
        method: "PATCH",
        body: JSON.stringify({
          lineItems: [{ name: "Widget", qty: 3, unitPrice: 1000, discount: 0, discountMode: "percent", taxRate: 0 }],
        }),
      }),
      { params: Promise.resolve({ id: String(invoice._id) }) },
    );
    expect(patchRes.status).toBe(200);
    const body = await patchRes.json();
    expect(body.data.lineItems[0].lineTotal).toBe(3000);
  });

  it("quote -> invoice conversion also computes real lineTotal instead of carrying over the quote's default-0 value", async () => {
    vi.mocked(auth).mockResolvedValue(mockSession(TENANT) as any);
    const customer = await makeCustomer();
    const quote = await SalesQuotation.create({
      tenantId: TENANT,
      quoteNumber: "QUO-LT-1",
      customerId: customer._id,
      quoteDate: new Date("2026-08-01"),
      lineItems: [{ name: "Widget", qty: 2, unitPrice: 500, discount: 0, discountMode: "percent", taxRate: 0 }],
      taxableAmount: 1000,
      totalAmount: 1000,
      status: QUOTE_STATUS.SENT,
      createdBy: new mongoose.Types.ObjectId(),
    });

    // Confirms the premise: the quote's own lineTotal really is 0 (the `default: 0`
    // masking the same underlying gap, rather than a real computed value).
    expect((quote.lineItems[0] as any).lineTotal).toBe(0);

    const res = await convertPOST(makeRequest(`http://localhost/api/sales/quotes/${quote._id}/convert-to-invoice`, { method: "POST" }), {
      params: Promise.resolve({ id: String(quote._id) }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.invoice.lineItems[0].lineTotal).toBe(1000);
  });
});

// Regression tests for the reported "even after clearing a customer's due
// amount, it's showing in balance sheet under liabilities -> customer
// advances" symptom. Root cause: InvoiceForm's "Mark as fully paid"
// checkbox only ever flipped invoice.status — it never created a Payment
// or touched the GL, so Accounts Receivable stayed debited in full forever
// (live-confirmed: 11 existing invoices had markedFullyPaid=true backed by
// $0 or partial real payments). Fixed by auto-recording a real payment for
// the shortfall through the same tested postCustomerPaymentJournal pipeline.
describe("Sales Invoices routes — 'Mark as fully paid' now posts a real, GL-correct payment", () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI!);
    ({ POST } = await import("@/app/api/sales/invoices/route"));
    ({ PATCH } = await import("@/app/api/sales/invoices/[id]/route"));
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  afterEach(async () => {
    await Customer.deleteMany({ tenantId: TENANT });
    await (SalesInvoice as any).deleteMany({ tenantId: TENANT });
    await JournalEntry.deleteMany({ tenantId: TENANT });
    await Payment.deleteMany({ tenantId: TENANT });
    vi.mocked(auth).mockReset();
  });

  it("POST: auto-creates a real, allocated Payment when markedFullyPaid has no real payments backing it", async () => {
    vi.mocked(auth).mockResolvedValue(mockSession(TENANT) as any);
    const customer = await makeCustomer();

    const res = await POST(
      makeRequest(URL, {
        method: "POST",
        body: JSON.stringify({
          customerId: String(customer._id),
          invoiceDate: "2026-08-01",
          dueDate: "2026-08-15",
          lineItems: [{ name: "Widget", qty: 1, unitPrice: 1000, discount: 0, discountMode: "percent", taxRate: 0 }],
          status: "saved",
          markedFullyPaid: true,
        }),
      }),
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.status).toBe("paid");
    expect(body.data.payments).toHaveLength(1);

    const payments = await Payment.find({ tenantId: TENANT, customerId: customer._id }).lean();
    expect(payments).toHaveLength(1);
    expect(payments[0].allocations[0].amount).toBe(1000);
    expect(payments[0].journalEntryIds?.length).toBeGreaterThan(0);
  });

  it("PATCH: auto-creates a real Payment for the shortfall when an unpaid invoice is edited to markedFullyPaid", async () => {
    vi.mocked(auth).mockResolvedValue(mockSession(TENANT) as any);
    const customer = await makeCustomer();
    const createRes = await POST(
      makeRequest(URL, {
        method: "POST",
        body: JSON.stringify({
          customerId: String(customer._id),
          invoiceDate: "2026-08-01",
          dueDate: "2026-08-15",
          lineItems: [{ name: "Widget", qty: 1, unitPrice: 1000, discount: 0, discountMode: "percent", taxRate: 0 }],
          status: "saved",
        }),
      }),
    );
    const invoice = (await createRes.json()).data;

    const patchRes = await PATCH(
      makeRequest(`${URL}/${invoice._id}`, { method: "PATCH", body: JSON.stringify({ markedFullyPaid: true }) }),
      { params: Promise.resolve({ id: String(invoice._id) }) },
    );
    expect(patchRes.status).toBe(200);
    const patched = (await patchRes.json()).data;
    expect(patched.status).toBe("paid");

    const payments = await Payment.find({ tenantId: TENANT, customerId: customer._id }).lean();
    expect(payments).toHaveLength(1);
    expect(payments[0].allocations[0].amount).toBe(1000);
  });

  it("does not create a duplicate system payment when markedFullyPaid is already fully covered", async () => {
    vi.mocked(auth).mockResolvedValue(mockSession(TENANT) as any);
    const customer = await makeCustomer();
    const createRes = await POST(
      makeRequest(URL, {
        method: "POST",
        body: JSON.stringify({
          customerId: String(customer._id),
          invoiceDate: "2026-08-01",
          dueDate: "2026-08-15",
          lineItems: [{ name: "Widget", qty: 1, unitPrice: 1000, discount: 0, discountMode: "percent", taxRate: 0 }],
          status: "saved",
          markedFullyPaid: true,
        }),
      }),
    );
    const invoice = (await createRes.json()).data;
    expect(await Payment.countDocuments({ tenantId: TENANT })).toBe(1);

    // A no-op re-save (still markedFullyPaid, nothing else changed) must not
    // post a second system payment — the shortfall is already 0.
    const patchRes = await PATCH(
      makeRequest(`${URL}/${invoice._id}`, { method: "PATCH", body: JSON.stringify({ markedFullyPaid: true, notes: "unchanged" }) }),
      { params: Promise.resolve({ id: String(invoice._id) }) },
    );
    expect(patchRes.status).toBe(200);
    expect(await Payment.countDocuments({ tenantId: TENANT })).toBe(1);
  });
});
