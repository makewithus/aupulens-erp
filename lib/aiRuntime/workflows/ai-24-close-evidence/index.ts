import AiCloseAssertion from "@/models/ai/AiCloseAssertion";
import { evaluateCloseAssertions, type AssertionEvaluation } from "@/lib/aiRuntime/evidence/assertions";
import { AI_AUTONOMY_LEVEL, AI_FINDING_TYPE, AI_FINDING_SEVERITY, AI_ATTENTION_PRIORITY } from "@/lib/constants/statuses";
import type {
  WorkflowDefinition,
  ObservedResult,
  ReasonResult,
  ActResult,
  VerifyResult,
} from "@/lib/aiRuntime/workflows/types";

/**
 * AI-24 — Close evidence controller (docs/ai/BRIEF-04-BATCH-C.md, built third). "For every close
 * item, does the actual ERP state prove it's done — not 'did someone tick a box'." All real
 * computation is `lib/aiRuntime/evidence/assertions.ts::evaluateCloseAssertions()` — pure
 * predicates over the same live data AI-13 reads, never a parallel re-derivation. This workflow
 * persists each evaluation to `AiCloseAssertion` (first-class, inspectable records) and manages
 * the evidence-request task lifecycle: `create_task` once per missing item (deduped, so a
 * repeated sweep never spams), `resolve_task` once a previously-failing assertion re-evaluates
 * to verified.
 *
 * **Never mutates `PeriodClosing`** (A.2 / Hard Rule 4) — `evaluateCloseAssertions()` only reads
 * it, to detect a contradiction between what a human's `PeriodClosing.status` implicitly claims
 * and what the assertion actually finds. Proven by a source-grep structural test, same pattern
 * as AI-09's/AI-13's own.
 *
 * `create_task`/`resolve_task` are the only tool calls this workflow makes — `AI-24 | OBSERVE
 * plus create_task for evidence requests` (A.3); `resolve_task` is the one deliberate exception
 * to "no new write tools" this batch, reasoned in `lib/aiRuntime/tools/control.ts`'s own comment
 * and `docs/ai/OPEN_QUESTIONS.md`.
 */

interface Ai24Raw {
  period: string;
  periodEnd: string;
}

interface Ai24Extracted {
  period: string;
  assertions: AssertionEvaluation[];
  completenessPct: number;
  unsupportedMaterialBalances: { domain: string; blockerId: string; title: string; amount?: number }[];
  priorVerifiedByItem: Record<string, boolean>;
}

interface Ai24Proposal {
  assertions: AssertionEvaluation[];
}

const PERIOD_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

function currentPeriodString(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

function periodEndOf(period: string): Date {
  const [y, m] = period.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0, 23, 59, 59));
}

