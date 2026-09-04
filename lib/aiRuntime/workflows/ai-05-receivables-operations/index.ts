import connectDB from "@/lib/db";
import { differenceInCalendarDays, addDays } from "date-fns";
import { SalesInvoice } from "@/models/sales/SalesInvoice";
import Payment from "@/models/sales/Payment";
import Invoice from "@/models/finance/Invoice";
import AiMaterialityPolicy, { findThreshold, type IAiMaterialityPolicy } from "@/models/ai/AiMaterialityPolicy";
import { buildAgedPartnerReport } from "@/lib/accounting/reports";
import {
  AI_AUTONOMY_LEVEL,
  AI_FINDING_TYPE,
  AI_FINDING_SEVERITY,
  SALES_INVOICE_STATUS,
  PAYMENT_STATUS,
  PAYMENT_STATE,
} from "@/lib/constants/statuses";
import type { WorkflowDefinition, ObservedResult, ReasonResult, ActResult, VerifyResult } from "@/lib/aiRuntime/workflows/types";
import "@/models/sales/Customer";

/**
 * AI-05 — Receivables operations (docs/ai/BRIEF-05-BATCH-D.md). Allocates incoming receipts,
 * predicts payment dates from actual customer history (not invoice terms), ranks a collection
 * worklist, drafts (never sends) chase communications, and detects disputes.
 *
 * **Extends, never replaces**: `lib/sales/reminderEngine.ts` keeps sending on its own schedule,
 * untouched, except for one additive guard (skip invoices with an open `AiDispute` — "stop the
 * reminder sequence for that invoice"). `lib/sales/paymentAllocation.ts`'s validation functions
 * are the only path `draft_receipt_allocation` uses to touch `models/sales/Payment.ts`.
 * `models/sales/DunningRule.ts` is deliberately NOT reused — it is subscription payment-failure
 * retry logic (`lib/sales/dunningEngine.ts`), a different domain that happens to share a word
 * with general AR collections (see GLOSSARY.md).
 *
 * **Never fabricates money**: the only "receipt allocation" candidates are existing DRAFT
 * `Payment` documents with `unusedAmount > 0` — money a human already recorded receiving but
 * didn't finish applying. AI-05 proposes how to finish applying it; it never creates a new
 * Payment out of thin air.
 *
 * **Short payment vs ordinary partial** (a documented heuristic, not a config value — no
 * materiality-style "short payment band" exists in this codebase to consult): when the unused
 * amount doesn't even cover the customer's oldest open invoice, an amount at or above 80% of
 * that invoice's due amount reads as a payment aimed at that invoice that came up short — a
 * dispute, not a silent partial. Below 80% reads as a small deliberate down-payment and is
 * allocated as an ordinary partial. Documented here because it is exactly the kind of number a
 * future reader will otherwise assume was specified somewhere.
 *
 * Sending is `NEVER_AUTONOMOUS` this batch (A.4) — no `send_reminder` tool exists anywhere in
 * the tool registry; `draft_communication` only ever writes `models/ai/AiCommunicationDraft.ts`.
 */

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

interface Ai05Raw {
  actingUserId?: string;
}

interface OpenInvoiceInfo {
  invoiceId: string;
  number: string;
  customerId: string;
  invoiceDate: Date;
  dueDate: Date;
  totalAmount: number;
  due: number;
}

interface CustomerHistory {
  sampleSize: number;
  meanDaysToPay: number | null;
  lateRate: number;
  basis: "history" | "terms";
}

interface AllocationCandidate {
  paymentId: string;
  paymentNumber: string;
  customerId: string;
  unusedAmount: number;
  type: "exact" | "partial" | "batched" | "overpayment" | "short_payment" | "no_open_invoices";
  allocations: { invoiceId: string; invoiceNumber: string; amount: number }[];
  disputeInvoiceId?: string;
  disputeInvoiceNumber?: string;
  remainingUnallocated: number;
}

