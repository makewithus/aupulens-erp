import { RECONCILIATION_DEFINITIONS, runReconciliationDefinition } from "@/lib/aiRuntime/reconciliation/engine";
import { resolveInventoryAccountMapping } from "@/lib/aiRuntime/inventory/accountMapping";
import {
  detectNegativeStock,
  detectValuationAnomalies,
  detectCountVariances,
  detectSlowMoving,
  computeMarginByProduct,
  type NegativeStockFinding,
  type ValuationAnomaly,
  type CountVariance,
  type SlowMovingFinding,
  type MarginByProduct,
} from "@/lib/aiRuntime/inventory/detect";
import { AI_AUTONOMY_LEVEL, AI_FINDING_TYPE, AI_FINDING_SEVERITY } from "@/lib/constants/statuses";
import type { WorkflowDefinition, ObservedResult, ReasonResult, ActResult, VerifyResult } from "@/lib/aiRuntime/workflows/types";

/**
 * AI-11 — Inventory / COGS intelligence (docs/ai/BRIEF-08a-BATCH-G.md). Named in Chunk 6
 * (`docs/ai/BRIEF-06-BATCH-E.md` Part 0.1), specced and built here in Chunk 8a.
 *
 * **First job**: answer which accounts constitute inventory
 * (`lib/aiRuntime/inventory/accountMapping.ts`), reusing `lib/accounting/inventory.ts`'s own real
 * posting-account resolution rather than a second guess — this is the same answer AI-22's
 * `inventory` reconciliation definition and AI-25's inventory-days gap have both been waiting on
 * since Chunk 5.
 *
 * **Subledger-to-GL reuses AI-22's own `inventory` reconciliation definition directly** — never a
 * second computation. Every other detector (negative stock, valuation, count variance,
 * obsolescence) is a pure read over `Product`/`Stock`/`StockMove`/`Batch`, no posting, no
 * adjustment — `lib/aiRuntime/inventory/detect.ts` for the real logic.
 *
 * OBSERVE-adjacent (`RECOMMEND`) — valuation rules stay deterministic; adjustments are judgement,
 * proposed only.
 */

interface Ai11Raw {
  period: string;
  periodEnd: string;
}

interface Ai11Extracted {
  period: string;
  periodEnd: string;
  accountMapping: Awaited<ReturnType<typeof resolveInventoryAccountMapping>>;
  negativeStock: NegativeStockFinding[];
  valuationAnomalies: ValuationAnomaly[];
  countVariances: CountVariance[];
  slowMoving: SlowMovingFinding[];
  marginByProduct: MarginByProduct[];
}

interface Ai11Proposal {
  period: string;
  inventoryAccountMapping: Ai11Extracted["accountMapping"];
  subledgerToGl: { qtyValue: number; glValue: number; difference: number; status: string } | null;
  negativeStock: NegativeStockFinding[];
  countVariances: CountVariance[];
  valuationAnomalies: ValuationAnomaly[];
  slowMoving: SlowMovingFinding[];
  marginAlerts: MarginByProduct[];
}

function currentPeriod(): { period: string; periodEnd: Date } {
  const now = new Date();
  const period = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const periodEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999));
  return { period, periodEnd };
}

const MARGIN_DROP_ALERT_POINTS = 10; // percentage points — a documented heuristic

