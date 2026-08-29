import { describe, expect, it, vi, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_q2c_sync";

vi.mock("@/auth", () => ({ auth: vi.fn() }));

import { auth } from "@/auth";
import Customer from "@/models/sales/Customer";
import SaleOrder from "@/models/sales/SaleOrder";
import SalesQuotation from "@/models/sales/SalesQuotation";
import { SalesInvoice } from "@/models/sales/SalesInvoice";
import JournalEntry from "@/models/finance/JournalEntry";
import Payment from "@/models/sales/Payment";
import Account from "@/models/finance/Account";
import { Q2C_STATUS, QUOTE_STATUS } from "@/lib/constants/statuses";
import { syncSaleOrderOnQuoteConverted, advanceSaleOrderOnInvoicePaid } from "@/lib/sales/q2cSync";
import { makeRequest, mockSession } from "../accounting/_helpers/routeTestUtils";

const TENANT = "t-q2c-sync";
let convertPOST: typeof import("@/app/api/sales/quotes/[id]/convert-to-invoice/route").POST;
let paymentsPOST: typeof import("@/app/api/sales/payments/route").POST;

async function makeCustomer() {
  return Customer.create({
    tenantId: TENANT,
    header: { name: "Q2C Co", displayName: "Q2C Co", is_company: true },
    createdBy: new mongoose.Types.ObjectId(),
  });
}

// Regression tests for "Sales -> Q2C pipeline: doesn't work, no update" —
// root cause: the pipeline board reads exclusively from SaleOrder.q2cStatus,
// but nothing in the real Quotes -> Invoices -> Payments workflow ever
// created or advanced a SaleOrder, so genuine business activity never
// appeared on the board at all.
describe("Q2C pipeline sync", () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI!);
    await Customer.init();
    await SaleOrder.init();
    await SalesQuotation.init();
    await SalesInvoice.init();
    await JournalEntry.init();
    await Payment.init();
    ({ POST: convertPOST } = await import("@/app/api/sales/quotes/[id]/convert-to-invoice/route"));
    ({ POST: paymentsPOST } = await import("@/app/api/sales/payments/route"));
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  afterEach(async () => {
    await Customer.deleteMany({ tenantId: TENANT });
    await SaleOrder.deleteMany({ tenantId: TENANT });
    await SalesQuotation.deleteMany({ tenantId: TENANT });
    await (SalesInvoice as any).deleteMany({ tenantId: TENANT });
    await JournalEntry.deleteMany({ tenantId: TENANT });
    await Payment.deleteMany({ tenantId: TENANT });
    vi.mocked(auth).mockReset();
  });

  it("converting a quote to an invoice creates a SaleOrder pipeline card at Invoice Posted", async () => {
    vi.mocked(auth).mockResolvedValue(mockSession(TENANT) as any);
    const customer = await makeCustomer();
    const quote = await SalesQuotation.create({
      tenantId: TENANT,
      quoteNumber: "QUO-Q2C-1",
      customerId: customer._id,
      quoteDate: new Date("2026-08-01"),
      lineItems: [{ name: "Widget", qty: 2, unitPrice: 500, discount: 0, discountMode: "percent", taxRate: 0 }],
      taxableAmount: 1000,
      totalAmount: 1000,
      status: QUOTE_STATUS.SENT,
      createdBy: new mongoose.Types.ObjectId(),
    });

    expect(await SaleOrder.countDocuments({ tenantId: TENANT })).toBe(0);

    const res = await convertPOST(
      makeRequest(`http://localhost/api/sales/quotes/${quote._id}/convert-to-invoice`, { method: "POST" }),
      { params: Promise.resolve({ id: String(quote._id) }) },
    );
    expect(res.status).toBe(201);

    const orders = await SaleOrder.find({ tenantId: TENANT }).lean();
    expect(orders).toHaveLength(1);
    expect(orders[0].q2cStatus).toBe(Q2C_STATUS.INVOICE_POSTED);
    expect(orders[0].header.name).toBe("QUO-Q2C-1");
    expect(String(orders[0].header.partnerId)).toBe(String(customer._id));
  });

  it("fully paying that invoice advances the linked pipeline card to Revenue Recognized", async () => {
    vi.mocked(auth).mockResolvedValue(mockSession(TENANT) as any);
    const customer = await makeCustomer();
    const quote = await SalesQuotation.create({
      tenantId: TENANT,
      quoteNumber: "QUO-Q2C-2",
      customerId: customer._id,
      quoteDate: new Date("2026-08-01"),
      lineItems: [{ name: "Widget", qty: 1, unitPrice: 1000, discount: 0, discountMode: "percent", taxRate: 0 }],
      taxableAmount: 1000,
      totalAmount: 1000,
      status: QUOTE_STATUS.SENT,
      createdBy: new mongoose.Types.ObjectId(),
    });
    const convertRes = await convertPOST(
      makeRequest(`http://localhost/api/sales/quotes/${quote._id}/convert-to-invoice`, { method: "POST" }),
      { params: Promise.resolve({ id: String(quote._id) }) },
    );
    const { invoice } = (await convertRes.json()).data;
    // Chart of Accounts was already lazily seeded for this tenant while
    // posting the invoice's own GL entries above.
    const cashAccount = await Account.findOne({ tenantId: TENANT, code: "1110" }).lean();

    const payRes = await paymentsPOST(
      makeRequest("http://localhost/api/sales/payments", {
        method: "POST",
        body: JSON.stringify({
          customerId: String(customer._id),
          amountReceived: 1000,
          depositToAccountId: String((cashAccount as any)._id),
          allocations: [{ invoiceId: invoice._id, amount: 1000 }],
          status: "paid",
        }),
      }),
    );
    expect(payRes.status).toBe(201);

    const order = await SaleOrder.findOne({ tenantId: TENANT, "header.name": "QUO-Q2C-2" }).lean();
    expect(order?.q2cStatus).toBe(Q2C_STATUS.REVENUE_RECOGNIZED);
  });

  it("advanceSaleOrderOnInvoicePaid is a safe no-op when no SaleOrder is linked to the invoice", async () => {
    await expect(
      advanceSaleOrderOnInvoicePaid(TENANT, new mongoose.Types.ObjectId()),
    ).resolves.not.toThrow();
  });

  it("syncSaleOrderOnQuoteConverted is idempotent (re-running for the same quote doesn't create a duplicate card)", async () => {
    const customer = await makeCustomer();
    const quote = {
      quoteNumber: "QUO-Q2C-3",
      customerId: customer._id,
      quoteDate: new Date(),
      lineItems: [{ name: "Widget", qty: 1, unitPrice: 200 }],
      taxableAmount: 200,
      totalAmount: 200,
    };
    const invoice = { _id: new mongoose.Types.ObjectId() };

    await syncSaleOrderOnQuoteConverted({ tenantId: TENANT, quote, invoice });
    await syncSaleOrderOnQuoteConverted({ tenantId: TENANT, quote, invoice });

    expect(await SaleOrder.countDocuments({ tenantId: TENANT, "header.name": "QUO-Q2C-3" })).toBe(1);
  });
});
