import { listWorkflows } from "@/lib/aiRuntime/runtime/registry";
import { WORKFLOW_INTENT_MAP, findClosestCapabilities, type WorkflowIntentEntry } from "@/lib/aiRuntime/nl/workflowIntentMap";

/**
 * AI-NL's layered resolution (docs/ai/BRIEF-08b-FINAL.md B.1) — cheapest first:
 * 1. The curated keyword/regex table (`workflowIntentMap.ts`) — no LLM call, deterministic.
 * 2. A direct workflow-id mention ("run AI-13", "AI-07") — still no LLM call.
 * 3. (not built here) the LLM layer, constrained to `listWorkflows()`'s own ids — wired directly
 *    into `app/api/ai/command/route.ts`'s existing classifier prompt, reusing the tenant-AI-call
 *    plumbing already there rather than a second one.
 *
 * The output is always `{workflow_id, parameters, confidence, alternatives[]}` against the real
 * registry — never a plan, never generated code (A.3). `resolvedBy` records which layer answered,
 * so "how many of the twelve resolved without an LLM call" is a real, checkable number.
 */

export interface ResolvedWorkflowIntent {
  workflowId: string;
  eventKey: string;
  parameters: Record<string, unknown>;
  confidence: number;
  alternatives: string[];
  resolvedBy: "keyword" | "workflow_id" | "unmatched";
}

const WORKFLOW_ID_PATTERN = /\bAI-(\d{1,2})\b/i;

export function resolveWorkflowIntentCheap(command: string): ResolvedWorkflowIntent | null {
  const registered = new Set(listWorkflows().map((w) => w.id));

  // Layer 2 first — an explicit "AI-07" mention is the least ambiguous signal available and
  // should win over a keyword guess even if one also matches.
  const idMatch = command.match(WORKFLOW_ID_PATTERN);
  if (idMatch) {
    const workflowId = `AI-${idMatch[1]}`;
    if (registered.has(workflowId)) {
      const mapped = WORKFLOW_INTENT_MAP.find((e) => e.workflowId === workflowId);
      return { workflowId, eventKey: mapped?.eventKey ?? "ai.sweep.hourly", parameters: {}, confidence: 1, alternatives: [], resolvedBy: "workflow_id" };
    }
  }

  // Layer 1 — the curated table. Collect every match so a genuinely ambiguous utterance
  // (two intents both plausible) can ask one clarifying question instead of guessing.
  const matches: WorkflowIntentEntry[] = WORKFLOW_INTENT_MAP.filter((entry) => entry.patterns.some((p) => p.test(command)) && registered.has(entry.workflowId));

  if (matches.length === 1) {
    return { workflowId: matches[0].workflowId, eventKey: matches[0].eventKey, parameters: {}, confidence: 0.9, alternatives: [], resolvedBy: "keyword" };
  }
  if (matches.length > 1) {
    // Ambiguous — surface as alternatives rather than picking one, so the caller can ask the
    // ONE clarifying question A.3 requires instead of guessing.
    return {
      workflowId: matches[0].workflowId,
      eventKey: matches[0].eventKey,
      parameters: {},
      confidence: 0.5,
      alternatives: matches.slice(1).map((m) => m.workflowId),
      resolvedBy: "keyword",
    };
  }

  return null; // no cheap-layer match — caller falls through to the LLM layer
}

export function unmatchedResponse(command: string): { message: string; suggestions: string[] } {
  return { message: "I can't do that yet.", suggestions: findClosestCapabilities(command) };
}