export const ai11InventoryCogs: WorkflowDefinition<Ai11Raw, Ai11Extracted, Ai11Proposal> = {
  id: "AI-11",
  version: "1.0.0",
  eventKeys: ["period.horizon.reached", "ai.sweep.hourly"],
  actionClass: "inventory_intelligence",
  defaultAutonomy: AI_AUTONOMY_LEVEL.RECOMMEND,

  subscriptionFilter(): boolean {
    return true;
  },

  async observe(event): Promise<ObservedResult<Ai11Raw>> {
    const fallback = currentPeriod();
    const period = event.payload.period ? String(event.payload.period) : fallback.period;
    const periodEnd = event.payload.periodEnd ? String(event.payload.periodEnd) : fallback.periodEnd.toISOString();
    return { entityId: event.tenantId, raw: { period, periodEnd } };
  },

  async extract(observed, ctx): Promise<Ai11Extracted> {
    const [accountMapping, negativeStock, valuationAnomalies, countVariances, slowMoving, marginByProduct] = await Promise.all([
      resolveInventoryAccountMapping(ctx.tenantId),
      detectNegativeStock(ctx.tenantId),
      detectValuationAnomalies(ctx.tenantId),
      detectCountVariances(ctx.tenantId),
      detectSlowMoving(ctx.tenantId),
      computeMarginByProduct(ctx.tenantId),
    ]);
    return { period: observed.raw.period, periodEnd: observed.raw.periodEnd, accountMapping, negativeStock, valuationAnomalies, countVariances, slowMoving, marginByProduct };
  },

  async reason(extracted): Promise<ReasonResult<Ai11Proposal>> {
    const findings: ReasonResult<Ai11Proposal>["findings"] = [];

    for (const n of extracted.negativeStock) {
      findings.push({
        id: `ai11-negative-stock-${n.productId}`,
        type: AI_FINDING_TYPE.EXCEPTION,
        severity: AI_FINDING_SEVERITY.HIGH,
        title: `Negative stock: ${n.productName}`,
        detail: `${n.qty} at ${n.location || "unspecified location"} — data-integrity failure, likely a movement-sequencing problem`,
        amount: n.qty,
        confidence: 1,
        subjectRefs: [{ model: "Product", id: n.productId }],
        evidence: n.causingSequence.slice(-5).map((s) => ({ kind: "record" as const, ref: s.stockId, label: s.reference })),
        reasonChain: [`${n.causingSequence.length} movement(s) in the causing sequence`],
      });
    }
    for (const v of extracted.countVariances) {
      findings.push({
        id: `ai11-count-variance-${v.productId}`,
        type: AI_FINDING_TYPE.EXCEPTION,
        severity: AI_FINDING_SEVERITY.MEDIUM,
        title: `Count variance: ${v.productName}`,
        detail: `counted ${v.countedQty} vs system ${v.systemQty} (variance ${v.variance}, valued ₹${v.valuedAt})`,
        amount: v.valuedAt,
        confidence: 1,
        subjectRefs: [{ model: "Product", id: v.productId }],
        evidence: [],
        reasonChain: [],
      });
    }
    for (const a of extracted.valuationAnomalies) {
      findings.push({
        id: `ai11-valuation-${a.productId}-${a.what}`,
        type: AI_FINDING_TYPE.ANOMALY,
        severity: AI_FINDING_SEVERITY.MEDIUM,
        title: `Valuation anomaly: ${a.productName}`,
        detail: a.detail,
        confidence: 1,
        subjectRefs: [{ model: "Product", id: a.productId }],
        evidence: [],
        reasonChain: [],
      });
    }
    const marginAlerts = extracted.marginByProduct.filter((m) => m.priorMarginPercent !== null && m.currentMarginPercent - (m.priorMarginPercent as number) <= -MARGIN_DROP_ALERT_POINTS);
    for (const m of marginAlerts) {
      findings.push({
        id: `ai11-margin-${m.productId}`,
        type: AI_FINDING_TYPE.ANOMALY,
        severity: AI_FINDING_SEVERITY.HIGH,
        title: `Margin break: ${m.productName}`,
        detail: `margin dropped from ${m.priorMarginPercent}% to ${m.currentMarginPercent}% — usually a costing error, one of the highest-value anomalies in the system (estimated COGS via standard_price, no real posted COGS pipeline exists — docs/ai/OPEN_QUESTIONS.md)`,
        confidence: 1,
        subjectRefs: [{ model: "Product", id: m.productId }],
        evidence: [],
        reasonChain: [],
      });
    }

    return {
      proposal: {
        period: extracted.period,
        inventoryAccountMapping: extracted.accountMapping,
        subledgerToGl: null,
        negativeStock: extracted.negativeStock,
        countVariances: extracted.countVariances,
        valuationAnomalies: extracted.valuationAnomalies,
        slowMoving: extracted.slowMoving,
        marginAlerts,
      },
      confidence: 1,
      findings,
      reasonChain: [`inventory account mapping resolved=${extracted.accountMapping.resolved}`, `${extracted.negativeStock.length} negative-stock item(s), ${extracted.countVariances.length} count variance(s), ${extracted.valuationAnomalies.length} valuation anomaly(ies), ${marginAlerts.length} margin break(s)`],
    };
  },

  async validate(): Promise<{ valid: boolean; vetoReason?: string }> {
    return { valid: true };
  },

  async act(reasoned, ctx, decision, rt, extracted): Promise<ActResult> {
    const tenantId = ctx.tenantId;
    const inventoryDefinition = RECONCILIATION_DEFINITIONS.find((d) => d.id === "inventory")!;
    const reconciliation = await runReconciliationDefinition(tenantId, inventoryDefinition, new Date(extracted.periodEnd), extracted.period);
    const subledgerToGl = { qtyValue: reconciliation.leftTotal, glValue: reconciliation.rightTotal, difference: reconciliation.difference, status: reconciliation.status };
    reasoned.proposal.subledgerToGl = subledgerToGl;

    await rt.callTool(
      "record_inventory_findings",
      {
        tenantId,
        period: extracted.period,
        accountMapping: extracted.accountMapping,
        subledgerToGl,
        negativeStock: extracted.negativeStock,
        countVariances: extracted.countVariances,
        valuationAnomalies: extracted.valuationAnomalies,
        slowMoving: extracted.slowMoving,
        marginAlerts: reasoned.proposal.marginAlerts,
      },
      { requestedAutonomy: AI_AUTONOMY_LEVEL.EXECUTE },
    );

    const findings: ActResult["findings"] = [];
    if (reconciliation.status === "unreconciled") {
      findings.push({
        id: `ai11-subledger-gl-${extracted.period}`,
        type: AI_FINDING_TYPE.EXCEPTION,
        severity: AI_FINDING_SEVERITY.HIGH,
        title: "Inventory subledger does not tie to the GL",
        detail: `qty×valuation ${subledgerToGl.qtyValue} vs GL ${subledgerToGl.glValue}, difference ${subledgerToGl.difference}`,
        amount: subledgerToGl.difference,
        confidence: 1,
        subjectRefs: [],
        evidence: [],
        reasonChain: [],
      });
    }

    return { findings, actionsTaken: [] };
  },

  async verify(): Promise<VerifyResult> {
    return { ok: true };
  },
};
