import connectDB from "@/lib/db";
import BankingRule, { type IBankingRuleCriterion } from "@/models/finance/BankingRule";
import { BANKING_RULE_STATUS } from "@/lib/constants/statuses";

/**
 * The first-ever interpreter for BankingRule.criteria/criteriaMatch (docs/ai/BRIEF-02-BATCH-A.md
 * AI-02 algorithm step 1). Confirmed in docs/ai/SYSTEM_INVENTORY.md: the model has existed with
 * this exact shape since before this brief, but nothing ever evaluated it — its only prior
 * consumer created rules and never applied them. This is the single highest-value piece of
 * AI-02: it works standing alone, with zero model calls.
 *
 * `criteria[].operator` is unconstrained free text in the schema (no enum) — this interpreter
 * recognizes a fixed, documented set of common operators case-insensitively and treats anything
 * else as non-matching (fails safe: an unrecognized operator never causes a false match).
 *
 * BankingRule has no priority field — rules are evaluated in `createdAt` ascending order
 * (oldest first), a deliberate, documented limitation rather than an unrequested schema change
 * (A.7-style reasoning) — see docs/ai/OPEN_QUESTIONS.md.
 */

export interface ClassificationSubject {
  vendorName?: string;
  description?: string;
  amount?: number;
  /** deposit = money in (matches applyTo "deposits"), withdrawal = money out. */
  direction?: "deposit" | "withdrawal";
  referenceNumber?: string;
}

export interface BankingRuleMatch {
  ruleId: string;
  ruleName: string;
  accountId: string;
  associatedAccountIds: string[];
}

function fieldValue(subject: ClassificationSubject, field: string): string | number | undefined {
  const key = field.trim().toLowerCase();
  if (key === "description" || key === "memo" || key === "narration") return subject.description;
  if (key === "vendor" || key === "payee" || key === "counterparty") return subject.vendorName;
  if (key === "amount") return subject.amount;
  if (key === "reference" || key === "reference number" || key === "ref") return subject.referenceNumber;
  return undefined;
}

function evaluateCriterion(criterion: IBankingRuleCriterion, subject: ClassificationSubject): boolean {
  const value = fieldValue(subject, criterion.field);
  const op = criterion.operator.trim().toLowerCase();

  if (typeof value === "number") {
    const target = Number(criterion.value);
    if (Number.isNaN(target)) return false;
    switch (op) {
      case "equals":
      case "is":
        return value === target;
      case "greater than":
      case ">":
        return value > target;
      case "less than":
      case "<":
        return value < target;
      case "greater than or equal to":
      case ">=":
        return value >= target;
      case "less than or equal to":
      case "<=":
        return value <= target;
      default:
        return false;
    }
  }

  const haystack = String(value ?? "").toLowerCase();
  const needle = criterion.value.toLowerCase();
  switch (op) {
    case "contains":
      return haystack.includes(needle);
    case "does not contain":
      return !haystack.includes(needle);
    case "equals":
    case "is":
      return haystack === needle;
    case "starts with":
      return haystack.startsWith(needle);
    case "ends with":
      return haystack.endsWith(needle);
    default:
      return false;
  }
}

function ruleMatchesSubject(criteria: IBankingRuleCriterion[], criteriaMatch: string, subject: ClassificationSubject): boolean {
  if (criteria.length === 0) return false;
  if (criteriaMatch === "all") {
    return criteria.every((c) => evaluateCriterion(c, subject));
  }
  return criteria.some((c) => evaluateCriterion(c, subject));
}

/** Loads active rules for the tenant and returns the first matching rule, evaluated in
 *  createdAt order. No LLM call — this is the whole point (see the AI-02 test: "no LLM call
 *  is made" when a rule matches). */
export async function matchBankingRule(
  tenantId: string,
  subject: ClassificationSubject,
): Promise<BankingRuleMatch | null> {
  await connectDB();

  const query: Record<string, unknown> = { tenantId, status: BANKING_RULE_STATUS.ACTIVE };
  if (subject.direction) {
    query.applyTo = subject.direction === "deposit" ? "deposits" : "withdrawals";
  }

  const rules = await BankingRule.find(query).sort({ createdAt: 1 }).lean();

  for (const rule of rules) {
    if (ruleMatchesSubject(rule.criteria, rule.criteriaMatch, subject)) {
      return {
        ruleId: String(rule._id),
        ruleName: rule.ruleName,
        accountId: String(rule.accountId),
        associatedAccountIds: (rule.associatedAccountIds ?? []).map(String),
      };
    }
  }
  return null;
}
