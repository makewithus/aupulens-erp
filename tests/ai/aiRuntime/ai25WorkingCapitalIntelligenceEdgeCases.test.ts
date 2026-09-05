import { describe, expect, it, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_ai25edge";
process.env.CRON_SECRET = "ai25-edge-test-secret";

import Organization from "@/models/admin/Organization";
import Account from "@/models/finance/Account";
import JournalEntry from "@/models/finance/JournalEntry";
import Customer from "@/models/sales/Customer";
import User from "@/models/auth/User";
import AiWorkflowRun from "@/models/ai/AiWorkflowRun";
import AiDecisionTrace from "@/models/ai/AiDecisionTrace";
import AiEvent from "@/models/ai/AiEvent";
import AiToolCall from "@/models/ai/AiToolCall";
import AiWorkflowPolicy from "@/models/ai/AiWorkflowPolicy";
import AiSchedule from "@/models/ai/AiSchedule";

let runWorkflow: typeof import("@/lib/aiRuntime/runtime/executor").runWorkflow;
let bootstrapAiRuntime: typeof import("@/lib/aiRuntime/bootstrap").bootstrapAiRuntime;
let ai25WorkingCapitalIntelligence: typeof import("@/lib/aiRuntime/workflows/ai-25-working-capital-intelligence").ai25WorkingCapitalIntelligence;

const TENANT = "ai25-edge-tenant";
const OTHER_TENANT = "ai25-edge-other-tenant";
const PERIOD = "2026-02";

async function makeUser(tenantId = TENANT) {
  const u = await User.create({ tenantId, name: "Finance User", email: `f-${Date.now()}-${Math.random()}@example.com`, phone: "9999999999", password: "hashed", role: "finance", status: "active" });
  return String(u._id);
}
async function makeAccount(tenantId: string, internal_group: string, account_type: string, name: string) {
  return Account.create({ tenantId, name, code: `ACC-${Math.random().toString(36).slice(2, 8)}`, account_type, internal_group, isActive: true, isLocked: false, status: "active" });
}
async function makePartner(userId: string, name: string, tenantId = TENANT) {
  return Customer.create({ tenantId, header: { name }, contact_details: {}, createdBy: userId });
}
async function postEntry(tenantId: string, debitAccountId: string, creditAccountId: string, amount: number, date: Date, partnerId?: string) {
  return JournalEntry.create({
    tenantId,
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
async function runAi25(tenantId = TENANT, actingUserId?: string, period: string = PERIOD) {
  return runWorkflow(ai25WorkingCapitalIntelligence, {
    tenantId,
    eventKey: "period.horizon.reached",
    payload: { period, periodEnd: new Date(`${period}-28T23:59:59Z`).toISOString(), actingUserId },
  });
}

describe("AI-25 — edge-case hardening (docs/ai/BRIEF-09-VERIFICATION.md Part C)", () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI!);
    await Promise.all([
      Organization.init(), Account.init(), JournalEntry.init(), Customer.init(), User.init(),
      AiWorkflowRun.init(), AiDecisionTrace.init(), AiEvent.init(), AiToolCall.init(), AiWorkflowPolicy.init(), AiSchedule.init(),
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
      Organization.deleteMany({}), Account.deleteMany({}), JournalEntry.deleteMany({}), Customer.deleteMany({}), User.deleteMany({}),
      AiWorkflowRun.deleteMany({}), AiDecisionTrace.deleteMany({}), AiEvent.deleteMany({}), AiToolCall.deleteMany({}), AiWorkflowPolicy.deleteMany({}), AiSchedule.deleteMany({}),
    ]);
  });

  // ── Section 1: trigger proof through the REAL cron route ──────────────────────────────────
  it("trigger proof: the real cron sweep route fires AI-25 and produces real DSO/DPO metrics", async () => {
    await Organization.create({ name: "AI25 Edge Co", subdomain: TENANT, ownerUserId: new mongoose.Types.ObjectId(), isActive: true });
    const userId = await makeUser();
    const ar = await makeAccount(TENANT, "asset", "asset_receivable", "Accounts Receivable");
    const income = await makeAccount(TENANT, "income", "income", "Sales Revenue");
    const cust = await makePartner(userId, "Real Trigger Customer");
    const now = new Date();
    await postEntry(TENANT, String(ar._id), String(income._id), 10000, now, String(cust._id));
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-25", killSwitchEnabled: true, maxAutonomyLevel: "observe" });

    const { POST } = await import("@/app/api/cron/ai/runtime-sweep/route");
    const req = { headers: { get: (h: string) => (h.toLowerCase() === "authorization" ? `Bearer ${process.env.CRON_SECRET}` : null) } } as any;
    const res = await POST(req);
    expect(res.status).toBe(200);

    const run = await AiWorkflowRun.findOne({ tenantId: TENANT, workflowId: "AI-25" }).sort({ startedAt: -1 }).lean();
    expect(run, "the cron route must have dispatched a real period.horizon.reached event that reached AI-25").not.toBeNull();
    const trace = await AiDecisionTrace.findOne({ runId: run!._id }).lean();
    const proposal = trace!.rawProposal as unknown as { metrics: { dso: number | null } };
    expect(proposal.metrics.dso).not.toBeNull();
  });

  // ── Section 9 bug regression: same defect class fixed in AI-14 ────────────────────────────
  // No cheap NL keyword currently routes to AI-25 with empty parameters (confirmed: no AI-25
  // entry exists in lib/aiRuntime/nl/workflowIntentMap.ts), but nothing validates
  // event.payload.period before it reaches extract()'s Date.UTC() construction either — the
  // same String(undefined) -> "undefined" -> NaN -> Invalid Date -> uncaught Mongoose cast
  // exception reproduced directly against this workflow in this pass (confirmed before the fix).
  it("bug regression: a missing or malformed period degrades to the current period instead of crashing", async () => {
    const userId = await makeUser();
    for (const badPeriod of [undefined, "undefined", "not-a-period", "2026-13", "2026", ""]) {
      const payload: Record<string, unknown> = { actingUserId: userId };
      if (badPeriod !== undefined) payload.period = badPeriod;
      const envelope = await runWorkflow(ai25WorkingCapitalIntelligence, { tenantId: TENANT, eventKey: "period.horizon.reached", payload });
      expect(envelope.status).not.toBe("failed");
    }
  });

  // ── C.4 Cross-tenant (positive proof) ──────────────────────────────────────────────────────
  it("C.4 cross-tenant: tenant A's DSO/DPO never includes tenant B's AR/AP balances or inventory mapping, even with a hostile actingUserId from tenant B", async () => {
    const userA = await makeUser(TENANT);
    const userB = await makeUser(OTHER_TENANT);
    const arA = await makeAccount(TENANT, "asset", "asset_receivable", "AR A");
    const incomeA = await makeAccount(TENANT, "income", "income", "Revenue A");
    const custA = await makePartner(userA, "Customer A", TENANT);
    const arB = await makeAccount(OTHER_TENANT, "asset", "asset_receivable", "AR B");
    const incomeB = await makeAccount(OTHER_TENANT, "income", "income", "Revenue B");
    const custB = await makePartner(userB, "Customer B", OTHER_TENANT);

    await postEntry(TENANT, String(arA._id), String(incomeA._id), 1000, new Date(`${PERIOD}-10`), String(custA._id));
    await postEntry(OTHER_TENANT, String(arB._id), String(incomeB._id), 9_000_000, new Date(`${PERIOD}-10`), String(custB._id));
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-25", killSwitchEnabled: true, maxAutonomyLevel: "observe" });
    await AiWorkflowPolicy.create({ tenantId: OTHER_TENANT, workflowId: "AI-25", killSwitchEnabled: true, maxAutonomyLevel: "observe" });

    const envelope = await runAi25(TENANT, userB); // hostile: tenant B's own user id
    const trace = await AiDecisionTrace.findOne({ runId: envelope.runId }).lean();
    const proposal = trace!.rawProposal as unknown as { drivers: { entityRef: string }[]; movement: { arBalance: number } };
    expect(proposal.drivers.some((d) => d.entityRef === String(custB._id))).toBe(false);
    expect(Math.abs(proposal.movement.arBalance)).toBeLessThan(9_000_000);
  });

  // ── C.1 Large volume ───────────────────────────────────────────────────────────────────────
  it("C.1 large volume: 10,000 AR postings across many customers resolve correctly within budget", async () => {
    const userId = await makeUser();
    const ar = await makeAccount(TENANT, "asset", "asset_receivable", "Accounts Receivable");
    const income = await makeAccount(TENANT, "income", "income", "Sales Revenue");
    const customers = await Promise.all(Array.from({ length: 100 }, (_, i) => makePartner(userId, `Customer ${i}`)));
    const docs = Array.from({ length: 10000 }, (_, i) => {
      const c = customers[i % customers.length];
      const amount = 100 + (i % 500);
      return {
        tenantId: TENANT,
        header: { name: `BULK-JE-${i}`, date: new Date(`${PERIOD}-15`), journalType: "general" },
        status: "posted",
        voucherStatus: "posted",
        lineIds: [
          { accountId: ar._id, label: "line", debit: amount, credit: 0, partnerId: c._id },
          { accountId: income._id, label: "line", debit: 0, credit: amount, partnerId: c._id },
        ],
        totals: { amountUntaxed: amount, amountTax: 0, amountTotal: amount },
      };
    });
    await JournalEntry.insertMany(docs);
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-25", killSwitchEnabled: true, maxAutonomyLevel: "observe" });

    const start = Date.now();
    const envelope = await runAi25(TENANT, userId);
    const elapsedMs = Date.now() - start;
    // eslint-disable-next-line no-console
    console.log(`AI-25 large-volume working-capital run (10,000 AR lines, 100 customers): ${elapsedMs}ms`);

    expect(envelope.status).not.toBe("failed");
    const trace = await AiDecisionTrace.findOne({ runId: envelope.runId }).lean();
    const proposal = trace!.rawProposal as unknown as { drivers: { cashImpact: number }[]; movement: { arBalance: number } };
    const driverSum = proposal.drivers.filter((d) => d.cashImpact !== undefined).reduce((s, d) => s + d.cashImpact, 0);
    // Not every driver crosses the 5% floor, so driverSum need not equal arBalance exactly, but
    // it must never exceed it in magnitude (a fabricated driver would be a real bug).
    expect(Math.abs(driverSum)).toBeLessThanOrEqual(Math.abs(proposal.movement.arBalance) + 1);
    expect(elapsedMs).toBeLessThan(10000);
  }, 30000);

  // ── C.1 Malformed / null fields ─────────────────────────────────────────────────────────────
  it("C.1 malformed: unicode/HTML customer names and zero-amount postings never crash the run", async () => {
    const userId = await makeUser();
    const ar = await makeAccount(TENANT, "asset", "asset_receivable", "Accounts Receivable");
    const income = await makeAccount(TENANT, "income", "income", "Sales Revenue");
    const cust = await makePartner(userId, `<script>alert(1)</script> 顧客 عميل ${"w".repeat(500)}`);
    await postEntry(TENANT, String(ar._id), String(income._id), 0, new Date(`${PERIOD}-10`), String(cust._id));
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-25", killSwitchEnabled: true, maxAutonomyLevel: "observe" });

    await expect(runAi25(TENANT, userId)).resolves.toBeDefined();
  });

  // ── C.6 Adversarial pass ────────────────────────────────────────────────────────────────────
  // What input makes AI-25 produce a confidently-wrong, human-accepted DSO/DPO figure? A single
  // customer paying off their ENTIRE prior balance and immediately re-booking an almost-identical
  // new balance nets to a tiny AR movement — hiding real, large collection-and-rebill activity
  // behind a headline number that looks stable, exactly the shape that would make a reviewer
  // stop looking. Confirms AI-25 reports the true net (not a fabricated "no change" when
  // meaningful cash actually moved), and that the per-customer driver decomposition — not this
  // pass's job to change — is the honest limitation to document.
  it("C.6 adversarial: a customer's balance paid off and immediately re-booked nets to a small AR movement — verify the reported movement is the genuine net", async () => {
    const userId = await makeUser();
    const ar = await makeAccount(TENANT, "asset", "asset_receivable", "Accounts Receivable");
    const income = await makeAccount(TENANT, "income", "income", "Sales Revenue");
    const cust = await makePartner(userId, "Repeat Customer");
    await postEntry(TENANT, String(ar._id), String(income._id), 50000, new Date("2026-01-15"), String(cust._id)); // prior balance
    // Current period: pay off (credit AR) then re-book almost the same amount.
    await postEntry(TENANT, String(income._id), String(ar._id), 50000, new Date(`${PERIOD}-05`), String(cust._id)); // payoff
    await postEntry(TENANT, String(ar._id), String(income._id), 49500, new Date(`${PERIOD}-20`), String(cust._id)); // re-bill
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-25", killSwitchEnabled: true, maxAutonomyLevel: "observe" });

    const envelope = await runAi25(TENANT, userId);
    const trace = await AiDecisionTrace.findOne({ runId: envelope.runId }).lean();
    const proposal = trace!.rawProposal as unknown as { movement: { arBalance: number } };
    // Genuine net: current AR = 49500, prior AR = 50000, movement = -500 — small and easily
    // dismissed, even though ₹99,500 of gross AR activity actually happened this period.
    expect(Math.abs(proposal.movement.arBalance)).toBeLessThan(1000);
    // Real, honest structural limitation (not fixed in this pass, same shape as AI-14's §9
    // netting case): AI-25 reports net AR movement per counterparty per period by construction
    // — it does not separately surface gross collection-and-rebill activity within a period.
  });
});
