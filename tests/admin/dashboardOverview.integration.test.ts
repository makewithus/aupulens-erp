import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";

vi.mock("@/auth", () => ({ auth: async () => ({ user: { role: "admin", tenantId: "overview-test" } }) }));
// This test owns its connection; never load an environment database URI.
vi.mock("@/lib/db", () => ({ default: async () => {} }));

import { GET } from "@/app/api/admin/dashboard/route";
import Account from "@/models/finance/Account";
import JournalEntry from "@/models/finance/JournalEntry";
import Expense from "@/models/finance/Expense";
import Invoice from "@/models/finance/Invoice";
import Payment from "@/models/sales/Payment";
import Stock from "@/models/inventory/Stock";

// Explicit opt-in for the disposable local service; no Atlas/shared URI support.
describe.runIf(process.env.AUPULENS_OVERVIEW_MONGO_TEST === "1")("overview with disposable MongoDB", () => {
  const databaseName = `aupulens_overview_test_${process.pid}_${Date.now()}`;
  const bank = new mongoose.Types.ObjectId();
  const revenue = new mongoose.Types.ObjectId();
  const costs = new mongoose.Types.ObjectId();
  const date = new Date();

  beforeAll(async () => {
    await mongoose.connect(`mongodb://127.0.0.1:27129/${databaseName}`, { serverSelectionTimeoutMS: 5000 });
    await Account.collection.insertMany([
      { _id: bank, tenantId: "overview-test", code: "1000", name: "Bank", internal_group: "asset" },
      { _id: revenue, tenantId: "overview-test", code: "4000", name: "Sales", internal_group: "income" },
      { _id: costs, tenantId: "overview-test", code: "5000", name: "Costs", internal_group: "expense" },
    ]);
    await JournalEntry.collection.insertMany([
      { tenantId: "overview-test", status: "posted", header: { name: "SALES-1", date }, lineIds: [
        { accountId: bank, debit: 1000, credit: 0 }, { accountId: revenue, debit: 0, credit: 1000 },
      ] },
      { tenantId: "other-tenant", status: "posted", header: { name: "OTHER", date }, lineIds: [
        { accountId: bank, debit: 9999, credit: 0 }, { accountId: revenue, debit: 0, credit: 9999 },
      ] },
    ]);
    await Payment.collection.insertMany([
      { tenantId: "overview-test", status: "paid", paymentNumber: "PAY-1" },
      { tenantId: "overview-test", status: "void", paymentNumber: "VOID-1" },
    ]);
    await Stock.collection.insertMany([
      { tenantId: "overview-test", isReserved: false, reference: "MIGRATED-OPENING" },
      { tenantId: "overview-test", isReserved: true, reference: "RESERVATION" },
    ]);
  });

  afterAll(async () => {
    if (mongoose.connection.readyState === 1 && mongoose.connection.name === databaseName) {
      await mongoose.connection.dropDatabase();
    }
    await mongoose.disconnect();
  });

  it("keeps profit unavailable before costs are posted and counts real activity", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    const { summary } = await response.json();
    expect(summary.finance).toMatchObject({ totalRevenue: 1000, totalExpenses: 0, netIncome: null,
      profitAvailable: false, totalTransactions: 1, totalPayments: 1 });
    expect(summary.inventory.totalStockTransfers).toBe(1);
  });

  it("includes posted costs exactly once even when originating expense/bill documents exist", async () => {
    await JournalEntry.collection.insertMany([
      { tenantId: "overview-test", status: "posted", header: { name: "EXPENSE-1", date }, lineIds: [
        { accountId: costs, debit: 350, credit: 0 }, { accountId: bank, debit: 0, credit: 350 },
      ] },
      { tenantId: "overview-test", status: "draft", header: { name: "DRAFT", date }, lineIds: [
        { accountId: costs, debit: 800, credit: 0 }, { accountId: bank, debit: 0, credit: 800 },
      ] },
    ]);
    await Expense.collection.insertOne({ tenantId: "overview-test", status: "posted", total: 350 });
    await Invoice.collection.insertOne({ tenantId: "overview-test", state: "posted", moveType: "in_invoice", amountTotal: 350 });
    const response = await GET();
    expect(response.status).toBe(200);
    const { summary } = await response.json();
    expect(summary.finance).toMatchObject({ totalRevenue: 1000, totalExpenses: 350, netIncome: 650,
      profitAvailable: true, revenueCurrentMonth: 1000, expensesCurrentMonth: 350, totalTransactions: 2 });
    expect(summary.chartData.at(-1).revenue).toBe(1000);
  });
});
