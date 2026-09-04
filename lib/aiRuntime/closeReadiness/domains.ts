import mongoose from "mongoose";
import connectDB from "@/lib/db";
import JournalEntry from "@/models/finance/JournalEntry";
import AiEvent from "@/models/ai/AiEvent";
import Invoice from "@/models/finance/Invoice";
import BankAccount from "@/models/finance/BankAccount";
import FxRate from "@/models/finance/FxRate";
import PurchaseOrder from "@/models/finance/PurchaseOrder";
import AiSchedule, { AI_SCHEDULE_TYPE, AI_SCHEDULE_PERIOD_STATUS, AI_SCHEDULE_STATUS } from "@/models/ai/AiSchedule";
import Asset from "@/models/finance/Asset";
import AiMaterialityPolicy, { findThreshold, type IAiMaterialityPolicy } from "@/models/ai/AiMaterialityPolicy";
import { DOCUMENT_STATUS, AI_EVENT_STATUS } from "@/lib/constants/statuses";
import { runReconciliationDefinition, RECONCILIATION_DEFINITIONS } from "@/lib/aiRuntime/reconciliation/engine";
import { classifyBlockerSeverity } from "@/lib/aiRuntime/closeReadiness/classify";
import { deriveAssertions } from "@/lib/aiRuntime/evidence/deriveAssertions";
import { computeComplianceReadiness } from "@/lib/aiRuntime/compliance/computeReadiness";
import type { IAiCloseBlocker, AiCloseDomainStatus, IAiCloseDomain } from "@/models/ai/AiCloseState";
import { AI_CLOSE_DOMAIN_STATUS } from "@/models/ai/AiCloseState";

/**
 * AI-13's 16 close domains (docs/ai/BRIEF-04-BATCH-C.md, AI-13; `compliance` added Chunk 6 per
 * docs/ai/BRIEF-06-BATCH-E.md). "Most of AI-13 is aggregation
 * of work already done" — every domain that has an AI-22 reconciliation definition behind it
 * (`bank`/`ar_control_finance`/`ap_control`/`inventory`/`prepaid`/`deferred_revenue`/
 * `fixed_assets`/`payroll`) wraps that definition's own `run()` via
 * `lib/aiRuntime/reconciliation/engine.ts`, never reimplemented.
 *
 * **Where a domain also needs a workflow-specific signal not covered by a reconciliation
 * definition** (e.g. AI-07's stale accruals, AI-10's fully-depreciated-but-active assets), this
 * file re-derives that signal from the same underlying models those workflows themselves read —
 * a lightweight, additive query, not a replay of the full 10-stage workflow. **The one deliberate
 * exception**: AI-09's "revenue gap" signal (delivered-not-billed) needs `models/sales/**` reads,
 * which Chunk 2's A.1 kept out of every Batch A/B/C workflow except AI-09 itself (a bounded,
 * named exception, Chunk 3 A.2) — AI-13 was not granted that exception, so the Revenue domain's
 * AI-09 half stays honestly unreplicated rather than quietly widening that boundary. Recorded in
 * `docs/ai/OPEN_QUESTIONS.md`.
 */

export interface DomainMaterialityContext {
  policy: IAiMaterialityPolicy | null;
}

export interface DomainResult {
  domain: string;
  status: AiCloseDomainStatus;
  reasonIfNotChecked?: string;
  blockers: IAiCloseBlocker[];
}

function daysBetween(a: Date, b: Date): number {
  return Math.max(0, Math.floor((b.getTime() - a.getTime()) / (24 * 60 * 60 * 1000)));
}

function blockerFromReconciliation(domain: string, appliesTo: string, ctx: DomainMaterialityContext, r: Awaited<ReturnType<typeof runReconciliationDefinition>>): DomainResult {
  if (r.status === "not_implemented") return { domain, status: AI_CLOSE_DOMAIN_STATUS.NOT_CHECKED, reasonIfNotChecked: r.notImplementedReason, blockers: [] };
  if (r.status === "not_applicable") return { domain, status: AI_CLOSE_DOMAIN_STATUS.NOT_APPLICABLE, blockers: [] };
  if (r.status === "reconciled") return { domain, status: AI_CLOSE_DOMAIN_STATUS.READY, blockers: [] };

  const threshold = findThreshold(ctx.policy, appliesTo);
  const severity = classifyBlockerSeverity({
    isHard: r.status === "unreconciled" && r.differences.some((d) => d.type === "unexplained"),
    amount: r.difference,
    ageDays: r.oldestOpenItemDays,
    materialityConfigured: Boolean(threshold),
    materialityThreshold: threshold?.absoluteAmount,
  });
  const status = severity === "hard_blocker" ? AI_CLOSE_DOMAIN_STATUS.BLOCKED : AI_CLOSE_DOMAIN_STATUS.AT_RISK;
  return {
    domain,
    status,
    blockers: [
      {
        id: `${domain}-${r.definitionId}`,
        severity,
        title: `${r.name}: ${r.status}`,
        detail: `left ${r.leftTotal} vs right ${r.rightTotal}, difference ${r.difference}`,
        amount: r.difference,
        owner: r.owner,
        evidence: r.differences.flatMap((d) => d.evidence),
        recommendedAction: "Review and classify the reconciliation difference",
        ageDays: r.oldestOpenItemDays,
        autoResolvable: false,
        sourceWorkflow: "AI-22",
      },
    ],
  };
}

