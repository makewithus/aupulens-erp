import connectDB from "@/lib/db";
import { differenceInCalendarDays } from "date-fns";
import Invoice from "@/models/finance/Invoice";
import PurchaseOrder from "@/models/finance/PurchaseOrder";
import Customer from "@/models/sales/Customer";
import AiMaterialityPolicy, { findThreshold, type IAiMaterialityPolicy } from "@/models/ai/AiMaterialityPolicy";
import { computeLineVariances, type LineMatchResult, type UnmatchedLine } from "@/lib/accounting/matching";
import { AI_AUTONOMY_LEVEL, AI_FINDING_TYPE, AI_FINDING_SEVERITY, DOCUMENT_STATUS } from "@/lib/constants/statuses";
import type { WorkflowDefinition, ObservedResult, ReasonResult, ActResult, VerifyResult } from "@/lib/aiRuntime/workflows/types";

/**
 * AI-06 — Payables operations (docs/ai/BRIEF-05-BATCH-D.md). Matches bills to POs and receipts
 * with structured, quantified reasoning; checks for duplicates and tax gaps; builds a due
 * schedule; and produces a payment-run **proposal** — never an executable batch.
 *
 * **Extends, never replaces, `lib/accounting/matching.ts`**: `runPOMatching()` is the existing,
 * real, deterministic three-way matcher (it already decides `poMatchStatus`/
 * `manualReviewRequired` and already checks the receipt leg for `poMatchType: "3_way"` — neither
 * was missing). AI-06 never calls or reimplements it. It calls the new pure
 * `computeLineVariances()` export instead, which reads the same two documents and turns the
 * existing terse boolean verdict into a structured "which leg failed and by how much" — then, for
 * a bill the real matcher has ALREADY flagged `poMatchStatus: "mismatch"`, may replace
 * `Invoice.discrepancyNotes` (only that field) with the quantified explanation via
 * `draft_match_annotation`. It never sets `poMatchStatus` or `manualReviewRequired` — that
 * verdict stays exclusively with the deterministic matcher.
 *
 * **`checks_not_implemented`** (A.3, plus one more gap found while building this): vendor-bank-
 * change hold (no field tracks bank-detail changes — AI-19, Chunk 8), cross-source duplicate
 * search over payments/bank transactions (AI-27, Chunk 8), and early-payment discounts (no
 * payment-terms/discount field exists on `Invoice`, `PurchaseOrder`, or `Vendor` anywhere in this
 * codebase — confirmed by search, not assumed missing).
 *
 * **Payment release is impossible by construction**: no "release"/"execute" tool exists anywhere
 * in the tool registry for `AiPaymentRunProposal`, and the model itself carries no status field
 * that could represent one. `record_payment_run_proposal` only ever creates the proposal
 * document.
 */

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

interface Ai06Raw {
  mode: "bill_match" | "sweep";
  actingUserId?: string;
  invoiceId?: string;
}

interface MatchResultOutput {
  billId: string;
  billNumber: string;
  poId: string | null;
  legs: (LineMatchResult | UnmatchedLine)[];
  verdict: "match" | "exception" | "no_po_reference" | "po_not_found";
  variances: string[];
}

interface Ai06BillMatchExtracted {
  mode: "bill_match";
  actingUserId?: string;
  invoiceId: string;
  matchResult: MatchResultOutput;
  duplicateCandidateArgs: { vendorName?: string; billNumber?: string; totalAmount?: number; poReference?: string };
  noTaxLines: string[];
  materialityConfigured: boolean;
  materialityThreshold: number | null;
}

interface DueScheduleEntry {
  billId: string;
  billNumber: string;
  vendorId: string;
  vendorName: string;
  amount: number;
  currency: string;
  dueDate: Date;
  daysUntilDue: number;
  priority: "overdue" | "due_soon" | "normal";
}

interface PaymentRunCandidate {
  billId: string;
  billNumber: string;
  vendorId: string;
  vendorName: string;
  currency: string;
  amount: number;
  dueDate: Date;
  excludeReason?: string;
}

