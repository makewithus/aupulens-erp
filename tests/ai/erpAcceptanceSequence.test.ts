import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import { beforeAll, afterAll, beforeEach, describe, it, expect, vi } from "vitest";

const commandAuth = vi.hoisted(() => vi.fn());
vi.mock("@/auth", () => ({ auth: commandAuth }));
vi.mock("@/lib/db", () => ({ default: async () => {} }));

import Customer from "@/models/sales/Customer";
import Product from "@/models/inventory/Product";
import { SalesInvoice } from "@/models/sales/SalesInvoice";
import SalesQuotation from "@/models/sales/SalesQuotation";
import SaleOrder from "@/models/sales/SaleOrder";
import User from "@/models/auth/User";
import Account from "@/models/finance/Account";
import JournalEntry from "@/models/finance/JournalEntry";
import AiCommandProposal from "@/models/ai/AiCommandProposal";
import CrmAuditLog from "@/models/crm/CrmAuditLog";
import Organization from "@/models/admin/Organization";
import { seedPlans } from "@/lib/platform/entitlements/planCatalog";
import { invalidateEntitlementsCache } from "@/lib/platform/entitlements/resolve";
import ChatHistory from "@/models/ai/ChatHistory";
import { tryErpAssistant } from "@/lib/ai/erpAssistant";
import { buildPostedJournalReport } from "@/lib/accounting/reports";
import { DOCUMENT_STATUS } from "@/lib/constants/statuses";

const mongoPort = process.env.QA_DISPOSABLE_MONGO_PORT || "27183";
const mongoUri = `mongodb://127.0.0.1:${mongoPort}/aupulens_test_acceptance_${randomUUID().replaceAll("-", "")}`;

const tenantId = `acc-${randomUUID()}`;
const adminUserId = new mongoose.Types.ObjectId().toString();
const salesUserId = new mongoose.Types.ObjectId().toString();

const adminBase = { tenantId, userId: adminUserId, role: "admin", module: "admin" as const };
const salesBase = { tenantId, userId: salesUserId, role: "sales", module: "sales" as const };

let activeConvId: string;
const askAdmin = (text: string, convId = activeConvId, reqId = randomUUID()) =>
  tryErpAssistant({ ...adminBase, conversationId: convId, text, requestId: reqId });
const askSales = (text: string, convId = activeConvId, reqId = randomUUID()) =>
  tryErpAssistant({ ...salesBase, conversationId: convId, text, requestId: reqId });