async function runDefinition(id: string, tenantId: string, periodEnd: Date, period: string) {
  const definition = RECONCILIATION_DEFINITIONS.find((d) => d.id === id)!;
  return runReconciliationDefinition(tenantId, definition, periodEnd, period);
}

export async function checkTransactionsDomain(tenantId: string, ctx: DomainMaterialityContext): Promise<DomainResult> {
  await connectDB();
  const draftEntries = await JournalEntry.find({ tenantId, status: DOCUMENT_STATUS.DRAFT }).select("_id header createdAt").limit(200).lean();
  const deadLettered = await AiEvent.countDocuments({ tenantId, status: AI_EVENT_STATUS.DEAD_LETTER });

  const threshold = findThreshold(ctx.policy, "transactions");
  const blockers: IAiCloseBlocker[] = draftEntries.map((e) => ({
    id: `transactions-draft-${e._id}`,
    severity: classifyBlockerSeverity({ isHard: false, ageDays: daysBetween(new Date(e.createdAt), new Date()), materialityConfigured: Boolean(threshold), materialityThreshold: threshold?.absoluteAmount }),
    title: "Unposted journal entry",
    detail: `${e.header?.name ?? e._id} is still draft`,
    owner: "finance",
    evidence: [{ kind: "record" as const, ref: String(e._id), label: "JournalEntry" }],
    recommendedAction: "Post or void the draft entry",
    ageDays: daysBetween(new Date(e.createdAt), new Date()),
    autoResolvable: false,
    sourceWorkflow: undefined,
  }));
  if (deadLettered > 0) {
    blockers.push({
      id: "transactions-dlq",
      severity: "hard_blocker",
      title: "Dead-lettered AI events",
      detail: `${deadLettered} AiEvent(s) exhausted retries and were dead-lettered`,
      owner: "finance",
      evidence: [],
      recommendedAction: "Investigate the dead-lettered events (app/api/cron/ai/runtime-sweep)",
      ageDays: 0,
      autoResolvable: false,
      sourceWorkflow: undefined,
    });
  }

  const status = blockers.some((b) => b.severity === "hard_blocker") ? AI_CLOSE_DOMAIN_STATUS.BLOCKED : blockers.length > 0 ? AI_CLOSE_DOMAIN_STATUS.AT_RISK : AI_CLOSE_DOMAIN_STATUS.READY;
  return { domain: "transactions", status, blockers };
}

export async function checkBankDomain(tenantId: string, periodEnd: Date, period: string, ctx: DomainMaterialityContext): Promise<DomainResult> {
  const r = await runDefinition("bank", tenantId, periodEnd, period);
  return blockerFromReconciliation("bank", "bank", ctx, r);
}

export async function checkArDomain(tenantId: string, periodEnd: Date, period: string, ctx: DomainMaterialityContext): Promise<DomainResult> {
  const r = await runDefinition("ar_control_finance", tenantId, periodEnd, period);
  return blockerFromReconciliation("ar_finance", "ar_control_finance", ctx, r);
}

export async function checkApDomain(tenantId: string, periodEnd: Date, period: string, ctx: DomainMaterialityContext): Promise<DomainResult> {
  const r = await runDefinition("ap_control", tenantId, periodEnd, period);
  const result = blockerFromReconciliation("ap", "ap_control", ctx, r);
  // "unmatched bills from AI-06's future scope" — AI-06 does not exist yet; only ap_control's
  // own real check runs. Documented, not silently dropped.
  return result;
}

