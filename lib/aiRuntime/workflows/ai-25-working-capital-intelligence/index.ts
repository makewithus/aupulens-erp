import connectDB from "@/lib/db";
import { buildAgedPartnerReport, buildPostedJournalReport, type AgedPartnerReportItem } from "@/lib/accounting/reports";
import { glBalanceForAccount } from "@/lib/aiRuntime/reconciliation/definitions";
import { resolveInventoryAccountMapping } from "@/lib/aiRuntime/inventory/accountMapping";
import { AI_AUTONOMY_LEVEL, AI_FINDING_TYPE, AI_FINDING_SEVERITY } from "@/lib/constants/statuses";
import type { WorkflowDefinition, ObservedResult, ReasonResult, ActResult, VerifyResult } from "@/lib/aiRuntime/workflows/types";

/**
 * AI-25 — Working-capital intelligence (docs/ai/BRIEF-05-BATCH-D.md). DSO, DPO, DIO and cash
 * conversion cycle, compared period over period, with named drivers and a cash value.
 *
 * **Formula, stated once, used consistently** (there are several standard definitions —
 * mixing them across periods is exactly the reporting bug the brief warns about):
 *   DSO = (period-end AR balance / period revenue) × days in period
 *   DPO = (period-end AP balance / period COGS) × days in period
 *   DIO = (period-end inventory balance / period COGS) × days in period — **not_computable**
 *   CCC = DSO − DPO (+ DIO when computable)
 * AR/AP balances reuse `buildAgedPartnerReport()` (the same function `/api/finance/reports/aged`
 * already serves) at the period end date — never a second aging computation. Revenue/COGS come
 * from `buildPostedJournalReport()`; COGS is the `expense_direct_cost`-typed account subset (the
 * standard mapping for "cost of goods sold" in this chart of accounts), not every expense.
 *
 * **Inventory days (DIO), Chunk 8a**: AI-11 answered the standing "which accounts constitute
 * inventory" question (`lib/aiRuntime/inventory/accountMapping.ts`, `docs/ai/OPEN_QUESTIONS.md`
 * #21/#24) — DIO is now computed whenever that mapping resolves unambiguously for the tenant,
 * using the SAME `glBalanceForAccount()` point-in-time balance query AR/AP effectively rely on
 * (exported additively from `lib/aiRuntime/reconciliation/definitions.ts`, never a second
 * implementation) for the inventory account's period-end balance, against the same
 * `expense_direct_cost` COGS figure DPO already used. When the mapping is ambiguous or absent for
 * a tenant, DIO stays `not_computable` with that tenant's own live reason — never guessed. CCC
 * includes DIO only when it's computable, otherwise reported using DSO and DPO alone — a real,
 * standard simplified metric for that case, never silently presented as the full three-part cycle.
 *
 * **Driver decomposition is exact in cash terms by construction**: each customer's (or vendor's)
 * AR (or AP) balance delta between the current and prior period end is computed from the same
 * aged-report data that produced the aggregate balance, so the sum of every customer's delta
 * always equals the aggregate AR movement exactly — the same partition-based exactness AI-14
 * uses for flux drivers, applied here to working capital.
 */

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

interface Ai25Raw {
  actingUserId?: string;
  period: string;
  periodEnd: string;
}

interface PartnerBalance {
  partnerId: string;
  partnerName: string;
  total: number;
}

interface Ai25Extracted {
  actingUserId?: string;
  period: string;
  daysInPeriod: number;
  daysInPriorPeriod: number;
  arCurrent: PartnerBalance[];
  arPrior: PartnerBalance[];
  apCurrent: PartnerBalance[];
  apPrior: PartnerBalance[];
  arCurrentTotal: number;
  arPriorTotal: number;
  apCurrentTotal: number;
  apPriorTotal: number;
  revenueCurrent: number;
  revenuePrior: number;
  cogsCurrent: number;
  cogsPrior: number;
  inventoryBalanceCurrent: number | null;
  inventoryBalancePrior: number | null;
  inventoryMappingBasis: string;
}

interface Driver {
  type: "customer" | "vendor";
  entityRef: string;
  entityName: string;
  daysImpact: number;
  cashImpact: number;
}

