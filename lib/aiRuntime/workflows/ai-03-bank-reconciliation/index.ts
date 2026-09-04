import connectDB from "@/lib/db";
import mongoose from "mongoose";
import BankStatement from "@/models/finance/BankStatement";
import {
  AI_AUTONOMY_LEVEL,
  AI_FINDING_TYPE,
  AI_FINDING_SEVERITY,
} from "@/lib/constants/statuses";
import type {
  WorkflowDefinition,
  ObservedResult,
  ReasonResult,
  ActResult,
  VerifyResult,
} from "@/lib/aiRuntime/workflows/types";
import {
  findExactMatches,
  classifyUnresolvedLine,
  type BankLineSubject,
  type ExactMatchCandidate,
  type BankLineClassification,
} from "@/lib/aiRuntime/workflows/ai-03-bank-reconciliation/matcher";
import { computeBankPosition, type BankPosition } from "@/lib/aiRuntime/workflows/ai-03-bank-reconciliation/position";

/**
 * AI-03 — Bank reconciliation (docs/ai/BRIEF-02-BATCH-A.md). A new matcher
 * (lib/aiRuntime/workflows/ai-03-bank-reconciliation/matcher.ts), separate from
 * `lib/accounting/matching.ts` (PO↔invoice, a different scope — not overloaded, per the brief).
 *
 * **Scope limit (A.1)**: ledger candidates come only from Finance `Invoice`/posted
 * `JournalEntry` (via the `BankStatement.header.journalId` → `Account` link). A line only
 * explicable via `models/sales/Payment.ts` is classified `unknown_ar_side` and escalated —
 * never guessed at, per A.1.
 *
 * **Autonomy shape (A.5)**: the run-level gate governs ONLY Pass-1 exact-match auto-
 * reconciliation (the sole EXECUTE-eligible action this batch). Pass-2 fuzzy candidates and
 * Pass-3 fee/interest/transfer/unknown classifications are RECOMMEND-shaped unconditionally,
 * regardless of what the gate decides for the exact-match subset — A.5 requires this
 * independent of confidence, not just as a fallback.
 */

interface Ai03Raw {
  bankStatementIds: string[];
  actingUserId?: string;
}

interface LineOutcome {
  bankStatementId: string;
  bankAccountId: string;
  lineId: string;
  subject: BankLineSubject;
  kind: "exact" | "fuzzy" | "bank_fee" | "interest" | "internal_transfer" | "unknown_ar_side" | "unknown";
  exactCandidate?: ExactMatchCandidate;
  fuzzyCandidates?: ExactMatchCandidate[];
}

interface Ai03Extracted {
  actingUserId?: string;
  lines: LineOutcome[];
  positions: BankPosition[];
}

interface Ai03Proposal {
  exactMatchLines: LineOutcome[];
  otherLines: LineOutcome[];
}

async function classifyLine(
  tenantId: string,
  bankAccountId: mongoose.Types.ObjectId,
  bankStatementId: string,
  line: { _id?: mongoose.Types.ObjectId; date: Date; payment_ref?: string; amount: number; partnerId?: mongoose.Types.ObjectId; isReconciled: boolean },
): Promise<LineOutcome> {
  const subject: BankLineSubject = {
    bankStatementId,
    lineId: String(line._id),
    date: line.date,
    amount: line.amount,
    paymentRef: line.payment_ref ?? "",
    partnerId: line.partnerId ? String(line.partnerId) : undefined,
  };

  const exact = await findExactMatches(tenantId, bankAccountId, subject);
  const acctId = String(bankAccountId);
  if (exact.length === 1) {
    return { bankStatementId, bankAccountId: acctId, lineId: subject.lineId, subject, kind: "exact", exactCandidate: exact[0] };
  }
  if (exact.length > 1) {
    return { bankStatementId, bankAccountId: acctId, lineId: subject.lineId, subject, kind: "fuzzy", fuzzyCandidates: exact };
  }

  const classification: BankLineClassification = await classifyUnresolvedLine(tenantId, subject, bankStatementId);
  return { bankStatementId, bankAccountId: acctId, lineId: subject.lineId, subject, kind: classification };
}