interface PredictedPayment {
  customerId: string;
  invoiceId: string;
  invoiceNumber: string;
  amount: number; // outstanding due — added for AI-16 (Chunk 5), which needs an amount to forecast cash with a date
  dueDate: Date;
  predictedDate: Date;
  basis: "history" | "terms";
}

interface WorklistEntry {
  invoiceId: string;
  invoiceNumber: string;
  customerId: string;
  customerName: string;
  customerEmail?: string;
  amountAtRisk: number;
  priorityScore: number;
  reason: string;
  stage: "pre_due" | "gentle" | "firm" | "final";
  overdueDays: number;
}

interface Ai05Extracted {
  actingUserId?: string;
  allocationCandidates: AllocationCandidate[];
  predictedPayments: PredictedPayment[];
  worklist: WorklistEntry[];
  agingSummary: unknown;
  paymentStateDivergence: { count: number; value: number };
  unallocatedCash: { count: number; value: number };
  worklistMaterialityConfigured: boolean;
  worklistMaterialityThreshold: number | null;
}

interface Ai05Proposal {
  allocationCandidates: AllocationCandidate[];
  predictedPayments: PredictedPayment[];
  worklist: WorklistEntry[];
  agingSummary: unknown;
  paymentStateDivergence: { count: number; value: number };
  unallocatedCash: { count: number; value: number };
}

/** Mean and stddev of days-to-pay + historical late rate from a customer's own paid invoices —
 *  not invoice terms. Fewer than 3 paid invoices is too small a sample to trust; falls back to
 *  reporting on terms alone (basis: "terms"). */
function computeCustomerHistory(paid: { invoiceDate: Date; dueDate: Date; lastPaymentDate: Date }[]): CustomerHistory {
  if (paid.length < 3) {
    return { sampleSize: paid.length, meanDaysToPay: null, lateRate: 0, basis: "terms" };
  }
  const daysToPay = paid.map((p) => differenceInCalendarDays(p.lastPaymentDate, p.invoiceDate));
  const mean = daysToPay.reduce((a, b) => a + b, 0) / daysToPay.length;
  const lateCount = paid.filter((p) => p.lastPaymentDate.getTime() > p.dueDate.getTime()).length;
  return { sampleSize: paid.length, meanDaysToPay: round2(mean), lateRate: round2(lateCount / paid.length), basis: "history" };
}

/** Proposes how to finish allocating a draft receipt's unused amount against a customer's open
 *  invoices (oldest due date first). Never proposes more than what's actually due per invoice. */
function proposeAllocation(unusedAmount: number, openInvoices: OpenInvoiceInfo[]): Omit<AllocationCandidate, "paymentId" | "paymentNumber" | "customerId" | "unusedAmount"> {
  if (openInvoices.length === 0) {
    return { type: "no_open_invoices", allocations: [], remainingUnallocated: round2(unusedAmount) };
  }

  const totalDue = round2(openInvoices.reduce((s, i) => s + i.due, 0));

  if (unusedAmount >= totalDue - 0.005) {
    const allocations = openInvoices.map((inv) => ({ invoiceId: inv.invoiceId, invoiceNumber: inv.number, amount: round2(inv.due) }));
    const remaining = Math.max(0, round2(unusedAmount - totalDue));
    const type = remaining > 0.005 ? "overpayment" : allocations.length === 1 ? "exact" : "batched";
    return { type, allocations, remainingUnallocated: remaining };
  }

  const first = openInvoices[0];
  if (unusedAmount + 0.005 < first.due) {
    const ratio = unusedAmount / first.due;
    if (ratio >= 0.8) {
      return { type: "short_payment", allocations: [], disputeInvoiceId: first.invoiceId, disputeInvoiceNumber: first.number, remainingUnallocated: round2(unusedAmount) };
    }
    return { type: "partial", allocations: [{ invoiceId: first.invoiceId, invoiceNumber: first.number, amount: round2(unusedAmount) }], remainingUnallocated: 0 };
  }

  let remaining = unusedAmount;
  const allocations: { invoiceId: string; invoiceNumber: string; amount: number }[] = [];
  for (const inv of openInvoices) {
    if (remaining <= 0.005) break;
    const applied = Math.min(inv.due, remaining);
    allocations.push({ invoiceId: inv.invoiceId, invoiceNumber: inv.number, amount: round2(applied) });
    remaining = round2(remaining - applied);
  }
  return { type: "batched", allocations, remainingUnallocated: Math.max(0, remaining) };
}

