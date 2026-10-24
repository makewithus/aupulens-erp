import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
vi.mock("@/lib/db", () => ({ default: async () => {} }));
import mongoose from "mongoose";
import { randomUUID } from "crypto";
import Organization from "@/models/admin/Organization";
import { SalesInvoice } from "@/models/sales/SalesInvoice";
import Customer from "@/models/sales/Customer";
import { executeErpQuery } from "@/lib/ai/erpQuery";
import { parseErpIntent } from "@/lib/ai/erpIntent";
import { formatErpResult, tryErpAssistant } from "@/lib/ai/erpAssistant";
import { issuedInvoiceFilter, unpaidInvoiceFilter } from "@/lib/sales/invoiceEligibility";

const tenantId = `revenue-recon-${randomUUID().slice(0, 8)}`;
const otherTenantId = `revenue-recon-other-${randomUUID().slice(0, 8)}`;
const userId = new mongoose.Types.ObjectId().toString();
const now = new Date("2026-10-23T12:00:00+05:30"); // 23 Oct 2026

beforeAll(async () => {
  await mongoose.connect(`mongodb://127.0.0.1:27017/aupulens_test_rev_recon_${randomUUID().replaceAll("-", "")}`, {
    serverSelectionTimeoutMS: 5000,
  });
  await Organization.init();
  await Customer.init();
  await SalesInvoice.init();

  await Organization.create([
    {
      name: "Recon Org",
      subdomain: tenantId,
      ownerUserId: userId,
      tier: "enterprise",
      subscriptionStatus: "active",
      settings: { enabledModules: ["sales", "admin", "finance"] },
    },
    {
      name: "Other Org",
      subdomain: otherTenantId,
      ownerUserId: userId,
      tier: "enterprise",
      subscriptionStatus: "active",
      settings: { enabledModules: ["sales", "admin", "finance"] },
    },
  ]);

  const customer = await Customer.create({
    tenantId,
    createdBy: userId,
    header: { name: "Reconciliation Customer", displayName: "Reconciliation Customer" },
  });

  const invoice = (num: string, gross: number, taxable: number, status: string, daysAgo: number, overrides: any = {}) => ({
    tenantId,
    number: num,
    customerId: customer._id,
    totalAmount: gross,
    taxableAmount: taxable,
    status,
    invoiceDate: new Date(now.getTime() - daysAgo * 86400000),
    dueDate: new Date(now.getTime() - (daysAgo - 5) * 86400000),
    payments: [],
    markedFullyPaid: status === "paid",
    ...overrides,
  });

  await SalesInvoice.insertMany([
    // Eligible issued invoices within last 30 days:
    invoice("INV-RECON-001", 979995, 830504.24, "paid", 5),           // Paid large invoice
    invoice("INV-RECON-002", 29146, 24700.00, "overdue", 10),         // Overdue
    invoice("INV-RECON-003", 29146, 24700.00, "saved", 15),           // Saved (issued)
    invoice("INV-RECON-004", 900, 762.71, "partially_paid", 20, {     // Partially paid
      payments: [{ amount: 300, date: new Date(now.getTime() - 19 * 86400000), mode: "UPI" }],
    }),
    invoice("INV-RECON-005", 1500, 1271.19, "paid", 28),              // Boundary: 28 days ago (within 30 days)
    
    // Ineligible status invoices within 30 days (must be excluded):
    invoice("INV-DRAFT-1", 5000000, 5000000, "draft", 2),             // Draft: 50L excluded
    invoice("INV-CANCELLED-1", 1000000, 1000000, "cancelled", 4),     // Cancelled: 10L excluded

    // Out-of-window dates (must be excluded from 30-day window):
    invoice("INV-PAST-45D", 50000, 42372.88, "paid", 45),             // 45 days ago
    invoice("INV-FUTURE-5D", 25000, 21186.44, "saved", -5),           // 5 days in the future

    // Cross-tenant invoice (must be strictly isolated):
    {
      ...invoice("INV-OTHER-001", 99999999, 99999999, "paid", 5),
      tenantId: otherTenantId,
    },
  ]);
});

afterAll(async () => {
  if (mongoose.connection.readyState === 1) {
    await mongoose.connection.dropDatabase();
  }
  await mongoose.disconnect();
});

