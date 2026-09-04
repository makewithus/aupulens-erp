import { describe, expect, it, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_ai25";

import Account from "@/models/finance/Account";
import JournalEntry from "@/models/finance/JournalEntry";
import Customer from "@/models/sales/Customer";
import User from "@/models/auth/User";
import AiWorkflowRun from "@/models/ai/AiWorkflowRun";
import AiDecisionTrace from "@/models/ai/AiDecisionTrace";
import AiEvent from "@/models/ai/AiEvent";
import AiToolCall from "@/models/ai/AiToolCall";
import AiWorkflowPolicy from "@/models/ai/AiWorkflowPolicy";

let runWorkflow: typeof import("@/lib/aiRuntime/runtime/executor").runWorkflow;
let bootstrapAiRuntime: typeof import("@/lib/aiRuntime/bootstrap").bootstrapAiRuntime;
let ai25WorkingCapitalIntelligence: typeof import("@/lib/aiRuntime/workflows/ai-25-working-capital-intelligence").ai25WorkingCapitalIntelligence;

const TENANT = "ai25-tenant";
const PERIOD = "2026-02";

async function makeUser() {
  const u = await User.create({ tenantId: TENANT, name: "Finance User", email: `f-${Date.now()}-${Math.random()}@example.com`, phone: "9999999999", password: "hashed", role: "finance", status: "active" });
  return String(u._id);
}
async function makeAccount(internal_group: string, account_type: string, name: string) {
  return Account.create({ tenantId: TENANT, name, code: `ACC-${Math.random().toString(36).slice(2, 8)}`, account_type, internal_group, isActive: true, isLocked: false, status: "active" });
}
async function makePartner(userId: string, name: string) {
  return Customer.create({ tenantId: TENANT, header: { name }, contact_details: {}, createdBy: userId });
}

async function postEntry(debitAccountId: string, creditAccountId: string, amount: number, date: Date, partnerId?: string) {
  return JournalEntry.create({
    tenantId: TENANT,
    header: { name: `JE-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, date, journalType: "general" },
    status: "posted",
    voucherStatus: "posted",
    lineIds: [
      { accountId: debitAccountId, label: "line", debit: amount, credit: 0, partnerId },
      { accountId: creditAccountId, label: "line", debit: 0, credit: amount, partnerId },
    ],
    totals: { amountUntaxed: amount, amountTax: 0, amountTotal: amount },
  });
}

async function runAi25(actingUserId?: string, period: string = PERIOD) {
  return runWorkflow(ai25WorkingCapitalIntelligence, {
    tenantId: TENANT,
    eventKey: "period.horizon.reached",
    payload: { period, periodEnd: new Date(`${period}-28T23:59:59Z`).toISOString(), actingUserId },
  });
}

describe("AI-25 — Working-capital intelligence", () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI!);
    await Promise.all([
      Account.init(),
      JournalEntry.init(),
      Customer.init(),
      User.init(),
      AiWorkflowRun.init(),
      AiDecisionTrace.init(),
      AiEvent.init(),
      AiToolCall.init(),
      AiWorkflowPolicy.init(),
    ]);
    ({ runWorkflow } = await import("@/lib/aiRuntime/runtime/executor"));
    ({ bootstrapAiRuntime } = await import("@/lib/aiRuntime/bootstrap"));
    ({ ai25WorkingCapitalIntelligence } = await import("@/lib/aiRuntime/workflows/ai-25-working-capital-intelligence"));
    bootstrapAiRuntime();
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  afterEach(async () => {
    await Promise.all([
      Account.deleteMany({}),
      JournalEntry.deleteMany({}),
      Customer.deleteMany({}),
      User.deleteMany({}),
      AiWorkflowRun.deleteMany({}),
      AiDecisionTrace.deleteMany({}),
      AiEvent.deleteMany({}),
      AiToolCall.deleteMany({}),
      AiWorkflowPolicy.deleteMany({}),
    ]);
  });

  it("inventory days reports not_computable while the account-mapping question is open", async () => {
    const userId = await makeUser();
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-25", killSwitchEnabled: true, maxAutonomyLevel: "observe" });
    const envelope = await runAi25(userId);
    const trace = await AiDecisionTrace.findOne({ runId: envelope.runId }).lean();
    const proposal = trace!.rawProposal as unknown as { metrics: { dio: null; notComputable: { what: string }[] } };
    expect(proposal.metrics.dio).toBeNull();
    expect(proposal.metrics.notComputable.find((n) => n.what === "dio")).toBeDefined();
  });

  it("inventory days becomes computable once AI-11's inventory-account mapping resolves (Chunk 8a unblock)", async () => {
    const userId = await makeUser();
    const inventoryAcc = await Account.create({ tenantId: TENANT, name: "Inventory", code: "1300", account_type: "asset_current", internal_group: "asset", isActive: true, isLocked: false, status: "active" });
    const cogsAcc = await makeAccount("expense", "expense_direct_cost", "COGS");
    const equityAcc = await makeAccount("equity", "equity", "Opening Equity");

    // Opening stock, before the period — carries forward into the period-end balance.
    await postEntry(String(inventoryAcc._id), String(equityAcc._id), 6000, new Date("2026-01-15T00:00:00Z"));
    // Goods sold during the period: COGS recognised, inventory relieved.
    await postEntry(String(cogsAcc._id), String(inventoryAcc._id), 2000, new Date("2026-02-10T00:00:00Z"));

    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-25", killSwitchEnabled: true, maxAutonomyLevel: "observe" });
    const envelope = await runAi25(userId);
    const trace = await AiDecisionTrace.findOne({ runId: envelope.runId }).lean();
    const proposal = trace!.rawProposal as unknown as { metrics: { dio: number | null; notComputable: { what: string }[] } };
    expect(proposal.metrics.notComputable.find((n) => n.what === "dio")).toBeUndefined();
    expect(proposal.metrics.dio).toBe(56); // (4000 balance / 2000 COGS) x 28 days
  });

  it("formulas produce known values on a fixture set (DSO)", async () => {
    const userId = await makeUser();
    const ar = await makeAccount("asset", "asset_receivable", "Accounts Receivable");
    const income = await makeAccount("income", "income", "Sales Revenue");
    const custA = await makePartner(userId, "Customer A");
    const custB = await makePartner(userId, "Customer B");

    // Jan: A books 10000, B books 2000 (both still open/unpaid).
    await postEntry(String(ar._id), String(income._id), 10000, new Date("2026-01-15"), String(custA._id));
    await postEntry(String(ar._id), String(income._id), 2000, new Date("2026-01-10"), String(custB._id));
    // Feb: only B books a further 20000 (A has nothing new — Jan balance simply carries).
    await postEntry(String(ar._id), String(income._id), 20000, new Date("2026-02-05"), String(custB._id));

    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-25", killSwitchEnabled: true, maxAutonomyLevel: "observe" });
    const envelope = await runAi25(userId);
    const trace = await AiDecisionTrace.findOne({ runId: envelope.runId }).lean();
    const proposal = trace!.rawProposal as unknown as { metrics: { dso: number }; comparatives: { dso: number } };

    // AR(Feb-end) = 10000 + 22000 = 32000; revenue(Feb) = 20000 (only B's Feb entry); days = 28.
    expect(proposal.metrics.dso).toBeCloseTo((32000 / 20000) * 28, 1);
    // AR(Jan-end) = 10000 + 2000 = 12000; revenue(Jan) = 12000; days = 31.
    expect(proposal.comparatives.dso).toBeCloseTo((12000 / 12000) * 31, 1);
  });

  it("a single large late customer is identified as the dominant driver, and driver cash impacts sum to the total AR movement", async () => {
    const userId = await makeUser();
    const ar = await makeAccount("asset", "asset_receivable", "Accounts Receivable");
    const income = await makeAccount("income", "income", "Sales Revenue");
    const custA = await makePartner(userId, "Customer A");
    const custB = await makePartner(userId, "Customer B (late)");
    const custC = await makePartner(userId, "Customer C");

    await postEntry(String(ar._id), String(income._id), 5000, new Date("2026-01-10"), String(custA._id));
    await postEntry(String(ar._id), String(income._id), 2000, new Date("2026-01-10"), String(custB._id));
    await postEntry(String(ar._id), String(income._id), 3000, new Date("2026-01-10"), String(custC._id));
    // Feb: only Customer B books a large new balance — everyone else unchanged.
    await postEntry(String(ar._id), String(income._id), 50000, new Date("2026-02-05"), String(custB._id));

    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-25", killSwitchEnabled: true, maxAutonomyLevel: "observe" });
    const envelope = await runAi25(userId);
    const trace = await AiDecisionTrace.findOne({ runId: envelope.runId }).lean();
    const proposal = trace!.rawProposal as unknown as { drivers: { type: string; entityName: string; cashImpact: number }[]; movement: { arBalance: number } };

    const arDrivers = proposal.drivers.filter((d) => d.type === "customer");
    expect(arDrivers[0].entityName).toBe("Customer B (late)");
    expect(arDrivers[0].cashImpact).toBeCloseTo(50000, 2);

    const driverSum = arDrivers.reduce((s, d) => s + d.cashImpact, 0);
    expect(driverSum).toBeCloseTo(proposal.movement.arBalance, 2);
    expect(proposal.movement.arBalance).toBeCloseTo(50000, 2);
  });

  it("false positive: stable AR/AP period-over-period produces no drivers and no recommended actions", async () => {
    const userId = await makeUser();
    const ar = await makeAccount("asset", "asset_receivable", "Accounts Receivable");
    const income = await makeAccount("income", "income", "Sales Revenue");
    const custA = await makePartner(userId, "Steady Customer");
    // A single balance established well before either period — identical in both Jan-end and
    // Feb-end snapshots since nothing new posts and nothing gets paid off.
    await postEntry(String(ar._id), String(income._id), 5000, new Date("2025-11-01"), String(custA._id));

    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-25", killSwitchEnabled: true, maxAutonomyLevel: "observe" });
    const envelope = await runAi25(userId);
    const trace = await AiDecisionTrace.findOne({ runId: envelope.runId }).lean();
    const proposal = trace!.rawProposal as unknown as { drivers: unknown[]; recommendedActions: unknown[] };

    expect(proposal.drivers.length).toBe(0);
    expect(proposal.recommendedActions.length).toBe(0);
  });
});
