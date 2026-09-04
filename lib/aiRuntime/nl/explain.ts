import AiDecisionTrace from "@/models/ai/AiDecisionTrace";
import type { WorkflowRunEnvelope } from "@/lib/aiRuntime/contracts/outputContract";

/**
 * Builds a chat explanation from a run's own envelope + decision trace — never the model's own
 * knowledge (B.3: "Never answer a factual question from the model's own knowledge... it comes
 * from a workflow's output with citations, or the answer is 'I don't have that'"). This is AI-18's
 * citation discipline applied to the whole conversational surface, not a second citation scheme.
 */

export interface ChatExplanation {
  message: string;
  citations: { kind: string; ref: string; label: string }[];
}

export async function explainRun(envelope: WorkflowRunEnvelope): Promise<ChatExplanation> {
  const trace = await AiDecisionTrace.findOne({ runId: envelope.runId }).lean();

  const topFindings = envelope.findings.slice(0, 5);
  const lines: string[] = [envelope.summary];
  for (const f of topFindings) {
    lines.push(`- ${f.title}: ${f.detail}`);
  }
  if (envelope.findings.length === 0) {
    lines.push("No findings — nothing needs attention right now.");
  }

  const citations = topFindings.flatMap((f) => f.evidence.map((e) => ({ kind: e.kind, ref: e.ref, label: e.label })));

  return {
    message: lines.join("\n"),
    citations: citations.length > 0 ? citations : trace ? [{ kind: "record", ref: envelope.runId, label: `${envelope.workflowId} run ${envelope.runId}` }] : [],
  };
}

/** B.3's "never answer from the model's own knowledge" rule, for a question with no supporting
 *  workflow output at all — the honest "I don't have that" answer, citing what was searched. */
export function noSupportResponse(query: string): ChatExplanation {
  return { message: `I don't have that. Nothing in this tenant's recorded workflow output answers "${query}".`, citations: [] };
}