export const ai03BankReconciliation: WorkflowDefinition<Ai03Raw, Ai03Extracted, Ai03Proposal> = {
  id: "AI-03",
  version: "1.0.0",
  eventKeys: ["bank.transaction.imported", "ai.sweep.hourly"],
  actionClass: "bank_reconciliation",
  defaultAutonomy: AI_AUTONOMY_LEVEL.EXECUTE,

  // `bank.transaction.imported` is solo-subscribed (no filter consulted for it — see
  // eventBus.ts::dispatchEvent). `ai.sweep.hourly` is shared with AI-07/AI-09, each doing its
  // own independent domain scan on the same tenant-wide tick — fan-out, not entity ownership
  // (docs/ai/BRIEF-04-BATCH-C.md Part 0.2), so this always accepts.
  subscriptionFilter(): boolean {
    return true;
  },

  async observe(event): Promise<ObservedResult<Ai03Raw>> {
    const actingUserId = event.payload.actingUserId ? String(event.payload.actingUserId) : undefined;
    if (event.eventKey === "bank.transaction.imported") {
      const bankStatementId = String(event.payload.bankStatementId);
      return {
        entityId: bankStatementId,
        subjectRef: { model: "BankStatement", id: bankStatementId },
        raw: { bankStatementIds: [bankStatementId], actingUserId },
      };
    }
    // ai.sweep.hourly — scan every BankStatement for this tenant with unreconciled lines.
    await connectDB();
    const statements = await BankStatement.find({ tenantId: event.tenantId, "lineIds.isReconciled": false }).select("_id").lean();
    return {
      entityId: event.tenantId,
      raw: { bankStatementIds: statements.map((s) => String(s._id)), actingUserId },
    };
  },

  async extract(observed, ctx): Promise<Ai03Extracted> {
    await connectDB();
    const lines: LineOutcome[] = [];
    const positions: Ai03Extracted["positions"] = [];

    for (const bankStatementId of observed.raw.bankStatementIds) {
      const statement = await BankStatement.findById(bankStatementId).lean();
      if (!statement) continue;
      const bankAccountId = statement.header.journalId;

      const unreconciled = (statement.lineIds ?? []).filter((l) => !l.isReconciled);
      for (const line of unreconciled) {
        lines.push(await classifyLine(ctx.tenantId, bankAccountId, bankStatementId, line));
      }

      const position = await computeBankPosition(ctx.tenantId, bankStatementId);
      if (position) positions.push(position);
    }

    return { actingUserId: observed.raw.actingUserId, lines, positions };
  },

  async reason(extracted): Promise<ReasonResult<Ai03Proposal>> {
    const exactMatchLines = extracted.lines.filter((l) => l.kind === "exact");
    const otherLines = extracted.lines.filter((l) => l.kind !== "exact");
    const reasonChain = [
      `scanned ${extracted.lines.length} unreconciled line(s): ${exactMatchLines.length} exact, ${otherLines.length} other`,
    ];

    const findings = extracted.lines.map((l) => {
      const base = {
        id: `ai03-${l.bankStatementId}-${l.lineId}`,
        subjectRefs: [{ model: "BankStatement", id: l.bankStatementId }],
        evidence: [],
        reasonChain: [],
        amount: l.subject.amount,
      };
      if (l.kind === "exact") {
        return {
          ...base,
          type: AI_FINDING_TYPE.MATCH,
          severity: AI_FINDING_SEVERITY.INFO,
          title: "Exact bank match",
          detail: `Journal entry ${l.exactCandidate!.journalEntryId}`,
          confidence: 1,
        };
      }
      if (l.kind === "fuzzy") {
        return {
          ...base,
          type: AI_FINDING_TYPE.PROPOSAL,
          severity: AI_FINDING_SEVERITY.MEDIUM,
          title: "Multiple possible bank matches",
          detail: `${l.fuzzyCandidates!.length} candidate journal entries — review required`,
          confidence: 1 / l.fuzzyCandidates!.length,
        };
      }
      if (l.kind === "bank_fee" || l.kind === "interest") {
        return {
          ...base,
          type: AI_FINDING_TYPE.EXCEPTION,
          severity: AI_FINDING_SEVERITY.LOW,
          title: l.kind === "bank_fee" ? "Bank fee/charge" : "Interest",
          detail: `Classified from reference "${l.subject.paymentRef}"`,
          confidence: 0.7,
        };
      }
      if (l.kind === "internal_transfer") {
        return {
          ...base,
          type: AI_FINDING_TYPE.EXPLANATION,
          severity: AI_FINDING_SEVERITY.INFO,
          title: "Internal transfer between own bank accounts",
          detail: "Matched an opposite-signed line on another BankStatement",
          confidence: 0.9,
        };
      }
      if (l.kind === "unknown_ar_side") {
        return {
          ...base,
          type: AI_FINDING_TYPE.EXCEPTION,
          severity: AI_FINDING_SEVERITY.MEDIUM,
          title: "Likely a Sales-side receipt (out of scope this batch)",
          detail: "Has a Customer reference but no matching Finance-side record — see AI-05 (a later chunk)",
          confidence: 0,
        };
      }
      return {
        ...base,
        type: AI_FINDING_TYPE.EXCEPTION,
        severity: AI_FINDING_SEVERITY.HIGH,
        title: "Unmatched bank line",
        detail: `Reference "${l.subject.paymentRef}" — no candidate found`,
        confidence: 0,
      };
    });

    return {
      proposal: { exactMatchLines, otherLines },
      confidence: exactMatchLines.length > 0 ? 1 : 0,
      confidenceComponents: { exact_match_rate: extracted.lines.length > 0 ? exactMatchLines.length / extracted.lines.length : 0 },
      findings,
      reasonChain,
      gateOverrides: {
        periodOpen: true,
        permissionOk: Boolean(extracted.actingUserId),
      },
    };
  },

  async validate(): Promise<{ valid: boolean; vetoReason?: string }> {
    return { valid: true };
  },

  async act(reasoned, ctx, decision, rt, extracted): Promise<ActResult> {
    const actionsTaken: ActResult["actionsTaken"] = [];
    let autoActioned = 0;

    // Pass 1 EXECUTE — gated by the run-level decision, per A.5.
    if (decision.autonomyApplied === AI_AUTONOMY_LEVEL.EXECUTE) {
      for (const line of reasoned.proposal.exactMatchLines) {
        try {
          await rt.callTool(
            "reconcile_transaction",
            {
              tenantId: ctx.tenantId,
              createdBy: extracted.actingUserId,
              bankStatementId: line.bankStatementId,
              lineId: line.lineId,
              journalEntryId: line.exactCandidate!.journalEntryId,
              journalLineId: line.exactCandidate!.journalLineId,
              amount: line.subject.amount,
              date: line.subject.date,
              description: line.subject.paymentRef,
            },
            { requestedAutonomy: AI_AUTONOMY_LEVEL.EXECUTE, idempotencyKey: `ai-03-reconcile:${line.bankStatementId}:${line.lineId}` },
          );
          actionsTaken.push({ tool: "reconcile_transaction", args: { bankStatementId: line.bankStatementId, lineId: line.lineId }, reversible: false });
          autoActioned += 1;
        } catch {
          // Period locked, or no acting user for the required permission check — leave unmatched.
        }
      }
    }

    // Pass 3 fee/interest — always DRAFT a journal (never posted), then escalate for
    // approval, unconditionally per A.5 (independent of the run-level EXECUTE decision).
    // A real journal entry needs two legs: the bank account itself, and a fee/interest
    // expense account. AI-03 doesn't own account classification (that's AI-02) — it looks
    // up any active, postable expense-type account as a placeholder leg for the human
    // reviewer to correct if needed, rather than drafting an invalid single-leg entry.
    const feeExpenseLines = reasoned.proposal.otherLines.filter((l) => l.kind === "bank_fee" || l.kind === "interest");
    if (feeExpenseLines.length > 0) {
      const Account = (await import("@/models/finance/Account")).default;
      const placeholderExpenseAccount = await Account.findOne({
        tenantId: ctx.tenantId,
        account_type: "expense",
        isActive: { $ne: false },
        isLocked: { $ne: true },
      }).lean();

      if (placeholderExpenseAccount) {
        for (const line of feeExpenseLines) {
          const amount = Math.abs(line.subject.amount);
          const isOutflow = line.subject.amount < 0;
          try {
            await rt.callTool(
              "draft_journal",
              {
                tenantId: ctx.tenantId,
                createdBy: extracted.actingUserId,
                header: { journalType: "bank", date: line.subject.date },
                lineIds: [
                  { accountId: line.bankAccountId, label: line.kind, debit: isOutflow ? 0 : amount, credit: isOutflow ? amount : 0 },
                  { accountId: String(placeholderExpenseAccount._id), label: line.kind, debit: isOutflow ? amount : 0, credit: isOutflow ? 0 : amount },
                ],
              },
              { requestedAutonomy: AI_AUTONOMY_LEVEL.DRAFT, idempotencyKey: `ai-03-draft-journal:${line.bankStatementId}:${line.lineId}` },
            );
            actionsTaken.push({ tool: "draft_journal", args: { bankStatementId: line.bankStatementId, lineId: line.lineId, kind: line.kind }, reversible: true });
          } catch {
            // No acting user, or smart-rules vetoed — leave as a plain finding, no draft.
          }
        }
      }
    }

    return { findings: [], actionsTaken, metrics: { scanned: reasoned.proposal.exactMatchLines.length + reasoned.proposal.otherLines.length, matched: reasoned.proposal.exactMatchLines.length, autoActioned } };
  },

  async verify(): Promise<VerifyResult> {
    return { ok: true };
  },
};
