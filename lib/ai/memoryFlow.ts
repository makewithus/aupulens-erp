export interface MemoryFlowOutcome {
  handled: boolean;
  message?: string;
  route?: string;
}

// Cheap, deterministic pre-check — mirrors lib/ai/createTargets.ts's
// CREATE_VERB_RX gate pattern. Only messages that plausibly ASK ABOUT a
// Sales, Finance, Inventory, or CRM record (existence, count, list, browse,
// filtered by name/date/amount/status) reach the real (LLM-backed)
// /api/sales/ai-memory-query endpoint (kept at its original Sales path for
// call-site stability — it now also resolves vendor bills, expenses,
// purchase orders, inventory deliveries/receipts, manufacturing orders,
// batches, CRM leads/opportunities/cases/campaigns/contracts, and Admin
// users/tasks/activity logs); everything else falls through to the
// caller's normal flow at zero extra cost/latency.
//
// Deliberately permissive: a real lookup is often phrased as a bare
// declarative statement with no "verb" at all ("all the invoices created in
// August", "invoices above 50000") rather than a question. Requiring a verb
// here missed exactly those — so the entity keyword is the hard requirement,
// and ANY of a lookup verb / "all" / a numeric amount / a date-ish reference
// / a status word is enough to fire. Over-triggering is safe and cheap: the
// server-side extraction call has its own "entity: none" fallback for
// anything that isn't really a lookup, and this whole flow always resolves
// to {handled:false} on anything it can't confidently answer.
const SALES_ENTITY_RX =
  /\b(customer|customers|client|clients|product|products|item|items|catalog(?:ue)?|invoice|invoices|bill|bills|vendor[\s-]?bills?|quote|quotes|quotation|quotations|sales?[\s-]?orders?|orders?|payment|payments|subscription|subscriptions|delivery[\s-]?challans?|challans?|expense|expenses|purchase[\s-]?orders?|POs?|deliver(?:y|ies)|receipts?|manufacturing[\s-]?orders?|production[\s-]?orders?|MOs?|batch(?:es)?|lots?|leads?|opportunit(?:y|ies)|deals?|cases?|tickets?|campaigns?|contracts?|activity[\s-]?logs?|audit[\s-]?logs?|user[\s-]?accounts?|system[\s-]?users?|admin[\s-]?tasks?|to-?dos?)\b/i;
const LOOKUP_VERB_RX =
  /\b(exist|exists|existed|find|found|search|show|display|list|check|look ?up|is there|are there|was there|were there|how many|count|when (was|did)|give|get me|fetch|pull up|i want (to see|the)|do we have|did (we|i) create|created)\b/i;
const ALL_RX = /\ball\b/i;
const AMOUNT_RX = /\b(above|below|over|under|greater than|less than|more than|at least|at most)\s*[\d,]+|[₹$]\s*[\d,]{3,}|\b[\d,]{4,}\b/i;
const DATE_RX =
  /\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec|today|yesterday|this month|last month|this week|last week|this year|last year|this quarter|last quarter)\b|\b(19|20)\d{2}\b|\b\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b/i;
const STATUS_RX =
  /\b(paid|unpaid|overdue|pending|draft|saved|cancelled|canceled|active|inactive|closed|won|lost|confirmed|approved|rejected|expired|partially[\s-]?paid|delivered|dispatched|open)\b/i;

/**
 * Sales-module "AI memory" pre-check — real database lookups for factual
 * questions across every Sales entity (customers, invoices, quotes, sales
 * orders, payments, subscriptions, delivery challans): "does this customer
 * exist", "was an invoice created in the first week of August", "invoices
 * above 50000", "unpaid subscriptions". Call this AFTER tryAiCreateFlow
 * (create-verb requests should still win) and BEFORE falling back to the
 * plain conversational assistant.
 */
export async function tryAiMemoryFlow(input: {
  text: string;
  history?: { role: string; content: string }[];
}): Promise<MemoryFlowOutcome> {
  const q = input.text.trim();
  if (!q || !SALES_ENTITY_RX.test(q)) return { handled: false };
  // Mid-conversation, a bare entity mention with no other signal word ("and
  // quotes?", "what about invoices") is still very likely a real follow-up —
  // the server-side extraction resolves it against the conversation history
  // and safely falls back to "entity: none" if it isn't. Only a COLD first
  // message (no history yet) needs the extra lookup-verb/all/date/amount/
  // status signal to avoid over-triggering on a casual mention.
  const looksLikeLookup =
    LOOKUP_VERB_RX.test(q) || ALL_RX.test(q) || AMOUNT_RX.test(q) || DATE_RX.test(q) || STATUS_RX.test(q) || Boolean(input.history && input.history.length > 0);
  if (!looksLikeLookup) return { handled: false };

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