export async function checkInventoryDomain(tenantId: string, periodEnd: Date, period: string, ctx: DomainMaterialityContext): Promise<DomainResult> {
  const r = await runDefinition("inventory", tenantId, periodEnd, period);
  return blockerFromReconciliation("inventory", "inventory", ctx, r);
}

export async function checkAccrualsDomain(tenantId: string, ctx: DomainMaterialityContext): Promise<DomainResult> {
  await connectDB();
  const today = new Date();
  const staleAccruals = await AiSchedule.find({
    tenantId,
    scheduleType: AI_SCHEDULE_TYPE.ACCRUAL_REVERSAL,
    status: { $in: [AI_SCHEDULE_STATUS.APPROVED] },
    "periods.status": AI_SCHEDULE_PERIOD_STATUS.PENDING,
    "periods.dueDate": { $lt: today },
  })
    .select("_id periods totalAmount")
    .lean();

  const openGrni = await PurchaseOrder.find({ tenantId, status: { $nin: [DOCUMENT_STATUS.DRAFT, DOCUMENT_STATUS.CANCELLED] } })
    .select("_id name orderLines")
    .lean();
  const grniCandidateCount = openGrni.reduce((s, po) => s + (po.orderLines ?? []).filter((l) => l.receivedQty > l.billedQty).length, 0);

  const threshold = findThreshold(ctx.policy, "accrual");
  const blockers: IAiCloseBlocker[] = staleAccruals.map((s) => {
    const pending = s.periods.find((p) => p.status === AI_SCHEDULE_PERIOD_STATUS.PENDING && p.dueDate < today);
    const ageDays = pending ? daysBetween(pending.dueDate, today) : 0;
    return {
      id: `accruals-stale-${s._id}`,
      severity: classifyBlockerSeverity({ isHard: false, amount: s.totalAmount, ageDays, materialityConfigured: Boolean(threshold), materialityThreshold: threshold?.absoluteAmount }),
      title: "Stale accrual reversal",
      detail: `AiSchedule ${s._id} has an overdue reversal period`,
      amount: s.totalAmount,
      owner: "finance",
      evidence: [{ kind: "record" as const, ref: String(s._id), label: "AiSchedule" }],
      recommendedAction: "Trigger AI-07's schedule.due run for this reversal",
      ageDays,
      autoResolvable: true,
      sourceWorkflow: "AI-07",
    };
  });
  if (grniCandidateCount > 0) {
    blockers.push({
      id: "accruals-grni-open",
      severity: classifyBlockerSeverity({ isHard: false, ageDays: 0, materialityConfigured: Boolean(threshold), materialityThreshold: threshold?.absoluteAmount }),
      title: "Open GRNI candidates not yet accrued",
      detail: `${grniCandidateCount} PO line(s) have receivedQty > billedQty`,
      owner: "finance",
      evidence: [],
      recommendedAction: "Trigger AI-07's GRNI sweep (ai.sweep.hourly)",
      ageDays: 0,
      autoResolvable: true,
      sourceWorkflow: "AI-07",
    });
  }

  const status = blockers.some((b) => b.severity === "hard_blocker") ? AI_CLOSE_DOMAIN_STATUS.BLOCKED : blockers.length > 0 ? AI_CLOSE_DOMAIN_STATUS.AT_RISK : AI_CLOSE_DOMAIN_STATUS.READY;
  return { domain: "accruals", status, blockers };
}

export async function checkPrepaidsDomain(tenantId: string, periodEnd: Date, period: string, ctx: DomainMaterialityContext): Promise<DomainResult> {
  const r = await runDefinition("prepaid", tenantId, periodEnd, period);
  const base = blockerFromReconciliation("prepaids", "prepaid_recognition", ctx, r);

  await connectDB();
  const today = new Date();
  const overdue = await AiSchedule.countDocuments({
    tenantId,
    scheduleType: AI_SCHEDULE_TYPE.PREPAID,
    status: AI_SCHEDULE_STATUS.APPROVED,
    "periods.status": AI_SCHEDULE_PERIOD_STATUS.PENDING,
    "periods.dueDate": { $lt: today },
  });
  if (overdue > 0) {
    const threshold = findThreshold(ctx.policy, "prepaid_recognition");
    base.blockers.push({
      id: "prepaids-overdue",
      severity: classifyBlockerSeverity({ isHard: false, ageDays: 0, materialityConfigured: Boolean(threshold), materialityThreshold: threshold?.absoluteAmount }),
      title: "Overdue prepaid recognitions",
      detail: `${overdue} prepaid AiSchedule(s) have an overdue pending period`,
      owner: "finance",
      evidence: [],
      recommendedAction: "Trigger AI-08's schedule.due run",
      ageDays: 0,
      autoResolvable: true,
      sourceWorkflow: "AI-08",
    });
    if (base.status === AI_CLOSE_DOMAIN_STATUS.READY) base.status = AI_CLOSE_DOMAIN_STATUS.AT_RISK;
  }
  return base;
}

