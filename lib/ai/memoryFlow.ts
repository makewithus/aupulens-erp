export interface MemoryFlowOutcome {
  handled: boolean;
  message?: string;
  route?: string;
}

// Cheap, deterministic pre-check — mirrors lib/ai/createTargets.ts's
// CREATE_VERB_RX gate pattern. Only messages that plausibly ASK ABOUT a
// customer/invoice record (existence, count, list, browse) reach the real
// (LLM-backed) /api/sales/ai-memory-query endpoint; everything else falls
// through to the caller's normal flow at zero extra cost/latency.
const LOOKUP_VERB_RX =
  /\b(exist|exists|existed|find|found|search|show|display|list|check|look ?up|is there|are there|was there|were there|how many|count|when (was|did)|give|get me|fetch|pull up|i want (to see|the)|do we have|did (we|i) create)\b/i;
const SALES_ENTITY_RX = /\b(customer|customers|client|clients|invoice|invoices|bill|bills)\b/i;

/**
 * Sales-module "AI memory" pre-check — real database lookups for factual
 * questions ("does this customer exist", "was an invoice created in the
 * first week of August", "show me invoices from last month"). Call this
 * AFTER tryAiCreateFlow (create-verb requests should still win) and BEFORE
 * falling back to the plain conversational assistant.
 */
export async function tryAiMemoryFlow(input: {
  text: string;
  history?: { role: string; content: string }[];
}): Promise<MemoryFlowOutcome> {
  const q = input.text.trim();
  if (!q || !LOOKUP_VERB_RX.test(q) || !SALES_ENTITY_RX.test(q)) return { handled: false };

  try {
    const res = await fetch("/api/sales/ai-memory-query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: q, history: input.history || [] }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.success && data.handled) {
      return { handled: true, message: data.message, route: data.route };
    }
    return { handled: false };
  } catch {
    return { handled: false };
  }
}
