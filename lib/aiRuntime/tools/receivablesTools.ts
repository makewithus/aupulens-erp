import connectDB from "@/lib/db";
import mongoose from "mongoose";
import Payment from "@/models/sales/Payment";
import AiDispute, { AI_DISPUTE_STATUS } from "@/models/ai/AiDispute";
import AiCommunicationDraft, { type AiCommunicationStage } from "@/models/ai/AiCommunicationDraft";
import { validateAllocations, validateAllocationAmounts, sumAllocations, type AllocationInput } from "@/lib/sales/paymentAllocation";
import { PAYMENT_STATUS, AI_TOOL_SIDE_EFFECT, AI_AUTONOMY_LEVEL } from "@/lib/constants/statuses";
import { registerTool } from "@/lib/aiRuntime/tools/registry";
import { SalesInvoice } from "@/models/sales/SalesInvoice";

/**
 * AI-05's write tools (docs/ai/BRIEF-05-BATCH-D.md, AI-05). `draft_receipt_allocation` is a real
 * financial-module write (module: "sales") — it goes through the standard permission check, not
 * `internal_state`, because it writes `models/sales/Payment.ts`, not `models/ai/**`.
 * `draft_communication` and `open_dispute` are `internal_state` — both write only `models/ai/**`
 * (docs/ai/AiCommunicationDraft.ts, AiDispute.ts).
 */

// ── draft_receipt_allocation ────────────────────────────────────────────────
//
// AI-05 never fabricates new money — it only completes the allocation of an EXISTING draft
// Payment that already has `unusedAmount > 0` (a receipt someone recorded but didn't finish
// applying to invoices). This tool appends allocation rows and reduces `unusedAmount` on that
// same Payment; it never creates a new Payment document and never touches `status` (stays
// DRAFT — docs/ai/BRIEF-05-BATCH-D.md A.4). `SalesInvoice.payments[]` is never written here per
// A.2: that sync only runs when a human later confirms this Payment to PAID through the existing
// route (app/api/sales/payments/route.ts), which behaves identically whether the allocations on
// it were entered by a human or proposed by AI-05 — both are real, validated Payment data.

export interface DraftReceiptAllocationArgs {
  tenantId: string;
  paymentId: string;
  allocations: AllocationInput[];
}

async function draftReceiptAllocationHandler(args: DraftReceiptAllocationArgs) {
  await connectDB();
  const payment = await Payment.findOne({ _id: args.paymentId, tenantId: args.tenantId });
  if (!payment) throw new Error(`Payment ${args.paymentId} not found`);
  if (payment.status !== PAYMENT_STATUS.DRAFT) {
    throw new Error(`Payment ${args.paymentId} is not in draft status — AI-05 only completes allocation of draft receipts`);
  }

  // bankCharges/tdsAmount are already netted into this payment's current unusedAmount, so the
  // "amount received" pool being allocated here is unusedAmount itself, with no further
  // deductions.
  const stillUnused = validateAllocations(args.allocations, payment.unusedAmount, 0, 0);

  const invoices = await (SalesInvoice as any)
    .find({ tenantId: args.tenantId, _id: { $in: args.allocations.map((a) => a.invoiceId) } })
    .select("_id number totalAmount payments")
    .lean();
  validateAllocationAmounts(args.allocations, invoices);

  const appliedTotal = sumAllocations(args.allocations);
  payment.allocations = [
    ...payment.allocations,
    ...args.allocations.map((a) => ({ invoiceId: new mongoose.Types.ObjectId(a.invoiceId), amount: a.amount })),
  ];
  payment.unusedAmount = stillUnused;
  payment.notes = `${payment.notes ? payment.notes + " " : ""}Allocation proposed by AI-05 (Receivables operations) — pending human confirmation.`.trim();
  await payment.save();

  return { paymentId: String(payment._id), appliedTotal, remainingUnusedAmount: payment.unusedAmount };
}

// ── draft_communication ─────────────────────────────────────────────────────

export interface DraftCommunicationArgs {
  tenantId: string;
  workflowId: string;
  runId: string;
  customerId: string;
  invoiceIds: string[];
  stage: AiCommunicationStage;
  subject: string;
  body: string;
}

async function draftCommunicationHandler(args: DraftCommunicationArgs) {
  await connectDB();
  const draft = await AiCommunicationDraft.create({
    tenantId: args.tenantId,
    workflowId: args.workflowId,
    runId: args.runId,
    customerId: args.customerId,
    invoiceIds: args.invoiceIds,
    stage: args.stage,
    subject: args.subject,
    body: args.body,
    status: "drafted",
  });
  return { draftId: String(draft._id) };
}

// ── open_dispute ─────────────────────────────────────────────────────────────

export interface OpenDisputeArgs {
  tenantId: string;
  workflowId: string;
  subjectId: string;
  customerId: string;
  reason: string;
  detectedBasis: string;
  amount?: number;
}

async function openDisputeHandler(args: OpenDisputeArgs) {
  await connectDB();
  const existing = await AiDispute.findOne({
    tenantId: args.tenantId,
    subjectModel: "SalesInvoice",
    subjectId: args.subjectId,
    status: AI_DISPUTE_STATUS.OPEN,
  });
  if (existing) return { disputeId: String(existing._id), created: false };

  const dispute = await AiDispute.create({
    tenantId: args.tenantId,
    workflowId: args.workflowId,
    subjectModel: "SalesInvoice",
    subjectId: new mongoose.Types.ObjectId(args.subjectId),
    customerId: args.customerId,
    reason: args.reason,
    detectedBasis: args.detectedBasis,
    amount: args.amount,
    status: AI_DISPUTE_STATUS.OPEN,
  });
  return { disputeId: String(dispute._id), created: true };
}

// ── registration ─────────────────────────────────────────────────────────────

export function registerReceivablesTools(): void {
  registerTool<DraftReceiptAllocationArgs>({
    name: "draft_receipt_allocation",
    description: "Completes allocation of an existing DRAFT models/sales/Payment.ts (never creates one), validated through lib/sales/paymentAllocation.ts. Never syncs SalesInvoice.payments[] directly — that only happens on human confirm-to-paid via the existing route.",
    sideEffect: AI_TOOL_SIDE_EFFECT.DRAFT,
    reversible: true,
    maxAutonomyLevel: AI_AUTONOMY_LEVEL.DRAFT,
    module: "sales",
    handler: draftReceiptAllocationHandler,
  });

  registerTool<DraftCommunicationArgs>({
    name: "draft_communication",
    description: "Creates a models/ai/AiCommunicationDraft.ts row — content only, never sent (send_reminder is not registered this batch).",
    sideEffect: AI_TOOL_SIDE_EFFECT.EXECUTE,
    reversible: true,
    maxAutonomyLevel: AI_AUTONOMY_LEVEL.EXECUTE,
    category: "internal_state",
    handler: draftCommunicationHandler,
  });

  registerTool<OpenDisputeArgs>({
    name: "open_dispute",
    description: "Creates a models/ai/AiDispute.ts row, deduped on {tenantId, subjectId, status: open}. reminderEngine.ts skips any invoice with an open dispute.",
    sideEffect: AI_TOOL_SIDE_EFFECT.EXECUTE,
    reversible: true,
    maxAutonomyLevel: AI_AUTONOMY_LEVEL.EXECUTE,
    category: "internal_state",
    handler: openDisputeHandler,
  });
}
