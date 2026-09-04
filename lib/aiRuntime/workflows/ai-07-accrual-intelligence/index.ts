import connectDB from "@/lib/db";
import mongoose from "mongoose";
import PurchaseOrder from "@/models/finance/PurchaseOrder";
import Invoice from "@/models/finance/Invoice";
import Customer from "@/models/sales/Customer";
import Account from "@/models/finance/Account";
import AiSchedule, { AI_SCHEDULE_TYPE, AI_SCHEDULE_PERIOD_STATUS } from "@/models/ai/AiSchedule";
import AiMaterialityPolicy, { findThreshold, type IAiMaterialityPolicy } from "@/models/ai/AiMaterialityPolicy";
import { scheduleBelongsTo } from "@/lib/aiRuntime/schedules/ownership";
import { AI_AUTONOMY_LEVEL, AI_FINDING_TYPE, AI_FINDING_SEVERITY, AI_LEARNING_OUTCOME, DOCUMENT_STATUS } from "@/lib/constants/statuses";
import type {
  WorkflowDefinition,
  ObservedResult,
  ReasonResult,
  ActResult,
  VerifyResult,
} from "@/lib/aiRuntime/workflows/types";

/**
 * AI-07 — Accrual intelligence (docs/ai/BRIEF-03-BATCH-B.md). "Nothing exists" — fully new — but
 * built on real, already-present data: `PurchaseOrder.orderLines[].receivedQty > billedQty` is
 * deterministic goods-received-not-invoiced evidence, needing no model call. "Build this first
 * and prove it alone" — this workflow does exactly that; it does not call an LLM anywhere.
 *
 * **Recurring-vendor pattern-matching (algorithm step 2) is deliberately not built this batch** —
 * it needs a statistical baseline over 12–24 periods of vendor/account history that nothing in
 * this codebase currently aggregates, and inventing thresholds for it would violate the "never a
 * model-invented number" rule as surely as guessing an amount would. Documented in
 * docs/ai/OPEN_QUESTIONS.md; the effect is conservative by construction — a workflow that never
 * proposes a pattern-based accrual can never double-accrue or invent one, and a brand-new vendor
 * with no history correctly never gets one either (one of this workflow's required tests).
 *
 * **Two trigger modes**: `ai.sweep.hourly` runs the GRNI scan across every open PurchaseOrder for
 * the tenant (the "scheduled sweep" trigger from the spec); `bill.created` checks whether the new
 * bill matches a PO this workflow previously accrued for, and if so records accrual accuracy into
 * the shared learning store (Part 2.6) — the best evidence for raising autonomy later, per spec.
 * `schedule.due` drafts the single reversing entry each `accrual_reversal` AiSchedule carries
 * (algorithm step 5 — "reversal uses the same engine and cannot be forgotten"). That eventKey
 * fans out to every Batch B workflow registered on it, so this only ever acts on schedules it
 * owns (`scheduleType: "accrual_reversal"`, `sourceRef.model: "PurchaseOrder"`) and no-ops on
 * anyone else's, exactly like AI-08/AI-10 do for the schedules they own.
 */

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

interface Ai07Raw {
  mode: "grni_scan" | "accuracy_check" | "reversal_run";
  actingUserId?: string;
  invoiceId?: string;
  scheduleId?: string;
}

interface GrniCandidate {
  poId: string;
  poName: string;
  lineIndex: number;
  vendorId: string;
  vendorName: string;
  productName: string;
  gapQty: number;
  unitPrice: number;
  amount: number;
}

interface OverBilledLine {
  poId: string;
  poName: string;
  lineIndex: number;
  productName: string;
  receivedQty: number;
  billedQty: number;
}

interface Ai07GrniExtracted {
  mode: "grni_scan";
  actingUserId?: string;
  candidates: GrniCandidate[];
  overBilled: OverBilledLine[];
  materialityConfigured: boolean;
  materialityThreshold: number | null;
  debitAccountId: string | null;
  creditAccountId: string | null;
}

interface Ai07AccuracyExtracted {
  mode: "accuracy_check";
  actingUserId?: string;
  invoiceId: string;
  invoiceAmount: number;
  poId: string | null;
  priorAccrualAmount: number | null;
  priorScheduleIds: string[];
}

interface Ai07ReversalExtracted {
  mode: "reversal_run";
  actingUserId?: string;
  scheduleId: string;
  duePeriods: { periodKey: string; dueDate: Date; amount: number }[];
  schedule: { debitAccountId: string; creditAccountId: string };
}

