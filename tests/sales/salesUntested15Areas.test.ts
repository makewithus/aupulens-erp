import { describe, expect, it, vi, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";

// Mock email service to prevent network calls and timeouts
vi.mock("@/lib/email/sendEmail", async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    getEmailService: () => ({
      send: vi.fn().mockResolvedValue({ success: true, provider: "mock", message: "Mock email sent" }),
    }),
  };
});

// Models
import Customer from "@/models/sales/Customer";
import { SalesInvoice } from "@/models/sales/SalesInvoice";
import Subscription from "@/models/sales/Subscription";
import DunningRule from "@/models/sales/DunningRule";
import SubscriptionWebhook from "@/models/sales/SubscriptionWebhook";
import Reminder from "@/models/sales/Reminder";
import AiDispute, { AI_DISPUTE_STATUS } from "@/models/ai/AiDispute";
import Invoice from "@/models/finance/Invoice";
import DocumentPrefix from "@/models/sales/DocumentPrefix";
import SalesQuotation from "@/models/sales/SalesQuotation";
import SaleOrder from "@/models/sales/SaleOrder";
import Organization from "@/models/admin/Organization";
import Account from "@/models/finance/Account";
import JournalEntry from "@/models/finance/JournalEntry";

// Services and helpers
import { ensureChartOfAccounts } from "@/lib/accounting/coa-seeder";
import { onPaymentFailure, onPaymentSuccess, processDunningRetries } from "@/lib/sales/dunningEngine";
import { runSubscriptionBilling } from "@/lib/sales/subscriptionBillingRunner";
import { evaluateInvoiceReminders, evaluateBillReminders } from "@/lib/sales/reminderEngine";
import { dispatchSubscriptionEvent, generateWebhookSecret } from "@/lib/sales/webhookDispatch";
import { convertQuoteToInvoice, QuoteInvoiceError } from "@/lib/sales/quoteInvoice";
import {
  ISSUED_INVOICE_STATUSES,
  issuedInvoiceFilter,
  unpaidInvoiceFilter,
  invoicePaidAmountExpression,
  invoiceOutstandingExpression,
} from "@/lib/sales/invoiceEligibility";
import { isValidEmail, isValidPhone, validateCustomerInput } from "@/lib/sales/customerValidation";
import {
  DEFAULT_PREFIX_BY_DOCUMENT_TYPE,
  ensureDefaultPrefixes,
  createPrefix,
  setAsDefault,
  promoteFallbackDefault,
} from "@/lib/sales/documentPrefixes";
import { syncSaleOrderOnQuoteConverted, advanceSaleOrderOnInvoicePaid } from "@/lib/sales/q2cSync";
import { getPaymentGatewayService, setPaymentGatewayService } from "@/lib/sales/paymentGatewayService";
import {
  MANDATORY_PAYMENT_COLUMNS,
  SYSTEM_VIEW_DEFINITIONS as PAYMENT_SYSTEM_VIEWS,
  buildMongoFilterFromCriteria as buildPaymentFilter,
} from "@/lib/sales/paymentViews";
import { resolveSpecialFilter as resolvePaymentSpecialFilter } from "@/lib/sales/paymentViews.server";
import {
  MANDATORY_SALE_ORDER_COLUMNS,
  SYSTEM_VIEW_DEFINITIONS as SO_SYSTEM_VIEWS,
} from "@/lib/sales/saleOrderViews";
import { resolveSpecialFilter as resolveSOSpecialFilter } from "@/lib/sales/saleOrderViews.server";
import {
  DEFAULT_SUBSCRIPTION_COLUMNS,
  SYSTEM_VIEW_DEFINITIONS as SUB_SYSTEM_VIEWS,
} from "@/lib/sales/subscriptionViews";
import { resolveSpecialFilter as resolveSubSpecialFilter } from "@/lib/sales/subscriptionViews.server";
import { isValidGstinChecksum, validateGstin, lookupGstin } from "@/lib/sales/gstinLookup";
import {
  addBillingPeriods,
  computeInitialSchedule,
} from "@/lib/sales/subscriptionBilling";
import {
  SALES_SUBSCRIPTION_STATUS,
  SALES_INVOICE_STATUS,
  QUOTE_STATUS,
  Q2C_STATUS,
  SUBSCRIPTION_BILLING_FREQUENCY,
  REMINDER_SCOPE,
  REMINDER_DIRECTION,
  DOCUMENT_PREFIX_KIND,
  SALES_DOCUMENT_TYPE,
  DUNNING_FINAL_SUBSCRIPTION_ACTION,
  DUNNING_FINAL_INVOICE_ACTION,
} from "@/lib/constants/statuses";

const TENANT = "t-untested-15-qa";
const USER_ID = new mongoose.Types.ObjectId();

