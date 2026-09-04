import connectDB from "@/lib/db";
import { buildPostedJournalReport, getAccountTransactionDetail, type ReportGroup, type AccountTransactionLine } from "@/lib/accounting/reports";
import Budget, { type IBudgetLine } from "@/models/finance/Budget";
import AiMaterialityPolicy, { findThreshold, type IAiMaterialityPolicy } from "@/models/ai/AiMaterialityPolicy";
import { evaluateCutoff } from "@/lib/aiRuntime/cutoff/evaluateCutoff";
import { AI_AUTONOMY_LEVEL, AI_FINDING_TYPE, AI_FINDING_SEVERITY, BUDGET_STATUS } from "@/lib/constants/statuses";
import type { WorkflowDefinition, ObservedResult, ReasonResult, ActResult, VerifyResult } from "@/lib/aiRuntime/workflows/types";

/**
 * AI-14 — Flux analysis (docs/ai/BRIEF-05-BATCH-D.md). "Why did this number move?" Compares the
 * current period to a budget (if one exists for it) or the prior period, decomposes every
 * material movement into drivers with cited transaction ids, and reports what it cannot explain.
 *
 * **Extends `lib/accounting/reports.ts`**, never a second report engine: `buildPostedJournalReport()`
 * is still the source of every account total; the new `getAccountTransactionDetail()` export
 * (added alongside it, not touching its behaviour) is the only line-level source AI-14 drills
 * into. Read-only by construction — no write tool exists for this workflow, and OBSERVE means the
 * gate never even runs.
 *
 * **Driver decomposition is exact by construction, not narrative**: every material account's
 * current-period transactions are grouped by counterparty; every group's own delta (current vs
 * comparative) is computed from the same posted data that produced the account total, so the sum
 * of every group's delta always equals the account's total variance exactly. Only the largest
 * groups (>= 5% of the variance's magnitude) are listed as named drivers; the rest — genuinely
 * small, numerous fragments — are summed into `unexplained_amount`, which is therefore always the
 * exact residual, never an estimate.
 *
 * **Timing/cut-off classification** (docs/ai/BRIEF-06-BATCH-E.md Part 0.4) calls AI-28's own
 * evaluation directly via `lib/aiRuntime/cutoff/evaluateCutoff.ts` — a plain service function
 * AI-28's own workflow wraps too, so the two can never quietly disagree. Only determinable for a
 * single current-period transaction traceable to a vendor bill (the same scope AI-28 itself
 * has); everything else keeps its existing `one_off`/`recurring`/`new`/`ceased` classification —
 * never a guessed "timing" label.
 */

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

interface Ai14Raw {
  actingUserId?: string;
  period: string; // "YYYY-MM"
  periodEnd: string;
}

interface AccountTotal {
  accountId: string;
  code: string;
  name: string;
  internalGroup: ReportGroup;
  amount: number;
}

interface Ai14Extracted {
  actingUserId?: string;
  period: string;
  currentAccounts: AccountTotal[];
  comparativeByAccount: Map<string, { amount: number; basis: "budget" | "prior_period" }>;
  materialityConfigured: boolean;
  materialityThreshold: { absoluteAmount?: number; percentOfBalance?: number } | null;
  basisAvailable: { budget: boolean; priorPeriod: boolean; priorYear: boolean };
  periodBounds: { curStart: Date; curEnd: Date; priorStart: Date; priorEnd: Date };
}

interface Driver {
  description: string;
  amount: number;
  pctOfVariance: number;
  transactionRefs: string[];
  type: "one_off" | "recurring" | "new" | "ceased" | "timing";
}

interface Comparison {
  line: string;
  accountId: string;
  current: number;
  comparative: number;
  comparativeBasis: "budget" | "prior_period";
  variance: number;
  variancePct: number | null;
  materialityVerdict: "material" | "immaterial" | "unclassified";
  drivers: Driver[];
  explanation: string;
  unexplainedAmount: number;
  confidence: number;
}

interface Ai14Proposal {
  comparisons: Comparison[];
  basisAvailable: { budget: boolean; priorPeriod: boolean; priorYear: boolean };
  notImplemented: { what: string; reason: string }[];
}

function monthBounds(period: string): { start: Date; end: Date } {
  const [y, m] = period.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 0, 23, 59, 59, 999));
  return { start, end };
}