export async function checkRevenueDomain(tenantId: string, periodEnd: Date, period: string, ctx: DomainMaterialityContext): Promise<DomainResult> {
  const r = await runDefinition("deferred_revenue", tenantId, periodEnd, period);
  const result = blockerFromReconciliation("revenue", "deferred_revenue", ctx, r);
  // AI-09's "revenue leakage" (delivered-not-billed) signal needs models/sales/** reads, which
  // Chunk 2's A.1 kept out of every workflow except AI-09 itself (Chunk 3 A.2's bounded
  // exception). AI-13 was not granted that exception — see this file's module doc comment and
  // docs/ai/OPEN_QUESTIONS.md.
  return result;
}

export async function checkFixedAssetsDomain(tenantId: string, periodEnd: Date, period: string, ctx: DomainMaterialityContext): Promise<DomainResult> {
  const r = await runDefinition("fixed_assets", tenantId, periodEnd, period);
  const base = blockerFromReconciliation("fixed_assets", "capitalisation", ctx, r);

  await connectDB();
  const fullyDepreciatedAssetIds: mongoose.Types.ObjectId[] = await AiSchedule.distinct("sourceRef.id", {
    tenantId,
    scheduleType: AI_SCHEDULE_TYPE.DEPRECIATION,
    status: AI_SCHEDULE_STATUS.COMPLETED,
  }).then((ids: string[]) => ids.map((id) => new mongoose.Types.ObjectId(id)));
  if (fullyDepreciatedAssetIds.length > 0) {
    const stillActive = await Asset.countDocuments({ tenantId, _id: { $in: fullyDepreciatedAssetIds }, status: DOCUMENT_STATUS.POSTED });
    if (stillActive > 0) {
      base.blockers.push({
        id: "fixed-assets-fully-depreciated",
        severity: "minor_exception",
        title: "Fully depreciated assets still active",
        detail: `${stillActive} asset(s) completed depreciation but remain posted/in-use`,
        owner: "finance",
        evidence: [],
        recommendedAction: "Review for disposal or a residual-value adjustment",
        ageDays: 0,
        autoResolvable: false,
        sourceWorkflow: "AI-10",
      });
      if (base.status === AI_CLOSE_DOMAIN_STATUS.READY) base.status = AI_CLOSE_DOMAIN_STATUS.AT_RISK;
    }
  }
  return base;
}

export async function checkFxDomain(tenantId: string, periodEnd: Date, ctx: DomainMaterialityContext): Promise<DomainResult> {
  await connectDB();
  const nonInrInvoices = await Invoice.find({ tenantId, currencyId: { $ne: "INR" }, state: { $ne: DOCUMENT_STATUS.CANCELLED } })
    .select("_id name currencyId amountResidual")
    .lean();
  const nonInrBankAccounts = await BankAccount.find({ tenantId, currency: { $ne: "INR" } }).select("_id accountName currency").lean();

  if (nonInrInvoices.length === 0 && nonInrBankAccounts.length === 0) {
    return { domain: "fx", status: AI_CLOSE_DOMAIN_STATUS.NOT_APPLICABLE, blockers: [] };
  }

  const blockers: IAiCloseBlocker[] = [];
  const threshold = findThreshold(ctx.policy, "fx");
  for (const inv of nonInrInvoices) {
    const currency = (inv as { currencyId?: string }).currencyId ?? "";
    const rate = await FxRate.findOne({ tenantId, fromCurrency: currency.toUpperCase(), toCurrency: "INR", rateDate: { $lte: periodEnd } }).sort({ rateDate: -1 }).lean();
    if (!rate) {
      blockers.push({
        id: `fx-invoice-${inv._id}`,
        severity: classifyBlockerSeverity({ isHard: false, amount: (inv as { amountResidual?: number }).amountResidual, ageDays: 0, materialityConfigured: Boolean(threshold), materialityThreshold: threshold?.absoluteAmount }),
        title: "Non-INR balance with no FX rate for period end",
        detail: `Invoice ${(inv as { name?: string }).name} is in ${currency} with no FxRate on or before ${periodEnd.toISOString().slice(0, 10)}`,
        amount: (inv as { amountResidual?: number }).amountResidual,
        owner: "finance",
        evidence: [{ kind: "record" as const, ref: String(inv._id), label: "Invoice" }],
        recommendedAction: "Enter a manual or imported FxRate for this currency/date",
        ageDays: 0,
        autoResolvable: false,
        sourceWorkflow: undefined,
      });
    }
  }
  for (const acc of nonInrBankAccounts) {
    const currency = (acc as { currency?: string }).currency ?? "";
    const rate = await FxRate.findOne({ tenantId, fromCurrency: currency.toUpperCase(), toCurrency: "INR", rateDate: { $lte: periodEnd } }).sort({ rateDate: -1 }).lean();
    if (!rate) {
      blockers.push({
        id: `fx-bank-${acc._id}`,
        severity: classifyBlockerSeverity({ isHard: false, ageDays: 0, materialityConfigured: Boolean(threshold), materialityThreshold: threshold?.absoluteAmount }),
        title: "Non-INR bank account with no FX rate for period end",
        detail: `BankAccount ${(acc as { accountName?: string }).accountName} is in ${currency} with no FxRate on or before ${periodEnd.toISOString().slice(0, 10)}`,
        owner: "finance",
        evidence: [{ kind: "record" as const, ref: String(acc._id), label: "BankAccount" }],
        recommendedAction: "Enter a manual or imported FxRate for this currency/date",
        ageDays: 0,
        autoResolvable: false,
        sourceWorkflow: undefined,
      });
    }
  }

  const status = blockers.length > 0 ? AI_CLOSE_DOMAIN_STATUS.AT_RISK : AI_CLOSE_DOMAIN_STATUS.READY;
  return { domain: "fx", status, blockers };
}