interface Ai25Proposal {
  metrics: { dso: number | null; dpo: number | null; dio: number | null; ccc: number | null; formulaUsed: string; notComputable: { what: string; reason: string }[] };
  comparatives: { dso: number | null; dpo: number | null; dio: number | null; ccc: number | null };
  movement: { dso: number | null; dpo: number | null; dio: number | null; arBalance: number; apBalance: number; inventoryBalance: number | null };
  drivers: Driver[];
  cashTiedUp: { ar: number; ap: number };
  recommendedActions: { description: string; cashImpact: number }[];
}

const FORMULA_USED =
  "DSO = (period-end AR balance / period revenue) x days in period; " +
  "DPO = (period-end AP balance / period COGS[expense_direct_cost accounts]) x days in period; " +
  "DIO = (period-end inventory balance / period COGS) x days in period; " +
  "CCC = DSO - DPO (+ DIO when computable). Point-in-time balances via buildAgedPartnerReport(), the same function /api/finance/reports/aged uses.";

// `start` is 00:00:00.000 of the first day and `end` is 23:59:59.999 of the last day (how
// curStart/curEnd are always constructed below), so their raw difference already spans exactly
// N days inclusive — no +1 needed (that would double count the partial last-day span).
function daysBetween(start: Date, end: Date): number {
  return Math.max(1, Math.round((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)));
}

function toBalances(items: AgedPartnerReportItem[]): PartnerBalance[] {
  return items.map((i) => ({ partnerId: i.partnerId, partnerName: i.partnerName, total: i.total }));
}

/** Exact-by-construction driver decomposition: every partner's own delta, summed, always equals
 *  the aggregate balance movement (current total − prior total) exactly. */
function decomposePartnerDrivers(current: PartnerBalance[], prior: PartnerBalance[], type: Driver["type"], revenueOrCogs: number, daysInPeriod: number): Driver[] {
  const byId = new Map<string, { name: string; current: number; prior: number }>();
  for (const c of current) byId.set(c.partnerId, { name: c.partnerName, current: c.total, prior: 0 });
  for (const p of prior) {
    const existing = byId.get(p.partnerId);
    if (existing) existing.prior = p.total;
    else byId.set(p.partnerId, { name: p.partnerName, current: 0, prior: p.total });
  }

  const totalMovement = Array.from(byId.values()).reduce((s, v) => s + (v.current - v.prior), 0);
  const floor = Math.max(Math.abs(totalMovement) * 0.05, 1);

  const drivers: Driver[] = [];
  for (const [partnerId, v] of byId.entries()) {
    const delta = round2(v.current - v.prior);
    if (Math.abs(delta) < floor) continue;
    drivers.push({
      type,
      entityRef: partnerId,
      entityName: v.name,
      cashImpact: delta,
      daysImpact: revenueOrCogs > 0 ? round2((delta / revenueOrCogs) * daysInPeriod) : 0,
    });
  }
  return drivers.sort((a, b) => Math.abs(b.cashImpact) - Math.abs(a.cashImpact));
}

