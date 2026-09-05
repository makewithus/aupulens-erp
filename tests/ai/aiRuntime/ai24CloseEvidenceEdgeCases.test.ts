import { describe, expect, it, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";
import { execSync } from "node:child_process";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_ai24_edge";

import Account from "@/models/finance/Account";
import BankStatement from "@/models/finance/BankStatement";
import JournalEntry from "@/models/finance/JournalEntry";
import PeriodClosing from "@/models/finance/PeriodClosing";
import AiMaterialityPolicy from "@/models/ai/AiMaterialityPolicy";
import AiCloseAssertion from "@/models/ai/AiCloseAssertion";
import AiAttentionItem from "@/models/ai/AiAttentionItem";
import AiWorkflowRun from "@/models/ai/AiWorkflowRun";
import AiDecisionTrace from "@/models/ai/AiDecisionTrace";
import AiEvent from "@/models/ai/AiEvent";
import AiToolCall from "@/models/ai/AiToolCall";
import AiWorkflowPolicy from "@/models/ai/AiWorkflowPolicy";
import User from "@/models/auth/User";

let runWorkflow: typeof import("@/lib/aiRuntime/runtime/executor").runWorkflow;
let bootstrapAiRuntime: typeof import("@/lib/aiRuntime/bootstrap").bootstrapAiRuntime;
let ai24CloseEvidence: typeof import("@/lib/aiRuntime/workflows/ai-24-close-evidence").ai24CloseEvidence;

const TENANT = "ai24-edge-tenant";

async function makeAccount(tenantId: string, account_type: string) {
  const acc = await Account.create({ tenantId, name: `Account ${account_type}`, code: `ACC-${Math.random().toString(36).slice(2, 8)}`, account_type, isActive: true, isLocked: false, status: "active" });
  return String(acc._id);
}
async function makeUser(tenantId: string) {
  const u = await User.create({ tenantId, name: "Finance User", email: `f-${Date.now()}-${Math.random()}@example.com`, phone: "9999999999", password: "hashed", role: "finance", status: "active" });
  return String(u._id);
}

describe("AI-24 — Close evidence controller: verification edge cases (docs/ai/BRIEF-09-VERIFICATION.md)", () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI!);
    await Promise.all([
      Account.init(), BankStatement.init(), JournalEntry.init(), PeriodClosing.init(),
      AiMaterialityPolicy.init(), AiCloseAssertion.init(), AiAttentionItem.init(), AiWorkflowRun.init(),
      AiDecisionTrace.init(), AiEvent.init(), AiToolCall.init(), AiWorkflowPolicy.init(), User.init(),
    ]);
    ({ runWorkflow } = await import("@/lib/aiRuntime/runtime/executor"));
    ({ bootstrapAiRuntime } = await import("@/lib/aiRuntime/bootstrap"));
    ({ ai24CloseEvidence } = await import("@/lib/aiRuntime/workflows/ai-24-close-evidence"));
    bootstrapAiRuntime();
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  afterEach(async () => {
    await Promise.all([
      Account.deleteMany({}), BankStatement.deleteMany({}), JournalEntry.deleteMany({}), PeriodClosing.deleteMany({}),
      AiMaterialityPolicy.deleteMany({}), AiCloseAssertion.deleteMany({}), AiAttentionItem.deleteMany({}), AiWorkflowRun.deleteMany({}),
      AiDecisionTrace.deleteMany({}), AiEvent.deleteMany({}), AiToolCall.deleteMany({}), AiWorkflowPolicy.deleteMany({}), User.deleteMany({}),
    ]);
  });

  // ── C.2 / C.4 defect class 2: unvalidated period.horizon.reached payload ──────────────────
  it("malformed event.payload.period ('garbage') and a malformed event.payload.periodEnd both never reach Date.UTC as NaN — no uncaught Mongoose CastError (regression, this workflow's own §9 bug)", async () => {
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-24", killSwitchEnabled: true, maxAutonomyLevel: "observe" });
    const e1 = await runWorkflow(ai24CloseEvidence, { tenantId: TENANT, eventKey: "period.horizon.reached", payload: { period: "garbage" } });
    expect(e1.status).not.toBe("failed");
    const e2 = await runWorkflow(ai24CloseEvidence, { tenantId: TENANT, eventKey: "period.horizon.reached", payload: { period: "2026-03", periodEnd: "not-a-date" } });
    expect(e2.status).not.toBe("failed");
    const assertions = await AiCloseAssertion.find({ tenantId: TENANT, period: "2026-03" }).lean();
    expect(assertions.length).toBeGreaterThan(0);
  });

  // ── C.4 cross-tenant hostile input (defect class 1) ────────────────────────────────────────
  it("no externally-supplied id from the event payload is ever resolved via an unscoped DB read — AI-24 takes no subject id at all, only a period string (structural, source-grep)", () => {
    const output = execSync(String.raw`grep -n "findById" lib/aiRuntime/workflows/ai-24-close-evidence/index.ts lib/aiRuntime/evidence/*.ts || true`, { cwd: process.cwd(), encoding: "utf-8" });
    expect(output.trim()).toBe("");
  });

  // ── C.3 concurrent duplicate event ─────────────────────────────────────────────────────────
  it("the same triggerEventId fired concurrently twice still produces exactly one AiWorkflowRun and no duplicate AiAttentionItem (persistent dedupeKey holds; the executor's own duplicate-key race on the losing caller is a known, reported executor-level gap — see this record's §9)", async () => {
    const bankAccountId = await makeAccount(TENANT, "asset_cash");
    await BankStatement.create({ tenantId: TENANT, header: { name: "STMT", journalId: bankAccountId, date: new Date(), balance_start: 0, balance_end_real: 5000 }, lineIds: [], status: "draft" });
    const userId = await makeUser(TENANT);
    await AiMaterialityPolicy.create({ tenantId: TENANT, thresholds: [{ appliesTo: "bank", absoluteAmount: 100 }] });
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-24", killSwitchEnabled: true, maxAutonomyLevel: "observe" });

    const eventId = new mongoose.Types.ObjectId();
    const event = { id: String(eventId), tenantId: TENANT, eventKey: "period.horizon.reached", payload: { period: "2026-01", periodEnd: new Date("2026-01-31T23:59:59Z").toISOString(), actingUserId: userId } };
    const results = await Promise.allSettled([runWorkflow(ai24CloseEvidence, event), runWorkflow(ai24CloseEvidence, event)]);
    expect(results.some((r) => r.status === "fulfilled")).toBe(true);
    const runCount = await AiWorkflowRun.countDocuments({ tenantId: TENANT, workflowId: "AI-24", triggerEventId: eventId });
    expect(runCount).toBe(1);
    const items = await AiAttentionItem.find({ tenantId: TENANT, dedupeKey: "ai24:bank_reconciled:2026-01" }).lean();
    expect(items).toHaveLength(1);
  });

  // ── C.1 Large volume: 10k+ journal entries feeding the assertion evaluator ────────────────
  it("large volume: 10,000 posted journal entries evaluate correctly within a generous dev-box budget (C.1 Large; shared-machine timing per docs/ai/UI_REGRESSION.md)", async () => {
    const bankAccountId = await makeAccount(TENANT, "asset_cash");
    const expenseAccountId = await makeAccount(TENANT, "expense");
    await BankStatement.create({ tenantId: TENANT, header: { name: "STMT-BULK", journalId: bankAccountId, date: new Date(), balance_start: 0, balance_end_real: 500000 }, lineIds: [], status: "draft" });
    const bulk = Array.from({ length: 10000 }, (_, i) => ({
      tenantId: TENANT,
      header: { name: `JE-BULK-${i}`, date: new Date("2026-01-15"), journalType: "general" },
      status: "posted",
      voucherStatus: "posted",
      lineIds: [
        { accountId: bankAccountId, label: "bulk", debit: 50, credit: 0 },
        { accountId: expenseAccountId, label: "bulk", debit: 0, credit: 50 },
      ],
      totals: { amountUntaxed: 50, amountTax: 0, amountTotal: 50 },
    }));
    await JournalEntry.insertMany(bulk);
    await AiMaterialityPolicy.create({ tenantId: TENANT, thresholds: [{ appliesTo: "bank", absoluteAmount: 100 }] });
    const userId = await makeUser(TENANT);
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-24", killSwitchEnabled: true, maxAutonomyLevel: "observe" });

    const start = Date.now();
    const envelope = await runWorkflow(ai24CloseEvidence, { tenantId: TENANT, eventKey: "period.horizon.reached", payload: { period: "2026-01", periodEnd: new Date("2026-01-31T23:59:59Z").toISOString(), actingUserId: userId } });
    const elapsedMs = Date.now() - start;

    expect(envelope.status).not.toBe("failed");
    const assertion = await AiCloseAssertion.findOne({ tenantId: TENANT, period: "2026-01", item: "bank_reconciled" }).lean();
    expect(assertion!.verified).toBe(true); // 10,000 x 50 == statement's ending balance exactly
    expect(elapsedMs).toBeLessThan(30000);
  }, 40000);

  // ── C.6 Adversarial: a document that superficially matches the missing amount but was never
  //      actually posted must not be accepted as evidence — only real, posted GL activity counts.
  it("adversarial: a matching-amount JOURNAL ENTRY that is still DRAFT (never posted) does not falsely verify the assertion", async () => {
    const bankAccountId = await makeAccount(TENANT, "asset_cash");
    await BankStatement.create({ tenantId: TENANT, header: { name: "STMT", journalId: bankAccountId, date: new Date(), balance_start: 0, balance_end_real: 5000 }, lineIds: [], status: "draft" });
    const expenseAccountId = await makeAccount(TENANT, "expense");
    // Same accounts, same amount as would be required to close the gap — but never posted. A
    // workflow that reads draft/unposted entries as if they were real GL activity would produce
    // exactly the "confidently wrong" verified:true a human reviewer would accept at face value.
    await JournalEntry.create({
      tenantId: TENANT,
      header: { name: `JE-DRAFT-ONLY`, date: new Date("2026-01-15"), journalType: "general" },
      status: "draft",
      voucherStatus: "draft",
      lineIds: [{ accountId: bankAccountId, label: "x", debit: 5000, credit: 0 }, { accountId: expenseAccountId, label: "x", debit: 0, credit: 5000 }],
      totals: { amountUntaxed: 5000, amountTax: 0, amountTotal: 5000 },
    });
    const userId = await makeUser(TENANT);
    await AiMaterialityPolicy.create({ tenantId: TENANT, thresholds: [{ appliesTo: "bank", absoluteAmount: 100 }] });
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-24", killSwitchEnabled: true, maxAutonomyLevel: "observe" });

    await runWorkflow(ai24CloseEvidence, { tenantId: TENANT, eventKey: "period.horizon.reached", payload: { period: "2026-01", periodEnd: new Date("2026-01-31T23:59:59Z").toISOString(), actingUserId: userId } });
    const assertion = await AiCloseAssertion.findOne({ tenantId: TENANT, period: "2026-01", item: "bank_reconciled" }).lean();
    expect(assertion!.verified).toBe(false);
  });

  // Documented, not a bug: the bank check (lib/aiRuntime/reconciliation/definitions.ts "bank")
  // compares the bank statement's stated ending balance against ALL posted GL activity on the
  // account to date — it is a continuous, as-of-now reconciliation (matching AI-22's own
  // "continuous reconciliation" design), never fenced to entries dated inside the period being
  // evaluated. A posted entry dated in a later period therefore legitimately clears an earlier
  // period's assertion too — this is intentional (the bank balance IS the bank balance,
  // regardless of which period the offsetting GL correction was dated), not a period-boundary bug.
  it("documents (not a bug): a posted GL entry dated in a LATER period still clears an EARLIER period's bank assertion — the check is continuous-balance, not period-fenced, by design", async () => {
    const bankAccountId = await makeAccount(TENANT, "asset_cash");
    await BankStatement.create({ tenantId: TENANT, header: { name: "STMT", journalId: bankAccountId, date: new Date(), balance_start: 0, balance_end_real: 5000 }, lineIds: [], status: "draft" });
    const expenseAccountId = await makeAccount(TENANT, "expense");
    await JournalEntry.create({
      tenantId: TENANT,
      header: { name: `JE-LATER-PERIOD`, date: new Date("2026-02-15"), journalType: "general" },
      status: "posted",
      voucherStatus: "posted",
      lineIds: [{ accountId: bankAccountId, label: "x", debit: 5000, credit: 0 }, { accountId: expenseAccountId, label: "x", debit: 0, credit: 5000 }],
      totals: { amountUntaxed: 5000, amountTax: 0, amountTotal: 5000 },
    });
    const userId = await makeUser(TENANT);
    await AiMaterialityPolicy.create({ tenantId: TENANT, thresholds: [{ appliesTo: "bank", absoluteAmount: 100 }] });
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-24", killSwitchEnabled: true, maxAutonomyLevel: "observe" });

    await runWorkflow(ai24CloseEvidence, { tenantId: TENANT, eventKey: "period.horizon.reached", payload: { period: "2026-01", periodEnd: new Date("2026-01-31T23:59:59Z").toISOString(), actingUserId: userId } });
    const assertion = await AiCloseAssertion.findOne({ tenantId: TENANT, period: "2026-01", item: "bank_reconciled" }).lean();
    expect(assertion!.verified).toBe(true);
  });
});
