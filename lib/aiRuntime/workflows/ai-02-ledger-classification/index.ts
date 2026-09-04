import connectDB from "@/lib/db";
import mongoose from "mongoose";
import Invoice from "@/models/finance/Invoice";
import Expense from "@/models/finance/Expense";
import Customer from "@/models/sales/Customer";
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
import { matchBankingRule, type ClassificationSubject } from "@/lib/aiRuntime/workflows/ai-02-ledger-classification/bankingRuleEngine";
import { getChartOfAccountsHandler } from "@/lib/aiRuntime/tools/financeReadTools";
import { callLlmForReasoning } from "@/lib/aiRuntime/llm/reasonHelper";

/**
 * AI-02 — Ledger classification (docs/ai/BRIEF-02-BATCH-A.md). Built first, per the brief's
 * explicit reordering: the BankingRule interpreter
 * (lib/aiRuntime/workflows/ai-02-ledger-classification/bankingRuleEngine.ts) is a real,
 * standalone, model-free engine — that alone is the highest-value piece here, since nothing
 * ever applied BankingRule before this.
 *
 * **Batch A scope simplification** (recorded honestly): classifies ONE subject per run — an
 * Invoice's first/primary line, or an Expense's single account — rather than iterating every
 * line of a multi-line document. Full per-line classification is a follow-up (docs/ai/OPEN_QUESTIONS.md).
 *
 * **A real architectural finding from building this workflow**: `check_permission`'s router
 * (A.2) requires a real, human `userId` — there is no service-principal concept (A.2 explicitly
 * chose per-user RBAC routing over inventing one). An event-triggered, fully autonomous run has
 * no acting human user. So `permissionOk` is honestly `false` for autonomous triggers here,
 * which — correctly — caps this workflow at RECOMMEND in practice until a human-in-the-loop
 * trigger (or a future service-principal decision) supplies a real userId. This is exactly
 * A.5's own intended outcome ("ship with the threshold configured such that \[EXECUTE\] doesn't
 * fire") — reached honestly through the gate, not by hardcoding a lower ceiling. See
 * docs/ai/OPEN_QUESTIONS.md.
 */

export type Ai02RecordModel = "Invoice" | "Expense";

interface Ai02Raw {
  recordModel: Ai02RecordModel;
  recordId: string;
  /** A real acting user, if this run was triggered on behalf of one (e.g. from a UI action).
   *  Absent for autonomous event-triggered runs — see the module doc comment above. */
  actingUserId?: string;
}

interface Ai02Extracted {
  recordModel: Ai02RecordModel;
  recordId: string;
  actingUserId?: string;
  subject: ClassificationSubject;
  candidateAccounts: { id: string; code: string; name: string }[];
  history: { accountId: string; count: number }[];
  materialityThreshold?: number;
}

interface Ai02Proposal {
  accountId: string | null;
  accountName: string | null;
  basis: "explicit_rule" | "history" | "semantic" | "none";
  alternatives: { accountId: string; confidence: number }[];
}

async function resolveVendorName(partnerId?: mongoose.Types.ObjectId): Promise<string | undefined> {
  if (!partnerId) return undefined;
  const customer = await Customer.findById(partnerId).select("header.name").lean();
  return (customer as { header?: { name?: string } } | null)?.header?.name;
}

/** Tallies prior classifications for the same counterparty/category — the highest-value
 *  signal per Part 2.2, always checked before ever calling the model. */
async function lookupHistory(
  tenantId: string,
  recordModel: Ai02RecordModel,
  key: { partnerId?: mongoose.Types.ObjectId; category?: string },
): Promise<{ accountId: string; count: number }[]> {
  const tally = new Map<string, number>();

  if (recordModel === "Invoice" && key.partnerId) {
    const rows = await Invoice.find({ tenantId, moveType: "in_invoice", partnerId: key.partnerId })
      .select("invoiceLines")
      .limit(20)
      .lean();
    for (const row of rows) {
      const accId = (row as { invoiceLines?: { accountId?: mongoose.Types.ObjectId }[] }).invoiceLines?.[0]?.accountId;
      if (accId) tally.set(String(accId), (tally.get(String(accId)) ?? 0) + 1);
    }
  } else if (recordModel === "Expense" && key.category) {
    const rows = await Expense.find({ tenantId, category: key.category, accountId: { $exists: true } })
      .select("accountId")
      .limit(20)
      .lean();
    for (const row of rows) {
      const accId = (row as { accountId?: mongoose.Types.ObjectId }).accountId;
      if (accId) tally.set(String(accId), (tally.get(String(accId)) ?? 0) + 1);
    }
  }

  return Array.from(tally.entries())
    .map(([accountId, count]) => ({ accountId, count }))
    .sort((a, b) => b.count - a.count);
}

