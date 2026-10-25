import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import { beforeAll, afterAll, beforeEach, describe, it, expect, vi } from "vitest";

const commandAuth = vi.hoisted(() => vi.fn());
vi.mock("@/auth", () => ({ auth: commandAuth }));
vi.mock("@/lib/db", () => ({ default: async () => {} }));

import Organization from "@/models/admin/Organization";
import Customer from "@/models/sales/Customer";
import { SalesInvoice } from "@/models/sales/SalesInvoice";
import SalesQuotation from "@/models/sales/SalesQuotation";
import Product from "@/models/inventory/Product";
import User from "@/models/auth/User";
import ChatHistory from "@/models/ai/ChatHistory";
import AiCommandProposal from "@/models/ai/AiCommandProposal";
import { seedPlans } from "@/lib/platform/entitlements/planCatalog";
import { invalidateEntitlementsCache } from "@/lib/platform/entitlements/resolve";
import { tryErpAssistant, clearOrgCache } from "@/lib/ai/erpAssistant";

const mongoUri = process.env.MONGODB_URI || `mongodb://127.0.0.1:27017/aupulens_test_iso_${randomUUID().replaceAll("-", "")}`;

beforeAll(async () => {
  await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 5000 });
  await Promise.all([
    Organization.init(),
    Customer.init(),
    SalesInvoice.init(),
    SalesQuotation.init(),
    Product.init(),
    User.init(),
    ChatHistory.init(),
    AiCommandProposal.init(),
  ]);
  await seedPlans();
});

afterAll(async () => {
  if (mongoose.connection.readyState === 1) {
    await mongoose.connection.dropDatabase();
  }
  await mongoose.disconnect();
});

