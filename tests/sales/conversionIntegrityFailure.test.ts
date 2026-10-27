import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_conversion_integrity";

import Organization from "@/models/admin/Organization";
import Customer from "@/models/sales/Customer";
import SalesQuotation from "@/models/sales/SalesQuotation";
import { SalesInvoice } from "@/models/sales/SalesInvoice";
import JournalEntry from "@/models/finance/JournalEntry";
import Account from "@/models/finance/Account";
import { convertQuoteToInvoice, QuoteInvoiceError } from "@/lib/sales/quoteInvoice";
import * as salesInvoicePosting from "@/lib/accounting/salesInvoicePosting";
import { QUOTE_STATUS, SALES_INVOICE_STATUS } from "@/lib/constants/statuses";

describe("Priority 4: Quote-to-Invoice Conversion Integrity & Failure Recovery", () => {
  const TENANT = "tenant-conv-test";
  const userId = new mongoose.Types.ObjectId().toString();
  let customerId: mongoose.Types.ObjectId;

  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI!);
    await Organization.init();
    await Customer.init();
    await SalesQuotation.init();
    await SalesInvoice.init();
    await JournalEntry.init();
    await Account.init();

    await Organization.create({
      name: "Conv Test Org",
      subdomain: TENANT,
      settings: { state: "Maharashtra" },
      ownerUserId: new mongoose.Types.ObjectId(),
      createdBy: userId,
    });

    const customer = await Customer.create({
      tenantId: TENANT,
      header: { name: "Conv Customer", displayName: "Conv Customer", is_company: true },
      createdBy: userId,
    });
    customerId = customer._id as mongoose.Types.ObjectId;
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await SalesQuotation.deleteMany({ tenantId: TENANT });
    await (SalesInvoice as any).deleteMany({ tenantId: TENANT });
    await JournalEntry.deleteMany({ tenantId: TENANT });
  });

  async function makeQuote(overrides = {}) {
    return SalesQuotation.create({
      tenantId: TENANT,
      quoteNumber: `QT-TEST-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      customerId,
      placeOfSupply: "Maharashtra",
      lineItems: [
        {
          name: "Test Service",
          qty: 1,
          unitPrice: 1000,
          lineTotal: 1000,
        },
      ],
      totalAmount: 1000,
      status: QUOTE_STATUS.ACCEPTED,
      createdBy: userId,
      ...overrides,
    });
  }

  it("recovers cleanly and compensates when journal posting fails", async () => {
    const quote = await makeQuote();

    // Mock journal posting to throw an intentional failure
    vi.spyOn(salesInvoicePosting, "postSalesInvoiceJournal").mockRejectedValueOnce(
      new Error("Simulated General Ledger failure")
    );

    // Conversion attempt should fail with QuoteInvoiceError
    await expect(
      convertQuoteToInvoice({ tenantId: TENANT, userId, quote })
    ).rejects.toThrow("Simulated General Ledger failure");

    // Quote must NOT be marked INVOICED
    const reloadedQuote = await SalesQuotation.findById(quote._id).lean();
    expect(reloadedQuote?.status).not.toBe(QUOTE_STATUS.INVOICED);
    expect(reloadedQuote?.convertedInvoiceId).toBeUndefined();
    // Quote lock must be released
    expect(reloadedQuote?.isConverting).toBe(false);

    // Compensating action: No orphaned draft invoice should remain in database
    const invoices = await SalesInvoice.find({ tenantId: TENANT, sourceQuoteId: quote._id }).lean();
    expect(invoices.length).toBe(0);

    // No journal entries created
    const journals = await JournalEntry.find({ tenantId: TENANT }).lean();
    expect(journals.length).toBe(0);
  });

  it("concurrent conversion requests resolve to one invoice and journal", async () => {
    const quote = await makeQuote();

    // First request initiates lock
    const p1 = convertQuoteToInvoice({ tenantId: TENANT, userId, quote });
    // Second concurrent request with same quote document
    const p2 = convertQuoteToInvoice({ tenantId: TENANT, userId, quote });

    const results = await Promise.allSettled([p1, p2]);
    const successful = results.filter((r): r is PromiseFulfilledResult<any> => r.status === "fulfilled");
    expect(successful.length).toBeGreaterThanOrEqual(1);
    expect(new Set(successful.map(r => String(r.value._id))).size).toBe(1);
    for (const result of results) {
      if (result.status === "rejected") {
        expect(result.reason.status).toBe(409);
        expect(result.reason.message).toMatch(/already (?:being )?invoiced/);
      }
    }
    expect(await SalesInvoice.countDocuments({ tenantId: TENANT, sourceQuoteId: quote._id })).toBe(1);
    expect(await JournalEntry.countDocuments({ tenantId: TENANT })).toBe(1);
  });

  it("handles retry idempotently when quotation was already invoiced", async () => {
    const quote = await makeQuote();

    // Successful conversion
    const invoice1 = await convertQuoteToInvoice({ tenantId: TENANT, userId, quote });
    expect(invoice1.status).toBe(SALES_INVOICE_STATUS.SAVED);

    const reloadedQuote = await SalesQuotation.findById(quote._id).lean();
    expect(reloadedQuote?.status).toBe(QUOTE_STATUS.INVOICED);
    expect(reloadedQuote?.convertedInvoiceId).toBeDefined();

    // Client retries with the converted quote
    const invoice2 = await convertQuoteToInvoice({ tenantId: TENANT, userId, quote: reloadedQuote });
    // Returns the exact same existing invoice without creating duplicate
    expect(invoice2._id.toString()).toBe(invoice1._id.toString());

    // Verify only ONE invoice exists
    const totalInvoices = await SalesInvoice.countDocuments({ tenantId: TENANT, sourceQuoteId: quote._id });
    expect(totalInvoices).toBe(1);
  });

  it("prevents double-posting journals on retry", async () => {
    const quote = await makeQuote();

    await convertQuoteToInvoice({ tenantId: TENANT, userId, quote });
    const journalCountBefore = await JournalEntry.countDocuments({ tenantId: TENANT });

    // Re-converting the same quote
    const reloadedQuote = await SalesQuotation.findById(quote._id).lean();
    await convertQuoteToInvoice({ tenantId: TENANT, userId, quote: reloadedQuote });

    const journalCountAfter = await JournalEntry.countDocuments({ tenantId: TENANT });
    expect(journalCountAfter).toBe(journalCountBefore);
  });
});
