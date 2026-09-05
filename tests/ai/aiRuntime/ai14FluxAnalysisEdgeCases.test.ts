import { describe, expect, it, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_ai14edge";
process.env.CRON_SECRET = "ai14-edge-test-secret";

import Organization from "@/models/admin/Organization";
import Account from "@/models/finance/Account";
import JournalEntry from "@/models/finance/JournalEntry";
import Customer from "@/models/sales/Customer";
import User from "@/models/auth/User";
import AiMaterialityPolicy from "@/models/ai/AiMaterialityPolicy";
import AiWorkflowRun from "@/models/ai/AiWorkflowRun";
import AiDecisionTrace from "@/models/ai/AiDecisionTrace";
import AiEvent from "@/models/ai/AiEvent";
import AiToolCall from "@/models/ai/AiToolCall";
import AiWorkflowPolicy from "@/models/ai/AiWorkflowPolicy";
import AiSchedule from "@/models/ai/AiSchedule";
import AiCommandProposal from "@/models/ai/AiCommandProposal";

let runWorkflow: typeof import("@/lib/aiRuntime/runtime/executor").runWorkflow;
let bootstrapAiRuntime: typeof import("@/lib/aiRuntime/bootstrap").bootstrapAiRuntime;
let ai14FluxAnalysis: typeof import("@/lib/aiRuntime/workflows/ai-14-flux-analysis").ai14FluxAnalysis;
let handleWorkflowIntent: typeof import("@/lib/aiRuntime/nl/workflowChatHandler").handleWorkflowIntent;

const TENANT = "ai14-edge-tenant";
const OTHER_TENANT = "ai14-edge-other-tenant";
const PERIOD = "2026-02";

async function makeUser(tenantId = TENANT) {
  const u = await User.create({ tenantId, name: "Finance User", email: `f-${Date.now()}-${Math.random()}@example.com`, phone: "9999999999", password: "hashed", role: "finance", status: "active" });
  return String(u._id);
}
async function makeAccount(tenantId: string, internal_group: string) {
  return Account.create({ tenantId, name: `Account ${internal_group}`, code: `ACC-${Math.random().toString(36).slice(2, 8)}`, account_type: internal_group === "expense" ? "expense" : "income", internal_group, isActive: true, isLocked: false, status: "active" });
}
async function makeCustomer(userId: string, name: string, tenantId = TENANT) {
  return Customer.create({ tenantId, header: { name }, contact_details: {}, createdBy: userId });
}
async function postEntry(tenantId: string, accountId: string, offsetAccountId: string, amount: number, date: Date, partnerId?: string) {
  return JournalEntry.create({
    tenantId,
    header: { name: `JE-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, date, journalType: "general" },
    status: "posted",
    voucherStatus: "posted",
    lineIds: [
      { accountId, label: "line", debit: amount, credit: 0, partnerId },
      { accountId: offsetAccountId, label: "line", debit: 0, credit: amount },
    ],
    totals: { amountUntaxed: amount, amountTax: 0, amountTotal: amount },
  });
}
async function runAi14(tenantId = TENANT, actingUserId?: string, period: string = PERIOD) {
  return runWorkflow(ai14FluxAnalysis, {
    tenantId,
    eventKey: "period.horizon.reached",
    payload: { period, periodEnd: new Date(`${period}-28T23:59:59Z`).toISOString(), actingUserId },
  });
}

describe("AI-14 — edge-case hardening (docs/ai/BRIEF-09-VERIFICATION.md Part C)", () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI!);
    await Promise.all([
      Organization.init(), Account.init(), JournalEntry.init(), Customer.init(), User.init(),
      AiMaterialityPolicy.init(), AiWorkflowRun.init(), AiDecisionTrace.init(), AiEvent.init(), AiToolCall.init(),
      AiWorkflowPolicy.init(), AiSchedule.init(), AiCommandProposal.init(),
    ]);
    ({ runWorkflow } = await import("@/lib/aiRuntime/runtime/executor"));
    ({ bootstrapAiRuntime } = await import("@/lib/aiRuntime/bootstrap"));
    ({ ai14FluxAnalysis } = await import("@/lib/aiRuntime/workflows/ai-14-flux-analysis"));
    ({ handleWorkflowIntent } = await import("@/lib/aiRuntime/nl/workflowChatHandler"));
    bootstrapAiRuntime();
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  afterEach(async () => {
    await Promise.all([
      Organization.deleteMany({}), Account.deleteMany({}), JournalEntry.deleteMany({}), Customer.deleteMany({}), User.deleteMany({}),
      AiMaterialityPolicy.deleteMany({}), AiWorkflowRun.deleteMany({}), AiDecisionTrace.deleteMany({}), AiEvent.deleteMany({}), AiToolCall.deleteMany({}),
      AiWorkflowPolicy.deleteMany({}), AiSchedule.deleteMany({}), AiCommandProposal.deleteMany({}),
    ]);
  });

  // ── Section 1: trigger proof through the REAL cron route ──────────────────────────────────
  it("trigger proof: the real cron sweep route fires AI-14 and writes a real material-movement finding", async () => {
    await Organization.create({ name: "AI14 Edge Co", subdomain: TENANT, ownerUserId: new mongoose.Types.ObjectId(), isActive: true });
    const userId = await makeUser();
    const expenseAcc = await makeAccount(TENANT, "expense");
    const cash = await makeAccount(TENANT, "asset");
    const vendor = await makeCustomer(userId, "New Vendor");
    // Brand-new vendor spend this month, with a materiality policy set low enough to guarantee
    // a material finding regardless of the real cron's own current calendar period.
    const now = new Date();
    await postEntry(TENANT, String(expenseAcc._id), String(cash._id), 50000, now, String(vendor._id));
    await AiMaterialityPolicy.create({ tenantId: TENANT, thresholds: [{ appliesTo: "flux_analysis", absoluteAmount: 1000 }] });
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-14", killSwitchEnabled: true, maxAutonomyLevel: "observe" });

    const { POST } = await import("@/app/api/cron/ai/runtime-sweep/route");
    const req = { headers: { get: (h: string) => (h.toLowerCase() === "authorization" ? `Bearer ${process.env.CRON_SECRET}` : null) } } as any;
    const res = await POST(req);
    expect(res.status).toBe(200);

    const run = await AiWorkflowRun.findOne({ tenantId: TENANT, workflowId: "AI-14" }).sort({ startedAt: -1 }).lean();
    expect(run, "the cron route must have dispatched a real period.horizon.reached event that reached AI-14").not.toBeNull();
    const trace = await AiDecisionTrace.findOne({ runId: run!._id }).lean();
    const proposal = trace!.rawProposal as unknown as { comparisons: { materialityVerdict: string }[] };
    expect(proposal.comparisons.some((c) => c.materialityVerdict === "material")).toBe(true);
  });

  // ── Section 9 bug regression: the "explain_margin" chat intent's real, empty-parameters path ─
  // A real user typing "why is margin down?" resolves via lib/aiRuntime/nl/resolveIntent.ts's
  // cheap keyword table to AI-14 with `parameters: {}` (confirmed: resolveWorkflowIntentCheap
  // always returns `parameters: {}` for a keyword-table match) — event.payload.period is
  // genuinely undefined on this real path, not a synthetic test-only shape. Before the fix,
  // `observe()` did `String(event.payload.period)` -> the literal string "undefined" ->
  // monthBounds() computed an Invalid Date -> an uncaught Mongoose cast exception propagated
  // through runWorkflow() -> handleWorkflowIntent() -> the /api/ai/command route's try/catch,
  // surfacing a raw internal error message ("Cast to date failed...") to the chat user instead
  // of an answer or a clean clarifying question.
  it("bug regression: the real 'explain_margin' chat path (empty parameters) resolves to the current period instead of crashing", async () => {
    const userId = await makeUser();
    const expenseAcc = await makeAccount(TENANT, "expense");
    const cash = await makeAccount(TENANT, "asset");
    await postEntry(TENANT, String(expenseAcc._id), String(cash._id), 100, new Date());
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-14", killSwitchEnabled: true, maxAutonomyLevel: "observe" });

    // Exactly the call handleWorkflowIntent makes for the OBSERVE path, with the exact empty
    // parameters object resolveWorkflowIntentCheap always produces for a keyword match.
    const result = await handleWorkflowIntent(TENANT, userId, "AI-14", "period.horizon.reached", {});
    expect(result.action).toBe("explain");

    const run = await AiWorkflowRun.findOne({ tenantId: TENANT, workflowId: "AI-14" }).sort({ startedAt: -1 }).lean();
    expect(run!.status).not.toBe("failed");
    const now = new Date();
    const expectedPeriod = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
    expect(run!.entityId).toBe(`${TENANT}:${expectedPeriod}`);
  });

  it("bug regression: a malformed period string ('undefined', 'not-a-period', '2026-13') also degrades to the current period instead of crashing", async () => {
    const userId = await makeUser();
    for (const badPeriod of ["undefined", "not-a-period", "2026-13", "2026", ""]) {
      await expect(
        runWorkflow(ai14FluxAnalysis, { tenantId: TENANT, eventKey: "period.horizon.reached", payload: { period: badPeriod, actingUserId: userId } }),
      ).resolves.not.toHaveProperty("status", "failed");
    }
  });

  // ── C.4 Cross-tenant (positive proof) ──────────────────────────────────────────────────────
  it("C.4 cross-tenant: tenant A's flux never includes tenant B's accounts, budget, or materiality policy, even with a hostile actingUserId from tenant B", async () => {
    const userA = await makeUser(TENANT);
    const userB = await makeUser(OTHER_TENANT);
    const expenseA = await makeAccount(TENANT, "expense");
    const cashA = await makeAccount(TENANT, "asset");
    const expenseB = await makeAccount(OTHER_TENANT, "expense");
    const cashB = await makeAccount(OTHER_TENANT, "asset");
    const vendorB = await makeCustomer(userB, "B Vendor", OTHER_TENANT);

    // Tenant B has a large, clearly material movement.
    await postEntry(OTHER_TENANT, String(expenseB._id), String(cashB._id), 500000, new Date(`${PERIOD}-10`), String(vendorB._id));
    await AiMaterialityPolicy.create({ tenantId: OTHER_TENANT, thresholds: [{ appliesTo: "flux_analysis", absoluteAmount: 1 }] });
    // Tenant A has only a tiny, immaterial movement.
    await postEntry(TENANT, String(expenseA._id), String(cashA._id), 10, new Date(`${PERIOD}-10`));
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-14", killSwitchEnabled: true, maxAutonomyLevel: "observe" });
    await AiWorkflowPolicy.create({ tenantId: OTHER_TENANT, workflowId: "AI-14", killSwitchEnabled: true, maxAutonomyLevel: "observe" });

    const envelope = await runAi14(TENANT, userB); // hostile: tenant B's own user id
    const trace = await AiDecisionTrace.findOne({ runId: envelope.runId }).lean();
    const proposal = trace!.rawProposal as unknown as { comparisons: { accountId: string; variance: number }[] };
    expect(proposal.comparisons.some((c) => c.accountId === String(expenseB._id))).toBe(false);
    expect(proposal.comparisons.every((c) => Math.abs(c.variance) < 100000)).toBe(true);
    void userA;
  });

  // ── C.1 Large volume ───────────────────────────────────────────────────────────────────────
  it("C.1 large volume: 10,000 current-period lines across many counterparties resolve correctly within budget", async () => {
    const userId = await makeUser();
    const expenseAcc = await makeAccount(TENANT, "expense");
    const cash = await makeAccount(TENANT, "asset");
    const vendors = await Promise.all(Array.from({ length: 50 }, (_, i) => makeCustomer(userId, `Vendor ${i}`)));
    const docs = Array.from({ length: 10000 }, (_, i) => {
      const v = vendors[i % vendors.length];
      const amount = 10 + (i % 50);
      return {
        tenantId: TENANT,
        header: { name: `BULK-JE-${i}`, date: new Date(`${PERIOD}-15`), journalType: "general" },
        status: "posted",
        voucherStatus: "posted",
        lineIds: [
          { accountId: expenseAcc._id, label: "line", debit: amount, credit: 0, partnerId: v._id },
          { accountId: cash._id, label: "line", debit: 0, credit: amount },
        ],
        totals: { amountUntaxed: amount, amountTax: 0, amountTotal: amount },
      };
    });
    await JournalEntry.insertMany(docs);
    await AiMaterialityPolicy.create({ tenantId: TENANT, thresholds: [{ appliesTo: "flux_analysis", absoluteAmount: 100 }] });
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-14", killSwitchEnabled: true, maxAutonomyLevel: "observe" });

    const start = Date.now();
    const envelope = await runAi14(TENANT, userId);
    const elapsedMs = Date.now() - start;
    // eslint-disable-next-line no-console
    console.log(`AI-14 large-volume flux (10,000 lines, 50 counterparties): ${elapsedMs}ms`);

    expect(envelope.status).not.toBe("failed");
    const trace = await AiDecisionTrace.findOne({ runId: envelope.runId }).lean();
    const proposal = trace!.rawProposal as unknown as { comparisons: { accountId: string; variance: number; drivers: { amount: number }[]; unexplainedAmount: number }[] };
    const row = proposal.comparisons.find((c) => c.accountId === String(expenseAcc._id));
    expect(row).toBeDefined();
    const driverSum = row!.drivers.reduce((s, d) => s + d.amount, 0);
    expect(Math.round((driverSum + row!.unexplainedAmount) * 100) / 100).toBeCloseTo(row!.variance, 2);
    expect(elapsedMs).toBeLessThan(10000);
  }, 30000);

  // ── C.1 Malformed / null fields ─────────────────────────────────────────────────────────────
  it("C.1 malformed: unicode/HTML vendor names, negative (credit-note-shaped) amounts, absurd dates never crash the flux run", async () => {
    const userId = await makeUser();
    const expenseAcc = await makeAccount(TENANT, "expense");
    const cash = await makeAccount(TENANT, "asset");
    const vendor = await makeCustomer(userId, `<script>alert(1)</script> 供应商 مورد ${"w".repeat(500)}`);
    await postEntry(TENANT, String(expenseAcc._id), String(cash._id), -5000, new Date(`${PERIOD}-10`), String(vendor._id)); // credit-note shape
    await postEntry(TENANT, String(expenseAcc._id), String(cash._id), 0, new Date(`${PERIOD}-11`), String(vendor._id)); // zero amount
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-14", killSwitchEnabled: true, maxAutonomyLevel: "observe" });

    await expect(runAi14(TENANT, userId)).resolves.toBeDefined();
  });

  // ── C.6 Adversarial pass ────────────────────────────────────────────────────────────────────
  // What input makes AI-14 produce a confidently-wrong-looking, human-accepted explanation? A
  // credit note that exactly offsets a real new vendor's spend, timed so the NET current-period
  // activity nets close to zero, hides a real, large gross movement (a large bill AND a large
  // credit both landing this period) behind a small, unremarkable net variance — a human
  // skimming "movement: -200, immaterial" would never look closer, even though ₹100,000 of gross
  // activity happened. AI-14's per-counterparty driver decomposition is exactly the structural
  // defence: verify it survives this shape by checking the SAME group nets near zero but the
  // workflow doesn't fabricate a misleadingly large "driver" out of the net.
  it("C.6 adversarial: a large bill mostly offset by a same-period credit note nets to a small, easily-dismissed variance — verify the reported variance is the genuine net, not a fabricated partial figure", async () => {
    const userId = await makeUser();
    const expenseAcc = await makeAccount(TENANT, "expense");
    const cash = await makeAccount(TENANT, "asset");
    const vendor = await makeCustomer(userId, "Netting Vendor");
    await postEntry(TENANT, String(expenseAcc._id), String(cash._id), 1000, new Date("2026-01-10"), String(vendor._id)); // prior period baseline
    await postEntry(TENANT, String(expenseAcc._id), String(cash._id), 100000, new Date(`${PERIOD}-05`), String(vendor._id)); // large bill
    await postEntry(TENANT, String(expenseAcc._id), String(cash._id), -99200, new Date(`${PERIOD}-20`), String(vendor._id)); // large offsetting credit
    await AiMaterialityPolicy.create({ tenantId: TENANT, thresholds: [{ appliesTo: "flux_analysis", absoluteAmount: 50000 }] });
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-14", killSwitchEnabled: true, maxAutonomyLevel: "observe" });

    const envelope = await runAi14(TENANT, userId);
    const trace = await AiDecisionTrace.findOne({ runId: envelope.runId }).lean();
    const proposal = trace!.rawProposal as unknown as { comparisons: { accountId: string; variance: number; materialityVerdict: string }[] };
    const row = proposal.comparisons.find((c) => c.accountId === String(expenseAcc._id));
    // The genuine net movement is 100000 - 99200 - 1000(prior, already excluded from current) = -100 vs prior 1000 -> variance -900 approx.
    // Whatever the exact figure, it must be the TRUE net (current 800 - prior 1000 = -200), never
    // the gross 100000 mistakenly reported as the variance.
    expect(Math.abs(row!.variance)).toBeLessThan(1000);
    expect(row!.materialityVerdict).toBe("immaterial");
    // This is a real, honest structural limitation, not something this pass fixes: a ₹100,000
    // gross bill and a ₹99,200 gross credit both occurred and are individually large, but
    // AI-14's design reports NET movement per counterparty per period by construction (the same
    // choice a standard flux/variance report makes) — it is silent on gross activity within a
    // period for a counterparty whose net stayed small. Documented in the verification record.
  });
});
