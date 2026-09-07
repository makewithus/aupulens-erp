import connectDB from "@/lib/db";
import PeriodClosing from "@/models/finance/PeriodClosing";
import AiCloseState, { type IAiCloseDomain, type IAiCloseContradiction } from "@/models/ai/AiCloseState";
import { PERIOD_CLOSING_STATUS } from "@/lib/constants/statuses";
import { emitEvent } from "@/lib/aiRuntime/runtime/eventBus";
import { buildDedupeKey } from "@/lib/aiRuntime/attention/dedupeKey";
import { classifyReadiness } from "@/lib/aiRuntime/closeReadiness/classify";
import {
  loadMaterialityContext,
  checkTransactionsDomain,
  checkBankDomain,
  checkArDomain,
  checkApDomain,
  checkInventoryDomain,
  checkAccrualsDomain,
  checkPrepaidsDomain,
  checkRevenueDomain,
  checkFixedAssetsDomain,
  checkFxDomain,
  checkTaxDomain,
  checkPayrollDomain,
  checkComplianceDomain,
  checkIntercompanyDomain,
  checkControlsDomain,
  checkEvidenceDomain,
} from "@/lib/aiRuntime/closeReadiness/domains";

/**
 * AI-13's readiness recomputation (docs/ai/BRIEF-04-BATCH-C.md, AI-13 algorithm) — the single
 * function both the workflow and the `calculate_close_readiness` tool call. `PeriodClosing` is
 * read here, **never written** (A.2 / Hard Rule 4) — a contradiction between its human-advanced
 * status and what the domains computed is recorded as a CRITICAL finding, never a status change.
 */

function periodToFiscal(period: string): { fiscalYear: number; month: number } {
  const [y, m] = period.split("-").map(Number);
  return { fiscalYear: y, month: m };
}

export interface CloseReadinessComputation {
  period: string;
  readiness: ReturnType<typeof classifyReadiness>;
  domains: IAiCloseDomain[];
  autoResolvedThisRun: { domain: string; blockerId: string; sourceWorkflow: string }[];
  periodClosingStatus?: string;
  contradictions: IAiCloseContradiction[];
  computedAt: Date;
}

