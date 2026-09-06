import { describe, expect, it, beforeAll, afterAll } from "vitest";
import mongoose from "mongoose";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_ai22golden";

import Account from "@/models/finance/Account";
import JournalEntry from "@/models/finance/JournalEntry";
import BankStatement from "@/models/finance/BankStatement";
import Customer from "@/models/sales/Customer";
import Invoice from "@/models/finance/Invoice";
import Asset from "@/models/finance/Asset";
import AiSchedule from "@/models/ai/AiSchedule";
import StockMove from "@/models/inventory/StockMove";
import Payroll from "@/models/hr/Payroll";
import TaxRate from "@/models/finance/TaxRate";
import AiTaxTransaction from "@/models/ai/AiTaxTransaction";
import User from "@/models/auth/User";
import PeriodClosing from "@/models/finance/PeriodClosing";
import { AI22_GOLDEN_CASES, GOLDEN_TENANT_PREFIX, type GoldenCase } from "@/tests/golden/ai22/goldenCases";

/**
 * The golden-dataset CI check for AI-22 (docs/ai/BRIEF-10-PRE-QA.md P0.6). Same shape as
 * `tests/golden/ai27.golden.test.ts`: reports a PASS RATE across a named case set and fails the
 * whole run if it drops below `PASS_RATE_THRESHOLD` — the signal that a change to
 * `lib/aiRuntime/reconciliation/definitions.ts`, `classify.ts`, or `engine.ts` altered real
 * reconciliation behaviour, which a per-assertion unit test can miss if it doesn't happen to
 * cover the case that broke.
 *
 * Each case targets exactly one of `RECONCILIATION_DEFINITIONS`' entries — the harness calls
 * `runAllReconciliationDefinitions()`, the same engine entry point AI-22's own workflow calls, and
 * checks only the one definition the case names (`goldenCase.definitionId`), never the whole
 * result array — the same "check the thing the case is actually about" discipline as AI-27's own
 * `duplicateFindingCount`-only assertion.
 */

const PASS_RATE_THRESHOLD = 1.0; // AI-22 has zero model calls anywhere in its path — fully deterministic

let runAllReconciliationDefinitions: typeof import("@/lib/aiRuntime/reconciliation/engine").runAllReconciliationDefinitions;
let bootstrapAiRuntime: typeof import("@/lib/aiRuntime/bootstrap").bootstrapAiRuntime;

