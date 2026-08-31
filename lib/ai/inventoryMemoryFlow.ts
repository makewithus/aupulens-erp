export interface MemoryFlowOutcome {
  handled: boolean;
  message?: string;
  route?: string;
}

// Cheap, deterministic pre-check — mirrors lib/ai/memoryFlow.ts's Sales gate.
// Deliberately permissive: a real lookup is often phrased as a bare
// declarative statement with no "verb" at all ("all batches expiring in
// September", "warehouse orders above 50000") rather than a question.
// Requiring a verb misses exactly those — so the entity keyword is the hard
// requirement, and ANY of a lookup verb / "all" / a number / a date-ish
// reference / a status word is enough to fire. Over-triggering is safe and
// cheap: the server-side extraction call has its own "entity: none"
// fallback, and this whole flow always resolves to {handled:false} on
// anything it can't confidently answer.
const INVENTORY_ENTITY_RX =
  /\b(product|products|item|items|stock|batch|batches|lot|lots|warehouse|warehouses|receipt|receipts|grn|delivery|deliveries|dispatch|manufacturing[\s-]?order|production[\s-]?order|return|returns|stock[\s-]?move|stock[\s-]?moves|transfer|transfers|inventory[\s-]?order|inventory[\s-]?orders|purchase[\s-]?order|alert|alerts|low[\s-]?stock|reorder)\b/i;
const LOOKUP_VERB_RX =
  /\b(exist|exists|existed|find|found|search|show|display|list|check|look ?up|is there|are there|was there|were there|how many|count|when (was|did)|give|get me|fetch|pull up|i want (to see|the)|do we have|did (we|i) create|created)\b/i;
const ALL_RX = /\ball\b/i;
const AMOUNT_RX = /\b(above|below|over|under|greater than|less than|more than|at least|at most)\s*[\d,]+|[₹$]\s*[\d,]{3,}|\b[\d,]{4,}\b/i;
const DATE_RX =
  /\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec|today|yesterday|this month|last month|this week|last week|this year|last year|this quarter|last quarter|expiring|expired)\b|\b(19|20)\d{2}\b|\b\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b/i;
const STATUS_RX =
  /\b(pending|approved|posted|closed|rejected|cancelled|canceled|draft|active|inactive|expired|quarantine|released|in[\s-]?stock|low[\s-]?stock|out[\s-]?of[\s-]?stock|reserved|maintenance|passed|failed|confirmed)\b/i;

/**
 * Inventory-module "AI memory" pre-check — real database lookups for factual
 * questions across every Inventory entity (products/stock, batches,
 * warehouses, receipts, deliveries, manufacturing orders, returns, stock
 * moves, inventory orders, low-stock alerts): "does this batch exist",
 * "batches expiring in September", "inventory orders above 50000", "low
 * stock items in Warehouse B". Call this AFTER tryAiCreateFlow (create-verb
 * requests should still win) and BEFORE falling back to the plain
 * conversational assistant.
 */
export async function tryAiInventoryMemoryFlow(input: {
  text: string;
  history?: { role: string; content: string }[];
}): Promise<MemoryFlowOutcome> {
  const q = input.text.trim();
  if (!q || !INVENTORY_ENTITY_RX.test(q)) return { handled: false };
  const looksLikeLookup =
    LOOKUP_VERB_RX.test(q) || ALL_RX.test(q) || AMOUNT_RX.test(q) || DATE_RX.test(q) || STATUS_RX.test(q);
  if (!looksLikeLookup) return { handled: false };

  try {
    const res = await fetch("/api/inventory/ai-memory-query", {
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
