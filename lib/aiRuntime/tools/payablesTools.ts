import connectDB from "@/lib/db";
import Invoice from "@/models/finance/Invoice";
import AiPaymentRunProposal, { type IAiPaymentRunIncluded, type IAiPaymentRunExcluded, type IAiPaymentRunTotal } from "@/models/ai/AiPaymentRunProposal";
import { AI_TOOL_SIDE_EFFECT, AI_AUTONOMY_LEVEL } from "@/lib/constants/statuses";
import { registerTool } from "@/lib/aiRuntime/tools/registry";

/**
 * AI-06's write tools (docs/ai/BRIEF-05-BATCH-D.md, AI-06). `draft_match_annotation` is a real
 * financial-module write (module: "finance") — it only ever replaces `Invoice.discrepancyNotes`
 * (a human-readable string) on a bill the EXISTING `lib/accounting/matching.ts::runPOMatching()`
 * has already flagged `poMatchStatus: "mismatch"`. It never sets `poMatchStatus` or
 * `manualReviewRequired` itself — that decision stays exclusively with the deterministic
 * matching engine; AI-06 only enriches the explanation with a quantified "which leg, by how
 * much" note in place of the terse default one. `record_payment_run_proposal` is `internal_state`
 * — it writes only `models/ai/AiPaymentRunProposal.ts`, never anything that could move money.
 */

// ── draft_match_annotation ──────────────────────────────────────────────────

export interface DraftMatchAnnotationArgs {
  tenantId: string;
  invoiceId: string;
  discrepancyNotes: string;
}

async function draftMatchAnnotationHandler(args: DraftMatchAnnotationArgs) {
  await connectDB();
  const invoice = await Invoice.findOne({ _id: args.invoiceId, tenantId: args.tenantId, moveType: "in_invoice" });
  if (!invoice) throw new Error(`Vendor bill ${args.invoiceId} not found`);
  if (invoice.poMatchStatus !== "mismatch") {
    throw new Error(`Invoice ${args.invoiceId} is not flagged as a match mismatch — AI-06 only annotates existing mismatches, never sets the verdict itself`);
  }
  invoice.discrepancyNotes = args.discrepancyNotes;
  await invoice.save();
  return { invoiceId: String(invoice._id) };
}

// ── record_payment_run_proposal ─────────────────────────────────────────────

export interface RecordPaymentRunProposalArgs {
  tenantId: string;
  workflowId: string;
  runId: string;
  included: IAiPaymentRunIncluded[];
  excluded: IAiPaymentRunExcluded[];
  totalsByCurrency: IAiPaymentRunTotal[];
  checksNotImplemented: { what: string; reason: string }[];
}

async function recordPaymentRunProposalHandler(args: RecordPaymentRunProposalArgs) {
  await connectDB();
  const proposal = await AiPaymentRunProposal.create({
    tenantId: args.tenantId,
    workflowId: args.workflowId,
    runId: args.runId,
    included: args.included,
    excluded: args.excluded,
    totalsByCurrency: args.totalsByCurrency,
    checksNotImplemented: args.checksNotImplemented,
  });
  return { proposalId: String(proposal._id) };
}

// ── registration ─────────────────────────────────────────────────────────────

export function registerPayablesTools(): void {
  registerTool<DraftMatchAnnotationArgs>({
    name: "draft_match_annotation",
    description: "Replaces Invoice.discrepancyNotes on an EXISTING poMatchStatus:mismatch bill with a structured, quantified explanation. Never sets poMatchStatus or manualReviewRequired.",
    sideEffect: AI_TOOL_SIDE_EFFECT.DRAFT,
    reversible: true,
    maxAutonomyLevel: AI_AUTONOMY_LEVEL.DRAFT,
    module: "finance",
    handler: draftMatchAnnotationHandler,
  });

  registerTool<RecordPaymentRunProposalArgs>({
    name: "record_payment_run_proposal",
    description: "Creates a models/ai/AiPaymentRunProposal.ts document — a proposal, never executable. No tool anywhere can release or pay it.",
    sideEffect: AI_TOOL_SIDE_EFFECT.EXECUTE,
    reversible: true,
    maxAutonomyLevel: AI_AUTONOMY_LEVEL.EXECUTE,
    category: "internal_state",
    handler: recordPaymentRunProposalHandler,
  });
}