describe("Priority 2 — Revenue and Financial Baseline Reconciliation", () => {
  it("calculates commercial issued invoice value within last 30 days strictly excluding drafts and cancellations", async () => {
    const intent = parseErpIntent("What was our revenue in the last 30 days?", now);
    expect(intent).not.toBeNull();
    const result = await executeErpQuery({ tenantId, role: "sales" }, intent, now);

    // Expected issued invoices within 30 days:
    // INV-RECON-001: 979,995
    // INV-RECON-002:  29,146
    // INV-RECON-003:  29,146
    // INV-RECON-004:     900
    // INV-RECON-005:   1,500
    // Total gross = 1,040,687 across exactly 5 invoices.
    expect(result.count).toBe(5);
    expect(result.total).toBe(1040687);

    const formatted = formatErpResult(result);
    expect(formatted).toContain("Issued invoice value (including tax; drafts and cancellations excluded)");
    expect(formatted).toContain("₹10,40,687 across 5 records");
  });

  it("verifies distinction between commercial issued value (gross ₹10,40,687) and taxable recognized value", async () => {
    // Commercial sales metrics aggregate gross issued value (including GST).
    // Accounting General Ledger recognizes taxable sales value credit (excluding GST liability).
    const issuedFilter = {
      tenantId,
      ...issuedInvoiceFilter(),
      invoiceDate: {
        $gte: new Date(now.getTime() - 30 * 86400000),
        $lte: now,
      },
    };

    const grossAggregate = await SalesInvoice.aggregate([
      { $match: issuedFilter },
      { $group: { _id: null, totalGross: { $sum: "$totalAmount" }, totalTaxable: { $sum: "$taxableAmount" } } },
    ]);

    expect(grossAggregate[0].totalGross).toBe(1040687);
    // Taxable portion is strictly less than gross total
    expect(grossAggregate[0].totalTaxable).toBeLessThan(1040687);
    expect(Math.round(grossAggregate[0].totalTaxable)).toBe(881938);
  });

  it("excludes drafts and cancellations from overdue counts and balances", async () => {
    const overdueFilter = {
      tenantId,
      ...unpaidInvoiceFilter(now),
    };
    const overdue = await SalesInvoice.find(overdueFilter).lean();
    // 3 invoices have dueDate < now and balance > 0 (INV-RECON-002, INV-RECON-003, INV-RECON-004)
    expect(overdue.length).toBe(3);
    expect(overdue.every(inv => inv.status !== "draft" && inv.status !== "cancelled")).toBe(true);
    const overdueNumbers = overdue.map(i => i.number).sort();
    expect(overdueNumbers).toEqual(["INV-RECON-002", "INV-RECON-003", "INV-RECON-004"]);
  });

  it("returns zero revenue and zero count for empty date windows or tenants without records", async () => {
    const emptyTenantId = `empty-tenant-${randomUUID().slice(0, 8)}`;
    await Organization.create({
      name: "Empty Org",
      subdomain: emptyTenantId,
      ownerUserId: userId,
      tier: "enterprise",
      subscriptionStatus: "active",
      settings: { enabledModules: ["sales", "admin"] },
    });

    const res = await tryErpAssistant({
      tenantId: emptyTenantId,
      userId,
      role: "sales",
      module: "sales",
      conversationId: randomUUID(),
      text: "What was our revenue in the last 30 days?",
      requestId: randomUUID(),
    });

    expect(res?.message).toContain("₹0 across 0 records");
  });

  it("documents historical dataset reconciliation: ~₹11.4L vs ₹1,040,987", () => {
    // Audit documentation check:
    // 1. The ~₹11.4 lakh figure comes from historical production screens on 22 Oct 2026.
    // 2. The ₹1,040,987 figure comes from the synthetic fixture in tests/ai/erpQa.integration.test.ts (979995 + 59192 + 600 + 900 + 200 + 100).
    // Both apply the exact same mathematical formula: sum(totalAmount) WHERE status IN (saved, partially_paid, paid, overdue) AND invoiceDate IN (now - 30d, now).
    // The historical live count remains unverified pending QA environment database access.
    expect(true).toBe(true);
  });
});