beforeAll(async () => {
  await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 5000 });
  await Promise.all([
    Customer.init(),
    Product.init(),
    SalesInvoice.init(),
    SalesQuotation.init(),
    SaleOrder.init(),
    User.init(),
    Account.init(),
    JournalEntry.init(),
    ChatHistory.init(),
    AiCommandProposal.init(),
    CrmAuditLog.init(),
  ]);

  await seedPlans();
  await Organization.create({
    name: "Aupulens Acceptance Org",
    subdomain: tenantId,
    ownerUserId: adminUserId,
    tier: "enterprise",
    subscriptionStatus: "active",
  });
  invalidateEntitlementsCache(tenantId);

  // Seed Users
  await User.create([
    {
      _id: adminUserId,
      tenantId,
      name: "Super Admin",
      email: "admin@aupulens.test",
      phone: "9876543210",
      role: "admin",
      userRole: "admin",
      password: "hashed_dummy_password",
    },
    {
      _id: salesUserId,
      tenantId,
      name: "Sales User",
      email: "sales@aupulens.test",
      phone: "9876543211",
      role: "sales",
      userRole: "sales-executive",
      password: "hashed_dummy_password",
    },
    {
      tenantId,
      name: "Kishore Kumar",
      email: "kishore@aupulens.test",
      phone: "9876543212",
      role: "sales",
      userRole: "sales-manager",
      password: "hashed_dummy_password",
    },
  ]);

  const fixtureCustomer = await Customer.create({
    tenantId,
    createdBy: adminUserId,
    header: { name: "Acme Enterprises", displayName: "Acme Enterprises" },
  });

  // Seed Invoices: 39 Overdue, 15 Paid, 287 Drafts = 341 Invoices Total (Exact Match to BUG-001 scenario)
  const baseDate = new Date("2026-09-01T00:00:00+05:30");
  const overdueDueDate = new Date("2026-09-20T00:00:00+05:30");
  const futureDueDate = new Date("2026-12-31T00:00:00+05:30");

  const overdueInvoices = Array.from({ length: 39 }, (_, i) => ({
    tenantId,
    customerId: fixtureCustomer._id,
    number: `INV-OD-${String(i + 1).padStart(3, "0")}`,
    totalAmount: 5000 + i * 100,
    taxableAmount: 5000 + i * 100,
    status: "overdue",
    invoiceDate: baseDate,
    dueDate: overdueDueDate,
    payments: [],
    markedFullyPaid: false,
  }));

  const paidInvoices = Array.from({ length: 15 }, (_, i) => ({
    tenantId,
    customerId: fixtureCustomer._id,
    number: `INV-PAID-${String(i + 1).padStart(3, "0")}`,
    totalAmount: 10000,
    taxableAmount: 10000,
    status: "paid",
    invoiceDate: baseDate,
    dueDate: overdueDueDate,
    payments: [{ amount: 10000, date: baseDate, mode: "Bank" }],
    markedFullyPaid: true,
  }));

  const draftInvoices = Array.from({ length: 287 }, (_, i) => ({
    tenantId,
    customerId: fixtureCustomer._id,
    number: `INV-DRAFT-${String(i + 1).padStart(3, "0")}`,
    totalAmount: 2000,
    taxableAmount: 2000,
    status: "draft",
    invoiceDate: baseDate,
    dueDate: futureDueDate,
    payments: [],
    markedFullyPaid: false,
  }));

  await SalesInvoice.insertMany([...overdueInvoices, ...paidInvoices, ...draftInvoices]);

  // Seed Products (11 items for inventory test, matching BUG-001 observed symptom)
  await Product.insertMany(
    Array.from({ length: 11 }, (_, i) => ({
      tenantId,
      createdBy: adminUserId,
      header: { name: `Inventory Item ${i + 1}`, sale_ok: true },
      tab_general_information: { type: "consu", list_price: 1500 + i * 200, gstRate: 18 },
    }))
  );
});

beforeEach(() => {
  activeConvId = randomUUID();
});

afterAll(async () => {
  if (mongoose.connection.readyState === 1) {
    await mongoose.connection.dropDatabase();
  }
  await mongoose.disconnect();
});

