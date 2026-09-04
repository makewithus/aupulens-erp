import { describe, expect, it, beforeAll, afterAll } from "vitest";
import mongoose from "mongoose";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_ai15golden";

import Account from "@/models/finance/Account";
import JournalEntry from "@/models/finance/JournalEntry";
import Customer from "@/models/sales/Customer";
import User from "@/models/auth/User";
import AiAnomaly from "@/models/ai/AiAnomaly";
import AiDetectorHealth from "@/models/ai/AiDetectorHealth";
import AiAnomalySuppression from "@/models/ai/AiAnomalySuppression";
import AiAttentionItem from "@/models/ai/AiAttentionItem";
import AiWorkflowRun from "@/models/ai/AiWorkflowRun";
import AiDecisionTrace from "@/models/ai/AiDecisionTrace";
import AiEvent from "@/models/ai/AiEvent";
import AiToolCall from "@/models/ai/AiToolCall";
import AiWorkflowPolicy from "@/models/ai/AiWorkflowPolicy";
import AccountingSettings from "@/models/finance/AccountingSettings";
import { AI15_GOLDEN_CASES, GOLDEN_TENANT_PREFIX, GOLDEN_CREATOR, type GoldenCase } from "@/tests/golden/ai15/goldenCases";

/**
 * The golden-dataset CI check for AI-15 (docs/ai/BRIEF-09-VERIFICATION.md Part 0.3). Unlike a
 * normal test (proves the code does what it did yesterday), this reports a PASS RATE across a
 * named case set and fails the whole run if it drops below `PASS_RATE_THRESHOLD` — the signal a
 * change to any of AI-15's eleven detectors, or to a detector's precision-floor auto-disable
 * gating, altered real behaviour. AI-15 is explicitly named as the workflow with the highest cost
 * of a wrong answer (docs/ai/BRIEF-08b-FINAL.md C.2), so this is the highest-value dataset in
 * this batch.
 */

// Every detector in ai-15-anomaly-detection/index.ts is deterministic statistics/keyword/
// cross-reference logic (z-scores, calendar-day windows, keyword matches, and reading another
// workflow's own already-computed AiDecisionTrace) — no model call anywhere in the loop
// (confirmed by reading index.ts, matcher submodules, and journalPatterns/*.ts, not assumed) —
// so 100% is the only honest bar, exactly as for AI-27/AI-03.
const PASS_RATE_THRESHOLD = 1.0;

let runWorkflow: typeof import("@/lib/aiRuntime/runtime/executor").runWorkflow;
let bootstrapAiRuntime: typeof import("@/lib/aiRuntime/bootstrap").bootstrapAiRuntime;
let ai15AnomalyDetection: typeof import("@/lib/aiRuntime/workflows/ai-15-anomaly-detection").ai15AnomalyDetection;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Weekday, 14:00 UTC (well inside business hours) — used for "recent" entries that must NOT
 *  trip the weekend/after-hours timing detector. Mirrors the unit test's own helper exactly. */
function businessHourDate(base: Date): Date {
  const d = new Date(base);
  d.setUTCHours(14, 0, 0, 0);
  const day = d.getUTCDay();
  if (day === 0) d.setUTCDate(d.getUTCDate() + 1); // Sunday -> Monday
  if (day === 6) d.setUTCDate(d.getUTCDate() + 2); // Saturday -> Monday
  return d;
}

/** 2am UTC — always after-hours, regardless of what day it lands on. */
function afterHoursDate(base: Date): Date {
  const d = new Date(base);
  d.setUTCHours(2, 0, 0, 0);
  return d;
}

/** Plain calendar offset — used for historical-baseline entries, where the exact hour/weekday is
 *  irrelevant (history entries are never scanned directly, only used to build stats), and for a
 *  backdated entry's own header.date (a multi-day calendar gap survives any weekday adjustment). */
function daysAgoDate(now: Date, n: number): Date {
  return new Date(now.getTime() - n * DAY_MS);
}