type Ai07Extracted = Ai07GrniExtracted | Ai07AccuracyExtracted | Ai07ReversalExtracted;

interface Ai07Proposal {
  mode: "grni_scan" | "accuracy_check" | "reversal_run";
  draftable: GrniCandidate[];
  recommendOnly: GrniCandidate[];
  reversalPeriods?: { periodKey: string; dueDate: Date; amount: number }[];
  /** Chunk 9 (0.1) — populated in act() for accuracy_check mode so the executor's own
   *  AiLearningRecord (created generically from `reasoned.proposal`) carries the real comparison,
   *  not just the mode placeholder. */
  accrualAccuracy?: { basis: "accrual_accuracy"; poId: string; priorAccrualAmount: number; invoiceAmount: number };
}

export const ai07AccrualIntelligence: WorkflowDefinition<Ai07Raw, Ai07Extracted, Ai07Proposal> = {
  id: "AI-07",
  version: "1.0.0",
  eventKeys: ["ai.sweep.hourly", "bill.created", "schedule.due"],
  actionClass: "accrual",
  defaultAutonomy: AI_AUTONOMY_LEVEL.DRAFT,

  // `ai.sweep.hourly`/`bill.created` are fan-out (shared with AI-03/AI-09 and AI-02/08/10
  // respectively) — always accepted. `schedule.due` is real ownership: only accept a reversal
  // schedule this workflow itself created (docs/ai/BRIEF-04-BATCH-C.md Part 0.2, replacing the
  // ad-hoc extract()-time check Batch B hand-wrote; extract() keeps its own check too, as
  // defense in depth).
  async subscriptionFilter(event): Promise<boolean> {
    if (event.eventKey !== "schedule.due") return true;
    const scheduleId = event.payload.scheduleId ? String(event.payload.scheduleId) : "";
    if (!scheduleId) return false;
    return scheduleBelongsTo(event.tenantId, scheduleId, AI_SCHEDULE_TYPE.ACCRUAL_REVERSAL, "PurchaseOrder");
  },

  async observe(event): Promise<ObservedResult<Ai07Raw>> {
    const actingUserId = event.payload.actingUserId ? String(event.payload.actingUserId) : undefined;
    if (event.eventKey === "bill.created") {
      const invoiceId = String(event.payload.invoiceId);
      return { entityId: invoiceId, subjectRef: { model: "Invoice", id: invoiceId }, raw: { mode: "accuracy_check", invoiceId, actingUserId } };
    }
    if (event.eventKey === "schedule.due") {
      const scheduleId = String(event.payload.scheduleId);
      return { entityId: scheduleId, subjectRef: { model: "AiSchedule", id: scheduleId }, raw: { mode: "reversal_run", scheduleId, actingUserId } };
    }
    return { entityId: event.tenantId, raw: { mode: "grni_scan", actingUserId } };
  },

  async extract(observed, ctx): Promise<Ai07Extracted> {
    await connectDB();

    if (observed.raw.mode === "reversal_run") {
      const schedule = await AiSchedule.findById(observed.raw.scheduleId).lean();
      if (!schedule) throw new Error(`AiSchedule ${observed.raw.scheduleId} not found`);

      const owned = schedule.scheduleType === AI_SCHEDULE_TYPE.ACCRUAL_REVERSAL && schedule.sourceRef.model === "PurchaseOrder";
      const today = new Date();
      const duePeriods = owned
        ? (schedule.periods ?? [])
            .filter((p) => p.status === AI_SCHEDULE_PERIOD_STATUS.PENDING && p.dueDate.getTime() <= today.getTime())
            .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime())
            .map((p) => ({ periodKey: p.periodKey, dueDate: p.dueDate, amount: p.amount }))
        : [];

      return {
        mode: "reversal_run",
        actingUserId: observed.raw.actingUserId,
        scheduleId: observed.raw.scheduleId!,
        duePeriods,
        schedule: { debitAccountId: String(schedule.debitAccountId), creditAccountId: String(schedule.creditAccountId) },
      };
    }

    if (observed.raw.mode === "accuracy_check") {
      const invoice = await Invoice.findById(observed.raw.invoiceId).lean();
      if (!invoice) throw new Error(`Invoice ${observed.raw.invoiceId} not found`);
      const po = await PurchaseOrder.findOne({ tenantId: ctx.tenantId, invoiceIds: invoice._id }).lean();
      let priorAccrualAmount: number | null = null;
      const priorScheduleIds: string[] = [];
      if (po) {
        const schedules = await AiSchedule.find({
          tenantId: ctx.tenantId,
          scheduleType: AI_SCHEDULE_TYPE.ACCRUAL_REVERSAL,
          "sourceRef.model": "PurchaseOrder",
          "sourceRef.id": String(po._id),
        }).lean();
        if (schedules.length > 0) {
          priorAccrualAmount = round2(schedules.reduce((s, sc) => s + sc.totalAmount, 0));
          priorScheduleIds.push(...schedules.map((s) => String(s._id)));
        }
      }
      return {
        mode: "accuracy_check",
        actingUserId: observed.raw.actingUserId,
        invoiceId: observed.raw.invoiceId!,
        invoiceAmount: (invoice as { amountTotal?: number }).amountTotal ?? 0,
        poId: po ? String(po._id) : null,
        priorAccrualAmount,
        priorScheduleIds,
      };
    }

    const purchaseOrders = await PurchaseOrder.find({
      tenantId: ctx.tenantId,
      status: { $nin: [DOCUMENT_STATUS.DRAFT, DOCUMENT_STATUS.CANCELLED] },
    }).lean();

    const candidates: GrniCandidate[] = [];
    const overBilled: OverBilledLine[] = [];

    for (const po of purchaseOrders) {
      let vendorName = "";
      if (po.partnerId) {
        const vendor = await Customer.findById(po.partnerId).select("header.name").lean();
        vendorName = (vendor as { header?: { name?: string } } | null)?.header?.name ?? "";
      }
      (po.orderLines ?? []).forEach((line, lineIndex) => {
        const gap = round2((line.receivedQty ?? 0) - (line.billedQty ?? 0));
        if (gap > 0.001) {
          candidates.push({
            poId: String(po._id),
            poName: po.name,
            lineIndex,
            vendorId: String(po.partnerId),
            vendorName,
            productName: line.name,
            gapQty: gap,
            unitPrice: line.priceUnit,
            amount: round2(gap * line.priceUnit),
          });
        } else if (gap < -0.001) {
          overBilled.push({ poId: String(po._id), poName: po.name, lineIndex, productName: line.name, receivedQty: line.receivedQty, billedQty: line.billedQty });
        }
      });
    }

    const materialityPolicy = await AiMaterialityPolicy.findOne({ tenantId: ctx.tenantId }).lean();
    const threshold = findThreshold(materialityPolicy as unknown as IAiMaterialityPolicy | null, "accrual");

    const creditAccount = await Account.findOne({ tenantId: ctx.tenantId, account_type: "liability_current", isActive: { $ne: false }, isLocked: { $ne: true } }).lean();
    const debitAccount = await Account.findOne({ tenantId: ctx.tenantId, account_type: "expense", isActive: { $ne: false }, isLocked: { $ne: true } }).lean();

    return {
      mode: "grni_scan",
      actingUserId: observed.raw.actingUserId,
      candidates,
      overBilled,
      materialityConfigured: Boolean(threshold),
      materialityThreshold: threshold?.absoluteAmount ?? null,
      debitAccountId: debitAccount ? String(debitAccount._id) : null,
      creditAccountId: creditAccount ? String(creditAccount._id) : null,
    };
  },

  async reason(extracted, ctx): Promise<ReasonResult<Ai07Proposal>> {
    if (extracted.mode === "reversal_run") {
      return {
        proposal: { mode: "reversal_run", draftable: [], recommendOnly: [], reversalPeriods: extracted.duePeriods },
        confidence: extracted.duePeriods.length > 0 ? 1 : 0,
        findings: [],
        reasonChain: [`accrual reversal ${extracted.scheduleId}: ${extracted.duePeriods.length} period(s) due`],
        gateOverrides: { periodOpen: true, permissionOk: Boolean(extracted.actingUserId) },
      };
    }

    if (extracted.mode === "accuracy_check") {
      const reasonChain: string[] = [];
      if (extracted.priorAccrualAmount === null) {
        reasonChain.push("no prior accrual for this PO — nothing to compare");
        return { proposal: { mode: "accuracy_check", draftable: [], recommendOnly: [] }, confidence: 0, findings: [], reasonChain };
      }
      const delta = round2(extracted.invoiceAmount - extracted.priorAccrualAmount);
      reasonChain.push(`prior accrual ${extracted.priorAccrualAmount} vs invoice ${extracted.invoiceAmount} — delta ${delta}`);
      return {
        proposal: { mode: "accuracy_check", draftable: [], recommendOnly: [] },
        confidence: 1,
        findings: [],
        reasonChain,
        gateOverrides: { periodOpen: true, permissionOk: true },
      };
    }

    const reasonChain = [`scanned ${extracted.candidates.length} GRNI candidate line(s), ${extracted.overBilled.length} over-billed line(s)`];
    if (!extracted.materialityConfigured) {
      reasonChain.push("no accrual materiality threshold configured — every candidate is RECOMMEND (A.5)");
    }

    const draftable: GrniCandidate[] = [];
    const recommendOnly: GrniCandidate[] = [];
    for (const c of extracted.candidates) {
      const belowThreshold = extracted.materialityConfigured && extracted.materialityThreshold !== null && c.amount < extracted.materialityThreshold;
      if (belowThreshold && extracted.debitAccountId && extracted.creditAccountId) {
        draftable.push(c);
      } else {
        recommendOnly.push(c);
      }
    }

    const findings: ReasonResult<Ai07Proposal>["findings"] = [
      ...extracted.candidates.map((c) => ({
        id: `ai07-grni-${c.poId}-${c.lineIndex}`,
        type: AI_FINDING_TYPE.PROPOSAL,
        severity: AI_FINDING_SEVERITY.MEDIUM,
        title: `GRNI accrual candidate: ${c.vendorName || c.poId}`,
        detail: `${c.productName}: received ${c.gapQty} more than billed on ${c.poName} @ ${c.unitPrice}`,
        amount: c.amount,
        confidence: 1,
        subjectRefs: [{ model: "PurchaseOrder", id: c.poId }],
        evidence: [{ kind: "record" as const, ref: c.poId, label: `${c.poName} line ${c.lineIndex}` }],
        reasonChain: [],
      })),
      ...extracted.overBilled.map((o) => ({
        id: `ai07-overbilled-${o.poId}-${o.lineIndex}`,
        type: AI_FINDING_TYPE.EXCEPTION,
        severity: AI_FINDING_SEVERITY.MEDIUM,
        title: "Over-billed PO line",
        detail: `${o.productName} on ${o.poName}: billed ${o.billedQty} exceeds received ${o.receivedQty}`,
        confidence: 1,
        subjectRefs: [{ model: "PurchaseOrder", id: o.poId }],
        evidence: [],
        reasonChain: [],
      })),
    ];

    return {
      proposal: { mode: "grni_scan", draftable, recommendOnly },
      confidence: draftable.length > 0 ? 1 : 0,
      confidenceComponents: { grni_evidence: 1 },
      findings,
      reasonChain,
      gateOverrides: { periodOpen: true, permissionOk: Boolean(extracted.actingUserId) },
    };
  },

  async validate(): Promise<{ valid: boolean; vetoReason?: string }> {
    return { valid: true };
  },

  async act(reasoned, ctx, decision, rt, extracted): Promise<ActResult> {
    if (extracted.mode === "reversal_run") {
      // See ai-08's act() comment: decision.autonomyApplied must be checked explicitly —
      // callTool()'s maxAutonomyLevel check alone does not consult the gate's verdict.
      const actionsTaken: ActResult["actionsTaken"] = [];
      if (decision.autonomyApplied === AI_AUTONOMY_LEVEL.RECOMMEND) {
        return { findings: [], actionsTaken };
      }
      for (const period of reasoned.proposal.reversalPeriods ?? []) {
        const lineIds = [
          { accountId: extracted.schedule.debitAccountId, label: `Accrual reversal ${period.periodKey}`, debit: period.amount, credit: 0 },
          { accountId: extracted.schedule.creditAccountId, label: `Accrual reversal ${period.periodKey}`, debit: 0, credit: period.amount },
        ];
        const header = { journalType: "general" as const, date: period.dueDate };
        try {
          if (ctx.policy.autoPostSchedules) {
            await rt.callTool(
              "post_journal",
              { tenantId: ctx.tenantId, createdBy: extracted.actingUserId, scheduleId: extracted.scheduleId, periodKey: period.periodKey, header, lineIds },
              { requestedAutonomy: AI_AUTONOMY_LEVEL.CONTROLLED_AUTONOMOUS, idempotencyKey: `${extracted.scheduleId}:${period.periodKey}` },
            );
            actionsTaken.push({ tool: "post_journal", args: { scheduleId: extracted.scheduleId, periodKey: period.periodKey }, reversible: false });
          } else {
            const drafted = await rt.callTool<{ journalEntryId: string }>(
              "draft_journal",
              { tenantId: ctx.tenantId, createdBy: extracted.actingUserId, header, lineIds },
              { requestedAutonomy: AI_AUTONOMY_LEVEL.DRAFT, idempotencyKey: `ai-07-reversal-draft:${extracted.scheduleId}:${period.periodKey}` },
            );
            await rt.callTool(
              "link_schedule_draft",
              { tenantId: ctx.tenantId, scheduleId: extracted.scheduleId, periodKey: period.periodKey, journalEntryId: drafted.journalEntryId },
              { requestedAutonomy: AI_AUTONOMY_LEVEL.CONTROLLED_AUTONOMOUS },
            );
            actionsTaken.push({ tool: "draft_journal", args: { scheduleId: extracted.scheduleId, periodKey: period.periodKey }, reversible: true });
          }
        } catch {
          // Locked period or no acting user — period stays pending, next sweep retries (B.2).
        }
      }
      return { findings: [], actionsTaken, metrics: { scanned: (reasoned.proposal.reversalPeriods ?? []).length, autoActioned: actionsTaken.length } };
    }

    if (extracted.mode === "accuracy_check") {
      if (extracted.priorAccrualAmount === null) return { findings: [], actionsTaken: [] };
      const delta = Math.abs(extracted.invoiceAmount - extracted.priorAccrualAmount);
      const deltaPct = extracted.priorAccrualAmount !== 0 ? delta / Math.abs(extracted.priorAccrualAmount) : 1;
      // Chunk 9 (0.1): the executor's own `learn` stage creates this run's ONE AiLearningRecord
      // generically from `reasoned.proposal` — mutating it here (the same pattern AI-30 already
      // uses for its own proposal) is how the record gets the real comparison detail, and
      // `ActResult.learningOutcome` is how it gets resolved immediately instead of staying
      // `pending`. Previously this called `record_learning_outcome` directly, which duplicated
      // the record the executor had already created — fixed (`docs/ai/OPEN_QUESTIONS.md`).
      reasoned.proposal.accrualAccuracy = { basis: "accrual_accuracy", poId: extracted.poId, priorAccrualAmount: extracted.priorAccrualAmount, invoiceAmount: extracted.invoiceAmount };
      return {
        findings: [],
        actionsTaken: [],
        metrics: { scanned: 1 },
        learningOutcome: {
          outcome: deltaPct <= 0.05 ? AI_LEARNING_OUTCOME.ACCEPTED : AI_LEARNING_OUTCOME.EDITED,
          downstreamResult: `delta=${round2(delta)} (${(deltaPct * 100).toFixed(1)}%)`,
        },
      };
    }

    if (decision.autonomyApplied !== AI_AUTONOMY_LEVEL.DRAFT || !extracted.debitAccountId || !extracted.creditAccountId) {
      return { findings: [], actionsTaken: [] };
    }

    const actionsTaken: ActResult["actionsTaken"] = [];
    for (const c of reasoned.proposal.draftable) {
      const reversalDate = new Date();
      reversalDate.setUTCMonth(reversalDate.getUTCMonth() + 1);
      try {
        await rt.callTool(
          "draft_accrual",
          {
            tenantId: ctx.tenantId,
            createdBy: extracted.actingUserId,
            createdByWorkflow: "AI-07",
            header: { journalType: "general", date: new Date() },
            lineIds: [
              { accountId: extracted.debitAccountId, label: `GRNI accrual ${c.poName}`, debit: c.amount, credit: 0 },
              { accountId: extracted.creditAccountId, label: `GRNI accrual ${c.poName}`, debit: 0, credit: c.amount },
            ],
            reversalDate,
            debitAccountId: extracted.debitAccountId,
            creditAccountId: extracted.creditAccountId,
            amount: c.amount,
            sourceRef: { model: "PurchaseOrder", id: c.poId },
          },
          { requestedAutonomy: AI_AUTONOMY_LEVEL.DRAFT, idempotencyKey: `ai-07-accrual:${c.poId}:${c.lineIndex}` },
        );
        actionsTaken.push({ tool: "draft_accrual", args: { poId: c.poId, lineIndex: c.lineIndex, amount: c.amount }, reversible: true });
      } catch {
        // Smart-rules veto or no acting user — leave as a finding, no draft.
      }
    }

    return { findings: [], actionsTaken, metrics: { scanned: reasoned.proposal.draftable.length + reasoned.proposal.recommendOnly.length, autoActioned: actionsTaken.length } };
  },

  async verify(): Promise<VerifyResult> {
    return { ok: true };
  },
};