export async function computeCloseReadiness(tenantId: string, period: string, periodEnd: Date): Promise<CloseReadinessComputation> {
  await connectDB();
  const ctx = await loadMaterialityContext(tenantId);

  // Read PeriodClosing early — never write it (A.2 / Hard Rule 4) — so the `evidence` domain can
  // use it (each assertion's own `gatedByStatus`) at the same point every other domain runs.
  const { fiscalYear, month } = periodToFiscal(period);
  const periodClosing = await PeriodClosing.findOne({ tenantId, fiscalYear, month }).lean();

  // `evidence` (docs/ai/BRIEF-05-BATCH-D.md Part 0.4) is computed LAST, from every other domain
  // already built — never by calling back into AI-24's own entry point, which itself calls this
  // function; see lib/aiRuntime/evidence/deriveAssertions.ts's doc comment for why that would
  // recurse forever.
  //
  // Chunk 10a (docs/ai/BRIEF-10-PRE-QA.md B.3) — these 14 domain checks were previously run
  // strictly sequentially (one `await` per array element, each blocking the next), even though
  // none of them depends on any other's output — every one takes only {tenantId, periodEnd,
  // period, ctx}, none reads another domain's result. On the AI demo tenant this made
  // annotateStatement() (which calls this function once per statement view) take ~14s against a
  // <5s budget; this function alone measured ~5.3s of that. Running them concurrently collapses
  // the wall-clock cost from "sum of all 14 domains' own round trips" to "the slowest one," the
  // same sequential-to-concurrent class of fix already applied elsewhere in this codebase (e.g.
  // AI-28's own candidate-batching, Chunk 9).
  const otherDomains: IAiCloseDomain[] = await Promise.all([
    checkTransactionsDomain(tenantId, ctx),
    checkBankDomain(tenantId, periodEnd, period, ctx),
    checkArDomain(tenantId, periodEnd, period, ctx),
    checkApDomain(tenantId, periodEnd, period, ctx),
    checkInventoryDomain(tenantId, periodEnd, period, ctx),
    checkAccrualsDomain(tenantId, periodEnd, ctx),
    checkPrepaidsDomain(tenantId, periodEnd, period, ctx),
    checkRevenueDomain(tenantId, periodEnd, period, ctx),
    checkFixedAssetsDomain(tenantId, periodEnd, period, ctx),
    checkFxDomain(tenantId, periodEnd, ctx),
    checkTaxDomain(tenantId, periodEnd, period, ctx),
    checkPayrollDomain(tenantId, periodEnd, period, ctx),
    checkComplianceDomain(tenantId, period),
    Promise.resolve(checkIntercompanyDomain()),
    checkControlsDomain(tenantId, ctx),
  ]);
  const domains: IAiCloseDomain[] = [...otherDomains, checkEvidenceDomain(otherDomains, periodClosing?.status)];

  const readiness = classifyReadiness(domains);

  // Auto-resolve safe blockers by invoking the owning workflow's own trigger — never acting
  // directly (A.3). A blocker only clears on the NEXT recomputation once the underlying data
  // actually changed; triggering the workflow here does not itself clear anything.
  const autoResolvedThisRun: { domain: string; blockerId: string; sourceWorkflow: string }[] = [];
  for (const domain of domains) {
    for (const blocker of domain.blockers) {
      if (!blocker.autoResolvable || !blocker.sourceWorkflow) continue;
      const scheduleRef = blocker.evidence.find((e) => e.label === "AiSchedule")?.ref;
      try {
        // Chunk 10a — the same fix as app/api/cron/ai/runtime-sweep/route.ts's own schedule.due
        // loop, for the identical reason: AiEvent's unique index on {tenantId, eventKey,
        // dedupeKey} is sparse, but sparse only exempts a document when EVERY indexed field is
        // absent, not when just one is. Two auto-resolvable blockers in the SAME
        // computeCloseReadiness() call, both referencing a schedule, both emitting with no
        // dedupeKey, would collide on the second call — silently here (this whole call is
        // try/caught per blocker), meaning the second blocker's real auto-resolution trigger
        // would quietly never fire. Found via the AI demo tenant's own planted-findings
        // verification. Scoped per schedule/tenant AND per hour so a genuinely still-open
        // blocker is still re-triggered on a later recompute.
        const dedupeHour = new Date().toISOString().slice(0, 13);
        if (scheduleRef) {
          await emitEvent(tenantId, "schedule.due", { scheduleId: scheduleRef }, { dedupeKey: buildDedupeKey(scheduleRef, dedupeHour) });
        } else {
          await emitEvent(tenantId, "ai.sweep.hourly", {}, { dedupeKey: buildDedupeKey(tenantId, "auto-resolve", dedupeHour) });
        }
        autoResolvedThisRun.push({ domain: domain.domain, blockerId: blocker.id, sourceWorkflow: blocker.sourceWorkflow });
      } catch {
        // Best-effort — a failed trigger just means this blocker stays open until the next sweep.
      }
    }
  }

  const contradictions: IAiCloseContradiction[] = [];
  if (periodClosing) {
    const humanSaysReconciled = [PERIOD_CLOSING_STATUS.RECONCILED, PERIOD_CLOSING_STATUS.CLOSED, PERIOD_CLOSING_STATUS.STATEMENTS_GENERATED].includes(
      periodClosing.status as typeof PERIOD_CLOSING_STATUS.RECONCILED,
    );
    const bank = domains.find((d) => d.domain === "bank");
    if (humanSaysReconciled && bank && (bank.status === "blocked" || bank.status === "at_risk")) {
      contradictions.push({
        domain: "bank",
        detail: `PeriodClosing reports "${periodClosing.status}" but AI-22's bank reconciliation is "${bank.status}"`,
        periodClosingStatus: periodClosing.status,
        machineEvidence: JSON.stringify(bank.blockers.map((b) => ({ id: b.id, title: b.title, amount: b.amount }))),
      });
    }
  }

  return {
    period,
    readiness,
    domains,
    autoResolvedThisRun,
    periodClosingStatus: periodClosing?.status,
    contradictions,
    computedAt: new Date(),
  };
}

/** Persists the recomputation to `AiCloseState`, upserted per `{tenantId, period}` — a read is
 *  then a single lookup, not a live recompute, per the brief's "well under a second" requirement. */
export async function computeAndPersistCloseReadiness(tenantId: string, period: string, periodEnd: Date) {
  const computation = await computeCloseReadiness(tenantId, period, periodEnd);
  await AiCloseState.findOneAndUpdate(
    { tenantId, period },
    {
      $set: {
        readiness: computation.readiness,
        domains: computation.domains,
        autoResolvedThisRun: computation.autoResolvedThisRun,
        periodClosingStatus: computation.periodClosingStatus,
        contradictions: computation.contradictions,
        computedAt: computation.computedAt,
      },
    },
    { upsert: true, new: true },
  );
  return computation;
}