export async function checkTaxDomain(tenantId: string, periodEnd: Date, period: string, ctx: DomainMaterialityContext): Promise<DomainResult> {
  const r = await runDefinition("tax", tenantId, periodEnd, period);
  return blockerFromReconciliation("tax", "tax", ctx, r);
}

export async function checkPayrollDomain(tenantId: string, periodEnd: Date, period: string, ctx: DomainMaterialityContext): Promise<DomainResult> {
  const r = await runDefinition("payroll", tenantId, periodEnd, period);
  return blockerFromReconciliation("payroll", "payroll", ctx, r);
}

/**
 * Wraps AI-17's own readiness computation (docs/ai/BRIEF-06-BATCH-E.md, "Feed into AI-13's close
 * state and Attention tab") — never a second, disagreeing computation of obligation readiness.
 */
export async function checkComplianceDomain(tenantId: string, period: string): Promise<DomainResult> {
  const computation = await computeComplianceReadiness(tenantId, period);
  if (!computation.profileConfigured) {
    return { domain: "compliance", status: AI_CLOSE_DOMAIN_STATUS.NOT_APPLICABLE, reasonIfNotChecked: "no compliance profile configured", blockers: [] };
  }

  const blockers: IAiCloseBlocker[] = computation.registrationGaps.map((gap) => ({
    id: `compliance-registration-gap-${gap.jurisdiction}-${gap.taxType}`,
    severity: "hard_blocker",
    title: `Registration gap: ${gap.jurisdiction} ${gap.taxType}`,
    detail: gap.reason,
    owner: "finance",
    evidence: [],
    recommendedAction: "Register in this jurisdiction or correct the compliance profile",
    ageDays: 0,
    autoResolvable: false,
    sourceWorkflow: "AI-17",
  }));

  for (const obligation of computation.obligations) {
    if (obligation.readiness === "blocked") {
      blockers.push({
        id: `compliance-obligation-${obligation.jurisdiction}-${obligation.taxType}`,
        severity: "hard_blocker",
        title: `${obligation.returnType} (${obligation.jurisdiction}) blocked`,
        detail: obligation.blockers.join("; "),
        owner: "finance",
        evidence: [],
        recommendedAction: "Resolve the tax reconciliation or missing-evidence gap AI-12 reports for this jurisdiction",
        ageDays: 0,
        autoResolvable: false,
        sourceWorkflow: "AI-17",
      });
    } else if (obligation.readiness === "at_risk") {
      blockers.push({
        id: `compliance-obligation-${obligation.jurisdiction}-${obligation.taxType}`,
        severity: "minor_exception",
        title: `${obligation.returnType} (${obligation.jurisdiction}) at risk — due in ${obligation.daysRemaining} day(s)`,
        detail: obligation.blockers.join("; "),
        owner: "finance",
        evidence: [],
        recommendedAction: "Review before the deadline",
        ageDays: 0,
        autoResolvable: false,
        sourceWorkflow: "AI-17",
      });
    }
  }

  const status = blockers.some((b) => b.severity === "hard_blocker") ? AI_CLOSE_DOMAIN_STATUS.BLOCKED : blockers.length > 0 ? AI_CLOSE_DOMAIN_STATUS.AT_RISK : AI_CLOSE_DOMAIN_STATUS.READY;
  return { domain: "compliance", status, blockers };
}