describe("AI-22 golden dataset", () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI!);
    await Promise.all([
      Account.init(), JournalEntry.init(), BankStatement.init(), Customer.init(), Invoice.init(),
      Asset.init(), AiSchedule.init(), StockMove.init(), Payroll.init(), TaxRate.init(),
      AiTaxTransaction.init(), User.init(), PeriodClosing.init(),
    ]);
    ({ runAllReconciliationDefinitions } = await import("@/lib/aiRuntime/reconciliation/engine"));
    ({ bootstrapAiRuntime } = await import("@/lib/aiRuntime/bootstrap"));
    bootstrapAiRuntime();
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  it(`reports a pass rate >= ${PASS_RATE_THRESHOLD * 100}% across ${AI22_GOLDEN_CASES.length} golden case(s)`, async () => {
    const results: { id: string; passed: boolean; expected: GoldenCase["expected"]; actual: unknown }[] = [];

    for (const goldenCase of AI22_GOLDEN_CASES) {
      const tenantId = `${GOLDEN_TENANT_PREFIX}-${goldenCase.id}`;
      await goldenCase.seed(tenantId);

      const allResults = await runAllReconciliationDefinitions(tenantId, goldenCase.periodEnd, goldenCase.period);
      const result = allResults.find((r) => r.definitionId === goldenCase.definitionId);

      const actual = result
        ? { status: result.status, leftTotal: result.leftTotal, rightTotal: result.rightTotal, difference: result.difference }
        : undefined;

      let passed = Boolean(result) && result!.status === goldenCase.expected.status;
      if (passed && goldenCase.expected.leftTotal !== undefined) passed = passed && result!.leftTotal === goldenCase.expected.leftTotal;
      if (passed && goldenCase.expected.rightTotal !== undefined) passed = passed && result!.rightTotal === goldenCase.expected.rightTotal;
      if (passed && goldenCase.expected.difference !== undefined) passed = passed && result!.difference === goldenCase.expected.difference;

      results.push({ id: goldenCase.id, passed, expected: goldenCase.expected, actual });
    }

    const passRate = results.filter((r) => r.passed).length / results.length;
    const failures = results.filter((r) => !r.passed);

    // eslint-disable-next-line no-console
    console.log(`AI-22 golden dataset: ${results.length - failures.length}/${results.length} passed (${Math.round(passRate * 100)}%)`, failures.length > 0 ? { failures } : "");

    expect(passRate, `golden dataset regressions: ${JSON.stringify(failures, null, 2)}`).toBeGreaterThanOrEqual(PASS_RATE_THRESHOLD);
  });

  // ── P0.5 regression: current period is unaffected by the closed-period scoping ───────────────
  it("P0.5 regression: the SAME open AP/AR balances still compute a real number for the tenant's current open period (only a CLOSED period is scoped out)", async () => {
    const currentCase = AI22_GOLDEN_CASES.find((c) => c.id === "ap-control-real-difference")!;
    const closedCase = AI22_GOLDEN_CASES.find((c) => c.id === "ap-control-closed-period-not-supported")!;

    const currentTenant = `${GOLDEN_TENANT_PREFIX}-p05-current-ap`;
    await currentCase.seed(currentTenant);
    const currentResults = await runAllReconciliationDefinitions(currentTenant, new Date(), currentCase.period);
    const currentAp = currentResults.find((r) => r.definitionId === "ap_control")!;
    expect(currentAp.status).toBe("unreconciled"); // a real, computed number — not scoped out
    expect(currentAp.leftTotal).toBe(8000);
    expect(currentAp.rightTotal).toBe(5000);

    const closedTenant = `${GOLDEN_TENANT_PREFIX}-p05-closed-ap`;
    await closedCase.seed(closedTenant);
    const closedResults = await runAllReconciliationDefinitions(closedTenant, closedCase.periodEnd, closedCase.period);
    const closedAp = closedResults.find((r) => r.definitionId === "ap_control")!;
    // The identical 8000-vs-5000 real gap exists in this tenant's data too (seeded by the golden
    // case itself) — but because periodEnd is closed, AI-22 must never report it as either 0
    // (looks clean) or 3000 (today's number under a stale label). It must say "not checked."
    expect(closedAp.status).toBe("not_supported_for_closed_periods");
    expect(closedAp.leftTotal).toBe(0);
    expect(closedAp.notImplementedReason).toBeTruthy();
  });

  // ── P0.5 regression: AI-13's own consumption never turns the new status into READY or a fabricated blocker ──
  it("P0.5 regression: AI-13's closeReadiness domain reports NOT_CHECKED (never ready, never a fabricated blocker) for a closed-period ap_control/ar_control_finance", async () => {
    const { checkApDomain, checkArDomain, loadMaterialityContext } = await import("@/lib/aiRuntime/closeReadiness/domains");
    const { AI_CLOSE_DOMAIN_STATUS } = await import("@/models/ai/AiCloseState");

    const closedCase = AI22_GOLDEN_CASES.find((c) => c.id === "ap-control-closed-period-not-supported")!;
    const tenantId = `${GOLDEN_TENANT_PREFIX}-p05-ai13-ap`;
    await closedCase.seed(tenantId);
    const ctx = await loadMaterialityContext(tenantId);

    const apDomain = await checkApDomain(tenantId, closedCase.periodEnd, closedCase.period, ctx);
    expect(apDomain.status).toBe(AI_CLOSE_DOMAIN_STATUS.NOT_CHECKED);
    expect(apDomain.blockers).toHaveLength(0);
    expect(apDomain.reasonIfNotChecked).toBeTruthy();

    const arClosedCase = AI22_GOLDEN_CASES.find((c) => c.id === "ar-control-closed-period-not-supported")!;
    const arTenantId = `${GOLDEN_TENANT_PREFIX}-p05-ai13-ar`;
    await arClosedCase.seed(arTenantId);
    const arDomain = await checkArDomain(arTenantId, arClosedCase.periodEnd, arClosedCase.period, ctx);
    expect(arDomain.status).toBe(AI_CLOSE_DOMAIN_STATUS.NOT_CHECKED);
    expect(arDomain.blockers).toHaveLength(0);
  });
});