async function makeCustomer(overrides: Record<string, any> = {}) {
  const defaults = {
    tenantId: TENANT,
    header: { name: "Test Customer", displayName: "Test Customer" },
    createdBy: USER_ID,
  };
  const merged = { ...defaults, ...overrides };
  if (overrides.header) {
    merged.header = { ...defaults.header, ...overrides.header };
  }
  return Customer.create(merged);
}

describe("Phase 5: 15 Previously Untested Functional Areas in Sales Module", () => {
  beforeAll(async () => {
    if (mongoose.connection.readyState === 0) {
      const port = process.env.QA_DISPOSABLE_MONGO_PORT || "27183";
      await mongoose.connect(process.env.MONGODB_URI || `mongodb://127.0.0.1:${port}/aupulens_test_15areas_qa`);
    }

    await Customer.init();
    await SalesInvoice.init();
    await Subscription.init();
    await DunningRule.init();
    await SubscriptionWebhook.init();
    await Reminder.init();
    await AiDispute.init();
    await Invoice.init();
    await DocumentPrefix.init();
    await SalesQuotation.init();
    await SaleOrder.init();
    await Organization.init();
    await Account.init();
    await JournalEntry.init();

    await ensureChartOfAccounts(TENANT, USER_ID.toString());

    await Organization.findOneAndUpdate(
      { subdomain: TENANT },
      {
        $set: {
          name: "Untested Areas QA Org",
          subdomain: TENANT,
          tier: "pro",
          maxUsers: 10,
          aiCallsPerMonth: 100,
          ownerUserId: USER_ID,
          isActive: true,
          settings: {
            state: "Maharashtra",
            country: "India",
            currency: "INR",
          },
        },
      },
      { upsert: true, new: true },
    );
  });

  afterAll(async () => {
    await Customer.deleteMany({ tenantId: TENANT });
    await SalesInvoice.deleteMany({ tenantId: TENANT });
    await Subscription.deleteMany({ tenantId: TENANT });
    await DunningRule.deleteMany({ tenantId: TENANT });
    await SubscriptionWebhook.deleteMany({ tenantId: TENANT });
    await Reminder.deleteMany({ tenantId: TENANT });
    await AiDispute.deleteMany({ tenantId: TENANT });
    await Invoice.deleteMany({ tenantId: TENANT });
    await DocumentPrefix.deleteMany({ tenantId: TENANT });
    await SalesQuotation.deleteMany({ tenantId: TENANT });
    await SaleOrder.deleteMany({ tenantId: TENANT });
    await Organization.deleteMany({ subdomain: TENANT });
    await Account.deleteMany({ tenantId: TENANT });
    await JournalEntry.deleteMany({ tenantId: TENANT });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // =========================================================================
  // Area 1: Dunning Engine (lib/sales/dunningEngine.ts)
  // =========================================================================
  describe("1. Dunning Engine (lib/sales/dunningEngine.ts)", () => {
    it("transitions subscription to DUNNING on payment failure and configures next retry", async () => {
      const customer = await makeCustomer({
        header: { name: "Dunning Customer", displayName: "Dunning Customer" },
        contact_details: { email: "dunning@test.com" },
      });

      await DunningRule.create({
        tenantId: TENANT,
        name: "Default Dunning",
        isDefault: true,
        status: "active",
        paymentMethod: "cards",
        autocharge: {
          onSuccessAction: "send_thank_you_email",
          onFailureAction: "send_payment_failure_email",
          retries: [{ afterDays: 3, action: "retry_charge_and_email" }],
          finalSubscriptionAction: DUNNING_FINAL_SUBSCRIPTION_ACTION.CANCEL_SUBSCRIPTION,
          finalInvoiceAction: DUNNING_FINAL_INVOICE_ACTION.MARK_VOID,
        },
        manual: {
          onSuccessAction: "none",
          onFailureAction: "none",
          retries: [],
          finalSubscriptionAction: DUNNING_FINAL_SUBSCRIPTION_ACTION.DO_NOTHING,
          finalInvoiceAction: DUNNING_FINAL_INVOICE_ACTION.DO_NOTHING,
        },
      });

      const subscription: any = await Subscription.create({
        tenantId: TENANT,
        number: "SUB-DUNNING-001",
        customerId: customer._id,
        profileName: "SaaS Enterprise",
        lineItems: [{ name: "Seat", qty: 1, unitPrice: 5000 }],
        subTotal: 5000,
        totalAmount: 5000,
        billEvery: 1,
        billEveryUnit: "months",
        neverExpires: true,
        paymentMode: "online",
        status: SALES_SUBSCRIPTION_STATUS.ACTIVE,
        createdBy: USER_ID,
        billingFrequency: SUBSCRIPTION_BILLING_FREQUENCY.MONTHLY,
        startDate: new Date(),
        trialDays: 0,
        extraDiscount: 0,
        extraDiscountMode: "percent",
        taxMode: "none",
        taxRate: 0,
        adjustment: 0,
        taxAmount: 0,
        dunningRetryCount: 0,
        autoRenew: true,
        metered: false,
        unbilledCharges: 0,
      });

      await onPaymentFailure(TENANT, subscription._id.toString());

      const updated = await Subscription.findById(subscription._id);
      expect(updated?.status).toBe(SALES_SUBSCRIPTION_STATUS.DUNNING);
      expect(updated?.dunningRetryCount).toBe(0);
      expect(updated?.nextDunningRetryAt).toBeDefined();

      // Test recovery on success
      await onPaymentSuccess(TENANT, subscription._id.toString());
      const recovered = await Subscription.findById(subscription._id);
      expect(recovered?.status).toBe(SALES_SUBSCRIPTION_STATUS.ACTIVE);
      expect(recovered?.nextDunningRetryAt).toBeUndefined();
    });

    it("processes dunning retries and applies final actions when retries are exhausted", async () => {
      const customer = await makeCustomer({
        header: { name: "Exhausted Customer", displayName: "Exhausted Customer" },
      });

      const invoice: any = await (SalesInvoice as any).create({
        tenantId: TENANT,
        number: "INV-DUNNING-FINAL",
        customerId: customer._id,
        invoiceDate: new Date(),
        taxableAmount: 2000,
        totalAmount: 2000,
        status: SALES_INVOICE_STATUS.SAVED,
      });

      const subscription: any = await Subscription.create({
        tenantId: TENANT,
        number: "SUB-DUNNING-002",
        customerId: customer._id,
        profileName: "Exhausted Plan",
        lineItems: [{ name: "Plan", qty: 1, unitPrice: 2000 }],
        subTotal: 2000,
        totalAmount: 2000,
        billEvery: 1,
        billEveryUnit: "months",
        neverExpires: true,
        paymentMode: "online",
        status: SALES_SUBSCRIPTION_STATUS.DUNNING,
        createdBy: USER_ID,
        billingFrequency: SUBSCRIPTION_BILLING_FREQUENCY.MONTHLY,
        startDate: new Date(),
        trialDays: 0,
        extraDiscount: 0,
        extraDiscountMode: "percent",
        taxMode: "none",
        taxRate: 0,
        adjustment: 0,
        taxAmount: 0,
        dunningRetryCount: 1, // Already on retry 1 of 1 -> next failure exhausts
        nextDunningRetryAt: new Date(Date.now() - 3600000), // Due in the past
        generatedInvoiceIds: [invoice._id],
        autoRenew: true,
        metered: false,
        unbilledCharges: 0,
      });

      const result = await processDunningRetries(TENANT);
      expect(result.processed).toBeGreaterThanOrEqual(1);

      const finalSub = await Subscription.findById(subscription._id);
      expect(finalSub?.status).toBe(SALES_SUBSCRIPTION_STATUS.CANCELLED);

      const finalInv = await (SalesInvoice as any).findById(invoice._id);
      expect(finalInv?.status).toBe(SALES_INVOICE_STATUS.CANCELLED);
    });
  });

  // =========================================================================
  // Area 2: Subscription Billing Runner (lib/sales/subscriptionBillingRunner.ts)
  // =========================================================================
  describe("2. Subscription Billing Runner (lib/sales/subscriptionBillingRunner.ts)", () => {
    it("runs billing run, generates sales invoice, and converts trial subscription to active", async () => {
      const customer = await makeCustomer({
        header: { name: "Billing Sub Customer", displayName: "Billing Sub Customer" },
      });

      const subscription: any = await Subscription.create({
        tenantId: TENANT,
        customerId: customer._id,
        number: "SUB-001001",
        profileName: "Trial SaaS Pro",
        lineItems: [{ name: "Seat Pro", qty: 2, unitPrice: 1500 }],
        subTotal: 3000,
        totalAmount: 3000,
        billEvery: 1,
        billEveryUnit: "months",
        neverExpires: true,
        paymentMode: "offline",
        status: SALES_SUBSCRIPTION_STATUS.TRIAL,
        createdBy: USER_ID,
        billingFrequency: SUBSCRIPTION_BILLING_FREQUENCY.MONTHLY,
        startDate: new Date(Date.now() - 86400000 * 14),
        trialDays: 14,
        nextBillingOn: new Date(Date.now() - 3600000), // due now
        extraDiscount: 0,
        extraDiscountMode: "percent",
        taxMode: "none",
        taxRate: 0,
        adjustment: 0,
        taxAmount: 0,
        dunningRetryCount: 0,
        autoRenew: true,
        metered: false,
        unbilledCharges: 0,
      });

      const runResult = await runSubscriptionBilling(TENANT);
      expect(runResult.billed).toBeGreaterThanOrEqual(1);

      const updated = await Subscription.findById(subscription._id);
      expect(updated?.status).toBe(SALES_SUBSCRIPTION_STATUS.ACTIVE);
      expect(updated?.generatedInvoiceIds?.length).toBe(1);

      const generatedInvoice = await (SalesInvoice as any).findById(updated?.generatedInvoiceIds[0]);
      expect(generatedInvoice).toBeDefined();
      expect(generatedInvoice.totalAmount).toBe(3000);
      expect(generatedInvoice.customerId.toString()).toBe(customer._id.toString());
    });
  });

  // =========================================================================
  // Area 3: Invoice Reminder Engine (lib/sales/reminderEngine.ts)
  // =========================================================================
  describe("3. Invoice Reminder Engine (lib/sales/reminderEngine.ts)", () => {
    it("evaluates invoice reminders and skips invoices under active dispute", async () => {
      const customer = await makeCustomer({
        header: { name: "Reminder Customer", displayName: "Reminder Customer" },
        contact_details: { email: "reminder@test.com" },
      });

      // Invoice 1: Regular overdue invoice due today
      const invNormal: any = await (SalesInvoice as any).create({
        tenantId: TENANT,
        number: "INV-REM-001",
        customerId: customer._id,
        dueDate: new Date(),
        taxableAmount: 1000,
        totalAmount: 1000,
        status: SALES_INVOICE_STATUS.SAVED,
      });

      // Invoice 2: Disputed invoice due today
      const invDisputed: any = await (SalesInvoice as any).create({
        tenantId: TENANT,
        number: "INV-REM-002",
        customerId: customer._id,
        dueDate: new Date(),
        taxableAmount: 2000,
        totalAmount: 2000,
        status: SALES_INVOICE_STATUS.SAVED,
      });

      await AiDispute.create({
        tenantId: TENANT,
        workflowId: "wf-dispute-test",
        subjectModel: "SalesInvoice",
        subjectId: invDisputed._id,
        customerId: customer._id,
        reason: "Customer disputes rate mismatch",
        detectedBasis: "receipt_short_payment",
        status: AI_DISPUTE_STATUS.OPEN,
      });

      await Reminder.create({
        tenantId: TENANT,
        scope: REMINDER_SCOPE.INVOICE,
        name: "Due Date Reminder",
        offsetDays: 0,
        direction: REMINDER_DIRECTION.AFTER,
        enabled: true,
      });

      const result = await evaluateInvoiceReminders(TENANT);
      expect(result.evaluated).toBeGreaterThanOrEqual(1);
      // Only the non-disputed invoice should trigger sending
      expect(result.sent).toBe(1);
    });

    it("evaluates vendor bill reminders safely", async () => {
      const vendor = await makeCustomer({
        header: { name: "Vendor Corp", displayName: "Vendor Corp" },
        contact_details: { email: "vendor@test.com" },
      });

      await (Invoice as any).create({
        tenantId: TENANT,
        name: "BILL-0099",
        partnerId: vendor._id,
        currencyId: "INR",
        state: "draft",
        invoiceDate: new Date(),
        dueDate: new Date(),
        moveType: "in_invoice",
        amountUntaxed: 4500,
        amountTax: 0,
        amountTotal: 4500,
        amountResidual: 4500,
        paymentState: "not_paid",
        invoiceLines: [],
        createdBy: USER_ID,
      });

      await Reminder.create({
        tenantId: TENANT,
        scope: REMINDER_SCOPE.BILL,
        name: "Bill Due Reminder",
        offsetDays: 0,
        direction: REMINDER_DIRECTION.AFTER,
        enabled: true,
      });

      const result = await evaluateBillReminders(TENANT);
      expect(result.evaluated).toBeGreaterThanOrEqual(1);
      expect(result.sent).toBe(1);
    });
  });

  // =========================================================================
  // Area 4: Webhook Dispatch (lib/sales/webhookDispatch.ts)
  // =========================================================================
  describe("4. Webhook Dispatch (lib/sales/webhookDispatch.ts)", () => {
    it("generates 48-char hex secret and signs payload with HMAC-SHA256", async () => {
      const secret = generateWebhookSecret();
      expect(secret).toMatch(/^[0-9a-f]{48}$/);

      let capturedUrl = "";
      let capturedHeaders: Record<string, string> = {};
      let capturedBody = "";

      const fetchSpy = vi.spyOn(global, "fetch").mockImplementation(async (url: any, opts: any) => {
        capturedUrl = String(url);
        capturedHeaders = opts.headers;
        capturedBody = opts.body;
        return { ok: true, json: async () => ({}) } as any;
      });

      await SubscriptionWebhook.create({
        tenantId: TENANT,
        name: "Test Hook",
        url: "https://example.com/webhook",
        secret,
        events: ["payment_failed"],
        active: true,
      });

      await dispatchSubscriptionEvent(TENANT, "payment_failed", { subId: "123" });

      expect(fetchSpy).toHaveBeenCalled();
      expect(capturedUrl).toBe("https://example.com/webhook");
      expect(capturedHeaders["X-Aupulens-Signature"]).toBeDefined();
      expect(capturedHeaders["Content-Type"]).toBe("application/json");

      const parsed = JSON.parse(capturedBody);
      expect(parsed.event).toBe("payment_failed");
      expect(parsed.payload.subId).toBe("123");
    });
  });

  // =========================================================================
  // Area 5: Quote-to-Invoice Conversion (lib/sales/quoteInvoice.ts)
  // =========================================================================
  describe("5. Quote-to-Invoice Conversion (lib/sales/quoteInvoice.ts)", () => {
    it("converts quote to sales invoice and links conversion idempotently", async () => {
      const customer = await makeCustomer({
        header: { name: "Quote Customer", displayName: "Quote Customer" },
        address_tab: { state_name: "Maharashtra" },
      });

      const quote: any = await SalesQuotation.create({
        tenantId: TENANT,
        quoteNumber: "QT-CONV-001",
        customerId: customer._id,
        quoteDate: new Date(),
        expiryDate: new Date(Date.now() + 86400000 * 30),
        status: QUOTE_STATUS.ACCEPTED,
        lineItems: [
          {
            name: "Server Hosting",
            qty: 1,
            unitPrice: 10000,
            discount: 0,
            taxRate: 18,
            lineTotal: 10000,
          },
        ],
        taxableAmount: 10000,
        totalAmount: 11800,
        adjustment: 0,
        createdBy: USER_ID,
      });

      const invoice: any = await convertQuoteToInvoice({
        tenantId: TENANT,
        userId: USER_ID.toString(),
        quote,
      });

      expect(invoice).toBeDefined();
      expect(invoice.totalAmount).toBe(11800);
      expect(invoice.status).toBe(SALES_INVOICE_STATUS.SAVED);

      const refreshedQuote = await SalesQuotation.findById(quote._id);
      expect(refreshedQuote?.status).toBe(QUOTE_STATUS.INVOICED);
      expect(refreshedQuote?.convertedInvoiceId?.toString()).toBe(invoice._id.toString());

      // Converting again returns the existing invoice
      const idempotentInvoice = await convertQuoteToInvoice({
        tenantId: TENANT,
        userId: USER_ID.toString(),
        quote: refreshedQuote,
      });
      expect(idempotentInvoice._id.toString()).toBe(invoice._id.toString());
    });
  });

  // =========================================================================
  // Area 6: Invoice Eligibility (lib/sales/invoiceEligibility.ts)
  // =========================================================================
  describe("6. Invoice Eligibility (lib/sales/invoiceEligibility.ts)", () => {
    it("returns correct filters and computes outstanding amounts in aggregation", async () => {
      expect(ISSUED_INVOICE_STATUSES).toContain(SALES_INVOICE_STATUS.SAVED);
      expect(ISSUED_INVOICE_STATUSES).toContain(SALES_INVOICE_STATUS.PARTIALLY_PAID);
      expect(ISSUED_INVOICE_STATUSES).toContain(SALES_INVOICE_STATUS.PAID);
      expect(ISSUED_INVOICE_STATUSES).toContain(SALES_INVOICE_STATUS.OVERDUE);

      const filter = issuedInvoiceFilter();
      expect(filter.status.$in).toEqual(ISSUED_INVOICE_STATUSES);

      const customer = await makeCustomer({
        header: { name: "Eligibility Customer" },
      });

      await (SalesInvoice as any).create({
        tenantId: TENANT,
        number: "INV-ELIG-01",
        customerId: customer._id,
        invoiceDate: new Date(),
        dueDate: new Date(Date.now() - 86400000), // Overdue
        taxableAmount: 5000,
        totalAmount: 5000,
        payments: [{ amount: 2000, mode: "cash" }],
        status: SALES_INVOICE_STATUS.PARTIALLY_PAID,
      });

      const unpaidResults = await (SalesInvoice as any).aggregate([
        { $match: { tenantId: TENANT, number: "INV-ELIG-01" } },
        {
          $project: {
            paid: invoicePaidAmountExpression,
            outstanding: invoiceOutstandingExpression,
          },
        },
      ]);

      expect(unpaidResults.length).toBe(1);
      expect(unpaidResults[0].paid).toBe(2000);
      expect(unpaidResults[0].outstanding).toBe(3000);
    });
  });

  // =========================================================================
  // Area 7: Customer Validation (lib/sales/customerValidation.ts)
  // =========================================================================
  describe("7. Customer Validation (lib/sales/customerValidation.ts)", () => {
    it("validates emails and phones with strict format rules", () => {
      // Emails
      expect(isValidEmail("user@domain.com")).toBe(true);
      expect(isValidEmail("user.name+tag@sub.domain.co.in")).toBe(true);
      expect(isValidEmail("not-an-email")).toBe(false);
      expect(isValidEmail("missing@domain")).toBe(false);
      expect(isValidEmail(null)).toBe(true); // Optional
      expect(isValidEmail("")).toBe(true);

      // Phones (7 to 15 digits)
      expect(isValidPhone("+91 98765 43210")).toBe(true);
      expect(isValidPhone("(022) 2410-1234")).toBe(true);
      expect(isValidPhone("1234567")).toBe(true); // 7 digits
      expect(isValidPhone("12345")).toBe(false); // Too short
      expect(isValidPhone("12ab!")).toBe(false); // Non-digit characters
      expect(isValidPhone(null)).toBe(true); // Optional

      // validateCustomerInput
      const valid = validateCustomerInput({
        contact_details: { email: "good@test.com", phone: "+91 9876543210" },
      });
      expect(valid.valid).toBe(true);
      expect(valid.errors.length).toBe(0);

      const invalid = validateCustomerInput({
        contact_details: { email: "bad-email", phone: "123", mobile: "invalid" },
      });
      expect(invalid.valid).toBe(false);
      expect(invalid.errors.length).toBe(3);
    });
  });

  // =========================================================================
  // Area 8: Document Prefixes (lib/sales/documentPrefixes.ts)
  // =========================================================================
  describe("8. Document Prefixes (lib/sales/documentPrefixes.ts)", () => {
    it("seeds default prefixes, handles custom prefixes, and maintains exactly one default", async () => {
      await ensureDefaultPrefixes(TENANT);

      const invPrefix = await DocumentPrefix.findOne({
        tenantId: TENANT,
        documentType: SALES_DOCUMENT_TYPE.INVOICE,
        isDefault: true,
      });
      expect(invPrefix?.value).toBe(DEFAULT_PREFIX_BY_DOCUMENT_TYPE[SALES_DOCUMENT_TYPE.INVOICE]);

      // Create a second custom prefix and mark it default
      const customPrefix = await createPrefix({
        tenantId: TENANT,
        documentType: SALES_DOCUMENT_TYPE.INVOICE,
        value: "INV/2026/",
        isDefault: true,
      });

      // Old default should now be unset
      const oldDefault = await DocumentPrefix.findById(invPrefix?._id);
      expect(oldDefault?.isDefault).toBe(false);
      expect(customPrefix.isDefault).toBe(true);

      // Switch default back
      await setAsDefault(TENANT, invPrefix!._id.toString());
      const switched = await DocumentPrefix.findById(invPrefix?._id);
      expect(switched?.isDefault).toBe(true);

      // Promote fallback
      await DocumentPrefix.deleteOne({ _id: invPrefix?._id });
      const fallback = await promoteFallbackDefault(
        TENANT,
        SALES_DOCUMENT_TYPE.INVOICE,
        DOCUMENT_PREFIX_KIND.PREFIX,
      );
      expect(fallback?.isDefault).toBe(true);
      expect(fallback?.value).toBe("INV/2026/");
    });
  });

  // =========================================================================
  // Area 9: Q2C Sync (lib/sales/q2cSync.ts)
  // =========================================================================
  describe("9. Q2C Sync (lib/sales/q2cSync.ts)", () => {
    it("syncs SaleOrder when quote is converted and advances status on invoice payment", async () => {
      const customer = await makeCustomer({
        header: { name: "Q2C Sync Customer" },
      });

      const quote: any = {
        _id: new mongoose.Types.ObjectId(),
        quoteNumber: "QT-SYNC-001",
        customerId: customer._id,
        quoteDate: new Date(),
        totalAmount: 8500,
        taxableAmount: 7500,
        lineItems: [
          {
            name: "Enterprise License",
            qty: 1,
            unitPrice: 7500,
            discount: 0,
            discountMode: "percent",
            taxRate: 18,
          },
        ],
      };

      const invoice: any = {
        _id: new mongoose.Types.ObjectId(),
        number: "INV-SYNC-001",
        totalAmount: 8500,
      };

      await syncSaleOrderOnQuoteConverted({
        tenantId: TENANT,
        quote,
        invoice,
      });

      const createdOrder: any = await SaleOrder.findOne({
        tenantId: TENANT,
        "header.name": quote.quoteNumber,
      });
      expect(createdOrder).toBeDefined();
      expect(createdOrder.q2cStatus).toBe(Q2C_STATUS.INVOICE_POSTED);
      expect(createdOrder.totals.amountTotal).toBe(8500);
      expect(createdOrder.invoiceNumber).toBe("INV-SYNC-001");

      // Advance to revenue recognized
      await advanceSaleOrderOnInvoicePaid(TENANT, invoice._id);
      const paidOrder: any = await SaleOrder.findById(createdOrder._id);
      expect(paidOrder.q2cStatus).toBe(Q2C_STATUS.REVENUE_RECOGNIZED);
    });
  });

  // =========================================================================
  // Area 10: Payment Gateway Service (lib/sales/paymentGatewayService.ts)
  // =========================================================================
  describe("10. Payment Gateway Service (lib/sales/paymentGatewayService.ts)", () => {
    it("handles connection handshakes, credentials rejection, and disconnect", async () => {
      const gateway = getPaymentGatewayService();

      // Empty credentials rejection
      const emptyResult = await gateway.connect(TENANT, "razorpay", {});
      expect(emptyResult.ok).toBe(false);
      expect(emptyResult.error).toContain("Credentials are required");

      // Valid credentials connection
      const connectResult = await gateway.connect(TENANT, "razorpay", {
        keyId: "rzp_test_123",
        keySecret: "secret_xyz",
      });
      expect(connectResult.ok).toBe(true);
      expect(connectResult.status).toBe("connected");

      // Status check
      const statusResult = await gateway.getStatus(TENANT, "razorpay");
      expect(statusResult.ok).toBe(true);

      // Disconnect
      const disconnectResult = await gateway.disconnect(TENANT, "razorpay");
      expect(disconnectResult.ok).toBe(true);
      expect(disconnectResult.status).toBe("disconnected");
    });
  });

  // =========================================================================
  // Area 11: Payment Views (lib/sales/paymentViews.ts)
  // =========================================================================
  describe("11. Payment Views (lib/sales/paymentViews.ts & server)", () => {
    it("defines mandatory payment columns and resolves filters correctly", async () => {
      expect(MANDATORY_PAYMENT_COLUMNS.length).toBe(4);
      expect(MANDATORY_PAYMENT_COLUMNS.map((c) => c.key)).toContain("paymentDate");
      expect(MANDATORY_PAYMENT_COLUMNS.map((c) => c.key)).toContain("amountReceived");

      expect(PAYMENT_SYSTEM_VIEWS.find((v) => v.name === "All Payments")).toBeDefined();
      expect(PAYMENT_SYSTEM_VIEWS.find((v) => v.name === "Paid")).toBeDefined();

      const filter = buildPaymentFilter([
        { field: "amount", comparator: "greater_than", value: "1000" },
        { field: "status", comparator: "equals", value: "paid" },
      ]);
      expect(filter.amountReceived).toEqual({ $gt: 1000 });
      expect(filter.status).toBe("paid");

      const special = await resolvePaymentSpecialFilter("none");
      expect(special).toEqual({});
    });
  });

  // =========================================================================
  // Area 12: Sale Order Views (lib/sales/saleOrderViews.ts)
  // =========================================================================
  describe("12. Sale Order Views (lib/sales/saleOrderViews.ts & server)", () => {
    it("defines mandatory columns, 22 seeded views, and server special filters", async () => {
      expect(MANDATORY_SALE_ORDER_COLUMNS.length).toBe(5);
      expect(SO_SYSTEM_VIEWS.length).toBe(22);

      const overdueFilter = await resolveSOSpecialFilter("overdue");
      expect(overdueFilter.expectedShipmentDate).toBeDefined();
      expect(overdueFilter.shipmentStatus).toEqual({ $ne: "fulfilled" });

      const toBeShippedFilter = await resolveSOSpecialFilter("to_be_shipped");
      expect(toBeShippedFilter.salesOrderStatus).toBe("confirmed");
      expect(toBeShippedFilter.shipmentStatus).toBe("not_shipped");

      const emptyFilter = await resolveSOSpecialFilter("placeholder_empty");
      expect(emptyFilter._id).toEqual({ $in: [] });
    });
  });

  // =========================================================================
  // Area 13: Subscription Views (lib/sales/subscriptionViews.ts)
  // =========================================================================
  describe("13. Subscription Views (lib/sales/subscriptionViews.ts & server)", () => {
    it("defines default columns, seeded views, and server special filters", async () => {
      expect(DEFAULT_SUBSCRIPTION_COLUMNS).toContain("profileName");
      expect(SUB_SYSTEM_VIEWS.length).toBe(17);

      const forItemsFilter = await resolveSubSpecialFilter("for_items", TENANT);
      expect(forItemsFilter.lineItems).toBeDefined();

      const expiringNext7Days = await resolveSubSpecialFilter("trial_expiring_next_7_days", TENANT);
      expect(expiringNext7Days.trialEndsAt).toBeDefined();

      const canceledThisMonth = await resolveSubSpecialFilter("canceled_this_month", TENANT);
      expect(canceledThisMonth.status).toBe("cancelled");
      expect(canceledThisMonth.cancelledAt).toBeDefined();
    });
  });

  // =========================================================================
  // Area 14: GSTIN Lookup (lib/sales/gstinLookup.ts)
  // =========================================================================
  describe("14. GSTIN Lookup (lib/sales/gstinLookup.ts)", () => {
    it("validates GSTIN checksum and decodes state, PAN, and entity type offline", async () => {
      const validGstin = "27AAPFU0939F1ZV"; // Valid format & checksum for Maharashtra
      expect(isValidGstinChecksum(validGstin)).toBe(true);

      const validation = validateGstin(validGstin);
      expect(validation.ok).toBe(true);
      expect(validation.gstin).toBe(validGstin);

      // Bad length
      expect(validateGstin("123").ok).toBe(false);
      // Bad state code
      expect(validateGstin("99AAPFU0939F1ZV").ok).toBe(false);

      // Offline lookup
      const lookup = await lookupGstin(validGstin);
      expect(lookup.ok).toBe(true);
      expect(lookup.live).toBe(false);
      expect(lookup.data?.pan).toBe("AAPFU0939F");
      expect(lookup.data?.entityType).toBe("Firm / LLP"); // 4th char 'F'
      expect(lookup.data?.address.state).toBe("Maharashtra");
    });
  });

  // =========================================================================
  // Area 15: Subscription Billing Math & Schedule (lib/sales/subscriptionBilling.ts)
  // =========================================================================
  describe("15. Subscription Billing Math & Schedule (lib/sales/subscriptionBilling.ts)", () => {
    it("advances billing periods accurately across all frequencies", () => {
      const baseDate = new Date("2026-01-15T00:00:00Z");

      const weekly = addBillingPeriods(baseDate, SUBSCRIPTION_BILLING_FREQUENCY.WEEKLY, 2);
      expect(weekly.toISOString().slice(0, 10)).toBe("2026-01-29");

      const monthly = addBillingPeriods(baseDate, SUBSCRIPTION_BILLING_FREQUENCY.MONTHLY, 1);
      expect(monthly.toISOString().slice(0, 10)).toBe("2026-02-15");

      const quarterly = addBillingPeriods(baseDate, SUBSCRIPTION_BILLING_FREQUENCY.QUARTERLY, 1);
      expect(quarterly.toISOString().slice(0, 10)).toBe("2026-04-15");

      const halfYearly = addBillingPeriods(baseDate, SUBSCRIPTION_BILLING_FREQUENCY.HALF_YEARLY, 1);
      expect(halfYearly.toISOString().slice(0, 10)).toBe("2026-07-15");

      const yearly = addBillingPeriods(baseDate, SUBSCRIPTION_BILLING_FREQUENCY.YEARLY, 1);
      expect(yearly.toISOString().slice(0, 10)).toBe("2027-01-15");
    });

    it("computes initial schedule with trial days and cycle limits", () => {
      const startDate = new Date("2026-03-01T00:00:00Z");

      // With trial
      const withTrial = computeInitialSchedule({
        startDate,
        trialDays: 14,
        billingFrequency: SUBSCRIPTION_BILLING_FREQUENCY.MONTHLY,
        neverExpires: true,
      });
      expect(withTrial.trialEndsAt?.toISOString().slice(0, 10)).toBe("2026-03-15");
      expect(withTrial.nextBillingOn.toISOString().slice(0, 10)).toBe("2026-03-15");
      expect(withTrial.activatedOn).toBeUndefined();

      // Without trial, 12 cycles limit
      const noTrialExpiring = computeInitialSchedule({
        startDate,
        trialDays: 0,
        billingFrequency: SUBSCRIPTION_BILLING_FREQUENCY.MONTHLY,
        neverExpires: false,
        expiresAfterCycles: 12,
      });
      expect(noTrialExpiring.trialEndsAt).toBeUndefined();
      expect(noTrialExpiring.activatedOn).toEqual(startDate);
      expect(noTrialExpiring.nextBillingOn.toISOString().slice(0, 10)).toBe("2026-04-01");
      expect(noTrialExpiring.expiresOn?.toISOString().slice(0, 10)).toBe("2027-03-01");
    });
  });
});