function priorMonth(period: string): string {
  const [y, m] = period.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 2, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function priorYearPeriod(period: string): string {
  const [y, m] = period.split("-").map(Number);
  return `${y - 1}-${String(m).padStart(2, "0")}`;
}

async function accountTotalsFromReport(tenantId: string, start: Date, end: Date): Promise<AccountTotal[]> {
  const report = await buildPostedJournalReport({ tenantId, startDate: start, endDate: end });
  const groups: ReportGroup[] = ["asset", "liability", "equity", "income", "expense", "off_balance"];
  const out: AccountTotal[] = [];
  for (const g of groups) {
    for (const acc of Object.values(report[g].accounts)) {
      out.push({ accountId: acc.id, code: acc.code, name: acc.name, internalGroup: g, amount: acc.amount });
    }
  }
  return out;
}

// `timing_vs_real_change_decomposition` closed in Chunk 6 (docs/ai/BRIEF-06-BATCH-E.md Part
// 0.4) — AI-28's cutoff evaluation is now a callable service (lib/aiRuntime/cutoff/
// evaluateCutoff.ts) and decomposeVariance() below calls it directly. Kept as a real, typed,
// currently-empty list rather than deleted — the next honest gap this workflow finds goes here.
const NOT_IMPLEMENTED: { what: string; reason: string }[] = [];

export const ai14FluxAnalysis: WorkflowDefinition<Ai14Raw, Ai14Extracted, Ai14Proposal> = {
  id: "AI-14",
  version: "1.0.0",
  eventKeys: ["period.horizon.reached"],
  actionClass: "flux_analysis",
  defaultAutonomy: AI_AUTONOMY_LEVEL.OBSERVE,

  async subscriptionFilter(): Promise<boolean> {
    return true; // fan-out, shared with AI-13/22/24/28 — tenant-wide, no single owner
  },

  async observe(event): Promise<ObservedResult<Ai14Raw>> {
    const period = String(event.payload.period);
    const periodEnd = String(event.payload.periodEnd);
    return { entityId: `${event.tenantId}:${period}`, raw: { period, periodEnd, actingUserId: event.payload.actingUserId ? String(event.payload.actingUserId) : undefined } };
  },

  async extract(observed, ctx): Promise<Ai14Extracted> {
    await connectDB();
    const tenantId = ctx.tenantId;
    const period = observed.raw.period;
    const { start: curStart, end: curEnd } = monthBounds(period);
    const { start: priorStart, end: priorEnd } = monthBounds(priorMonth(period));
    const { start: pyStart, end: pyEnd } = monthBounds(priorYearPeriod(period));

    const currentAccounts = await accountTotalsFromReport(tenantId, curStart, curEnd);
    const priorPeriodAccounts = await accountTotalsFromReport(tenantId, priorStart, priorEnd);
    const priorYearAccounts = await accountTotalsFromReport(tenantId, pyStart, pyEnd);

    const [y] = period.split("-");
    const budget = await Budget.findOne({ tenantId, fiscalYear: y, status: BUDGET_STATUS.ACTIVE }).lean();
    const budgetByAccount = new Map<string, number>();
    if (budget) {
      for (const line of budget.lines as IBudgetLine[]) {
        const match = line.amounts.find((a) => a.periodLabel === period);
        if (match) budgetByAccount.set(String(line.accountId), (budgetByAccount.get(String(line.accountId)) ?? 0) + match.amount);
      }
    }

    const priorPeriodByAccount = new Map(priorPeriodAccounts.map((a) => [a.accountId, a.amount]));
    const comparativeByAccount = new Map<string, { amount: number; basis: "budget" | "prior_period" }>();
    const allAccountIds = new Set([...currentAccounts.map((a) => a.accountId), ...priorPeriodAccounts.map((a) => a.accountId)]);
    for (const id of allAccountIds) {
      if (budgetByAccount.has(id)) {
        comparativeByAccount.set(id, { amount: budgetByAccount.get(id)!, basis: "budget" });
      } else {
        comparativeByAccount.set(id, { amount: priorPeriodByAccount.get(id) ?? 0, basis: "prior_period" });
      }
    }
    // Union in accounts that only exist in the comparative period (dropped to 0 in current).
    for (const acc of priorPeriodAccounts) {
      if (!currentAccounts.some((a) => a.accountId === acc.accountId)) {
        currentAccounts.push({ ...acc, amount: 0 });
      }
    }

    const materialityPolicy = await AiMaterialityPolicy.findOne({ tenantId }).lean();
    const threshold = findThreshold(materialityPolicy as unknown as IAiMaterialityPolicy | null, "flux_analysis");

    return {
      actingUserId: observed.raw.actingUserId,
      period,
      currentAccounts,
      comparativeByAccount,
      materialityConfigured: Boolean(threshold),
      materialityThreshold: threshold ? { absoluteAmount: threshold.absoluteAmount, percentOfBalance: threshold.percentOfBalance } : null,
      basisAvailable: { budget: budgetByAccount.size > 0, priorPeriod: priorPeriodAccounts.length > 0, priorYear: priorYearAccounts.length > 0 },
      periodBounds: { curStart, curEnd, priorStart, priorEnd },
    };
  },

  async reason(extracted, ctx): Promise<ReasonResult<Ai14Proposal>> {
    const comparisons: Comparison[] = [];

    for (const acc of extracted.currentAccounts) {
      const comparative = extracted.comparativeByAccount.get(acc.accountId) ?? { amount: 0, basis: "prior_period" as const };
      const variance = round2(acc.amount - comparative.amount);
      if (Math.abs(variance) < 0.005) continue; // zero movement — nothing to explain

      const variancePct = comparative.amount !== 0 ? round2((variance / Math.abs(comparative.amount)) * 100) : null;

      let verdict: Comparison["materialityVerdict"] = "unclassified";
      if (extracted.materialityConfigured) {
        const absHit = extracted.materialityThreshold?.absoluteAmount !== undefined && Math.abs(variance) >= extracted.materialityThreshold.absoluteAmount;
        const pctHit = extracted.materialityThreshold?.percentOfBalance !== undefined && variancePct !== null && Math.abs(variancePct) >= extracted.materialityThreshold.percentOfBalance;
        verdict = absHit || pctHit ? "material" : "immaterial";
      }

      let drivers: Driver[] = [];
      let unexplainedAmount = variance;
      let explanation = `${acc.name} moved by ${variance} vs its ${comparative.basis === "budget" ? "budget" : "prior period"} comparative.`;

      if (verdict !== "immaterial") {
        drivers = await decomposeVariance(ctx.tenantId, acc.accountId, variance, extracted.periodBounds);
        const driverSum = round2(drivers.reduce((s, d) => s + d.amount, 0));
        unexplainedAmount = round2(variance - driverSum);
        explanation =
          drivers.length > 0
            ? `${acc.name} moved by ${variance}: ${drivers.map((d) => `${d.description} (${d.amount})`).join("; ")}${Math.abs(unexplainedAmount) >= 0.01 ? `; ${unexplainedAmount} unexplained` : ""}.`
            : `${acc.name} moved by ${variance}, entirely from counterparty-level activity below the driver-listing threshold — reported as unexplained pending review.`;
      }

      comparisons.push({
        line: `${acc.code} ${acc.name}`,
        accountId: acc.accountId,
        current: acc.amount,
        comparative: comparative.amount,
        comparativeBasis: comparative.basis,
        variance,
        variancePct,
        materialityVerdict: verdict,
        drivers,
        explanation,
        unexplainedAmount,
        confidence: verdict === "material" ? 1 : 0.5,
      });
    }

    const findings: ReasonResult<Ai14Proposal>["findings"] = comparisons
      .filter((c) => c.materialityVerdict === "material")
      .map((c) => ({
        id: `ai14-flux-${c.accountId}-${extracted.period}`,
        type: AI_FINDING_TYPE.EXCEPTION,
        severity: AI_FINDING_SEVERITY.MEDIUM,
        title: `Material movement: ${c.line}`,
        detail: c.explanation,
        amount: c.variance,
        confidence: c.confidence,
        subjectRefs: [{ model: "Account", id: c.accountId }],
        evidence: c.drivers.flatMap((d) => d.transactionRefs.map((ref) => ({ kind: "record" as const, ref, label: d.description }))),
        reasonChain: [],
      }));

    return {
      proposal: { comparisons, basisAvailable: extracted.basisAvailable, notImplemented: NOT_IMPLEMENTED },
      confidence: 1,
      findings,
      reasonChain: [
        `${comparisons.length} account(s) moved this period`,
        `${comparisons.filter((c) => c.materialityVerdict === "material").length} material movement(s)`,
        extracted.materialityConfigured ? "flux_analysis materiality configured" : 'no "flux_analysis" materiality threshold configured — movements reported unclassified, not filtered',
      ],
      gateOverrides: { periodOpen: true, permissionOk: true },
    };
  },

  async validate(): Promise<{ valid: boolean; vetoReason?: string }> {
    return { valid: true };
  },

  async act(): Promise<ActResult> {
    // Read-only by construction — no write tool exists for AI-14.
    return { findings: [], actionsTaken: [] };
  },

  async verify(): Promise<VerifyResult> {
    return { ok: true };
  },
};

/** Groups an account's current-vs-comparative transactions by counterparty, computes each
 *  group's exact delta, and lists only groups whose magnitude is >= 5% of the total variance as
 *  named drivers — the remainder is the exact residual returned to the caller as
 *  `variance - sum(listed driver amounts)`, never estimated. */
async function decomposeVariance(
  tenantId: string,
  accountId: string,
  totalVariance: number,
  bounds: { curStart: Date; curEnd: Date; priorStart: Date; priorEnd: Date },
): Promise<Driver[]> {
  const [currentLines, comparativeLines] = await Promise.all([
    getAccountTransactionDetail({ tenantId, accountId, startDate: bounds.curStart, endDate: bounds.curEnd }),
    getAccountTransactionDetail({ tenantId, accountId, startDate: bounds.priorStart, endDate: bounds.priorEnd }),
  ]);

  const byPartner = new Map<string, { label: string; current: AccountTransactionLine[]; comparative: AccountTransactionLine[] }>();
  const key = (l: AccountTransactionLine) => l.partnerId ?? `__no_counterparty__:${l.label || l.entryName}`;
  for (const l of currentLines) {
    const k = key(l);
    if (!byPartner.has(k)) byPartner.set(k, { label: l.partnerName ?? l.label ?? l.entryName, current: [], comparative: [] });
    byPartner.get(k)!.current.push(l);
  }
  for (const l of comparativeLines) {
    const k = key(l);
    if (!byPartner.has(k)) byPartner.set(k, { label: l.partnerName ?? l.label ?? l.entryName, current: [], comparative: [] });
    byPartner.get(k)!.comparative.push(l);
  }

  const groupDeltas: { key: string; label: string; delta: number; type: Driver["type"]; refs: string[] }[] = [];
  for (const [k, group] of byPartner.entries()) {
    const currentSum = round2(group.current.reduce((s, l) => s + l.signedAmount, 0));
    const comparativeSum = round2(group.comparative.reduce((s, l) => s + l.signedAmount, 0));
    const delta = round2(currentSum - comparativeSum);
    if (Math.abs(delta) < 0.005) continue;

    let type: Driver["type"];
    if (comparativeSum === 0 && currentSum !== 0) type = "new";
    else if (currentSum === 0 && comparativeSum !== 0) type = "ceased";
    else if (group.current.length <= 1) type = "one_off";
    else type = "recurring";

    // A single current-period transaction traceable to a vendor bill (evaluateCutoff() only
    // determines vendor bills — everything else stays whatever it already was classified as,
    // never guessed) whose posted date and receipt evidence disagree on period — a real timing
    // difference, not a genuine one-off change (docs/ai/BRIEF-06-BATCH-E.md Part 0.4).
    if (type === "one_off" && group.current[0]?.sourceId) {
      const evaluation = await evaluateCutoff(tenantId, group.current[0].sourceId, bounds.curEnd);
      if (evaluation.determinable && evaluation.isTimingDifference) type = "timing";
    }

    groupDeltas.push({ key: k, label: group.label || "unlabelled", delta, type, refs: group.current.map((l) => l.entryId) });
  }

  const materialityFloor = Math.max(Math.abs(totalVariance) * 0.05, 0.01);
  const drivers: Driver[] = groupDeltas
    .filter((g) => Math.abs(g.delta) >= materialityFloor)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .map((g) => ({
      description: g.type === "new" ? `New activity: ${g.label}` : g.type === "ceased" ? `Ceased activity: ${g.label}` : `${g.label} (${g.type})`,
      amount: g.delta,
      pctOfVariance: totalVariance !== 0 ? round2((g.delta / totalVariance) * 100) : 0,
      transactionRefs: g.refs,
      type: g.type,
    }));

  return drivers;
}
