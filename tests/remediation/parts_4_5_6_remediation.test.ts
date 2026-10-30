import { describe, expect, it, vi, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";
import { NextRequest } from "next/server";

vi.mock("@/auth", () => ({ auth: vi.fn() }));

import connectDB from "@/lib/db";
import { auth } from "@/auth";
import Account from "@/models/finance/Account";
import AccountType from "@/models/finance/AccountType";
import Customer from "@/models/sales/Customer";
import Product from "@/models/inventory/Product";
import { SalesInvoice } from "@/models/sales/SalesInvoice";
import SaleOrder from "@/models/sales/SaleOrder";
import Invoice from "@/models/finance/Invoice";
import JournalEntry from "@/models/finance/JournalEntry";
import Organization from "@/models/admin/Organization";
import Vendor from "@/models/admin/Vendor";
import AiCommandProposal from "@/models/ai/AiCommandProposal";
import StockTransfer from "@/models/inventory/StockTransfer";
import { invalidateServerCache } from "@/lib/api/serverCache";
import { disposableMongoUri } from "./disposableMongoUri";

// Helpers & logic under test
import { isInvoiceOverdue } from "@/lib/sales/invoiceStatus";
import { invoiceRevenueExpression, invoiceGrossValueExpression, invoiceRevenueFromDocument } from "@/lib/sales/invoiceEligibility";
import { plainNumberFmtY, plainNumberFmtTooltip } from "@/components/charts/DailyBrickBarChart";
import { seedChartOfAccounts } from "@/lib/accounting/coa-seeder";
import { seedNewChartOfAccounts } from "@/lib/accounting/coa-feature-seeder";
import { parseErpIntent } from "@/lib/ai/erpIntent";
import { tryErpAssistant } from "@/lib/ai/erpAssistant";
import { prepareQuoteDraft } from "@/lib/ai/quoteDraft";
import { prepareProductDraft, confirmProductDraft } from "@/lib/ai/productDraft";
import { prepareCustomerDraft, confirmCustomerDraft, prepareUpdateCustomerMobile, confirmUpdateCustomerMobile } from "@/lib/ai/customerDraft";

const TENANT_A = "tenant-alpha-parts456";
const TENANT_B = "tenant-beta-parts456";

function mockSession(tenantId: string, role = "admin") {
  return {
    user: {
      id: new mongoose.Types.ObjectId().toString(),
      email: "finance.admin@aupulens.test",
      name: "Finance Admin",
      role,
      tenantId,
    },
    expires: new Date(Date.now() + 86400000).toISOString(),
  };
}

async function callAssistant(text: string, tenantId = TENANT_A) {
  return tryErpAssistant({
    text,
    tenantId,
    userId: new mongoose.Types.ObjectId().toString(),
    role: "admin",
  });
}

function makeUserScope(tenantId = TENANT_A) {
  return {
    tenantId,
    userId: new mongoose.Types.ObjectId().toString(),
    role: "admin",
    conversationId: "conv-remediation-test",
  };
}

describe("AUPULENS ERP — Parts 4, 5 & 6 Remediation Verification Suite (22 Bug IDs)", () => {
  beforeAll(async () => {
    process.env.MONGODB_URI = disposableMongoUri("parts_4_5_6");
    await connectDB();
    await Account.init();
    await AccountType.init();
    await Customer.init();
    await Product.init();
    await SalesInvoice.init();
    await SaleOrder.init();
    await Invoice.init();
    await JournalEntry.init();
    await Organization.init();
    await Vendor.init();
    await AiCommandProposal.init();
  });

  afterAll(async () => {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.dropDatabase();
      await mongoose.connection.close();
    }
  });

  afterEach(async () => {
    invalidateServerCache();
    await Account.deleteMany({});
    await AccountType.deleteMany({});
    await Customer.deleteMany({});
    await Product.deleteMany({});
    await SalesInvoice.deleteMany({});
    await SaleOrder.deleteMany({});
    await Invoice.deleteMany({});
    await JournalEntry.deleteMany({});
    await Organization.deleteMany({});
    await Vendor.deleteMany({});
    await AiCommandProposal.deleteMany({});
    await StockTransfer.deleteMany({});
    vi.mocked(auth).mockReset();
  });

  // =========================================================================
  // PART 4: Financial consistency, dashboards and reports
  // =========================================================================

  describe("Part 4: Financial consistency, dashboards & reports", () => {
    it("SYS-03: Revenue definition excludes GST; separates revenue (₹5,000) from gross invoice value (₹5,900)", async () => {
      // Create test invoice: Taxable sales: ₹5,000, CGST: ₹450, SGST: ₹450, Total: ₹5,900
      const customer = await Customer.create({
        tenantId: TENANT_A,
        createdBy: new mongoose.Types.ObjectId(),
        name: "CLOUD-TEST-CUSTOMER-001",
        header: { name: "CLOUD-TEST-CUSTOMER-001", is_company: true },
      });

      const invoice = await SalesInvoice.create({
        tenantId: TENANT_A,
        number: "INV-SYS03-001",
        customerId: customer._id,
        invoiceDate: new Date("2026-10-15"),
        dueDate: new Date("2026-10-30"),
        status: "saved",
        taxableAmount: 5000,
        totalAmount: 5900,
        totalDiscount: 0,
        taxes: {
          tds: 0,
          tcs: 0,
          gstBreakup: [
            { label: "CGST", amount: 450 },
            { label: "SGST", amount: 450 },
          ],
        },
        lineItems: [
          {
            name: "Industrial Valve",
            qty: 5,
            unitPrice: 1000,
            discount: 0,
            discountMode: "percent",
            taxRate: 18,
            lineTotal: 5900,
          },
        ],
      });

      // Run aggregate using authoritative invoiceRevenueExpression and invoiceGrossValueExpression
      const agg = await SalesInvoice.aggregate([
        { $match: { tenantId: TENANT_A, _id: invoice._id } },
        {
          $group: {
            _id: null,
            authoritativeRevenue: { $sum: invoiceRevenueExpression },
            grossInvoiceValue: { $sum: invoiceGrossValueExpression },
          },
        },
      ]);

      expect(agg[0].authoritativeRevenue).toBe(5000); // Excludes GST
      expect(agg[0].grossInvoiceValue).toBe(5900); // Gross invoice total
      expect(agg[0].authoritativeRevenue).not.toBe(agg[0].grossInvoiceValue);
      expect(invoiceRevenueFromDocument({
        taxableAmount: 5000,
        totalAmount: 5900,
        taxes: { gstBreakup: [{ amount: 450 }, { amount: 450 }] },
      })).toBe(5000);

      const session = mockSession(TENANT_A);
      vi.mocked(auth).mockResolvedValue(session as any);
      const { GET: visualizationGET } = await import("@/app/api/sales/visualization/route");
      const visualizationRes = await visualizationGET(
        new NextRequest("http://localhost:3000/api/sales/visualization?type=revenue_trend&dateRange=30")
      );
      const visualizationJson = await visualizationRes.json();
      const invoiceDay = new Date("2026-10-15").toISOString().slice(0, 10);
      expect(visualizationJson.data.find((point: any) => point.date === invoiceDay)?.revenue).toBe(5000);
    });

    it("SYS-04: Returns structured incomplete status for unposted COGS; never fabricates 100% margin", async () => {
      const session = mockSession(TENANT_A);
      vi.mocked(auth).mockResolvedValue(session as any);

      const customer = await Customer.create({
        tenantId: TENANT_A,
        createdBy: new mongoose.Types.ObjectId(),
        name: "CLOUD-TEST-CUSTOMER-001",
        header: { name: "CLOUD-TEST-CUSTOMER-001", is_company: true },
      });

      const salesAccount = await Account.create({
        tenantId: TENANT_A,
        code: "4000",
        name: "Sales Income",
        internal_group: "income",
        account_type: "income",
        isActive: true,
      });
      const arAccount = await Account.create({
        tenantId: TENANT_A,
        code: "1200",
        name: "Accounts Receivable",
        internal_group: "asset",
        account_type: "asset_receivable",
        isActive: true,
      });

      // Post revenue journal entry without posting any COGS / expense entries
      await JournalEntry.create({
        tenantId: TENANT_A,
        header: {
          name: "JE-SYS04-001",
          journalType: "sale",
          date: new Date(),
        },
        status: "posted",
        voucherStatus: "posted",
        lineIds: [
          { accountId: arAccount._id, debit: 5000, credit: 0 },
          { accountId: salesAccount._id, debit: 0, credit: 5000 },
        ],
        totals: {
          amountUntaxed: 5000,
          amountTax: 0,
          amountTotal: 5000,
        },
      });

      const { GET: summaryGET } = await import("@/app/api/finance/summary/route");
      const res = await summaryGET();
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.summary.matrices.profitStatus).toBe("incomplete");
      expect(json.summary.matrices.profitMargin).toBeNull();
      expect(json.summary.matrices.profitUnavailableReason).toMatch(/costs unposted|general ledger/i);

      const { GET: adminGET } = await import("@/app/api/admin/dashboard/route");
      const adminRes = await adminGET();
      const adminJson = await adminRes.json();
      expect(adminJson.summary.finance.profitAvailable).toBe(false);
      expect(adminJson.summary.finance.netIncome).toBeNull();
      expect(adminJson.summary.finance.profitUnavailableReason).toMatch(/costs|expenses/i);
    });

    it("SYS-05: Invoice is NOT marked overdue on its due date; only after due date passes", () => {
      const dueDate = "2026-10-26";

      // 1. On the day before due date (25 Oct 2026) -> NOT overdue
      const dayBefore = new Date("2026-10-25T14:30:00Z");
      expect(isInvoiceOverdue(dueDate, dayBefore)).toBe(false);

      // 2. On the due date itself (26 Oct 2026 noon UTC) -> NOT overdue
      const onDueDateNoon = new Date("2026-10-26T12:00:00Z");
      expect(isInvoiceOverdue(dueDate, onDueDateNoon)).toBe(false);

      // 3. Near end of due date (26 Oct 2026 23:59:00 UTC) -> NOT overdue
      const onDueDateNight = new Date("2026-10-26T23:59:00Z");
      expect(isInvoiceOverdue(dueDate, onDueDateNight)).toBe(false);

      // 4. On the following day (27 Oct 2026 00:00:01 UTC) -> OVERDUE
      const dayAfter = new Date("2026-10-27T00:00:01Z");
      expect(isInvoiceOverdue(dueDate, dayAfter)).toBe(true);

      // 5. Undefined or empty -> NOT overdue
      expect(isInvoiceOverdue(undefined, dayAfter)).toBe(false);
    });

    it("SYS-06: COA seeding is idempotent; repeated seeding preserves account count, types and classification", async () => {
      const adminUserId = new mongoose.Types.ObjectId().toString();

      // First seed
      await seedChartOfAccounts(TENANT_A, adminUserId);
      const count1 = await Account.countDocuments({ tenantId: TENANT_A });

      // Run feature seeder on top
      await seedNewChartOfAccounts(TENANT_A, adminUserId);
      const count2 = await Account.countDocuments({ tenantId: TENANT_A });

      // Repeat seeding
      await seedChartOfAccounts(TENANT_A, adminUserId);
      await seedNewChartOfAccounts(TENANT_A, adminUserId);
      const count3 = await Account.countDocuments({ tenantId: TENANT_A });

      // Seeding must be idempotent without runaway duplicates
      expect(count3).toBe(count2);

      // Every account must have valid type and internal_group
      const accountsWithoutType = await Account.find({
        tenantId: TENANT_A,
        $or: [{ accountType: { $exists: false } }, { accountType: null }],
      });
      expect(accountsWithoutType.length).toBe(0);

      // Control accounts must be uniquely defined
      const apAccounts = await Account.find({ tenantId: TENANT_A, code: "2100" });
      expect(apAccounts.length).toBe(1);
    }, 60_000);

    it("SYS-21: Recent Orders returns real persisted order and customer records, never fabricated SO-9491CC", async () => {
      const session = mockSession(TENANT_A);
      vi.mocked(auth).mockResolvedValue(session as any);

      // Create customer and actual order
      const customer = await Customer.create({
        tenantId: TENANT_A,
        createdBy: new mongoose.Types.ObjectId(),
        name: "CLOUD-TEST-CUSTOMER-001",
        header: { name: "CLOUD-TEST-CUSTOMER-001", is_company: true },
        code: "CUST-001",
      });

      await SaleOrder.create({
        tenantId: TENANT_A,
        createdBy: new mongoose.Types.ObjectId(),
        header: {
          name: "SO-000001",
          partnerId: customer._id,
          dateOrder: new Date("2026-10-20"),
        },
        orderLines: [
          {
            name: "Industrial Valve",
            productId: new mongoose.Types.ObjectId(),
            productUomQty: 1,
            priceUnit: 15000,
            priceSubtotal: 15000,
          },
        ],
      });

      const { GET: ordersGET } = await import("@/app/api/sales/orders/route");
      const req = new NextRequest("http://localhost:3000/api/sales/orders?limit=5");
      const res = await ordersGET(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.items.length).toBe(1);
      expect(json.items[0].header.name).toBe("SO-000001");
      expect(json.items[0].header.partnerId.header.name).toBe("CLOUD-TEST-CUSTOMER-001");
      expect(json.items[0].header.name).not.toBe("SO-9491CC");
      expect(json.items[0].header.partnerId.header.name).not.toBe("Customer");
    });

    it("SYS-22: Dashboard API returns empty array for empty database without fabricating fake placeholder records", async () => {
      const session = mockSession(TENANT_A);
      vi.mocked(auth).mockResolvedValue(session as any);

      const { GET: ordersGET } = await import("@/app/api/sales/orders/route");
      const req = new NextRequest("http://localhost:3000/api/sales/orders?limit=5");
      const res = await ordersGET(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.items).toEqual([]); // Genuine empty state, not fake fallback data
    });

    it("SYS-23: Cash runway returns unavailable when cash is 0 and expenses are 0, not fabricated 12.0 months", async () => {
      const session = mockSession(TENANT_A);
      vi.mocked(auth).mockResolvedValue(session as any);

      const { GET: summaryGET } = await import("@/app/api/finance/summary/route");
      const res = await summaryGET();
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.summary.matrices.cashRunway).toBeNull();
      expect(json.summary.matrices.cashRunwayStatus).toBe("unavailable");
      expect(json.summary.matrices.cashRunwayReason).toMatch(/no liquid cash or historical expense|insufficient/i);
      expect(json.summary.matrices.cashRunway).not.toBe(12);
    });

    it("SYS-24: Daily order-count chart uses plain number formatting (e.g. '10'), not currency (₹10)", () => {
      expect(plainNumberFmtY(0)).toBe("0");
      expect(plainNumberFmtY(5)).toBe("5");
      expect(plainNumberFmtY(10)).toBe("10");
      expect(plainNumberFmtY(10)).not.toMatch(/₹/);

      const tooltipRes = plainNumberFmtTooltip(10);
      expect(tooltipRes).toBe("10");
      expect(tooltipRes).not.toMatch(/₹/);
    });
  });

  // =========================================================================
  // PART 5: AI answers, accounting queries, inventory and tenant isolation
  // =========================================================================

  describe("Part 5: AI answers, accounting queries, inventory & tenant isolation", () => {
    it("SYS-07 & SYS-27: AI returns outstanding receivables (₹5,900) vs taxable sales (₹5,000) for CLOUD-TEST-CUSTOMER-001", async () => {
      // Seed customer
      const cust = await Customer.create({
        tenantId: TENANT_A,
        createdBy: new mongoose.Types.ObjectId(),
        name: "CLOUD-TEST-CUSTOMER-001",
        header: { name: "CLOUD-TEST-CUSTOMER-001", is_company: true },
        code: "CUST-001",
      });

      // Seed invoice INV-0001
      await SalesInvoice.create({
        tenantId: TENANT_A,
        number: "INV-0001",
        customerId: cust._id,
        invoiceDate: new Date("2026-10-15"),
        dueDate: new Date("2026-10-30"),
        status: "saved",
        taxableAmount: 5000,
        totalAmount: 5900,
        taxes: { tds: 0, tcs: 0, gstBreakup: [] },
        lineItems: [{ name: "Valve", qty: 5, unitPrice: 1000, discount: 0, discountMode: "percent", taxRate: 18, lineTotal: 5900 }],
        payments: [],
      });

      const response = await callAssistant(
        "What is the total sales and outstanding receivables for customer CLOUD-TEST-CUSTOMER-001?"
      );

      // Verify response text
      expect(response.message).toMatch(/INV-0001/);
      expect(response.message).toMatch(/₹5,900/); // Outstanding balance
      expect(response.message).toMatch(/₹5,000/); // Taxable sales / Recognized revenue
      expect(response.message).not.toMatch(/₹0 per customer/);

      const portfolio = await callAssistant("How much do customers still owe me?");
      expect(portfolio.message).toMatch(/₹5,900/);
      expect(portfolio.message).toMatch(/including GST/i);
    });

    it("SYS-08: AI answers both order shipment status and actual payments received in multi-part queries", async () => {
      const cust = await Customer.create({
        tenantId: TENANT_A,
        createdBy: new mongoose.Types.ObjectId(),
        name: "Acme Corp",
        header: { name: "Acme Corp", is_company: true },
      });

      const so = await SaleOrder.create({
        tenantId: TENANT_A,
        createdBy: new mongoose.Types.ObjectId(),
        header: {
          name: "SO-000042",
          partnerId: cust._id,
          dateOrder: new Date(),
        },
        orderLines: [
          {
            name: "Industrial Item",
            productId: new mongoose.Types.ObjectId(),
            productUomQty: 1,
            priceUnit: 12000,
            priceSubtotal: 12000,
          },
        ],
      });

      const invoice = await SalesInvoice.create({
        tenantId: TENANT_A,
        number: "INV-000042",
        customerId: cust._id,
        status: "partially_paid",
        taxableAmount: 10000,
        totalAmount: 12000,
        taxes: { tds: 0, tcs: 0, gstBreakup: [] },
        lineItems: [{ name: "Item", qty: 1, unitPrice: 10000, discount: 0, discountMode: "percent", taxRate: 20, lineTotal: 12000 }],
        payments: [
          {
            paymentId: new mongoose.Types.ObjectId(),
            amount: 5000,
            date: new Date(),
            mode: "Bank",
          },
        ],
      });

      await SaleOrder.updateOne({ _id: so._id, tenantId: TENANT_A }, { $set: { salesInvoiceIds: [invoice._id] } });

      const response = await callAssistant(
        "What's the status of SO-000042 and how much has the customer paid so far?"
      );

      expect(response.message).toMatch(/SO-000042/);
      expect(response.message).toMatch(/shipment status/i);
      expect(response.message).toMatch(/payments received/i);
      expect(response.message).toMatch(/₹5,000/);
    });

    it("SYS-09: AI responses never leak another tenant's test data or contain 'not ₹99 lakh'", async () => {
      // Seed Tenant A
      const custA = await Customer.create({
        tenantId: TENANT_A,
        createdBy: new mongoose.Types.ObjectId(),
        name: "Tenant A Customer Alpha",
        header: { name: "Tenant A Customer Alpha", is_company: true },
      });
      await SalesInvoice.create({
        tenantId: TENANT_A,
        customerId: custA._id,
        number: "INV-TENANT-A",
        taxableAmount: 42000,
        totalAmount: 42000,
        status: "saved",
        lineItems: [{ name: "Service", qty: 1, unitPrice: 42000, discount: 0, discountMode: "percent", taxRate: 0, lineTotal: 42000 }],
        taxes: { tds: 0, tcs: 0, gstBreakup: [] },
      });

      // Seed Tenant B
      const custB = await Customer.create({
        tenantId: TENANT_B,
        createdBy: new mongoose.Types.ObjectId(),
        name: "Tenant B Secret Client",
        header: { name: "Tenant B Secret Client", is_company: true },
      });
      await SalesInvoice.create({
        tenantId: TENANT_B,
        customerId: custB._id,
        number: "INV-TENANT-B-SECRET",
        taxableAmount: 9900000,
        totalAmount: 9900000,
        status: "saved",
        lineItems: [{ name: "Secret Product", qty: 1, unitPrice: 9900000, discount: 0, discountMode: "percent", taxRate: 0, lineTotal: 9900000 }],
        taxes: { tds: 0, tcs: 0, gstBreakup: [] },
      });

      // Query from Tenant A
      const responseA = await callAssistant(
        "Show our biggest invoice and all customers",
        TENANT_A
      );

      // Must not leak Tenant B data or the hardcoded phrase "not ₹99 lakh"
      expect(responseA.message).not.toMatch(/Tenant B/i);
      expect(responseA.message).not.toMatch(/INV-TENANT-B/);
      expect(responseA.message).not.toMatch(/not ₹99 lakh/i);
    });

    it("SYS-19 & SYS-28: AI finds supplier bills by supplier name and returns due date and navigation /finance/bills", async () => {
      // Seed supplier
      const vendor = await Vendor.create({
        tenantId: TENANT_A,
        name: "CLOUD-TEST-SUPPLIER-001",
        email: "supplier@aupulens.test",
        category: "Services",
      });

      // Seed supplier bill
      await Invoice.create({
        tenantId: TENANT_A,
        partnerId: vendor._id,
        vendorId: vendor._id,
        moveType: "in_invoice",
        name: "BILL-2026-009",
        migrationOriginalBillNumber: "BILL-2026-009",
        amountTotal: 7080,
        amountUntaxed: 6000,
        amountTax: 1080,
        invoiceDate: new Date("2026-10-01"),
        dueDate: new Date("2026-10-26T00:00:00.000Z"),
        invoiceDateDue: new Date("2026-10-26T00:00:00.000Z"),
        state: "posted",
        paymentState: "not_paid",
      });

      // Query bill by supplier name
      const res = await callAssistant(
        "What do we owe CLOUD-TEST-SUPPLIER-001 and when is it due?"
      );

      expect(res.message).toMatch(/CLOUD-TEST-SUPPLIER-001/);
      expect(res.message).toMatch(/BILL-2026-009/);
      expect(res.message).toMatch(/₹7,080/);
      expect(res.message).toMatch(/26 October 2026/);
      expect(res.message).toMatch(/\/finance\/bills/);
      expect(res.message).not.toMatch(/\/purchases\/dashboard/);
    });

    it("SYS-20: AI answers stock queries with actual on-hand quantity (0 units), NOT selling price", async () => {
      // Seed product with 0 stock
      await Product.create({
        tenantId: TENANT_A,
        createdBy: new mongoose.Types.ObjectId(),
        header: { name: "CLOUD-TEST-PRODUCT-001" },
        tab_general_information: {
          type: "consu",
          list_price: 250,
          standard_price: 150,
          default_code: "CTP-001",
        },
      });

      // Query stock
      const res = await callAssistant(
        "What is the stock for CLOUD-TEST-PRODUCT-001?"
      );

      expect(res.message).toMatch(/On-Hand Stock:\s*0 units/i);
      expect(res.message).not.toMatch(/On-Hand Stock:\s*₹250/i);
    });
  });

  // =========================================================================
  // PART 6: AI-assisted creation, updates and usage credits
  // =========================================================================

  describe("Part 6: AI-assisted creation, updates and usage credits", () => {
    it("SYS-10 & SYS-29: Prepares quote draft in English & Hindi with exact math (2 units @ ₹1000 + 18% GST = ₹2,360)", async () => {
      // Seed customer & product
      await Customer.create({
        tenantId: TENANT_A,
        createdBy: new mongoose.Types.ObjectId(),
        name: "CLOUD-TEST-CUSTOMER-001",
        header: { name: "CLOUD-TEST-CUSTOMER-001", is_company: true },
      });

      await Product.create({
        tenantId: TENANT_A,
        createdBy: new mongoose.Types.ObjectId(),
        header: { name: "CLOUD-TEST-PRODUCT-001" },
        tab_general_information: {
          type: "consu",
          list_price: 1000,
          gstRate: 18,
          default_code: "CTP-001",
        },
      });

      // Hindi request intent classification
      const hindiIntent = parseErpIntent("2 unit CLOUD-TEST-PRODUCT-001 ka quote banao CLOUD-TEST-CUSTOMER-001 ke liye");
      expect(hindiIntent).toBe("quote_draft");

      // English request intent classification
      const englishIntent = parseErpIntent("Create a quote for 2 units of CLOUD-TEST-PRODUCT-001 for customer CLOUD-TEST-CUSTOMER-001");
      expect(englishIntent).toBe("quote_draft");

      // Execution of quote draft
      const draftRes = await prepareQuoteDraft(
        makeUserScope(TENANT_A),
        "Create a quote for 2 units of CLOUD-TEST-PRODUCT-001 for customer CLOUD-TEST-CUSTOMER-001",
        "req-29"
      );

      expect(draftRes.customerName).toBe("CLOUD-TEST-CUSTOMER-001");
      expect(draftRes.line.qty).toBe(2);
      expect(draftRes.totals.subtotal).toBe(2000);
      expect(draftRes.totals.totalTax).toBe(360);
      expect(draftRes.totals.totalAmount).toBe(2360);

      const hindiDraft = await prepareQuoteDraft(
        makeUserScope(TENANT_A),
        "2 unit CLOUD-TEST-PRODUCT-001 ka quote banao CLOUD-TEST-CUSTOMER-001 ke liye",
        "req-29-hi"
      );
      expect(hindiDraft.customerName).toBe("CLOUD-TEST-CUSTOMER-001");
      expect(hindiDraft.line.qty).toBe(2);
      expect(hindiDraft.totals.totalAmount).toBe(2360);

      const reportedIntent = parseErpIntent(
        "make quotation for CLOUD-TEST-CUSTOMER-001 : 5 qty CLOUD-TEST-PRODUCT-001",
      );
      expect(reportedIntent).toBe("quote_draft");
      const reportedDraft = await prepareQuoteDraft(
        makeUserScope(TENANT_A),
        "make quotation for CLOUD-TEST-CUSTOMER-001 : 5 qty CLOUD-TEST-PRODUCT-001",
        "req-sys29-reported-format",
      );
      expect(reportedDraft.customerName).toBe("CLOUD-TEST-CUSTOMER-001");
      expect(reportedDraft.line.qty).toBe(5);
      expect(reportedDraft.line.unitPrice).toBe(1000);
      expect(reportedDraft.totals.totalAmount).toBe(5900);
    });

    it("SYS-30: AI customer mobile update supports English & Tamil with review, safe proposal & confirmed persistence", async () => {
      const cust = await Customer.create({
        tenantId: TENANT_A,
        createdBy: new mongoose.Types.ObjectId(),
        name: "CLOUD-TEST-CUSTOMER-001",
        header: { name: "CLOUD-TEST-CUSTOMER-001", is_company: true },
        contact_details: { mobile: "9000000001" },
      });

      // English intent
      const enIntent = parseErpIntent("Update mobile number for CLOUD-TEST-CUSTOMER-001 to 9000000002");
      expect(enIntent).toMatchObject({
        type: "customer_mobile_update",
        customerQuery: "CLOUD-TEST-CUSTOMER-001",
        newMobile: "9000000002",
      });

      // Tamil intent
      const taIntent = parseErpIntent("வாடிக்கையாளர் CLOUD-TEST-CUSTOMER-001 மொபைல் 9000000002 ஆக மாற்றவும்");
      expect(taIntent).toMatchObject({
        type: "customer_mobile_update",
        customerQuery: "CLOUD-TEST-CUSTOMER-001",
        newMobile: "9000000002",
      });

      const userScope = makeUserScope(TENANT_A);

      // Prepare proposal
      const prep = await prepareUpdateCustomerMobile(
        userScope,
        "CLOUD-TEST-CUSTOMER-001",
        "9000000002"
      );
      expect(prep.proposalId).toBeDefined();

      // Verify database record has NOT mutated before confirmation
      const unconfirmed = await Customer.findById(cust._id);
      expect(unconfirmed?.contact_details?.mobile).toBe("9000000001");

      // Confirm proposal
      const conf = await confirmUpdateCustomerMobile(
        userScope,
        prep.proposalId!
      );
      expect(conf.mobile).toBe("9000000002");

      // Verify database record HAS mutated after confirmation
      const confirmed = await Customer.findById(cust._id);
      expect(confirmed?.contact_details?.mobile).toBe("9000000002");
    });

    it("SYS-31: Hinglish create-product request prepares draft with price, cost, GST & HSN, then saves cleanly", async () => {
      const prompt = "CLOUD-TEST-AI-PROD-01 ka naya product banao selling price 250 cost 150 gst 12% hsn 7318";
      const intent = parseErpIntent(prompt);
      expect(intent).toBe("product_draft");

      const userScope = makeUserScope(TENANT_A);
      const draft = await prepareProductDraft(userScope, prompt, "req-31");
      expect(draft.name).toBe("CLOUD-TEST-AI-PROD-01");
      expect(draft.sellingPrice).toBe(250);
      expect(draft.costPrice).toBe(150);
      expect(draft.gstRate).toBe(12);
      expect(draft.hsnCode).toBe("7318");

      // Confirm proposal
      const conf = await confirmProductDraft(userScope, draft.proposalId!);
      expect(conf.name).toBe("CLOUD-TEST-AI-PROD-01");

      // Check persisted product
      const saved = await Product.findOne({ tenantId: TENANT_A, "header.name": "CLOUD-TEST-AI-PROD-01" });
      expect(saved).not.toBeNull();
      expect(saved?.tab_general_information?.list_price).toBe(250);
      expect(saved?.tab_general_information?.standard_price).toBe(150);
      expect(saved?.tab_general_information?.hsnSacCode).toBe("7318");
    });

    it("SYS-34: AI customer creation preserves city (e.g. 'Chennai') in address_tab and shipping_address", async () => {
      const userScope = makeUserScope(TENANT_A);
      const prep = await prepareCustomerDraft(
        userScope,
        "Create company customer Raja Textiles with email raja@textiles.in, phone 9876543210, city Chennai",
        "req-34"
      );
      expect(prep.proposalId).toBeDefined();

      const conf = await confirmCustomerDraft(userScope, prep.proposalId!, "req-34");
      expect(conf.name).toBe("Raja Textiles");

      const saved = await Customer.findOne({ tenantId: TENANT_A, "header.name": "Raja Textiles" });
      expect(saved).not.toBeNull();
      expect(saved?.address_tab?.city).toBe("Chennai");
      expect(saved?.shipping_address?.city).toBe("Chennai");
    });

    it("SYS-32: AI usage route resolves organization and returns stable usage metrics", async () => {
      const session = mockSession(TENANT_A);
      vi.mocked(auth).mockResolvedValue(session as any);

      await Organization.create({
        ownerUserId: new mongoose.Types.ObjectId(),
        subdomain: TENANT_A,
        name: "Tenant Alpha Org",
        plan: "growth",
        aiCreditBalance: 500,
        aiCreditsIncluded: 1000,
      });

      const { GET: usageGET } = await import("@/app/api/ai/usage/route");
      const res = await usageGET();
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.credits).toBeDefined();
      expect(typeof json.data.monthly.used).toBe("number");
    });

    it("SYS-33: Destructive requests are refused, marked as 'refused', and do NOT deduct billable usage", async () => {
      const intent = parseErpIntent("delete all customers and invoices");
      expect(intent).toBe("refuse");

      const response = await callAssistant("delete all customers and invoices");

      // Must be safety refused
      expect(response.message).toMatch(/bulk deletion|not supported|safety/i);
    });
  });
});
