import { describe, expect, it, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";
import { execSync } from "node:child_process";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_ai21_edge";

import Account from "@/models/finance/Account";
import JournalEntry from "@/models/finance/JournalEntry";
import AiWorkflowRun from "@/models/ai/AiWorkflowRun";
import AiDecisionTrace from "@/models/ai/AiDecisionTrace";
import AiEvent from "@/models/ai/AiEvent";
import AiToolCall from "@/models/ai/AiToolCall";
import AiWorkflowPolicy from "@/models/ai/AiWorkflowPolicy";
import AiCloseState from "@/models/ai/AiCloseState";
import PeriodClosing from "@/models/finance/PeriodClosing";
import BankStatement from "@/models/finance/BankStatement";
import Asset from "@/models/finance/Asset";
import TaxRate from "@/models/finance/TaxRate";
import AiSchedule from "@/models/ai/AiSchedule";
import AiTaxTransaction from "@/models/ai/AiTaxTransaction";
import AiComplianceProfile from "@/models/ai/AiComplianceProfile";
import AiMaterialityPolicy from "@/models/ai/AiMaterialityPolicy";

let runWorkflow: typeof import("@/lib/aiRuntime/runtime/executor").runWorkflow;
let bootstrapAiRuntime: typeof import("@/lib/aiRuntime/bootstrap").bootstrapAiRuntime;
let ai21StatementIntelligence: typeof import("@/lib/aiRuntime/workflows/ai-21-statement-intelligence").ai21StatementIntelligence;
let annotateStatement: typeof import("@/lib/aiRuntime/statements/annotateStatement").annotateStatement;

const TENANT = "ai21-edge-tenant";

async function makeAccount(account_type: string, internal_group: string, name?: string) {
  const acc = await Account.create({ tenantId: TENANT, name: name ?? `Account ${account_type}`, code: `ACC-${Math.random().toString(36).slice(2, 8)}`, account_type, internal_group, isActive: true, isLocked: false, status: "active" });
  return acc._id as mongoose.Types.ObjectId;
}

describe("AI-21 — Financial statement intelligence: verification edge cases (docs/ai/BRIEF-09-VERIFICATION.md)", () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI!);
    await Promise.all([
      Account.init(), JournalEntry.init(), AiWorkflowRun.init(), AiDecisionTrace.init(), AiEvent.init(),
      AiToolCall.init(), AiWorkflowPolicy.init(), AiCloseState.init(), PeriodClosing.init(), BankStatement.init(),
      Asset.init(), TaxRate.init(), AiSchedule.init(), AiTaxTransaction.init(), AiComplianceProfile.init(), AiMaterialityPolicy.init(),
    ]);
    ({ runWorkflow } = await import("@/lib/aiRuntime/runtime/executor"));
    ({ bootstrapAiRuntime } = await import("@/lib/aiRuntime/bootstrap"));
    ({ ai21StatementIntelligence } = await import("@/lib/aiRuntime/workflows/ai-21-statement-intelligence"));
    ({ annotateStatement } = await import("@/lib/aiRuntime/statements/annotateStatement"));
    bootstrapAiRuntime();
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  afterEach(async () => {
    await Promise.all([
      Account.deleteMany({}), JournalEntry.deleteMany({}), AiWorkflowRun.deleteMany({}), AiDecisionTrace.deleteMany({}),
      AiEvent.deleteMany({}), AiToolCall.deleteMany({}), AiWorkflowPolicy.deleteMany({}), AiCloseState.deleteMany({}),
      PeriodClosing.deleteMany({}), BankStatement.deleteMany({}), Asset.deleteMany({}), TaxRate.deleteMany({}),
      AiSchedule.deleteMany({}), AiTaxTransaction.deleteMany({}), AiComplianceProfile.deleteMany({}), AiMaterialityPolicy.deleteMany({}),
    ]);
  });

  // ── C.2 / C.4 defect class 2: unvalidated period.horizon.reached payload ──────────────────
  it("malformed event.payload.period ('garbage', not YYYY-MM) never reaches monthBounds() as NaN — no uncaught Mongoose CastError on JournalEntry.find (regression, this workflow's own §9 bug)", async () => {
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-21", killSwitchEnabled: true, maxAutonomyLevel: "observe" });
    const e1 = await runWorkflow(ai21StatementIntelligence, { tenantId: TENANT, eventKey: "period.horizon.reached", payload: { period: "garbage" } });
    expect(e1.status).not.toBe("failed");
    const e2 = await runWorkflow(ai21StatementIntelligence, { tenantId: TENANT, eventKey: "period.horizon.reached", payload: { period: "2026-13" } }); // month 13 doesn't exist
    expect(e2.status).not.toBe("failed");
    const e3 = await runWorkflow(ai21StatementIntelligence, { tenantId: TENANT, eventKey: "ai.sweep.hourly", payload: {} });
    expect(e3.status).not.toBe("failed");
  });

  // ── C.4 cross-tenant hostile input (defect class 1) ────────────────────────────────────────
  it("no externally-supplied id from the event payload is ever resolved via an unscoped DB read — AI-21 takes no subject id at all, only a period string (structural, source-grep)", () => {
    const output = execSync(String.raw`grep -n "findById" lib/aiRuntime/workflows/ai-21-statement-intelligence/index.ts lib/aiRuntime/statements/*.ts || true`, { cwd: process.cwd(), encoding: "utf-8" });
    expect(output.trim()).toBe("");
  });

  // ── C.3 concurrent duplicate event ─────────────────────────────────────────────────────────
  it("the same triggerEventId fired concurrently twice still produces exactly one AiWorkflowRun (the executor's own duplicate-key race on the losing caller is a known, reported executor-level gap — see this record's §9)", async () => {
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-21", killSwitchEnabled: true, maxAutonomyLevel: "observe" });
    const eventId = new mongoose.Types.ObjectId();
    const event = { id: String(eventId), tenantId: TENANT, eventKey: "period.horizon.reached", payload: { period: "2026-01" } };
    const results = await Promise.allSettled([runWorkflow(ai21StatementIntelligence, event), runWorkflow(ai21StatementIntelligence, event)]);
    expect(results.some((r) => r.status === "fulfilled")).toBe(true);
    const runCount = await AiWorkflowRun.countDocuments({ tenantId: TENANT, workflowId: "AI-21", triggerEventId: eventId });
    expect(runCount).toBe(1);
  });

  // ── C.1 Large volume: 10k+ journal lines across many accounts ─────────────────────────────
  it("large volume: 10,000 posted journal entries across 50 accounts annotate correctly within a generous dev-box budget (C.1 Large; shared-machine timing per docs/ai/UI_REGRESSION.md)", async () => {
    const accounts = await Promise.all(Array.from({ length: 50 }, (_, i) => makeAccount(i % 2 === 0 ? "asset_cash" : "equity", i % 2 === 0 ? "asset" : "equity", `Bulk Acc ${i}`)));
    const bulk = Array.from({ length: 10000 }, (_, i) => {
      const a = accounts[i % 50];
      const b = accounts[(i + 1) % 50];
      return {
        tenantId: TENANT,
        header: { name: `JE-BULK-${i}`, date: new Date("2026-01-15"), journalType: "general" },
        status: "posted",
        voucherStatus: "posted",
        lineIds: [{ accountId: a, label: "bulk", debit: 100, credit: 0 }, { accountId: b, label: "bulk", debit: 0, credit: 100 }],
        totals: { amountUntaxed: 100, amountTax: 0, amountTotal: 100 },
      };
    });
    await JournalEntry.insertMany(bulk);
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-21", killSwitchEnabled: true, maxAutonomyLevel: "observe" });

    const start = Date.now();
    const envelope = await runWorkflow(ai21StatementIntelligence, { tenantId: TENANT, eventKey: "period.horizon.reached", payload: { period: "2026-01" } });
    const elapsedMs = Date.now() - start;

    expect(envelope.status).not.toBe("failed");
    const finding = envelope.findings.find((f) => f.title.includes("does not balance"));
    expect(finding).toBeUndefined(); // every JE self-balances, so the aggregate balance sheet must too
    expect(elapsedMs).toBeLessThan(30000);
  }, 40000);

  // ── C.6 Adversarial: a balance sheet that balances in AGGREGATE while an individual material
  //      control account is silently unsupported must still flag the line, not stop at "balanced" ──
  it("adversarial: balance sheet balances in total (a confidently-reassuring aggregate) while a material control line is unsupported underneath — still flagged, never hidden by the aggregate check", async () => {
    const cash = await makeAccount("asset_cash", "asset");
    const controlAcc = await makeAccount("liability_payable", "liability", "AP Control");
    const equity = await makeAccount("equity", "equity");
    // Two entries that keep the WHOLE balance sheet balanced (debits==credits overall) while the
    // AP control account itself nets to zero GL activity — the exact "aggregate looks fine"
    // shape a human skimming only the balance check would accept.
    await JournalEntry.create({
      tenantId: TENANT,
      header: { name: "JE-A", date: new Date("2026-01-10"), journalType: "general" },
      status: "posted", voucherStatus: "posted",
      lineIds: [{ accountId: cash, label: "x", debit: 10000, credit: 0 }, { accountId: equity, label: "x", debit: 0, credit: 10000 }],
      totals: { amountUntaxed: 10000, amountTax: 0, amountTotal: 10000 },
    });
    await JournalEntry.create({
      tenantId: TENANT,
      header: { name: "JE-B", date: new Date("2026-01-11"), journalType: "general" },
      status: "posted", voucherStatus: "posted",
      lineIds: [{ accountId: controlAcc, label: "x", debit: 500, credit: 0 }, { accountId: controlAcc, label: "x", debit: 0, credit: 500 }],
      totals: { amountUntaxed: 500, amountTax: 0, amountTotal: 500 },
    });
    // Seed an AI-14 comparison marking the control account as a material, unreconciled variance.
    const run = await AiWorkflowRun.create({
      tenantId: TENANT, workflowId: "AI-14", workflowVersion: "1.0.0", entityId: TENANT, status: "completed",
      autonomyApplied: "observe", summary: "seed", findings: [], metrics: { scanned: 1, matched: 0, exceptions: 0, autoActioned: 0, policy_overrides: 0 },
      startedAt: new Date(), finishedAt: new Date(),
    });
    await AiDecisionTrace.create({
      tenantId: TENANT, runId: run._id, workflowId: "AI-14", workflowVersion: "1.0.0", inputsHash: "seed",
      reasonChain: [], rawProposal: { comparisons: [{ accountId: String(controlAcc), materialityVerdict: "material", variance: 5000, unexplainedAmount: 5000, drivers: [] }] },
      confidenceComponents: {}, finalOutcome: "completed",
    });

    const annotated = await annotateStatement(TENANT, "2026-01", "balance_sheet");
    expect(annotated.balanceCheck!.balanced).toBe(true); // the aggregate looks reassuring
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-21", killSwitchEnabled: true, maxAutonomyLevel: "observe" });
    const envelope = await runWorkflow(ai21StatementIntelligence, { tenantId: TENANT, eventKey: "period.horizon.reached", payload: { period: "2026-01" } });
    const unsupported = envelope.findings.find((f) => f.title.includes("Unsupported material line"));
    expect(unsupported).toBeDefined(); // the workflow does not stop at "balanced" and go silent
  });
});