function stageFor(overdueDays: number): WorklistEntry["stage"] {
  if (overdueDays <= 0) return "pre_due";
  if (overdueDays <= 15) return "gentle";
  if (overdueDays <= 45) return "firm";
  return "final";
}

export const ai05ReceivablesOperations: WorkflowDefinition<Ai05Raw, Ai05Extracted, Ai05Proposal> = {
  id: "AI-05",
  version: "1.0.0",
  eventKeys: ["ai.sweep.hourly"],
  actionClass: "receivables_collection",
  defaultAutonomy: AI_AUTONOMY_LEVEL.DRAFT,

  // ai.sweep.hourly is shared with AI-07/AI-09/AI-13/others — fan-out, always accepted (the
  // sweep is tenant-wide, not tied to one other workflow's entity).
  async subscriptionFilter(): Promise<boolean> {
    return true;
  },

  async observe(event): Promise<ObservedResult<Ai05Raw>> {
    const actingUserId = event.payload.actingUserId ? String(event.payload.actingUserId) : undefined;
    return { entityId: event.tenantId, raw: { actingUserId } };
  },

  async extract(observed, ctx): Promise<Ai05Extracted> {
    await connectDB();
    const tenantId = ctx.tenantId;
    const today = new Date();

    // Every non-draft, non-cancelled SalesInvoice — used both for open-invoice allocation/
    // worklist logic and for the Sales-vs-Finance divergence report (which must also see
    // already-paid invoices, since a Sales-paid/Finance-unpaid mismatch is exactly the case that
    // matters).
    const allInvoices = await (SalesInvoice as any)
      .find({ tenantId, status: { $nin: [SALES_INVOICE_STATUS.DRAFT, SALES_INVOICE_STATUS.CANCELLED] } })
      .populate("customerId", "header contact_details")
      .lean();

    const openStatuses = new Set([SALES_INVOICE_STATUS.SAVED, SALES_INVOICE_STATUS.PARTIALLY_PAID, SALES_INVOICE_STATUS.OVERDUE]);
    const openByCustomer = new Map<string, OpenInvoiceInfo[]>();
    const paidByCustomer = new Map<string, { invoiceDate: Date; dueDate: Date; lastPaymentDate: Date }[]>();

    for (const inv of allInvoices) {
      const customerId = String(inv.customerId?._id ?? inv.customerId);
      const paidSoFar = (inv.payments || []).reduce((s: number, p: { amount: number }) => s + (Number(p.amount) || 0), 0);
      const due = round2(Number(inv.totalAmount) - paidSoFar);

      if (openStatuses.has(inv.status) && due > 0.005) {
        const list = openByCustomer.get(customerId) ?? [];
        list.push({
          invoiceId: String(inv._id),
          number: inv.number,
          customerId,
          invoiceDate: new Date(inv.invoiceDate),
          dueDate: new Date(inv.dueDate),
          totalAmount: inv.totalAmount,
          due,
        });
        openByCustomer.set(customerId, list);
      }

      if (inv.status === SALES_INVOICE_STATUS.PAID && (inv.payments || []).length > 0) {
        const lastPaymentDate = (inv.payments as { date: Date }[]).reduce(
          (latest, p) => (new Date(p.date).getTime() > latest.getTime() ? new Date(p.date) : latest),
          new Date(0),
        );
        const list = paidByCustomer.get(customerId) ?? [];
        list.push({ invoiceDate: new Date(inv.invoiceDate), dueDate: new Date(inv.dueDate), lastPaymentDate });
        paidByCustomer.set(customerId, list);
      }
    }
    for (const list of openByCustomer.values()) {
      list.sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
    }

    const historyByCustomer = new Map<string, CustomerHistory>();
    for (const [customerId, paid] of paidByCustomer.entries()) {
      historyByCustomer.set(customerId, computeCustomerHistory(paid));
    }
    const historyFor = (customerId: string): CustomerHistory => historyByCustomer.get(customerId) ?? { sampleSize: 0, meanDaysToPay: null, lateRate: 0, basis: "terms" };

    // ── Receipt allocation candidates: existing DRAFT payments with unused money ──
    const draftPayments = await Payment.find({ tenantId, status: PAYMENT_STATUS.DRAFT, unusedAmount: { $gt: 0.005 } }).lean();
    const allocationCandidates: AllocationCandidate[] = draftPayments.map((p) => {
      const openInvoices = openByCustomer.get(String(p.customerId)) ?? [];
      const proposal = proposeAllocation(p.unusedAmount, openInvoices);
      return { paymentId: String(p._id), paymentNumber: p.paymentNumber, customerId: String(p.customerId), unusedAmount: p.unusedAmount, ...proposal };
    });

    const unallocatedCash = allocationCandidates
      .filter((c) => c.type === "short_payment" || c.type === "no_open_invoices")
      .reduce((acc, c) => ({ count: acc.count + 1, value: round2(acc.value + c.unusedAmount) }), { count: 0, value: 0 });

    // ── Predicted payment dates + collection worklist ──
    const predictedPayments: PredictedPayment[] = [];
    const worklist: WorklistEntry[] = [];
    const materialityPolicy = await AiMaterialityPolicy.findOne({ tenantId }).lean();
    const threshold = findThreshold(materialityPolicy as unknown as IAiMaterialityPolicy | null, "receivables_collection");

    for (const [customerId, invoices] of openByCustomer.entries()) {
      const history = historyFor(customerId);
      for (const inv of invoices) {
        const predictedDate =
          history.basis === "history" && history.meanDaysToPay !== null ? addDays(inv.invoiceDate, Math.round(history.meanDaysToPay)) : inv.dueDate;
        predictedPayments.push({ customerId, invoiceId: inv.invoiceId, invoiceNumber: inv.number, amount: inv.due, dueDate: inv.dueDate, predictedDate, basis: history.basis });

        const overdueDays = differenceInCalendarDays(today, inv.dueDate);
        const isOverdue = overdueDays > 0;
        // False-positive guard (docs/ai/BRIEF-05-BATCH-D.md AI-05 tests): a customer within
        // terms with zero historical lateness produces no worklist entry at all.
        if (!isOverdue && history.lateRate <= 0) continue;

        const riskWeight = isOverdue ? 1 : Math.max(history.lateRate, 0.1);
        const source = allInvoices.find((i: { _id: unknown }) => String(i._id) === inv.invoiceId);
        const customerName = source?.customerId?.header?.displayName || source?.customerId?.header?.name || "Customer";
        const customerEmail = source?.customerId?.contact_details?.email;

        worklist.push({
          invoiceId: inv.invoiceId,
          invoiceNumber: inv.number,
          customerId,
          customerName,
          customerEmail,
          amountAtRisk: inv.due,
          priorityScore: round2(inv.due * riskWeight),
          reason: isOverdue
            ? `${overdueDays}d past due, ₹${inv.due} outstanding`
            : `predicted late — ${Math.round(history.lateRate * 100)}% of this customer's past invoices paid after their due date`,
          stage: stageFor(overdueDays),
          overdueDays,
        });
      }
    }
    worklist.sort((a, b) => b.priorityScore - a.priorityScore);

    // ── Ageing (partner-level, GL-derived) ──
    const agingSummary = await buildAgedPartnerReport({ tenantId, type: "receivable", asOfDate: today });

    // ── Sales-vs-Finance payment-state divergence (A.2 — report, never repair) ──
    const financeInvoices = await Invoice.find({ tenantId, moveType: "out_invoice" }).select("sourceDocument paymentState").lean();
    const financeByNumber = new Map(financeInvoices.map((f: { sourceDocument?: string; paymentState?: string }) => [f.sourceDocument, f.paymentState]));
    const normalizeSales = (status: string) => (status === SALES_INVOICE_STATUS.PAID ? "paid" : status === SALES_INVOICE_STATUS.PARTIALLY_PAID ? "partial" : "unpaid");
    const normalizeFinance = (state: string | undefined) => (state === PAYMENT_STATE.PAID ? "paid" : state === PAYMENT_STATE.PARTIAL ? "partial" : "unpaid");
    let divergenceCount = 0;
    let divergenceValue = 0;
    for (const inv of allInvoices) {
      const financeState = financeByNumber.get(inv.number);
      if (financeState === undefined) continue; // no matching Finance-side invoice at all — unwired, not a divergence
      if (normalizeSales(inv.status) !== normalizeFinance(financeState)) {
        divergenceCount++;
        divergenceValue = round2(divergenceValue + inv.totalAmount);
      }
    }

    return {
      actingUserId: observed.raw.actingUserId,
      allocationCandidates,
      predictedPayments,
      worklist,
      agingSummary,
      paymentStateDivergence: { count: divergenceCount, value: divergenceValue },
      unallocatedCash,
      worklistMaterialityConfigured: Boolean(threshold),
      worklistMaterialityThreshold: threshold?.absoluteAmount ?? null,
    };
  },

  async reason(extracted): Promise<ReasonResult<Ai05Proposal>> {
    const reasonChain: string[] = [
      `${extracted.allocationCandidates.length} draft receipt(s) with unused funds`,
      `${extracted.worklist.length} collection worklist entr(y/ies)`,
      `${extracted.paymentStateDivergence.count} Sales-vs-Finance payment-state divergence(s), value ${extracted.paymentStateDivergence.value}`,
    ];
    if (!extracted.worklistMaterialityConfigured) {
      reasonChain.push('no "receivables_collection" materiality threshold configured — worklist escalation is informational only, nothing auto-escalated on amount');
    }

    const findings: ReasonResult<Ai05Proposal>["findings"] = [
      ...extracted.allocationCandidates
        .filter((c) => c.type === "short_payment")
        .map((c) => ({
          id: `ai05-dispute-${c.paymentId}`,
          type: AI_FINDING_TYPE.EXCEPTION,
          severity: AI_FINDING_SEVERITY.HIGH,
          title: `Short payment on ${c.disputeInvoiceNumber}`,
          detail: `Payment ${c.paymentNumber}: ₹${c.unusedAmount} received against an invoice with a larger balance — dispute opened, not silently allocated`,
          amount: c.unusedAmount,
          confidence: 1,
          subjectRefs: c.disputeInvoiceId ? [{ model: "SalesInvoice", id: c.disputeInvoiceId }] : [],
          evidence: [{ kind: "record" as const, ref: c.paymentId, label: c.paymentNumber }],
          reasonChain: [],
        })),
      ...extracted.allocationCandidates
        .filter((c) => c.type === "no_open_invoices")
        .map((c) => ({
          id: `ai05-unallocated-${c.paymentId}`,
          type: AI_FINDING_TYPE.EXCEPTION,
          severity: AI_FINDING_SEVERITY.MEDIUM,
          title: `Unallocated cash: ${c.paymentNumber}`,
          detail: `₹${c.unusedAmount} received with no open invoices for this customer to apply it against`,
          amount: c.unusedAmount,
          confidence: 1,
          subjectRefs: [],
          evidence: [{ kind: "record" as const, ref: c.paymentId, label: c.paymentNumber }],
          reasonChain: [],
        })),
    ];

    const draftable = extracted.allocationCandidates.filter((c) => c.allocations.length > 0);

    return {
      proposal: {
        allocationCandidates: extracted.allocationCandidates,
        predictedPayments: extracted.predictedPayments,
        worklist: extracted.worklist,
        agingSummary: extracted.agingSummary,
        paymentStateDivergence: extracted.paymentStateDivergence,
        unallocatedCash: extracted.unallocatedCash,
      },
      confidence: draftable.length > 0 ? 1 : 0,
      confidenceComponents: { allocation_evidence: 1 },
      findings,
      reasonChain,
      gateOverrides: { periodOpen: true, permissionOk: Boolean(extracted.actingUserId) },
    };
  },

  async validate(): Promise<{ valid: boolean; vetoReason?: string }> {
    return { valid: true };
  },

  async act(reasoned, ctx, decision, rt, extracted): Promise<ActResult> {
    const actionsTaken: ActResult["actionsTaken"] = [];
    const findings: ActResult["findings"] = [];

    // Disputes and unallocated-cash escalations are AI-native record-keeping
    // (models/ai/AiDispute.ts, models/ai/AiAttentionItem.ts) — recorded regardless of this run's
    // financial-write autonomy, the same way AI-24's resolve_task and AI-07's
    // record_learning_outcome always run: they are the workflow's own observations, not a
    // financial action gated by policy.
    for (const c of extracted.allocationCandidates) {
      if (c.type === "short_payment" && c.disputeInvoiceId) {
        try {
          await rt.callTool(
            "open_dispute",
            {
              tenantId: ctx.tenantId,
              workflowId: "AI-05",
              subjectId: c.disputeInvoiceId,
              customerId: c.customerId,
              reason: `Short payment: ₹${c.unusedAmount} received against invoice ${c.disputeInvoiceNumber}`,
              detectedBasis: "receipt_below_80pct_of_oldest_open_invoice",
              amount: c.unusedAmount,
            },
            { requestedAutonomy: AI_AUTONOMY_LEVEL.EXECUTE, idempotencyKey: `ai-05-dispute:${c.disputeInvoiceId}:${c.paymentId}` },
          );
          actionsTaken.push({ tool: "open_dispute", args: { invoiceId: c.disputeInvoiceId, paymentId: c.paymentId }, reversible: true });
          await rt.callTool(
            "create_task",
            {
              tenantId: ctx.tenantId,
              workflowId: "AI-05",
              runId: rt.runId,
              priority: "high",
              what: `Short payment on invoice ${c.disputeInvoiceNumber}`,
              why: `Payment ${c.paymentNumber} received ₹${c.unusedAmount}, less than the invoice's outstanding balance — reminder sequence stopped for this invoice`,
              dedupeKey: `ai05-dispute:${ctx.tenantId}:${c.disputeInvoiceId}`,
              impactAmount: c.unusedAmount,
              evidence: [{ kind: "record", ref: c.paymentId, label: c.paymentNumber }],
            },
            { requestedAutonomy: AI_AUTONOMY_LEVEL.EXECUTE },
          );
        } catch {
          // Dispute already open or transient failure — next sweep retries.
        }
        continue;
      }

      if (c.type === "no_open_invoices") {
        try {
          await rt.callTool(
            "create_task",
            {
              tenantId: ctx.tenantId,
              workflowId: "AI-05",
              runId: rt.runId,
              priority: "medium",
              what: `Unallocated cash: ${c.paymentNumber}`,
              why: `₹${c.unusedAmount} received with no open invoices for this customer`,
              dedupeKey: `ai05-unallocated:${ctx.tenantId}:${c.paymentId}`,
              impactAmount: c.unusedAmount,
              evidence: [{ kind: "record", ref: c.paymentId, label: c.paymentNumber }],
            },
            { requestedAutonomy: AI_AUTONOMY_LEVEL.EXECUTE },
          );
        } catch {
          // Best-effort.
        }
        continue;
      }

      // exact/partial/batched/overpayment — the real financial write, gated on this run's
      // actual autonomy decision (docs/ai/BRIEF-05-BATCH-D.md A.4: DRAFT for allocation).
      // callTool()'s own maxAutonomyLevel check does not consult decision.autonomyApplied, so
      // the workflow must check it explicitly (same pattern as AI-07/AI-08/AI-10).
      if (decision.autonomyApplied !== AI_AUTONOMY_LEVEL.DRAFT || c.allocations.length === 0) continue;
      try {
        await rt.callTool(
          "draft_receipt_allocation",
          { tenantId: ctx.tenantId, paymentId: c.paymentId, allocations: c.allocations.map((a) => ({ invoiceId: a.invoiceId, amount: a.amount })) },
          { requestedAutonomy: AI_AUTONOMY_LEVEL.DRAFT, idempotencyKey: `ai-05-allocation:${c.paymentId}` },
        );
        actionsTaken.push({ tool: "draft_receipt_allocation", args: { paymentId: c.paymentId, type: c.type }, reversible: true });
      } catch {
        // Smart-rules veto, race with a human edit, or already fully allocated — leave as a
        // finding, no draft.
      }
    }

    // Drafted communications for the collection worklist (algorithm step 4) — content only,
    // always recorded regardless of decision.autonomyApplied since nothing here can send.
    for (const entry of reasoned.proposal.worklist.slice(0, 50)) {
      try {
        const draft = await rt.callTool<{ draftId: string }>(
          "draft_communication",
          {
            tenantId: ctx.tenantId,
            workflowId: "AI-05",
            runId: rt.runId,
            customerId: entry.customerId,
            invoiceIds: [entry.invoiceId],
            stage: entry.stage,
            subject: `${entry.stage === "final" ? "Final notice" : "Payment reminder"}: invoice ${entry.invoiceNumber}`,
            body: `Hi ${entry.customerName}, invoice ${entry.invoiceNumber} for ₹${entry.amountAtRisk} is ${entry.reason}. Please arrange payment at your earliest convenience.`,
          },
          { requestedAutonomy: AI_AUTONOMY_LEVEL.EXECUTE, idempotencyKey: `ai-05-draft-comm:${ctx.tenantId}:${entry.invoiceId}` },
        );
        actionsTaken.push({ tool: "draft_communication", args: { invoiceId: entry.invoiceId, stage: entry.stage, draftId: draft.draftId }, reversible: true });
      } catch {
        // Best-effort — worklist entry still reported even if the draft failed.
      }

      if (extracted.worklistMaterialityConfigured && extracted.worklistMaterialityThreshold !== null && entry.amountAtRisk >= extracted.worklistMaterialityThreshold) {
        try {
          await rt.callTool(
            "create_task",
            {
              tenantId: ctx.tenantId,
              workflowId: "AI-05",
              runId: rt.runId,
              priority: entry.overdueDays > 45 ? "high" : "medium",
              what: `Collection risk: ${entry.invoiceNumber} (${entry.customerName})`,
              why: entry.reason,
              dedupeKey: `ai05-worklist:${ctx.tenantId}:${entry.invoiceId}`,
              impactAmount: entry.amountAtRisk,
              evidence: [{ kind: "record", ref: entry.invoiceId, label: entry.invoiceNumber }],
            },
            { requestedAutonomy: AI_AUTONOMY_LEVEL.EXECUTE },
          );
        } catch {
          // Best-effort.
        }
      }
    }

    return {
      findings,
      actionsTaken,
      metrics: { scanned: extracted.allocationCandidates.length + extracted.worklist.length, autoActioned: actionsTaken.length },
    };
  },

  async verify(): Promise<VerifyResult> {
    return { ok: true };
  },
};
