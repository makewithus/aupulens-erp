import connectDB from "@/lib/db";
import Expense from "@/models/finance/Expense";
import AiExpensePolicy from "@/models/ai/AiExpensePolicy";
import { AI_AUTONOMY_LEVEL, AI_FINDING_TYPE, AI_FINDING_SEVERITY } from "@/lib/constants/statuses";
import type {
  WorkflowDefinition,
  ObservedResult,
  ReasonResult,
  ActResult,
  VerifyResult,
} from "@/lib/aiRuntime/workflows/types";

/**
 * AI-04 — Expense intelligence (docs/ai/BRIEF-02-BATCH-A.md). Fully deterministic — no LLM
 * call at all, by design: this workflow only checks an already-created `Expense` record
 * (from `expense.submitted`, the existing plain-CRUD route) against a configured
 * `AiExpensePolicy`. Account classification for expense lines is already handled by AI-02,
 * which also subscribes to `expense.submitted` — not duplicated here.
 *
 * **Two real gaps recorded, not papered over** (see docs/ai/OPEN_QUESTIONS.md):
 * 1. No corporate-card feed exists anywhere in this codebase — card↔receipt matching from the
 *    generic brief has nothing to match against and is not built.
 * 2. `models/finance/Expense.ts` has no receipt-attachment field — the "missing receipt above
 *    threshold" check cannot be implemented against a real field, so it is not implemented
 *    rather than faked against a field that doesn't exist.
 *
 * **The single most important rule here**: an absent/unconfigured `AiExpensePolicy` means
 * `policy_configured: false` and **zero violations invented** — never a made-up spending limit.
 * A false positive here (flagging a legitimate expense against a limit nobody set) is worse
 * than any other failure mode in this batch.
 */

interface Ai04Raw {
  expenseId: string;
  actingUserId?: string;
}

interface Ai04Violation {
  rule: "prohibited_category" | "over_limit" | "duplicate_claim";
  detail: string;
}

interface Ai04Extracted {
  expenseId: string;
  actingUserId?: string;
  category?: string;
  total: number;
  employeeId?: string;
  expenseDate?: Date;
  policyConfigured: boolean;
  violations: Ai04Violation[];
}

interface Ai04Proposal {
  policyConfigured: boolean;
  violations: Ai04Violation[];
}

export const ai04ExpenseIntelligence: WorkflowDefinition<Ai04Raw, Ai04Extracted, Ai04Proposal> = {
  id: "AI-04",
  version: "1.0.0",
  eventKeys: ["expense.submitted"],
  actionClass: "expense_policy_check",
  defaultAutonomy: AI_AUTONOMY_LEVEL.DRAFT,

  // Shared with AI-02 (account classification) — every submitted expense is a valid policy-check
  // candidate for AI-04 too; fan-out, not ownership (docs/ai/BRIEF-04-BATCH-C.md Part 0.2).
  subscriptionFilter(): boolean {
    return true;
  },

  async observe(event): Promise<ObservedResult<Ai04Raw>> {
    const expenseId = String(event.payload.expenseId);
    const actingUserId = event.payload.actingUserId ? String(event.payload.actingUserId) : undefined;
    return {
      entityId: expenseId,
      subjectRef: { model: "Expense", id: expenseId },
      raw: { expenseId, actingUserId },
    };
  },

  async extract(observed, ctx): Promise<Ai04Extracted> {
    await connectDB();
    const expense = await Expense.findById(observed.raw.expenseId).lean();
    if (!expense) throw new Error(`Expense ${observed.raw.expenseId} not found`);

    const policy = await AiExpensePolicy.findOne({ tenantId: ctx.tenantId }).lean();
    const violations: Ai04Violation[] = [];

    if (policy) {
      if (expense.category && policy.prohibitedCategories.includes(expense.category)) {
        violations.push({ rule: "prohibited_category", detail: `Category "${expense.category}" is prohibited by policy` });
      }
      const limit = policy.categoryLimits.find((l) => l.category === expense.category);
      if (limit && expense.total > limit.maxAmount) {
        violations.push({ rule: "over_limit", detail: `Amount ${expense.total} exceeds the ${limit.maxAmount} limit for "${expense.category}"` });
      }
    }

    // Duplicate claim: same employee, same total (±0.01), within 1 day — regardless of
    // whether a policy is configured (this is a data-integrity check, not a policy rule).
    const dayMs = 24 * 60 * 60 * 1000;
    const dateWindow = expense.expenseDate
      ? { $gte: new Date(new Date(expense.expenseDate).getTime() - dayMs), $lte: new Date(new Date(expense.expenseDate).getTime() + dayMs) }
      : undefined;
    const possibleDuplicates = await Expense.find({
      tenantId: ctx.tenantId,
      _id: { $ne: expense._id },
      employeeId: expense.employeeId,
      total: { $gte: expense.total - 0.01, $lte: expense.total + 0.01 },
      ...(dateWindow ? { expenseDate: dateWindow } : {}),
    })
      .limit(5)
      .lean();
    if (possibleDuplicates.length > 0) {
      violations.push({ rule: "duplicate_claim", detail: `${possibleDuplicates.length} other claim(s) by the same employee for the same amount within 1 day` });
    }

    return {
      expenseId: observed.raw.expenseId,
      actingUserId: observed.raw.actingUserId,
      category: expense.category,
      total: expense.total,
      employeeId: expense.employeeId ? String(expense.employeeId) : undefined,
      expenseDate: expense.expenseDate,
      policyConfigured: Boolean(policy),
      violations,
    };
  },

  async reason(extracted): Promise<ReasonResult<Ai04Proposal>> {
    const severityFor = (rule: Ai04Violation["rule"]) =>
      rule === "duplicate_claim" ? AI_FINDING_SEVERITY.HIGH : AI_FINDING_SEVERITY.MEDIUM;

    const findings = extracted.violations.map((v, i) => ({
      id: `ai04-${extracted.expenseId}-${i}`,
      type: AI_FINDING_TYPE.EXCEPTION,
      severity: severityFor(v.rule),
      title: `Expense policy: ${v.rule.replace(/_/g, " ")}`,
      detail: v.detail,
      amount: extracted.total,
      confidence: 1,
      subjectRefs: [{ model: "Expense", id: extracted.expenseId }],
      evidence: [],
      reasonChain: [],
    }));

    const reasonChain = extracted.policyConfigured
      ? [`policy configured — evaluated ${extracted.violations.length} violation(s)`]
      : ["no AiExpensePolicy configured for this tenant — only the duplicate-claim check ran, no limit was invented"];

    return {
      proposal: { policyConfigured: extracted.policyConfigured, violations: extracted.violations },
      confidence: 1,
      confidenceComponents: { deterministic: 1 },
      findings,
      reasonChain,
      gateOverrides: { periodOpen: true, permissionOk: Boolean(extracted.actingUserId) },
    };
  },

  async validate(): Promise<{ valid: boolean; vetoReason?: string }> {
    return { valid: true };
  },

  async act(reasoned): Promise<ActResult> {
    // Nothing to write — this workflow only evaluates and reports. Violations become
    // attention items automatically (EXCEPTION-type findings always escalate — see
    // lib/aiRuntime/runtime/executor.ts's per-finding escalation).
    return { findings: [], actionsTaken: [], metrics: { scanned: 1, exceptions: reasoned.proposal.violations.length } };
  },

  async verify(): Promise<VerifyResult> {
    return { ok: true };
  },
};