async function createEntry(
  tenantId: string,
  accountId: string,
  offsetAccountId: string,
  amount: number,
  when: Date,
  createdAt: Date,
  opts: { partnerId?: string; journalType?: string },
) {
  const entry = await JournalEntry.create({
    tenantId,
    header: { name: `JE-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, date: when, journalType: opts.journalType ?? "purchase" },
    status: "posted",
    voucherStatus: "posted",
    lineIds: [
      { accountId, label: "line", debit: amount, credit: 0, partnerId: opts.partnerId },
      { accountId: offsetAccountId, label: "line", debit: 0, credit: amount },
    ],
    totals: { amountUntaxed: amount, amountTax: 0, amountTotal: amount },
  });
  // Mongoose's timestamps plugin stamps createdAt at insert time regardless of what's passed —
  // force it via the raw driver collection, same technique the unit test uses.
  await JournalEntry.collection.updateOne({ _id: entry._id }, { $set: { createdAt } });
  return entry;
}

async function seedCase(tenantId: string, goldenCase: GoldenCase) {
  const now = new Date();
  const userId = String(
    (
      await User.create({ tenantId, name: "Finance User", email: `finance-${Date.now()}-${Math.random()}@example.com`, phone: "9999999999", password: "hashed", role: "finance", status: "active" })
    )._id,
  );

  const accountIds = new Map<string, string>();
  for (const a of goldenCase.accounts) {
    const acc = await Account.create({ tenantId, name: a.name, code: `ACC-${Math.random().toString(36).slice(2, 8)}`, account_type: a.accountType, internal_group: a.internalGroup, isActive: true, isLocked: false, status: "active" });
    accountIds.set(a.key, String(acc._id));
  }

  const vendorIds = new Map<string, string>();
  for (const v of goldenCase.vendors) {
    const vend = await Customer.create({ tenantId, header: { name: v.name }, contact_details: {}, createdBy: GOLDEN_CREATOR });
    vendorIds.set(v.key, String(vend._id));
  }

  for (const e of goldenCase.entries) {
    const createdAtDaysAgo = e.createdAtDaysAgo ?? e.dateDaysAgo;
    const createdAt = createdAtDaysAgo === 0 ? (e.afterHours ? afterHoursDate(now) : businessHourDate(now)) : daysAgoDate(now, createdAtDaysAgo);
    const when = e.dateDaysAgo === 0 ? businessHourDate(now) : daysAgoDate(now, e.dateDaysAgo);
    await createEntry(tenantId, accountIds.get(e.accountKey)!, accountIds.get(e.offsetAccountKey)!, e.amount, when, createdAt, {
      partnerId: e.vendorKey ? vendorIds.get(e.vendorKey) : undefined,
      journalType: e.journalType,
    });
  }

  if (goldenCase.accountingSettings) {
    await AccountingSettings.create({ tenantId, journals: { approvalThresholdAmount: goldenCase.accountingSettings.approvalThresholdAmount } });
  }

  if (goldenCase.upstreamTraces) {
    for (const t of goldenCase.upstreamTraces) {
      await AiDecisionTrace.create({ tenantId, runId: new mongoose.Types.ObjectId(), workflowId: t.workflowId, workflowVersion: "1.0.0", inputsHash: "golden", rawProposal: t.rawProposal });
    }
  }

  await AiWorkflowPolicy.create({ tenantId, workflowId: "AI-15", killSwitchEnabled: true, maxAutonomyLevel: "observe" });

  return { userId };
}

describe("AI-15 golden dataset", () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI!);
    await Promise.all([
      Account.init(),
      JournalEntry.init(),
      Customer.init(),
      User.init(),
      AiAnomaly.init(),
      AiDetectorHealth.init(),
      AiAnomalySuppression.init(),
      AiAttentionItem.init(),
      AiWorkflowRun.init(),
      AiDecisionTrace.init(),
      AiEvent.init(),
      AiToolCall.init(),
      AiWorkflowPolicy.init(),
      AccountingSettings.init(),
    ]);
    ({ runWorkflow } = await import("@/lib/aiRuntime/runtime/executor"));
    ({ bootstrapAiRuntime } = await import("@/lib/aiRuntime/bootstrap"));
    ({ ai15AnomalyDetection } = await import("@/lib/aiRuntime/workflows/ai-15-anomaly-detection"));
    bootstrapAiRuntime();
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  it(`reports a pass rate >= ${PASS_RATE_THRESHOLD * 100}% across ${AI15_GOLDEN_CASES.length} golden case(s)`, async () => {
    const results: { id: string; passed: boolean; expected: string[]; actual: string[] }[] = [];

    for (const goldenCase of AI15_GOLDEN_CASES) {
      const tenantId = `${GOLDEN_TENANT_PREFIX}-${goldenCase.id}`;
      const { userId } = await seedCase(tenantId, goldenCase);

      const envelope = await runWorkflow(ai15AnomalyDetection, { tenantId, eventKey: "ai.sweep.hourly", payload: { actingUserId: userId } });
      const titles = envelope.findings.map((f) => f.title);

      const passed =
        goldenCase.expected.mustFire.length === 0
          ? envelope.findings.length === 0
          : goldenCase.expected.mustFire.every((detectorId) => titles.some((t) => t.startsWith(`${detectorId}:`)));

      results.push({ id: goldenCase.id, passed, expected: goldenCase.expected.mustFire, actual: titles });
    }

    const passRate = results.filter((r) => r.passed).length / results.length;
    const failures = results.filter((r) => !r.passed);

    console.log(`AI-15 golden dataset: ${results.length - failures.length}/${results.length} passed (${Math.round(passRate * 100)}%)`, failures.length > 0 ? { failures } : "");

    expect(passRate, `golden dataset regressions: ${JSON.stringify(failures)}`).toBeGreaterThanOrEqual(PASS_RATE_THRESHOLD);
  });
});
