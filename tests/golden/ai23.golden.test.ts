import { describe, expect, it, beforeAll, afterAll } from "vitest";
import mongoose from "mongoose";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_ai23golden";

import Account from "@/models/finance/Account";
import JournalEntry from "@/models/finance/JournalEntry";
import AccountingSettings from "@/models/finance/AccountingSettings";
import User from "@/models/auth/User";
import AiWorkflowRun from "@/models/ai/AiWorkflowRun";
import AiDecisionTrace from "@/models/ai/AiDecisionTrace";
import AiEvent from "@/models/ai/AiEvent";
import AiToolCall from "@/models/ai/AiToolCall";
import AiWorkflowPolicy from "@/models/ai/AiWorkflowPolicy";
import { AI23_GOLDEN_CASES, GOLDEN_TENANT_PREFIX, type GoldenCase, type GoldenJournalSeed } from "@/tests/golden/ai23/goldenCases";

/**
 * The golden-dataset CI check for AI-23 (docs/ai/BRIEF-09-VERIFICATION.md 0.3). Unlike a normal
 * test (proves the code does what it did yesterday), this reports a PASS RATE across a named case
 * set and fails the whole run if it drops below `PASS_RATE_THRESHOLD` — the signal a scoring
 * change altered real behaviour, which a per-assertion test can miss if it only checks the cases
 * it happens to include.
 */

const PASS_RATE_THRESHOLD = 1.0; // AI-23's risk scoring (scoreJournalRisk.ts) is a pure function over already-fetched data — no model call in the loop, so 100% is the honest bar, same as AI-27.

let runWorkflow: typeof import("@/lib/aiRuntime/runtime/executor").runWorkflow;
let bootstrapAiRuntime: typeof import("@/lib/aiRuntime/bootstrap").bootstrapAiRuntime;
let ai23JournalReview: typeof import("@/lib/aiRuntime/workflows/ai-23-journal-review").ai23JournalReview;

async function makeAccounts(tenantId: string, accounts: GoldenCase["accounts"]) {
  const byKey = new Map<string, mongoose.Types.ObjectId>();
  for (const a of accounts) {
    const acc = await Account.create({ tenantId, name: a.name, code: `ACC-${Math.random().toString(36).slice(2, 8)}`, account_type: a.accountType, internal_group: a.internalGroup, isActive: true, isLocked: false, status: "active" });
    byKey.set(a.key, acc._id as mongoose.Types.ObjectId);
  }
  return byKey;
}

/** Posts a journal, then force-sets createdAt (Mongoose's timestamps plugin overrides any
 *  createdAt passed to .create() — same fix already established in ai23JournalReview.test.ts). */
async function postJournal(tenantId: string, journal: GoldenJournalSeed, accountsByKey: Map<string, mongoose.Types.ObjectId>) {
  let createdBy: mongoose.Types.ObjectId | undefined;
  let approvedBy: mongoose.Types.ObjectId | undefined;
  if (journal.samePreparerApprover) {
    const u = await User.create({ tenantId, name: "Same User", email: `same-user-${Date.now()}-${Math.random()}@x.com`, phone: "9999999999", password: "hashedpw", role: "finance", status: "active" });
    createdBy = u._id as mongoose.Types.ObjectId;
    approvedBy = createdBy;
  }
  const date = new Date(journal.date);
  const entry = await JournalEntry.create({
    tenantId,
    header: { name: journal.name, date, journalType: journal.journalType },
    status: "posted",
    voucherStatus: "posted",
    createdBy,
    approvalRequired: Boolean(approvedBy),
    approvalDetails: approvedBy ? { approvedBy, approvedAt: date } : undefined,
    lineIds: journal.lines.map((l) => ({ accountId: accountsByKey.get(l.accountKey), label: l.label ?? "", debit: l.debit, credit: l.credit })),
    totals: { amountUntaxed: 0, amountTax: 0, amountTotal: journal.lines.reduce((s, l) => s + l.debit, 0) },
  });
  await JournalEntry.collection.updateOne({ _id: entry._id }, { $set: { createdAt: date } });
  return entry;
}

async function seedCase(tenantId: string, goldenCase: GoldenCase) {
  const accountsByKey = await makeAccounts(tenantId, goldenCase.accounts);
  for (const j of goldenCase.baselineJournals) await postJournal(tenantId, j, accountsByKey);
  await postJournal(tenantId, goldenCase.target, accountsByKey);
}

describe("AI-23 golden dataset", () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI!);
    await Promise.all([
      Account.init(), JournalEntry.init(), AccountingSettings.init(), User.init(),
      AiWorkflowRun.init(), AiDecisionTrace.init(), AiEvent.init(), AiToolCall.init(), AiWorkflowPolicy.init(),
    ]);
    ({ runWorkflow } = await import("@/lib/aiRuntime/runtime/executor"));
    ({ bootstrapAiRuntime } = await import("@/lib/aiRuntime/bootstrap"));
    ({ ai23JournalReview } = await import("@/lib/aiRuntime/workflows/ai-23-journal-review"));
    bootstrapAiRuntime();
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  it(`reports a pass rate >= ${PASS_RATE_THRESHOLD * 100}% across ${AI23_GOLDEN_CASES.length} golden case(s)`, async () => {
    const results: { id: string; passed: boolean; reason?: string }[] = [];

    for (const goldenCase of AI23_GOLDEN_CASES) {
      const tenantId = `${GOLDEN_TENANT_PREFIX}-${goldenCase.id}`;
      await seedCase(tenantId, goldenCase);
      await AiWorkflowPolicy.create({ tenantId, workflowId: "AI-23", killSwitchEnabled: true, maxAutonomyLevel: "recommend" });

      const envelope = await runWorkflow(ai23JournalReview, {
        tenantId,
        eventKey: "period.horizon.reached",
        payload: { period: "golden", periodStart: goldenCase.periodStart, periodEnd: goldenCase.periodEnd },
      });

      const finding = envelope.findings.find((f) => f.title.includes(goldenCase.target.name));
      let passed = true;
      let reason: string | undefined;

      if (goldenCase.expected.findingRaised) {
        if (!finding) {
          passed = false;
          reason = "expected a finding, none raised";
        } else {
          if (goldenCase.expected.severity && finding.severity !== goldenCase.expected.severity) {
            passed = false;
            reason = `severity ${finding.severity} !== expected ${goldenCase.expected.severity}`;
          }
          for (const dim of goldenCase.expected.dimensions ?? []) {
            if (!finding.reasonChain.some((rc) => rc.startsWith(`${dim}:`))) {
              passed = false;
              reason = `${reason ? reason + "; " : ""}missing dimension "${dim}" in reasonChain: ${JSON.stringify(finding.reasonChain)}`;
            }
          }
        }
      } else if (finding) {
        passed = false;
        reason = `expected no finding, got: ${JSON.stringify({ severity: finding.severity, detail: finding.detail })}`;
      }

      results.push({ id: goldenCase.id, passed, reason });
    }

    const passRate = results.filter((r) => r.passed).length / results.length;
    const failures = results.filter((r) => !r.passed);

    console.log(`AI-23 golden dataset: ${results.length - failures.length}/${results.length} passed (${Math.round(passRate * 100)}%)`, failures.length > 0 ? { failures } : "");

    expect(passRate, `golden dataset regressions: ${JSON.stringify(failures)}`).toBeGreaterThanOrEqual(PASS_RATE_THRESHOLD);
  });
});