export const ai25WorkingCapitalIntelligence: WorkflowDefinition<Ai25Raw, Ai25Extracted, Ai25Proposal> = {
  id: "AI-25",
  version: "1.0.0",
  eventKeys: ["period.horizon.reached"],
  actionClass: "working_capital",
  defaultAutonomy: AI_AUTONOMY_LEVEL.OBSERVE,

  async subscriptionFilter(): Promise<boolean> {
    return true; // fan-out, shared with AI-13/14/22/24/28
  },

  async observe(event): Promise<ObservedResult<Ai25Raw>> {
    const period = String(event.payload.period);
    const periodEnd = String(event.payload.periodEnd);
    return { entityId: `${event.tenantId}:${period}`, raw: { period, periodEnd, actingUserId: event.payload.actingUserId ? String(event.payload.actingUserId) : undefined } };
  },

  async extract(observed, ctx): Promise<Ai25Extracted> {
    await connectDB();
    const tenantId = ctx.tenantId;
    const [y, m] = observed.raw.period.split("-").map(Number);
    const curStart = new Date(Date.UTC(y, m - 1, 1));
    const curEnd = new Date(Date.UTC(y, m, 0, 23, 59, 59, 999));
    const priorEnd = new Date(Date.UTC(y, m - 1, 0, 23, 59, 59, 999));
    const priorStart = new Date(Date.UTC(priorEnd.getUTCFullYear(), priorEnd.getUTCMonth(), 1));
    const daysInPeriod = daysBetween(curStart, curEnd);
    const daysInPriorPeriod = daysBetween(priorStart, priorEnd);

    const [arCurrentReport, arPriorReport, apCurrentReport, apPriorReport] = await Promise.all([
      buildAgedPartnerReport({ tenantId, type: "receivable", asOfDate: curEnd }),
      buildAgedPartnerReport({ tenantId, type: "receivable", asOfDate: priorEnd }),
      buildAgedPartnerReport({ tenantId, type: "payable", asOfDate: curEnd }),
      buildAgedPartnerReport({ tenantId, type: "payable", asOfDate: priorEnd }),
    ]);

    const [curReport, priorReport] = await Promise.all([
      buildPostedJournalReport({ tenantId, startDate: curStart, endDate: curEnd }),
      buildPostedJournalReport({ tenantId, startDate: priorStart, endDate: priorEnd }),
    ]);

    const cogsOf = (report: Awaited<ReturnType<typeof buildPostedJournalReport>>) =>
      Object.values(report.expense.accounts)
        .filter((a) => a.accountType === "expense_direct_cost")
        .reduce((s, a) => s + a.amount, 0);

    const inventoryMapping = await resolveInventoryAccountMapping(tenantId);
    let inventoryBalanceCurrent: number | null = null;
    let inventoryBalancePrior: number | null = null;
    if (inventoryMapping.resolved && inventoryMapping.accounts.length > 0) {
      const [curBal, priorBal] = await Promise.all([
        Promise.all(inventoryMapping.accounts.map((a) => glBalanceForAccount(tenantId, a.id, curEnd))).then((vals) => vals.reduce((s, v) => s + v, 0)),
        Promise.all(inventoryMapping.accounts.map((a) => glBalanceForAccount(tenantId, a.id, priorEnd))).then((vals) => vals.reduce((s, v) => s + v, 0)),
      ]);
      inventoryBalanceCurrent = round2(curBal);
      inventoryBalancePrior = round2(priorBal);
    }

    return {
      actingUserId: observed.raw.actingUserId,
      period: observed.raw.period,
      daysInPeriod,
      daysInPriorPeriod,
      arCurrent: toBalances(arCurrentReport.items),
      arPrior: toBalances(arPriorReport.items),
      apCurrent: toBalances(apCurrentReport.items),
      apPrior: toBalances(apPriorReport.items),
      arCurrentTotal: arCurrentReport.totals.total,
      arPriorTotal: arPriorReport.totals.total,
      apCurrentTotal: apCurrentReport.totals.total,
      apPriorTotal: apPriorReport.totals.total,
      revenueCurrent: round2(curReport.income.total),
      revenuePrior: round2(priorReport.income.total),
      cogsCurrent: round2(cogsOf(curReport)),
      cogsPrior: round2(cogsOf(priorReport)),
      inventoryBalanceCurrent,
      inventoryBalancePrior,
      inventoryMappingBasis: inventoryMapping.basis,
    };
  },

  async reason(extracted): Promise<ReasonResult<Ai25Proposal>> {
    const dso = extracted.revenueCurrent > 0 ? round2((extracted.arCurrentTotal / extracted.revenueCurrent) * extracted.daysInPeriod) : null;
    const dpo = extracted.cogsCurrent > 0 ? round2((extracted.apCurrentTotal / extracted.cogsCurrent) * extracted.daysInPeriod) : null;
    const dio = extracted.cogsCurrent > 0 && extracted.inventoryBalanceCurrent !== null ? round2((extracted.inventoryBalanceCurrent / extracted.cogsCurrent) * extracted.daysInPeriod) : null;
    const ccc = dso !== null && dpo !== null ? round2(dso - dpo + (dio ?? 0)) : null;

    const dsoPrior = extracted.revenuePrior > 0 ? round2((extracted.arPriorTotal / extracted.revenuePrior) * extracted.daysInPriorPeriod) : null;
    const dpoPrior = extracted.cogsPrior > 0 ? round2((extracted.apPriorTotal / extracted.cogsPrior) * extracted.daysInPriorPeriod) : null;
    const dioPrior = extracted.cogsPrior > 0 && extracted.inventoryBalancePrior !== null ? round2((extracted.inventoryBalancePrior / extracted.cogsPrior) * extracted.daysInPriorPeriod) : null;
    const cccPrior = dsoPrior !== null && dpoPrior !== null ? round2(dsoPrior - dpoPrior + (dioPrior ?? 0)) : null;

    const notComputable: { what: string; reason: string }[] =
      dio === null && extracted.inventoryBalanceCurrent === null
        ? [{ what: "dio", reason: `${extracted.inventoryMappingBasis} (docs/ai/OPEN_QUESTIONS.md #21/#24)` }]
        : [];

    const arDrivers = decomposePartnerDrivers(extracted.arCurrent, extracted.arPrior, "customer", extracted.revenueCurrent, extracted.daysInPeriod);
    const apDrivers = decomposePartnerDrivers(extracted.apCurrent, extracted.apPrior, "vendor", extracted.cogsCurrent, extracted.daysInPeriod);
    const drivers = [...arDrivers, ...apDrivers].sort((a, b) => Math.abs(b.cashImpact) - Math.abs(a.cashImpact));

    const recommendedActions = drivers.slice(0, 5).map((d) => ({
      description:
        d.type === "customer"
          ? `Follow up with ${d.entityName} — ₹${Math.abs(d.cashImpact)} ${d.cashImpact > 0 ? "newly outstanding" : "collected"}${d.daysImpact !== 0 ? `, ~${Math.abs(d.daysImpact)} day(s) of DSO impact` : ""}`
          : `${d.cashImpact > 0 ? "Review timing on" : "Note earlier payment to"} ${d.entityName} — ₹${Math.abs(d.cashImpact)} ${d.cashImpact > 0 ? "increase" : "decrease"} in payable balance`,
      cashImpact: d.cashImpact,
    }));

    const findings: ReasonResult<Ai25Proposal>["findings"] = drivers
      .filter((d) => Math.abs(d.cashImpact) > 0)
      .slice(0, 10)
      .map((d) => ({
        id: `ai25-driver-${d.type}-${d.entityRef}-${extracted.period}`,
        type: AI_FINDING_TYPE.EXPLANATION,
        severity: AI_FINDING_SEVERITY.LOW,
        title: `${d.type === "customer" ? "AR" : "AP"} movement: ${d.entityName}`,
        detail: `₹${d.cashImpact} cash impact, ~${d.daysImpact} day(s)`,
        amount: d.cashImpact,
        confidence: 1,
        subjectRefs: [{ model: "Customer", id: d.entityRef }],
        evidence: [],
        reasonChain: [],
      }));

    return {
      proposal: {
        metrics: { dso, dpo, dio, ccc, formulaUsed: FORMULA_USED, notComputable },
        comparatives: { dso: dsoPrior, dpo: dpoPrior, dio: dioPrior, ccc: cccPrior },
        movement: {
          dso: dso !== null && dsoPrior !== null ? round2(dso - dsoPrior) : null,
          dpo: dpo !== null && dpoPrior !== null ? round2(dpo - dpoPrior) : null,
          dio: dio !== null && dioPrior !== null ? round2(dio - dioPrior) : null,
          arBalance: round2(extracted.arCurrentTotal - extracted.arPriorTotal),
          apBalance: round2(extracted.apCurrentTotal - extracted.apPriorTotal),
          inventoryBalance: extracted.inventoryBalanceCurrent !== null && extracted.inventoryBalancePrior !== null ? round2(extracted.inventoryBalanceCurrent - extracted.inventoryBalancePrior) : null,
        },
        drivers,
        cashTiedUp: { ar: round2(extracted.arCurrentTotal - extracted.arPriorTotal), ap: round2(extracted.apCurrentTotal - extracted.apPriorTotal) },
        recommendedActions,
      },
      confidence: 1,
      findings,
      reasonChain: [
        `DSO ${dso ?? "not_computable"}, DPO ${dpo ?? "not_computable"}, DIO ${dio ?? "not_computable"}, CCC ${ccc ?? "not_computable"}${dio === null ? " (excludes inventory)" : ""}`,
        `${drivers.length} driver(s) >= 5% of their respective AR/AP movement`,
      ],
      gateOverrides: { periodOpen: true, permissionOk: true },
    };
  },

  async validate(): Promise<{ valid: boolean; vetoReason?: string }> {
    return { valid: true };
  },

  async act(): Promise<ActResult> {
    // Read-only by construction — no write tool exists for AI-25.
    return { findings: [], actionsTaken: [] };
  },

  async verify(): Promise<VerifyResult> {
    return { ok: true };
  },
};