interface Ai06SweepExtracted {
  mode: "sweep";
  actingUserId?: string;
  dueSchedule: DueScheduleEntry[];
  cashImpact: { currency: string; amount: number }[];
  candidates: PaymentRunCandidate[];
}

type Ai06Extracted = Ai06BillMatchExtracted | Ai06SweepExtracted;

interface Ai06Proposal {
  mode: "bill_match" | "sweep";
  matchResult?: MatchResultOutput;
  dueSchedule?: DueScheduleEntry[];
  cashImpact?: { currency: string; amount: number }[];
  paymentRunProposal?: { included: PaymentRunCandidate[]; excluded: PaymentRunCandidate[]; totalsByCurrency: { currency: string; amount: number }[] };
  checksNotImplemented: { what: string; reason: string }[];
}

// Chunk 8b (D.3 handover audit): this list was stale — AI-19/AI-27 shipped in Chunk 8a and
// closed two of these three items, but this array was never revisited. `cross_source_duplicate_search`
// and `early_payment_discount` are now real (delegated to sibling workflows, not duplicated here);
// `vendor_bank_change_hold` is still genuinely not_implemented — 0.3's investigation confirmed
// Vendor/Customer really do carry no bank-detail field at all (AI-19's own hold mechanism is real
// for Employee/BankAccount, not Vendor).
const CHECKS_NOT_IMPLEMENTED: { what: string; reason: string }[] = [
  { what: "vendor_bank_change_hold", reason: "Vendor/Customer (the AP 'vendor' model) carry no bank-detail field at all, confirmed by schema inspection (docs/ai/SYSTEM_INVENTORY.md 0.3) — AI-19's real hold mechanism only covers Employee.bankDetails/BankAccount, which this workflow doesn't touch" },
];

function describeVariance(label: string, lineIndex: number, name: string, leg: { billed: number; reference: number; variance: number }): string {
  return `${label} variance of ${Math.abs(leg.variance)} on line ${lineIndex + 1} ("${name}"), PO says ${leg.reference}, bill says ${leg.billed}`;
}