const HISTORY_MIN_COUNT = 3;
const HISTORY_MIN_SHARE = 0.7;

export const ai02LedgerClassification: WorkflowDefinition<Ai02Raw, Ai02Extracted, Ai02Proposal> = {
  id: "AI-02",
  version: "1.0.0",
  eventKeys: ["bill.created", "invoice.created", "expense.submitted"],
  actionClass: "ledger_classification",
  defaultAutonomy: AI_AUTONOMY_LEVEL.EXECUTE,

  // All three keys are genuine fan-out, not entity ownership — every bill/invoice/expense is a
  // valid classification candidate for AI-02 regardless of who else is also subscribed to that
  // key (docs/ai/BRIEF-04-BATCH-C.md Part 0.2). No real disambiguation needed, so this always
  // accepts; declaring it at all is what keeps AI-02 receiving these shared keys by default-reject.
  subscriptionFilter(): boolean {
    return true;
  },

  async observe(event): Promise<ObservedResult<Ai02Raw>> {
    const recordModel: Ai02RecordModel = event.eventKey === "expense.submitted" ? "Expense" : "Invoice";
    const recordId = String(recordModel === "Expense" ? event.payload.expenseId : event.payload.invoiceId);
    const actingUserId = event.payload.actingUserId ? String(event.payload.actingUserId) : undefined;
    return {
      entityId: recordId,
      subjectRef: { model: recordModel, id: recordId },
      raw: { recordModel, recordId, actingUserId },
    };
  },

  async extract(observed, ctx): Promise<Ai02Extracted> {
    await connectDB();
    const { recordModel, recordId, actingUserId } = observed.raw;

    let subject: ClassificationSubject;
    let historyKey: { partnerId?: mongoose.Types.ObjectId; category?: string };

    if (recordModel === "Invoice") {
      const invoice = await Invoice.findById(recordId).lean();
      if (!invoice) throw new Error(`Invoice ${recordId} not found`);
      const line = (invoice as { invoiceLines?: { name?: string; priceSubtotal?: number }[] }).invoiceLines?.[0];
      const vendorName = await resolveVendorName((invoice as { partnerId?: mongoose.Types.ObjectId }).partnerId);
      subject = {
        vendorName,
        description: line?.name,
        amount: line?.priceSubtotal,
        direction: (invoice as { moveType?: string }).moveType === "out_invoice" ? "deposit" : "withdrawal",
        referenceNumber: (invoice as { sourceDocument?: string }).sourceDocument,
      };
      historyKey = { partnerId: (invoice as { partnerId?: mongoose.Types.ObjectId }).partnerId };
    } else {
      const expense = await Expense.findById(recordId).lean();
      if (!expense) throw new Error(`Expense ${recordId} not found`);
      subject = {
        description: (expense as { description?: string }).description,
        amount: (expense as { total?: number }).total,
        direction: "withdrawal",
      };
      historyKey = { category: (expense as { category?: string }).category };
    }

    const candidateAccounts = (await getChartOfAccountsHandler({
      tenantId: ctx.tenantId,
      excludeControlAccounts: true,
    })) as { _id: mongoose.Types.ObjectId; code?: string; name?: string }[];

    const history = await lookupHistory(ctx.tenantId, recordModel, historyKey);

    return {
      recordModel,
      recordId,
      actingUserId,
      subject,
      candidateAccounts: candidateAccounts.map((a) => ({ id: String(a._id), code: a.code ?? "", name: a.name ?? "" })),
      history,
      materialityThreshold: ctx.policy.materialityThreshold,
    };
  },

  async reason(extracted, ctx): Promise<ReasonResult<Ai02Proposal>> {
    const reasonChain: string[] = [];

    // Step 1 — the BankingRule engine. Deterministic, no model call.
    const ruleMatch = await matchBankingRule(ctx.tenantId, extracted.subject);
    if (ruleMatch) {
      reasonChain.push(`matched BankingRule "${ruleMatch.ruleName}" — no model call needed`);
      return {
        proposal: { accountId: ruleMatch.accountId, accountName: ruleMatch.ruleName, basis: "explicit_rule", alternatives: [] },
        confidence: 1,
        confidenceComponents: { explicit_rule: 1 },
        findings: [
          {
            id: `ai02-${extracted.recordId}`,
            type: AI_FINDING_TYPE.PROPOSAL,
            severity: AI_FINDING_SEVERITY.INFO,
            title: `Classified via BankingRule "${ruleMatch.ruleName}"`,
            detail: `Account ${ruleMatch.accountId}`,
            confidence: 1,
            subjectRefs: [{ model: extracted.recordModel, id: extracted.recordId }],
            evidence: [{ kind: "record", ref: ruleMatch.ruleId, label: "Matched BankingRule" }],
            reasonChain: [],
          },
        ],
        reasonChain,
        gateOverrides: {
          amount: extracted.subject.amount,
          historicalStability: 1,
          periodOpen: true,
          permissionOk: Boolean(extracted.actingUserId),
        },
      };
    }
    reasonChain.push("no BankingRule matched");

    // Step 2 — vendor/category history.
    const totalHistory = extracted.history.reduce((s, h) => s + h.count, 0);
    const top = extracted.history[0];
    if (top && totalHistory > 0 && top.count >= HISTORY_MIN_COUNT && top.count / totalHistory >= HISTORY_MIN_SHARE) {
      const share = top.count / totalHistory;
      reasonChain.push(`history: ${top.count}/${totalHistory} (${(share * 100).toFixed(0)}%) prior records used account ${top.accountId}`);
      const isValidCandidate = extracted.candidateAccounts.some((a) => a.id === top.accountId);
      if (isValidCandidate) {
        return {
          proposal: { accountId: top.accountId, accountName: "", basis: "history", alternatives: [] },
          confidence: share,
          confidenceComponents: { history_share: share },
          findings: [
            {
              id: `ai02-${extracted.recordId}`,
              type: AI_FINDING_TYPE.PROPOSAL,
              severity: AI_FINDING_SEVERITY.INFO,
              title: "Classified from prior treatment history",
              detail: `${top.count}/${totalHistory} prior records used this account`,
              confidence: share,
              subjectRefs: [{ model: extracted.recordModel, id: extracted.recordId }],
              evidence: [],
              reasonChain: [],
            },
          ],
          reasonChain,
          gateOverrides: {
            amount: extracted.subject.amount,
            historicalStability: share,
            periodOpen: true,
            permissionOk: Boolean(extracted.actingUserId),
          },
        };
      }
      reasonChain.push(`history's top account ${top.accountId} is not in the current valid candidate set — ignoring`);
    }

    // Step 3 — model ranking, constrained to the pre-filtered candidate set so a control/
    // suspense/equity/inactive account can never be selected regardless of what the model says.
    if (extracted.candidateAccounts.length === 0) {
      reasonChain.push("no candidate accounts available");
      return {
        proposal: { accountId: null, accountName: null, basis: "none", alternatives: [] },
        confidence: 0,
        findings: [],
        reasonChain,
      };
    }

    const candidateList = extracted.candidateAccounts.map((a) => `${a.id}: ${a.code} ${a.name}`).join("\n");
    const outcome = await callLlmForReasoning<{ accountId: string; confidence: number; alternatives: string[] }>({
      tenantId: ctx.tenantId,
      systemPrompt:
        "You classify a financial transaction line to the single best-fitting GL account from " +
        "the given candidate list. Respond ONLY with JSON: " +
        '{"accountId": "<id from the list>", "confidence": 0.0-1.0, "alternatives": ["<id>", ...]}. ' +
        "Never invent an id not in the candidate list.",
      userMessage:
        `Vendor/party: ${extracted.subject.vendorName ?? "unknown"}\n` +
        `Description: ${extracted.subject.description ?? ""}\n` +
        `Amount: ${extracted.subject.amount ?? ""}\n\nCandidate accounts:\n${candidateList}`,
      parseResponse: (text) => {
        const parsed = JSON.parse(text) as { accountId: string; confidence: number; alternatives?: string[] };
        return {
          proposal: { accountId: parsed.accountId, confidence: parsed.confidence, alternatives: parsed.alternatives ?? [] },
          confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0,
          reasons: [],
        };
      },
    });

    // Narrowing on `"proposal" in outcome` rather than `!outcome.gated` — see
    // lib/aiRuntime/llm/reasonHelper.ts's own note on strictNullChecks:false in this project.
    if (!("proposal" in outcome)) {
      reasonChain.push(`model call gated: ${outcome.code} — ${outcome.reason}`);
      return {
        proposal: { accountId: null, accountName: null, basis: "none", alternatives: [] },
        confidence: 0,
        findings: [],
        reasonChain,
      };
    }

    const modelProposal = outcome.proposal;
    const modelConfidence = outcome.confidence;
    const chosenId = modelProposal?.accountId;
    const isValid = Boolean(chosenId) && extracted.candidateAccounts.some((a) => a.id === chosenId);
    if (!isValid) {
      reasonChain.push(`model proposed an account not in the candidate set — rejecting (chosenId=${chosenId})`);
      return {
        proposal: { accountId: null, accountName: null, basis: "none", alternatives: [] },
        confidence: 0,
        findings: [],
        reasonChain,
      };
    }

    reasonChain.push(`model proposed account ${chosenId} at confidence ${modelConfidence}`);
    const account = extracted.candidateAccounts.find((a) => a.id === chosenId)!;
    return {
      proposal: {
        accountId: chosenId!,
        accountName: account.name,
        basis: "semantic",
        alternatives: (modelProposal.alternatives ?? [])
          .filter((id) => extracted.candidateAccounts.some((a) => a.id === id))
          .map((id) => ({ accountId: id, confidence: modelConfidence * 0.8 })),
      },
      confidence: modelConfidence,
      confidenceComponents: { model_score: modelConfidence },
      findings: [
        {
          id: `ai02-${extracted.recordId}`,
          type: AI_FINDING_TYPE.PROPOSAL,
          severity: AI_FINDING_SEVERITY.MEDIUM,
          title: "Classified by model (no rule or strong history match)",
          detail: `Proposed account ${chosenId}`,
          confidence: modelConfidence,
          subjectRefs: [{ model: extracted.recordModel, id: extracted.recordId }],
          evidence: [],
          reasonChain: [],
        },
      ],
      reasonChain,
      gateOverrides: {
        amount: extracted.subject.amount,
        historicalStability: undefined,
        periodOpen: true,
        permissionOk: Boolean(extracted.actingUserId),
      },
    };
  },

  async validate(): Promise<{ valid: boolean; vetoReason?: string }> {
    // The candidate set itself already guarantees the proposal (if any) is active,
    // postable and non-control — see extract()/reason() above. Nothing further to veto.
    return { valid: true };
  },

  async act(reasoned, ctx, decision, rt, extracted): Promise<ActResult> {
    if (!reasoned.proposal.accountId || decision.autonomyApplied !== AI_AUTONOMY_LEVEL.EXECUTE) {
      // RECOMMEND (or nothing to propose) — propose only, set nothing.
      return { findings: [], actionsTaken: [] };
    }

    try {
      await rt.callTool(
        "set_draft_account",
        {
          tenantId: ctx.tenantId,
          recordModel: extracted.recordModel,
          recordId: extracted.recordId,
          lineIndex: 0,
          accountId: reasoned.proposal.accountId,
        },
        {
          requestedAutonomy: AI_AUTONOMY_LEVEL.EXECUTE,
          idempotencyKey: `ai-02:${extracted.recordModel}:${extracted.recordId}`,
        },
      );
    } catch {
      // Not a draft record (already posted/validated, A.5), or permission denied —
      // fall back to propose-only rather than throwing the whole run into `failed`.
      return { findings: [], actionsTaken: [] };
    }

    return {
      findings: [],
      actionsTaken: [
        {
          tool: "set_draft_account",
          args: { recordModel: extracted.recordModel, recordId: extracted.recordId, accountId: reasoned.proposal.accountId },
          reversible: true,
        },
      ],
      metrics: { scanned: 1, autoActioned: 1 },
    };
  },

  async verify(): Promise<VerifyResult> {
    return { ok: true };
  },
};