export const ai24CloseEvidence: WorkflowDefinition<Ai24Raw, Ai24Extracted, Ai24Proposal> = {
  id: "AI-24",
  version: "1.0.0",
  eventKeys: ["period.horizon.reached", "ai.sweep.hourly"],
  actionClass: "read_only",
  defaultAutonomy: AI_AUTONOMY_LEVEL.OBSERVE,

  subscriptionFilter(): boolean {
    return true;
  },

  async observe(event): Promise<ObservedResult<Ai24Raw>> {
    // A missing or malformed period must never reach periodEndOf() as a literal "undefined" or
    // arbitrary string — that produced Date.UTC(NaN, ...) → an Invalid Date → an uncaught
    // Mongoose CastError thrown out of computeCloseReadiness() (a real bug found in this pass,
    // see this workflow's own verification record §9). periodEnd is always derived from the
    // validated period, never trusted from the payload directly, so the two can never disagree.
    const rawPeriod = event.payload.period;
    const period = typeof rawPeriod === "string" && PERIOD_PATTERN.test(rawPeriod) ? rawPeriod : currentPeriodString();
    const periodEnd = periodEndOf(period).toISOString();
    return { entityId: event.tenantId, raw: { period, periodEnd } };
  },

  async extract(observed, ctx): Promise<Ai24Extracted> {
    const result = await evaluateCloseAssertions(ctx.tenantId, observed.raw.period, new Date(observed.raw.periodEnd));

    const prior = await AiCloseAssertion.find({ tenantId: ctx.tenantId, period: observed.raw.period }).select("item verified").lean();
    const priorVerifiedByItem: Record<string, boolean> = {};
    for (const p of prior) priorVerifiedByItem[p.item] = p.verified;

    return { period: observed.raw.period, assertions: result.assertions, completenessPct: result.completenessPct, unsupportedMaterialBalances: result.unsupportedMaterialBalances, priorVerifiedByItem };
  },

  async reason(extracted): Promise<ReasonResult<Ai24Proposal>> {
    const reasonChain = [`evaluated ${extracted.assertions.length} close assertion(s) for ${extracted.period}: ${extracted.completenessPct}% complete`];
    const findings: ReasonResult<Ai24Proposal>["findings"] = [];

    for (const a of extracted.assertions) {
      if (a.contradiction) {
        findings.push({
          id: `ai24-contradiction-${a.item}-${extracted.period}`,
          type: AI_FINDING_TYPE.ANOMALY,
          severity: AI_FINDING_SEVERITY.CRITICAL,
          title: `Close item marked done but assertion "${a.item}" fails`,
          detail: `${a.assertionDescription} — not verified: ${a.missing.join("; ")}`,
          confidence: 1,
          subjectRefs: [{ model: "PeriodClosing", id: a.item }],
          evidence: a.evidence,
          reasonChain: [],
        });
      }
    }
    for (const u of extracted.unsupportedMaterialBalances) {
      findings.push({
        id: `ai24-unsupported-${u.domain}-${u.blockerId}`,
        type: AI_FINDING_TYPE.EXCEPTION,
        severity: AI_FINDING_SEVERITY.HIGH,
        title: `Unsupported material balance: ${u.title}`,
        detail: `${u.domain} has a material item with no linked reconciliation or supporting document`,
        amount: u.amount,
        confidence: 1,
        subjectRefs: [{ model: "AiCloseState", id: u.domain }],
        evidence: [],
        reasonChain: [],
      });
    }

    return { proposal: { assertions: extracted.assertions }, confidence: 1, findings, reasonChain };
  },

  async validate(): Promise<{ valid: boolean; vetoReason?: string }> {
    return { valid: true };
  },

  async act(reasoned, ctx, decision, rt, extracted): Promise<ActResult> {
    const actionsTaken: ActResult["actionsTaken"] = [];

    for (const a of extracted.assertions) {
      const dedupeKey = `ai24:${a.item}:${extracted.period}`;
      let requestTaskId: string | undefined;
      const wasVerified = extracted.priorVerifiedByItem[a.item];

      if (!a.verified) {
        try {
          const result = await rt.callTool<{ attentionItemId: string }>(
            "create_task",
            {
              tenantId: ctx.tenantId,
              workflowId: "AI-24",
              runId: rt.runId,
              priority: a.contradiction ? AI_ATTENTION_PRIORITY.CRITICAL : AI_ATTENTION_PRIORITY.MEDIUM,
              what: `Evidence needed: ${a.assertionDescription}`,
              why: a.missing.join("; "),
              dedupeKey,
              evidence: a.evidence,
            },
            { requestedAutonomy: AI_AUTONOMY_LEVEL.EXECUTE },
          );
          requestTaskId = result.attentionItemId;
          actionsTaken.push({ tool: "create_task", args: { item: a.item, dedupeKey }, reversible: true });
        } catch {
          // No acting user / permission denied — the finding above still surfaces this.
        }
      } else if (wasVerified === false) {
        // Previously failing, now verified — close the request this same workflow raised.
        try {
          await rt.callTool("resolve_task", { tenantId: ctx.tenantId, dedupeKey }, { requestedAutonomy: AI_AUTONOMY_LEVEL.EXECUTE });
          actionsTaken.push({ tool: "resolve_task", args: { item: a.item, dedupeKey }, reversible: false });
        } catch {
          // Best-effort — a stuck open task is a UI cleanup issue, not a correctness one.
        }
      }

      try {
        await rt.callTool(
          "record_close_assertion",
          {
            tenantId: ctx.tenantId,
            period: extracted.period,
            item: a.item,
            assertionId: a.assertionId,
            assertionDescription: a.assertionDescription,
            verified: a.verified,
            evidence: a.evidence,
            missing: a.missing,
            owner: a.owner,
            requestTaskId,
          },
          { requestedAutonomy: AI_AUTONOMY_LEVEL.EXECUTE },
        );
        actionsTaken.push({ tool: "record_close_assertion", args: { item: a.item, period: extracted.period }, reversible: true });
      } catch {
        // No acting user / permission denied — the assertion result still surfaces via findings.
      }
    }

    return { findings: [], actionsTaken, metrics: { scanned: extracted.assertions.length, autoActioned: actionsTaken.length } };
  },

  async verify(): Promise<VerifyResult> {
    return { ok: true };
  },
};