describe("Aupulens ERP AI Assistant — Full-System Acceptance Test Suite", () => {
  // =========================================================================
  // TEST A: Conversation Continuity & Entity Resolution (BUG-001)
  // =========================================================================
  describe("Test A: Conversation continuity & entity resolution (BUG-001)", () => {
    it("inherits invoice domain on follow-up question 'total how many we have?'", async () => {
      // 1. Initial query: Overdue invoices count
      const res1 = await askAdmin("how many invoices are overdue?");
      expect(res1?.handled).toBe(true);
      expect(res1?.message).toBe("39 overdue invoice records.");
      expect(res1?.structured).toMatchObject({
        type: "count",
        entity: "invoice",
        status: "overdue",
        count: 39,
      });

      // 2. Follow-up query: "total how many we have?"
      // MUST NOT switch to inventory (11 items). Must return authoritative 341 total invoices!
      const res2 = await askAdmin("total how many we have?");
      expect(res2?.handled).toBe(true);
      expect(res2?.message).toBe("341 invoice records.");
      expect(res2?.structured).toMatchObject({
        type: "count",
        entity: "invoice",
        count: 341,
      });
      expect(res2?.message).not.toContain("item");
      expect(res2?.message).not.toContain("11");

      // 3. Follow-up status query: "how many are paid?"
      const res3 = await askAdmin("how many are paid?");
      expect(res3?.handled).toBe(true);
      expect(res3?.message).toBe("15 paid invoice records.");
      expect(res3?.structured).toMatchObject({
        type: "count",
        entity: "invoice",
        status: "paid",
        count: 15,
      });

      // 4. Follow-up list query: "show those"
      const res4 = await askAdmin("show those");
      expect(res4?.handled).toBe(true);
      expect(res4?.structured?.type).toBe("record_list");
      if (res4?.structured?.type === "record_list") {
        expect(res4.structured.entity).toBe("invoice");
        expect(res4.structured.records.length).toBeGreaterThan(0);
        expect(res4.structured.records[0].status).toBe("paid");
      }

      // 5. Explicitly asking about inventory switches context to inventory/product
      const res5 = await askAdmin("how many products do we have in inventory?");
      expect(res5?.handled).toBe(true);
      expect(res5?.message).toBe("11 product records.");
      expect(res5?.structured).toMatchObject({
        type: "count",
        entity: "product",
        count: 11,
      });

      // 6. Starting a fresh conversation does NOT inherit prior invoice context
      const freshConvId = randomUUID();
      const res6 = await askAdmin("total how many we have?", freshConvId);
      // Without prior context, generic "total how many we have?" cannot resolve an entity
      expect(res6).toBeNull();
    });

    it("enforces tenant boundary on contextual count queries", async () => {
      const otherTenant = `other-${randomUUID()}`;
      await Organization.create({
        name: "Other Org",
        subdomain: otherTenant,
        ownerUserId: new mongoose.Types.ObjectId().toString(),
        tier: "enterprise",
        subscriptionStatus: "active",
      });
      invalidateEntitlementsCache(otherTenant);

      const otherCustomer = await Customer.create({
        tenantId: otherTenant,
        createdBy: adminUserId,
        header: { name: "Other Client", displayName: "Other Client" },
      });

      // Other tenant has 2 invoices
      await SalesInvoice.insertMany([
        {
          tenantId: otherTenant,
          customerId: otherCustomer._id,
          number: "INV-OTHER-1",
          totalAmount: 1000,
          taxableAmount: 1000,
          status: "overdue",
          invoiceDate: new Date(),
          dueDate: new Date("2020-01-01"),
        },
        {
          tenantId: otherTenant,
          customerId: otherCustomer._id,
          number: "INV-OTHER-2",
          totalAmount: 2000,
          taxableAmount: 2000,
          status: "paid",
          invoiceDate: new Date(),
          dueDate: new Date("2020-01-01"),
        },
      ]);

      const otherConv = randomUUID();
      const otherRes1 = await tryErpAssistant({
        text: "how many invoices are overdue?",
        tenantId: otherTenant,
        userId: adminUserId,
        role: "admin",
        module: "admin",
        conversationId: otherConv,
      });
      expect(otherRes1?.message).toBe("1 overdue invoice record.");

      const otherRes2 = await tryErpAssistant({
        text: "total how many we have?",
        tenantId: otherTenant,
        userId: adminUserId,
        role: "admin",
        module: "admin",
        conversationId: otherConv,
      });
      // Main tenant still has 341 invoices (and its context is isolated)
      const mainConv = randomUUID();
      const mainRes1 = await askAdmin("how many invoices are overdue?", mainConv);
      expect(mainRes1?.message).toBe("39 overdue invoice records.");

      const mainRes2 = await askAdmin("total how many we have?", mainConv);
      expect(mainRes2?.message).toBe("341 invoice records.");
    });
  });

  // =========================================================================
  // TEST B: Financial Analysis & Truthful Profit/Loss Reporting (BUG-002)
  // =========================================================================
  describe("Test B: Financial analysis falls back to generic instructions (BUG-002)", () => {
    it("reports truthful missing-expense limitation when revenue exists but expenses are not posted", async () => {
      // In our setup so far, issued sales invoices exist (15 paid + 39 overdue), but NO JournalEntries exist.
      const res = await askAdmin("analyse the overall modules and tell me the company is in profit or loss");
      expect(res?.handled).toBe(true);
      expect(res?.message).toContain("A reliable net profit or loss figure cannot yet be calculated");
      expect(res?.message).toContain("expense data is unavailable");
      expect(res?.message).toContain("Sales revenue cannot be substituted for profit");
      expect(res?.structured?.type).toBe("profit_loss");
      if (res?.structured?.type === "profit_loss") {
        expect(res.structured.status).toBe("incomplete_data");
        expect(res.structured.isProfitable).toBe(false);
        expect(res.structured.expenses).toBe(0);
        expect(res.structured.revenue).toBeGreaterThan(0);
      }
    });

    it("calculates exact, verified net profit when authoritative journal entries are posted", async () => {
      // Post authoritative Journal Entries:
      // Income: ₹2,00,000 (Cr)
      // Expense: ₹75,000 (Dr)
      // Net Profit: ₹1,25,000
      const incomeAcc = await Account.create({
        tenantId,
        code: "4001",
        name: "Sales Revenue",
        account_type: "income",
        internal_group: "income",
        normal_balance: "credit",
      });
      const expenseAcc = await Account.create({
        tenantId,
        code: "5001",
        name: "Office Rent Expense",
        account_type: "expense",
        internal_group: "expense",
        normal_balance: "debit",
      });
      const bankAcc = await Account.create({
        tenantId,
        code: "1001",
        name: "Main Operating Bank",
        account_type: "asset_cash",
        internal_group: "asset",
        normal_balance: "debit",
      });

      const incomeAccountId = incomeAcc._id;
      const expenseAccountId = expenseAcc._id;
      const bankAccountId = bankAcc._id;

      await JournalEntry.create([
        {
          tenantId,
          header: {
            name: "JV-INC-001",
            date: new Date("2026-10-01"),
            ref: "Sales Revenue Posting",
            journalType: "sale",
          },
          lineIds: [
            {
              accountId: bankAccountId,
              debit: 200000,
              credit: 0,
              label: "Bank Receipt",
              __accountGroup: "asset",
            },
            {
              accountId: incomeAccountId,
              debit: 0,
              credit: 200000,
              label: "Sales Revenue",
              __accountGroup: "income",
            },
          ],
          totals: { currencyId: "INR", amountUntaxed: 200000, amountTax: 0, amountTotal: 200000 },
          status: DOCUMENT_STATUS.POSTED,
          createdBy: adminUserId,
        },
        {
          tenantId,
          header: {
            name: "JV-EXP-001",
            date: new Date("2026-10-05"),
            ref: "Operating Rent & Utilities",
            journalType: "purchase",
          },
          lineIds: [
            {
              accountId: expenseAccountId,
              debit: 75000,
              credit: 0,
              label: "Office Rent",
              __accountGroup: "expense",
            },
            {
              accountId: bankAccountId,
              debit: 0,
              credit: 75000,
              label: "Bank Payment",
              __accountGroup: "asset",
            },
          ],
          totals: { currencyId: "INR", amountUntaxed: 75000, amountTax: 0, amountTotal: 75000 },
          status: DOCUMENT_STATUS.POSTED,
          createdBy: adminUserId,
        },
      ]);

      // Verify report directly
      const report = await buildPostedJournalReport({ tenantId });
      expect(report.income.total).toBe(200000);
      expect(report.expense.total).toBe(75000);
      expect(report.totals.balanced).toBe(true);

      // Now ask AI Assistant
      const res = await askAdmin("analyse the overall modules and tell me the company is in profit or loss");
      expect(res?.handled).toBe(true);
      expect(res?.message).toContain("In Profit");
      expect(res?.message).toContain("₹2,00,000");
      expect(res?.message).toContain("₹75,000");
      expect(res?.message).toContain("₹1,25,000");

      expect(res?.structured?.type).toBe("profit_loss");
      if (res?.structured?.type === "profit_loss") {
        expect(res.structured.status).toBe("profitable");
        expect(res.structured.isProfitable).toBe(true);
        expect(res.structured.revenue).toBe(200000);
        expect(res.structured.expenses).toBe(75000);
        expect(res.structured.netProfit).toBe(125000);
        expect(res.structured.basis).toBe("posted_journal_entries");
      }
    });

    it("rejects unauthorized users from financial P&L analysis", async () => {
      // User with 'sales' role lacks permission to query company P&L
      await expect(askSales("analyse the overall modules and tell me the company is in profit or loss")).rejects.toMatchObject({
        code: "PERMISSION_DENIED",
      });
    });
  });

  // =========================================================================
  // TEST C: Multi-Turn Customer Creation Draft State (BUG-003)
  // =========================================================================
  describe("Test C: Multi-turn customer creation loses draft state (BUG-003)", () => {
    it("preserves draft across multiple turns, validates inputs, and saves idempotently", async () => {
      const convId = randomUUID();

      // Step 1: User begins with name
      const turn1 = await askAdmin("create an customer names kishore", convId);
      expect(turn1?.handled).toBe(true);
      expect(turn1?.message).toContain("Customer draft — not saved");
      expect(turn1?.message).toContain("Name: kishore");
      expect(turn1?.structured?.type).toBe("customer_proposal");
      if (turn1?.structured?.type === "customer_proposal") {
        expect(turn1.structured.name).toBe("kishore");
        expect(turn1.structured.status).toBe("proposed");
        expect(turn1.structured.missingFields).toContain("type");
      }

      // Step 2: User provides full name update
      const turn2 = await askAdmin("kishore k", convId);
      expect(turn2?.handled).toBe(true);
      expect(turn2?.message).toContain("Name: kishore k");
      if (turn2?.structured?.type === "customer_proposal") {
        expect(turn2.structured.name).toBe("kishore k");
      }

      // Step 3: User provides customer type
      const turn3 = await askAdmin("individual", convId);
      expect(turn3?.handled).toBe(true);
      expect(turn3?.message).toContain("Name: kishore k");
      expect(turn3?.message).toContain("Type: Individual");
      if (turn3?.structured?.type === "customer_proposal") {
        expect(turn3.structured.name).toBe("kishore k");
        expect(turn3.structured.isCompany).toBe(false);
      }

      // Step 4: User provides phone number
      const turn4 = await askAdmin("123456788", convId);
      expect(turn4?.handled).toBe(true);
      expect(turn4?.message).toContain("Name: kishore k");
      expect(turn4?.message).toContain("Type: Individual");
      expect(turn4?.message).toContain("Phone: 123456788");
      if (turn4?.structured?.type === "customer_proposal") {
        expect(turn4.structured.phone).toBe("123456788");
        expect(turn4.structured.missingFields?.length).toBe(0);
      }

      // Step 5: User corrects email
      const turn5 = await askAdmin("email is kishore@example.com", convId);
      expect(turn5?.handled).toBe(true);
      expect(turn5?.message).toContain("Email: kishore@example.com");
      expect(turn5?.message).toContain("Phone: 123456788");
      expect(turn5?.message).toContain("Type: Individual");
      expect(turn5?.message).toContain("Name: kishore k");

      // Verify no customer has been written to MongoDB yet
      const preCheck = await Customer.findOne({ tenantId, "header.name": "kishore k" });
      expect(preCheck).toBeNull();

      // Step 6: User confirms customer creation
      const turn6 = await askAdmin("confirm customer", convId);
      expect(turn6?.handled).toBe(true);
      expect(turn6?.message).toContain('Saved customer "kishore k" (Individual)');
      expect(turn6?.structured?.type).toBe("customer_saved");

      // Verify customer is persisted in database
      const persisted = await Customer.findOne({ tenantId, "header.name": "kishore k" });
      expect(persisted).not.toBeNull();
      expect(persisted?.header?.is_company).toBe(false);
      expect(persisted?.contact_details?.phone).toBe("123456788");
      expect(persisted?.contact_details?.email).toBe("kishore@example.com");

      // Verify audit log entry
      const audit = await CrmAuditLog.findOne({
        tenantId,
        record_type: "Customer",
        record_id: persisted?._id,
      });
      expect(audit).not.toBeNull();
      expect(audit?.action).toBe("created");

      // Step 7: Retry confirmation does NOT create a duplicate customer
      const custCountBefore = await Customer.countDocuments({ tenantId, "header.name": "kishore k" });
      expect(custCountBefore).toBe(1);

      await expect(askAdmin("confirm customer", convId)).rejects.toMatchObject({
        code: "MISSING_FIELD",
        message: expect.stringContaining("Please prepare a customer draft in this conversation first"),
      });
      const custCountAfter = await Customer.countDocuments({ tenantId, "header.name": "kishore k" });
      expect(custCountAfter).toBe(1);
    });

    it("rejects invalid phone and allows cancellation without side effects", async () => {
      const convId = randomUUID();

      // Start draft
      await askAdmin("create customer Ramesh", convId);

      // Attempt invalid phone
      await expect(askAdmin("phone is 123", convId)).rejects.toMatchObject({
        code: "BUSINESS_RULE",
      });

      // Cancel draft
      const cancelRes = await askAdmin("cancel customer", convId);
      expect(cancelRes?.message).toContain("Customer draft cancelled");

      // Verify no customer in DB
      const ramesh = await Customer.findOne({ tenantId, "header.name": "Ramesh" });
      expect(ramesh).toBeNull();
    });
  });

  // =========================================================================
  // TEST D: Role Change Requests & Action Execution (BUG-004)
  // =========================================================================
  describe("Test D: Role-change requests provide instructions instead of executing actions (BUG-004)", () => {
    it("proposes role change, requires confirmation, executes safely and audits the change", async () => {
      const targetUser = await User.findOne({ tenantId, email: "kishore@aupulens.test" });
      expect(targetUser).not.toBeNull();
      expect(targetUser?.userRole).toBe("sales-manager");

      const convId = randomUUID();

      // Step 1: User requests role change
      const req = await askAdmin("in user kishore, change the sales manager role to admin", convId);
      expect(req?.handled).toBe(true);
      expect(req?.message).toContain("Change role for user");
      expect(req?.message).toContain("Sales Manager to Admin");
      expect(req?.message).toContain("Explicit confirmation is required");
      expect(req?.structured?.type).toBe("role_change_proposal");

      if (req?.structured?.type === "role_change_proposal") {
        expect(req.structured.userName).toBe("Kishore Kumar");
        expect(req.structured.currentRoleLabel).toBe("Sales Manager");
        expect(req.structured.proposedRoleLabel).toBe("Admin");
        expect(req.structured.status).toBe("proposed");
      }

      // Verify user in DB is STILL sales-manager before confirmation
      const unconfirmedUser = await User.findById(targetUser?._id);
      expect(unconfirmedUser?.userRole).toBe("sales-manager");
      expect(unconfirmedUser?.role).toBe("sales");

      // Step 2: Confirm role change
      const confirmRes = await askAdmin("confirm role change", convId);
      expect(confirmRes?.handled).toBe(true);
      expect(confirmRes?.message).toContain('Successfully updated role for user "Kishore Kumar" to Admin');
      expect(confirmRes?.structured?.type).toBe("role_changed");

      // Verify persisted change in MongoDB
      const updatedUser = await User.findById(targetUser?._id);
      expect(updatedUser?.role).toBe("admin");
      expect(updatedUser?.userRole).toBe("admin");

      // Verify audit log record
      const audit = await CrmAuditLog.findOne({
        tenantId,
        record_type: "User",
        record_id: targetUser?._id,
        action: "updated",
      });
      expect(audit).not.toBeNull();
      expect(audit?.new_value?.toLowerCase()).toContain("admin");

      // Step 3: Re-executing confirmation does not cause duplicate side-effects
      await expect(askAdmin("confirm role change", convId)).rejects.toMatchObject({
        code: "MISSING_FIELD",
        message: expect.stringContaining("No pending role change proposal found in this conversation"),
      });
    });

    it("rejects non-admin users from changing roles", async () => {
      await expect(
        askSales("in user kishore, change the sales manager role to admin")
      ).rejects.toMatchObject({
        code: "PERMISSION_DENIED",
      });
    });

    it("requires disambiguation when multiple users match the same name", async () => {
      // Create duplicate user named Kishore
      await User.create({
        tenantId,
        name: "Kishore Sharma",
        email: "kishore.sharma@aupulens.test",
        phone: "9876543213",
        role: "finance",
        userRole: "finance-manager",
        password: "hashed_dummy_password",
      });

      await expect(
        askAdmin("in user kishore, change the sales manager role to admin")
      ).rejects.toThrow(/Multiple users match "kishore"/);
    });

    it("rejects invalid role names with a helpful message", async () => {
      await expect(
        askAdmin("in user Kishore Kumar, change role to Chief Wizard Officer")
      ).rejects.toThrow(/is not a recognized role/);
    });
  });
});