export function checkIntercompanyDomain(): DomainResult {
  return { domain: "intercompany", status: AI_CLOSE_DOMAIN_STATUS.NOT_APPLICABLE, reasonIfNotChecked: "no intercompany/consolidation model exists anywhere in this codebase", blockers: [] };
}

export async function checkControlsDomain(tenantId: string, ctx: DomainMaterialityContext): Promise<DomainResult> {
  await connectDB();
  const pendingApprovals = await JournalEntry.find({ tenantId, approvalRequired: true, "approvalDetails.approvedAt": { $exists: false } })
    .select("_id header createdAt")
    .limit(200)
    .lean();
  const threshold = findThreshold(ctx.policy, "controls");
  const blockers: IAiCloseBlocker[] = pendingApprovals.map((e) => ({
    id: `controls-approval-${e._id}`,
    severity: classifyBlockerSeverity({ isHard: false, ageDays: daysBetween(new Date(e.createdAt), new Date()), materialityConfigured: Boolean(threshold), materialityThreshold: threshold?.absoluteAmount }),
    title: "Journal entry pending approval",
    detail: `${e.header?.name ?? e._id} requires approval and has none recorded`,
    owner: "finance",
    evidence: [{ kind: "record" as const, ref: String(e._id), label: "JournalEntry" }],
    recommendedAction: "Route for approval",
    ageDays: daysBetween(new Date(e.createdAt), new Date()),
    autoResolvable: false,
    sourceWorkflow: undefined,
  }));
  const status = blockers.length > 0 ? AI_CLOSE_DOMAIN_STATUS.AT_RISK : AI_CLOSE_DOMAIN_STATUS.READY;
  return { domain: "controls", status, blockers };
}

/**
 * Wired to AI-24 (docs/ai/BRIEF-05-BATCH-D.md Part 0.4 — was `not_checked` in Chunk 4; AI-24
 * exists now). Takes the OTHER 15 domains already computed (14 through Chunk 5, plus `compliance`
 * added Chunk 6) — not a fresh `computeCloseReadiness()`
 * call — that would recurse, since AI-24's own entry point calls `computeCloseReadiness()`; see
 * `lib/aiRuntime/evidence/deriveAssertions.ts`'s doc comment) and derives assertion verification
 * from them via the same pure logic AI-24's workflow uses.
 */
export function checkEvidenceDomain(otherDomains: DomainResult[], periodClosingStatus: string | undefined): DomainResult {
  const assertions = deriveAssertions(otherDomains as IAiCloseDomain[], periodClosingStatus);
  const unverified = assertions.filter((a) => !a.verified);

  if (unverified.length === 0) {
    return { domain: "evidence", status: AI_CLOSE_DOMAIN_STATUS.READY, blockers: [] };
  }

  const blockers: IAiCloseBlocker[] = unverified.map((a) => ({
    id: `evidence-${a.item}`,
    severity: a.contradiction ? "hard_blocker" : "minor_exception",
    title: `Close assertion not verified: ${a.item}`,
    detail: a.missing.join("; ") || a.assertionDescription,
    owner: a.owner,
    evidence: a.evidence,
    recommendedAction: a.contradiction
      ? "PeriodClosing status implies this is done, but the data disagrees — investigate before proceeding"
      : "Resolve the underlying domain's blockers; this assertion re-verifies automatically once they clear",
    ageDays: 0,
    autoResolvable: false,
    sourceWorkflow: "AI-24",
  }));
  const status = blockers.some((b) => b.severity === "hard_blocker") ? AI_CLOSE_DOMAIN_STATUS.BLOCKED : AI_CLOSE_DOMAIN_STATUS.AT_RISK;
  return { domain: "evidence", status, blockers };
}

export async function loadMaterialityContext(tenantId: string): Promise<DomainMaterialityContext> {
  await connectDB();
  const policy = await AiMaterialityPolicy.findOne({ tenantId }).lean();
  return { policy: policy as unknown as IAiMaterialityPolicy | null };
}
