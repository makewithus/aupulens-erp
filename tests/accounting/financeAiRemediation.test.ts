import { describe, expect, it, beforeAll, afterAll, vi } from "vitest";
import mongoose from "mongoose";
import { randomUUID } from "node:crypto";

vi.mock("@/lib/db", () => ({ default: async () => mongoose.connection }));

import Account from "@/models/finance/Account";
import JournalEntry from "@/models/finance/JournalEntry";
import Invoice from "@/models/finance/Invoice";
import Organization from "@/models/admin/Organization";
import { ensureChartOfAccounts } from "@/lib/accounting/coa-seeder";
import { createPostedJournalEntry } from "@/lib/accounting/posting";
import { VOUCHER_TYPE } from "@/lib/constants/statuses";
import { tryErpAssistant } from "@/lib/ai/erpAssistant";

const tenantId = `t-ai-finance-${Date.now()}`;
const createdBy = new mongoose.Types.ObjectId().toString();
const baseUri = process.env.MONGODB_URI?.split("?")[0].replace(/\/[^/]*$/, "") || "mongodb://localhost:27017";

describe("Finance AI Remediation & Deep Query Acceptance", () => {
  beforeAll(async () => {
    const dbName = `aupulens_test_ai_fin_${randomUUID().replaceAll("-", "").slice(0, 14)}`;
    await mongoose.connect(`${baseUri}/${dbName}`);
    await Account.init();
    await JournalEntry.init();
    await Invoice.init();
    await Organization.init();
    await ensureChartOfAccounts(tenantId, createdBy);

    await Organization.create({
      name: "Test Financial Org",
      subdomain: tenantId,
      ownerUserId: new mongoose.Types.ObjectId(createdBy),
      tier: "enterprise",
      subscriptionStatus: "active",
      modules: ["finance", "sales", "inventory", "hr"],
    });

    const revAccount = await Account.findOne({ tenantId, account_type: "income" });
    const arAccount = await Account.findOne({ tenantId, account_type: "asset_receivable" });
    await createPostedJournalEntry({
      tenantId,
      header: { name: "INV/AI/001", date: new Date(), ref: "AI-SO-1", journalType: "sale" },
      voucherType: VOUCHER_TYPE.SALES,
      lineIds: [
        { accountId: arAccount!._id, debit: 50000, credit: 0, label: "Services Provided" },
        { accountId: revAccount!._id, debit: 0, credit: 50000, label: "Sales Revenue" },
      ],
      totals: { amountUntaxed: 50000, amountTax: 0, amountTotal: 50000 },
      createdBy,
    });
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  it("resolves and answers net income explanation with supporting journals", async () => {
    const res = await tryErpAssistant({
      text: "Explain how the net income was calculated and show the supporting posted journal entries.",
      userId: createdBy,
      role: "admin",
      tenantId,
    });

    expect(res).toBeDefined();
    expect(res!.structured?.type).toBe("profit_loss");
    expect(res!.message).toContain("Reporting Scope & Basis");
    expect(Array.isArray((res!.structured as any)?.details?.supportingJournalEntries)).toBe(true);
  });

  it("resolves and performs Accounts Receivable to GL reconciliation", async () => {
    const res = await tryErpAssistant({
      text: "Reconcile Accounts Receivable to its General Ledger control account.",
      userId: createdBy,
      role: "finance",
      module: "finance",
      tenantId,
    });

    expect(res).toBeDefined();
    expect(res!.structured?.type).toBe("ar_reconciliation");
    expect((res!.structured as any)?.glControlAccount).toBeDefined();
    expect((res!.structured as any)?.subledger).toBeDefined();
    expect(res!.message).toContain("Accounts Receivable (AR) Subledger to GL Reconciliation");
  });

  it("identifies missing accounting records and unposted transactions for P&L completeness", async () => {
    const res = await tryErpAssistant({
      text: "Which accounting records or mappings are missing for a complete Profit & Loss?",
      userId: createdBy,
      role: "admin",
      tenantId,
    });

    expect(res).toBeDefined();
    expect(res!.structured?.type).toBe("missing_accounting_records");
    expect(typeof (res!.structured as any)?.draftVendorBillsCount).toBe("number");
    expect(res!.message).toContain("Accounting Completeness Review");
  });

  it("shows unposted journal entries that could affect period close", async () => {
    const res = await tryErpAssistant({
      text: "Show unposted journal entries that could affect the next period close.",
      userId: createdBy,
      role: "finance",
      module: "finance",
      tenantId,
    });

    expect(res).toBeDefined();
    expect(res!.structured?.type).toBe("unposted_journal_entries");
    expect(typeof (res!.structured as any)?.totalCount).toBe("number");
    expect(res!.message).toContain("Unposted Journal Entries Affecting Period Close");
  });

  it("performs month-over-month financial comparison with material transaction drivers", async () => {
    const res = await tryErpAssistant({
      text: "Compare the current month with the previous month and show the transactions driving material changes.",
      userId: createdBy,
      role: "finance",
      module: "finance",
      tenantId,
    });

    expect(res).toBeDefined();
    expect(res!.structured?.type).toBe("period_comparison");
    expect((res!.structured as any)?.currentPeriod).toBeDefined();
    expect((res!.structured as any)?.priorPeriod).toBeDefined();
    expect(res!.message).toContain("Month-over-Month Financial Comparison");
  });

  it("shows period close-readiness blockers and validation checklist", async () => {
    const res = await tryErpAssistant({
      text: "Show the current close-readiness blockers.",
      userId: createdBy,
      role: "admin",
      tenantId,
    });

    expect(res).toBeDefined();
    expect(res!.structured?.type).toBe("close_readiness_blockers");
    expect(typeof (res!.structured as any)?.blockersCount).toBe("number");
    expect(res!.message).toContain("Period Close Readiness & Blocker Review");
  });

  it("enforces RBAC and denies unauthorized roles from accessing financial intelligence", async () => {
    let error: any = null;
    try {
      await tryErpAssistant({
        text: "Reconcile Accounts Receivable to its General Ledger control account.",
        userId: createdBy,
        role: "warehouse",
        tenantId,
      });
    } catch (err: any) {
      error = err;
    }

    expect(error).toBeDefined();
    expect(error.code).toBe("PERMISSION_DENIED");
    expect(error.status).toBe(403);
  });
});