describe("Dynamic Workspace Isolation and Live Multi-Tenant Behavior", () => {
  describe("Test A: Newly Created Organization Starts Genuinely Empty and Updates Dynamically", () => {
    const newTenantId = `org-new-${randomUUID().slice(0, 8)}`;
    const ctoUserId = new mongoose.Types.ObjectId().toString();
    const ctoScope = { tenantId: newTenantId, userId: ctoUserId, role: "admin", module: "sales" as const };
    let convId = randomUUID();

    const askCto = (text: string, cid = convId, reqId = randomUUID()) =>
      tryErpAssistant({ ...ctoScope, conversationId: cid, text, requestId: reqId });

    beforeAll(async () => {
      // CTO provisions a brand new organization workspace
      await Organization.create({
        name: "Acme Corp (CTO Workspace)",
        subdomain: newTenantId,
        ownerUserId: ctoUserId,
        tier: "enterprise",
        subscriptionStatus: "active",
      });
      invalidateEntitlementsCache(newTenantId);
      clearOrgCache(newTenantId);
    });

    it("verifies the new workspace initially has 0 business records and does not inherit seeded QA data", async () => {
      // 1. Customer count
      const custRes = await askCto("How many customers do we have?");
      expect(custRes?.message).toBe("0 customer records.");
      expect(custRes?.structured?.type).toBe("count");
      if (custRes?.structured?.type === "count") {
        expect(custRes.structured.count).toBe(0);
      }

      // 2. Invoice count
      const invRes = await askCto("How many invoices do we have?");
      expect(invRes?.message).toBe("0 invoice records.");
      if (invRes?.structured?.type === "count") {
        expect(invRes.structured.count).toBe(0);
      }

      // 3. Quote count
      const quoteRes = await askCto("How many quotes do we have?");
      expect(quoteRes?.message).toBe("0 quote records.");
      if (quoteRes?.structured?.type === "count") {
        expect(quoteRes.structured.count).toBe(0);
      }

      // 4. Financial profit & loss on empty organization
      const plRes = await tryErpAssistant({
        ...ctoScope,
        module: "finance",
        conversationId: convId,
        text: "Analyse company profit or loss",
      });
      expect(plRes?.structured?.type).toBe("profit_loss");
      if (plRes?.structured?.type === "profit_loss") {
        expect(plRes.structured.status).toBe("unavailable");
        expect(plRes.structured.revenue).toBe(0);
        expect(plRes.structured.expenses).toBe(0);
        expect(plRes.structured.postedEntryCount).toBe(0);
        expect(plRes.structured.limitations).toContain("No revenue or expense records found");
      }
    });

    it("dynamically reflects new customer creation without hardcoded fallbacks", async () => {
      // Create a customer in this new tenant
      await Customer.create({
        tenantId: newTenantId,
        createdBy: ctoUserId,
        header: { name: "First Live Customer Inc." },
      });

      // Ask again
      const custRes = await askCto("How many customers do we have?", randomUUID());
      expect(custRes?.message).toBe("1 customer record.");
      if (custRes?.structured?.type === "count") {
        expect(custRes.structured.count).toBe(1);
      }
    });

    it("dynamically reflects new invoice creation without hardcoded fallbacks", async () => {
      const cust = await Customer.findOne({ tenantId: newTenantId }).lean();
      // Create an invoice in this new tenant
      await SalesInvoice.create({
        tenantId: newTenantId,
        number: "INV-ACME-001",
        customerId: cust?._id,
        totalAmount: 45000,
        taxableAmount: 45000,
        status: "saved",
        invoiceDate: new Date(),
        dueDate: new Date(Date.now() + 86400000 * 30),
        payments: [],
        markedFullyPaid: false,
      });

      // Ask for invoices
      const invRes = await askCto("How many invoices do we have?", randomUUID());
      expect(invRes?.message).toBe("1 invoice record.");
      if (invRes?.structured?.type === "count") {
        expect(invRes.structured.count).toBe(1);
      }

      // Direct lookup of the newly created invoice
      const lookupRes = await askCto("Show details of INV-ACME-001", randomUUID());
      expect(lookupRes?.message).toContain("INV-ACME-001");
      expect(lookupRes?.message).toContain("₹45,000");
    });
  });

  describe("Test B: Strict Cross-Tenant Isolation", () => {
    const tenantA = `tenant-a-${randomUUID().slice(0, 8)}`;
    const tenantB = `tenant-b-${randomUUID().slice(0, 8)}`;
    const userA = new mongoose.Types.ObjectId().toString();
    const userB = new mongoose.Types.ObjectId().toString();

    const scopeA = { tenantId: tenantA, userId: userA, role: "admin", module: "sales" as const };
    const scopeB = { tenantId: tenantB, userId: userB, role: "admin", module: "sales" as const };

    beforeAll(async () => {
      await Promise.all([
        Organization.create({ name: "Tenant A Org", subdomain: tenantA, ownerUserId: userA, tier: "enterprise", subscriptionStatus: "active" }),
        Organization.create({ name: "Tenant B Org", subdomain: tenantB, ownerUserId: userB, tier: "enterprise", subscriptionStatus: "active" }),
      ]);
      invalidateEntitlementsCache(tenantA);
      invalidateEntitlementsCache(tenantB);
      clearOrgCache();

      // Seed Tenant A: 2 customers, 1 invoice (INV-A-101)
      const custA1 = await Customer.create({ tenantId: tenantA, createdBy: userA, header: { name: "Tenant A Customer Alpha" } });
      await Customer.create({ tenantId: tenantA, createdBy: userA, header: { name: "Tenant A Customer Beta" } });
      await SalesInvoice.create({
        tenantId: tenantA,
        number: "INV-A-101",
        customerId: custA1._id,
        totalAmount: 12000,
        taxableAmount: 12000,
        status: "saved",
        invoiceDate: new Date(),
        dueDate: new Date(),
        payments: [],
        markedFullyPaid: false,
      });

      // Seed Tenant B: 5 customers, 3 invoices (INV-B-201, INV-B-202, INV-B-203)
      const custB1 = await Customer.create({ tenantId: tenantB, createdBy: userB, header: { name: "Tenant B Customer One" } });
      for (let i = 2; i <= 5; i++) {
        await Customer.create({ tenantId: tenantB, createdBy: userB, header: { name: `Tenant B Customer ${i}` } });
      }
      for (let i = 1; i <= 3; i++) {
        await SalesInvoice.create({
          tenantId: tenantB,
          number: `INV-B-20${i}`,
          customerId: custB1._id,
          totalAmount: 25000 * i,
          taxableAmount: 25000 * i,
          status: "saved",
          invoiceDate: new Date(),
          dueDate: new Date(),
          payments: [],
          markedFullyPaid: false,
        });
      }
    });

    it("queries counts independently for Tenant A and Tenant B", async () => {
      const resCustA = await tryErpAssistant({ ...scopeA, conversationId: randomUUID(), text: "How many customers do we have?" });
      expect(resCustA?.message).toBe("2 customer records.");

      const resCustB = await tryErpAssistant({ ...scopeB, conversationId: randomUUID(), text: "How many customers do we have?" });
      expect(resCustB?.message).toBe("5 customer records.");

      const resInvA = await tryErpAssistant({ ...scopeA, conversationId: randomUUID(), text: "How many invoices do we have?" });
      expect(resInvA?.message).toBe("1 invoice record.");

      const resInvB = await tryErpAssistant({ ...scopeB, conversationId: randomUUID(), text: "How many invoices do we have?" });
      expect(resInvB?.message).toBe("3 invoice records.");
    });

    it("mutating Tenant B does not alter Tenant A counts", async () => {
      // Add a customer to Tenant B
      await Customer.create({ tenantId: tenantB, createdBy: userB, header: { name: "Tenant B New Customer" } });

      // Tenant B count increases to 6
      const resCustB = await tryErpAssistant({ ...scopeB, conversationId: randomUUID(), text: "How many customers do we have?" });
      expect(resCustB?.message).toBe("6 customer records.");

      // Tenant A count strictly remains 2
      const resCustA = await tryErpAssistant({ ...scopeA, conversationId: randomUUID(), text: "How many customers do we have?" });
      expect(resCustA?.message).toBe("2 customer records.");
    });

    it("prevents direct record lookup or leakage across tenant boundaries", async () => {
      // Tenant A attempts to look up Tenant B's invoice "INV-B-201"
      const crossLookup = await tryErpAssistant({
        ...scopeA,
        conversationId: randomUUID(),
        text: "Show details of INV-B-201",
      });
      // Must NOT return Tenant B's data
      expect(crossLookup?.message).not.toContain("Tenant B Customer");
      expect(crossLookup?.structured?.type).toBe("not_found");

      // Tenant B looks up the same invoice -> succeeds
      const authorizedLookup = await tryErpAssistant({
        ...scopeB,
        conversationId: randomUUID(),
        text: "Show details of INV-B-201",
      });
      expect(authorizedLookup?.message).toContain("INV-B-201");
      expect(authorizedLookup?.message).toContain("Tenant B Customer One");
    });
  });

  describe("Test E: Cache Freshness and New Conversation State", () => {
    const tenantC = `tenant-c-${randomUUID().slice(0, 8)}`;
    const userC = new mongoose.Types.ObjectId().toString();
    const scopeC = { tenantId: tenantC, userId: userC, role: "admin", module: "sales" as const };

    beforeAll(async () => {
      await Organization.create({ name: "Tenant C Org", subdomain: tenantC, ownerUserId: userC, tier: "enterprise", subscriptionStatus: "active" });
      invalidateEntitlementsCache(tenantC);
      clearOrgCache();
    });

    it("verifies queries return fresh database data across conversation reloads", async () => {
      // Conversation 1: Initial query
      const conv1 = randomUUID();
      const res1 = await tryErpAssistant({ ...scopeC, conversationId: conv1, text: "How many invoices do we have?" });
      expect(res1?.message).toBe("0 invoice records.");

      // Add an invoice to the database
      const cust = await Customer.create({ tenantId: tenantC, createdBy: userC, header: { name: "Tenant C Customer" } });
      await SalesInvoice.create({
        tenantId: tenantC,
        number: "INV-C-001",
        customerId: cust._id,
        totalAmount: 18000,
        taxableAmount: 18000,
        status: "saved",
        invoiceDate: new Date(),
        dueDate: new Date(),
        payments: [],
        markedFullyPaid: false,
      });

      // Conversation 2 (Simulating page reload / new chat session):
      const conv2 = randomUUID();
      const res2 = await tryErpAssistant({ ...scopeC, conversationId: conv2, text: "How many invoices do we have?" });
      expect(res2?.message).toBe("1 invoice record.");
      if (res2?.structured?.type === "count") {
        expect(res2.structured.count).toBe(1);
      }

      // Add another invoice
      await SalesInvoice.create({
        tenantId: tenantC,
        number: "INV-C-002",
        customerId: cust._id,
        totalAmount: 32000,
        taxableAmount: 32000,
        status: "saved",
        invoiceDate: new Date(),
        dueDate: new Date(),
        payments: [],
        markedFullyPaid: false,
      });

      // Subsequent query reflects 2 records immediately
      const res3 = await tryErpAssistant({ ...scopeC, conversationId: conv2, text: "How many invoices do we have?" });
      expect(res3?.message).toBe("2 invoice records.");
    });
  });
});