export const ai06PayablesOperations: WorkflowDefinition<Ai06Raw, Ai06Extracted, Ai06Proposal> = {
  id: "AI-06",
  version: "1.0.0",
  eventKeys: ["ai.sweep.hourly", "bill.created"],
  actionClass: "payables",
  defaultAutonomy: AI_AUTONOMY_LEVEL.DRAFT,

  // Both keys are shared/fan-out — always accepted (bill.created has no single "owner", every
  // workflow watching it answers its own independent question about the same bill).
  async subscriptionFilter(): Promise<boolean> {
    return true;
  },

  async observe(event): Promise<ObservedResult<Ai06Raw>> {
    const actingUserId = event.payload.actingUserId ? String(event.payload.actingUserId) : undefined;
    if (event.eventKey === "bill.created") {
      const invoiceId = String(event.payload.invoiceId);
      return { entityId: invoiceId, subjectRef: { model: "Invoice", id: invoiceId }, raw: { mode: "bill_match", invoiceId, actingUserId } };
    }
    return { entityId: event.tenantId, raw: { mode: "sweep", actingUserId } };
  },

  async extract(observed, ctx): Promise<Ai06Extracted> {
    await connectDB();
    const tenantId = ctx.tenantId;

    if (observed.raw.mode === "bill_match") {
      const invoice = await Invoice.findOne({ _id: observed.raw.invoiceId, tenantId, moveType: "in_invoice" }).lean();
      if (!invoice) throw new Error(`Vendor bill ${observed.raw.invoiceId} not found`);

      const materialityPolicy = await AiMaterialityPolicy.findOne({ tenantId }).lean();
      const threshold = findThreshold(materialityPolicy as unknown as IAiMaterialityPolicy | null, "po_matching");

      const noTaxLines = (invoice.invoiceLines || []).filter((l) => !l.taxIds || l.taxIds.length === 0).map((l) => l.name);

      let matchResult: MatchResultOutput;
      if (!invoice.poReference?.trim()) {
        matchResult = { billId: String(invoice._id), billNumber: invoice.name, poId: null, legs: [], verdict: "no_po_reference", variances: [] };
      } else {
        const po = await PurchaseOrder.findOne({ tenantId, name: invoice.poReference.trim() }).lean();
        if (!po) {
          matchResult = { billId: String(invoice._id), billNumber: invoice.name, poId: null, legs: [], verdict: "po_not_found", variances: [] };
        } else {
          const legs = computeLineVariances(invoice.invoiceLines, po.orderLines, invoice.poMatchType);
          const variances: string[] = [];
          legs.forEach((leg, idx) => {
            if ("verdict" in leg && leg.verdict === "no_po_line") {
              variances.push(`no matching PO line for "${leg.name}" on line ${idx + 1}`);
              return;
            }
            const l = leg as LineMatchResult;
            if (l.verdict === "exception") {
              if (!l.quantity.withinTolerance) variances.push(describeVariance("quantity", idx, l.name, l.quantity));
              if (!l.price.withinTolerance) variances.push(describeVariance("price", idx, l.name, l.price));
              if (l.receipt && !l.receipt.withinTolerance) variances.push(describeVariance("receipt", idx, l.name, l.receipt));
            }
          });
          const verdict: "match" | "exception" = legs.some((l) => "verdict" in l && l.verdict !== "match") ? "exception" : "match";
          matchResult = { billId: String(invoice._id), billNumber: invoice.name, poId: String(po._id), legs, verdict, variances };
        }
      }

      let vendorName = "";
      if (invoice.partnerId) {
        const vendor = await Customer.findById(invoice.partnerId).select("header.name header.displayName").lean();
        vendorName = (vendor as { header?: { name?: string; displayName?: string } } | null)?.header?.displayName ?? (vendor as { header?: { name?: string } } | null)?.header?.name ?? "";
      }

      return {
        mode: "bill_match",
        actingUserId: observed.raw.actingUserId,
        invoiceId: String(invoice._id),
        matchResult,
        duplicateCandidateArgs: { vendorName, billNumber: invoice.name, totalAmount: invoice.amountTotal, poReference: invoice.poReference },
        noTaxLines,
        materialityConfigured: Boolean(threshold),
        materialityThreshold: threshold?.absoluteAmount ?? null,
      };
    }

    // ── sweep: due schedule + payment-run candidates across every open vendor bill ──
    const bills = await Invoice.find({
      tenantId,
      moveType: "in_invoice",
      state: { $nin: [DOCUMENT_STATUS.CANCELLED, DOCUMENT_STATUS.REJECTED] },
      paymentState: { $ne: "paid" },
    }).lean();

    const today = new Date();
    const dueSchedule: DueScheduleEntry[] = [];
    const candidates: PaymentRunCandidate[] = [];
    const vendorNameCache = new Map<string, string>();

    for (const bill of bills) {
      const vendorIdStr = String(bill.partnerId);
      if (!vendorNameCache.has(vendorIdStr)) {
        const vendor = await Customer.findById(bill.partnerId).select("header.name header.displayName").lean();
        vendorNameCache.set(vendorIdStr, (vendor as { header?: { displayName?: string; name?: string } } | null)?.header?.displayName ?? (vendor as { header?: { name?: string } } | null)?.header?.name ?? "Vendor");
      }
      const vendorName = vendorNameCache.get(vendorIdStr)!;
      const daysUntilDue = differenceInCalendarDays(bill.dueDate, today);
      const priority: DueScheduleEntry["priority"] = daysUntilDue < 0 ? "overdue" : daysUntilDue <= 7 ? "due_soon" : "normal";

      dueSchedule.push({
        billId: String(bill._id),
        billNumber: bill.name,
        vendorId: vendorIdStr,
        vendorName,
        amount: bill.amountResidual ?? bill.amountTotal,
        currency: bill.currencyId || "INR",
        dueDate: bill.dueDate,
        daysUntilDue,
        priority,
      });

      let excludeReason: string | undefined;
      if (bill.state === DOCUMENT_STATUS.DRAFT || bill.state === DOCUMENT_STATUS.PENDING_APPROVAL) {
        excludeReason = "unapproved";
      } else if (bill.poMatchStatus === "mismatch") {
        excludeReason = "match-failed";
      }
      candidates.push({
        billId: String(bill._id),
        billNumber: bill.name,
        vendorId: vendorIdStr,
        vendorName,
        currency: bill.currencyId || "INR",
        amount: bill.amountResidual ?? bill.amountTotal,
        dueDate: bill.dueDate,
        excludeReason,
      });
    }
    dueSchedule.sort((a, b) => a.daysUntilDue - b.daysUntilDue);

    const cashImpactMap = new Map<string, number>();
    for (const entry of dueSchedule) {
      cashImpactMap.set(entry.currency, round2((cashImpactMap.get(entry.currency) ?? 0) + entry.amount));
    }
    const cashImpact = Array.from(cashImpactMap.entries()).map(([currency, amount]) => ({ currency, amount }));

    return { mode: "sweep", actingUserId: observed.raw.actingUserId, dueSchedule, cashImpact, candidates };
  },

  async reason(extracted, ctx): Promise<ReasonResult<Ai06Proposal>> {
    if (extracted.mode === "bill_match") {
      const reasonChain: string[] = [`match verdict: ${extracted.matchResult.verdict}`, ...extracted.matchResult.variances];
      if (extracted.noTaxLines.length > 0) {
        reasonChain.push(`${extracted.noTaxLines.length} line(s) with no tax code selected (informational — proposal metadata only, never auto-corrected)`);
      }
      if (!extracted.materialityConfigured) {
        reasonChain.push('no "po_matching" materiality threshold configured — exceptions reported but not auto-escalated on amount');
      }

      const findings: ReasonResult<Ai06Proposal>["findings"] = [];
      if (extracted.matchResult.verdict === "exception") {
        findings.push({
          id: `ai06-mismatch-${extracted.matchResult.billId}`,
          type: AI_FINDING_TYPE.EXCEPTION,
          severity: AI_FINDING_SEVERITY.MEDIUM,
          title: `PO match exception: ${extracted.matchResult.billNumber}`,
          detail: extracted.matchResult.variances.join("; ") || "one or more lines outside tolerance",
          confidence: 1,
          subjectRefs: [{ model: "Invoice", id: extracted.matchResult.billId }],
          evidence: extracted.matchResult.poId ? [{ kind: "record" as const, ref: extracted.matchResult.poId, label: "linked PO" }] : [],
          reasonChain: [],
        });
      }

      return {
        proposal: { mode: "bill_match", matchResult: extracted.matchResult, checksNotImplemented: CHECKS_NOT_IMPLEMENTED },
        confidence: extracted.matchResult.verdict === "exception" ? 1 : 0,
        confidenceComponents: { match_evidence: 1 },
        findings,
        reasonChain,
        gateOverrides: { periodOpen: true, permissionOk: Boolean(extracted.actingUserId) },
      };
    }

    const reasonChain = [
      `${extracted.dueSchedule.length} open bill(s) on the due schedule`,
      `${extracted.candidates.filter((c) => !c.excludeReason).length} candidate(s) for a payment-run proposal`,
    ];

    return {
      proposal: {
        mode: "sweep",
        dueSchedule: extracted.dueSchedule,
        cashImpact: extracted.cashImpact,
        checksNotImplemented: CHECKS_NOT_IMPLEMENTED,
      },
      confidence: 1,
      findings: [],
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

    if (extracted.mode === "bill_match") {
      // Duplicate check — call AI-01's extended duplicateCheck.ts via the existing tool, never a
      // parallel matcher.
      const dup = await rt.callTool<{ matches: { id: string; reason: string }[]; isDuplicate: boolean }>(
        "run_duplicate_scan",
        { tenantId: ctx.tenantId, candidate: extracted.duplicateCandidateArgs },
        { requestedAutonomy: AI_AUTONOMY_LEVEL.CONTROLLED_AUTONOMOUS },
      );
      const realMatches = dup.matches.filter((m) => m.id !== extracted.invoiceId);
      if (realMatches.length > 0) {
        try {
          await rt.callTool(
            "create_task",
            {
              tenantId: ctx.tenantId,
              workflowId: "AI-06",
              runId: rt.runId,
              priority: "high",
              what: `Possible duplicate bill: ${extracted.matchResult.billNumber}`,
              why: realMatches.map((m) => m.reason).join("; "),
              dedupeKey: `ai06-duplicate:${ctx.tenantId}:${extracted.invoiceId}`,
              evidence: realMatches.map((m) => ({ kind: "record", ref: m.id, label: "possible duplicate" })),
            },
            { requestedAutonomy: AI_AUTONOMY_LEVEL.EXECUTE },
          );
        } catch {
          // Best-effort.
        }
      }

      // Enrich the annotation on an already-mismatched bill — DRAFT-tier, gated on this run's
      // actual autonomy decision (callTool()'s own check does not consult decision.autonomyApplied).
      if (decision.autonomyApplied === AI_AUTONOMY_LEVEL.DRAFT && extracted.matchResult.verdict === "exception" && extracted.matchResult.variances.length > 0) {
        try {
          await rt.callTool(
            "draft_match_annotation",
            { tenantId: ctx.tenantId, invoiceId: extracted.invoiceId, discrepancyNotes: extracted.matchResult.variances.join("\n") },
            { requestedAutonomy: AI_AUTONOMY_LEVEL.DRAFT, idempotencyKey: `ai-06-annotate:${extracted.invoiceId}` },
          );
          actionsTaken.push({ tool: "draft_match_annotation", args: { invoiceId: extracted.invoiceId }, reversible: true });
        } catch {
          // Bill not yet flagged "mismatch" by the real matcher, or a race — leave as a finding only.
        }
      }

      return { findings, actionsTaken, metrics: { scanned: 1, exceptions: extracted.matchResult.verdict === "exception" ? 1 : 0 } };
    }

    // sweep — always records the payment-run proposal (internal_state, models/ai/** only),
    // regardless of decision.autonomyApplied, same pattern as AI-05's dispute/draft recording:
    // this is the workflow's own observation, never itself a financial action.
    const included = extracted.candidates.filter((c) => !c.excludeReason);
    const excluded = extracted.candidates.filter((c) => c.excludeReason);
    const totalsMap = new Map<string, number>();
    for (const c of included) totalsMap.set(c.currency, round2((totalsMap.get(c.currency) ?? 0) + c.amount));
    const totalsByCurrency = Array.from(totalsMap.entries()).map(([currency, amount]) => ({ currency, amount }));

    try {
      const recorded = await rt.callTool<{ proposalId: string }>(
        "record_payment_run_proposal",
        {
          tenantId: ctx.tenantId,
          workflowId: "AI-06",
          runId: rt.runId,
          included: included.map((c) => ({ billId: c.billId, billNumber: c.billNumber, vendorId: c.vendorId, vendorName: c.vendorName, currency: c.currency, amount: c.amount, dueDate: c.dueDate })),
          excluded: excluded.map((c) => ({ billId: c.billId, billNumber: c.billNumber, reason: c.excludeReason! })),
          totalsByCurrency,
          checksNotImplemented: CHECKS_NOT_IMPLEMENTED,
        },
        { requestedAutonomy: AI_AUTONOMY_LEVEL.EXECUTE, idempotencyKey: `ai-06-payment-run:${ctx.tenantId}:${new Date().toISOString().slice(0, 10)}` },
      );
      actionsTaken.push({ tool: "record_payment_run_proposal", args: { proposalId: recorded.proposalId, includedCount: included.length }, reversible: true });
    } catch {
      // Idempotency replay for a run already made today, or a transient failure.
    }

    return { findings, actionsTaken, metrics: { scanned: extracted.candidates.length, matched: included.length } };
  },

  async verify(): Promise<VerifyResult> {
    return { ok: true };
  },
};
