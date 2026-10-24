import type { ErpQuery } from "./erpQuery";

/** Only ordinary words are normalized; document identifiers retain their bytes. */
export function normalizeErpText(text: string) {
  return text
    .replace(/\b(invocies|invoce|invioce)\b/gi, "invoices")
    .replace(/\bhw\b/gi, "how")
    .replace(/\br\b/gi, "are")
    .replace(/\bpaymnt\b/gi, "payment")
    .replace(/\bkumr\b/gi, "kumar")
    .replace(/\bqoute\b/gi, "quote")
    .replace(/\bchiar\b/gi, "chair")
    .replace(/\bacount\b/gi, "account")
    .replace(/\bsubcription\b/gi, "subscription")
    .replace(/\bfeautres?\b/gi, "features")
    .replace(/\bentitelments?\b/gi, "entitlements");
}
export type ErpIntent = Partial<ErpQuery> | "plan" | "organization_info" | "total" | "refuse" | "quote_draft" | "quote_confirm" | "quote_cancel" | "validate_values" | { type: "plan"; feature?: string } | { type: "organization_info" } | null;

export function parseErpIntent(text: string, now = new Date()): ErpIntent {
  const q = normalizeErpText(text).trim();
  if (/\b(?:delete|remove|erase)\b.*\b(?:invoices?|quotes?|customers?|orders?)\b/i.test(q)) return "refuse";
  if (/\b(?:quantity|qty|discount)\b/i.test(q) && !/\b(?:invoice|create|prepare|draft|for)\b/i.test(q)) return "validate_values";
  if (/^cancel(?: the)? quote[.!]?$/i.test(q)) return "quote_cancel";
  if (/^(?:yes[, ]*)?(?:confirm|save)(?: the)? quote[.!]?$/i.test(q)) return "quote_confirm";
  if (/\bquote\b/i.test(q) && /\b(?:create|make|draft|prepare|for)\b/i.test(q)) return "quote_draft";
  if (
    /\b(?:what(?:'s| is) (?:my|our|this) (?:organization|company|workspace|tenant)(?:'s)? name|what is the (?:organization|company) name|organization name|company name)\b/i.test(q) ||
    /^(?:my )?(?:organization|company) name[?.!]?$/i.test(q)
  ) {
    return { type: "organization_info" };
  }
  if (
    (/\b(?:plan|subscription)\b/i.test(q) && /\b(?:account|organization|org|which|what|free|paid|tier|status|current|features?|entitlements?|included|have|has|owns?|uses?)\b/i.test(q)) ||
    (/\b(?:features?|entitlements?|modules?)\b/i.test(q) && /\b(?:available|included|in our plan|in our subscription|do we have|in the plan)\b/i.test(q))
  ) {
    const featureMatch = q.match(/\b(?:is|do we have)\s+([a-z0-9_-]+)\s+(?:included|available|in\b)/i);
    const feature = featureMatch && !/^(?:the|our|this|a|an|in|features?|entitlements?|modules?)$/i.test(featureMatch[1])
      ? featureMatch[1].toLowerCase()
      : undefined;
    return { type: "plan", feature };
  }
  if (/^(?:what(?:'s| is)|show(?: me)?)?\s*(?:the )?(?:total|sum)(?: amount)?[?.!]?$/i.test(q)) return "total";
  const identifier = q.match(/\b(?:INV|SO|QUO)-\d+\b/i)?.[0];
  if (identifier) return { entity: /^SO/i.test(identifier) ? "sales_order" : /^QUO/i.test(identifier) ? "quote" : "invoice", operation: "lookup", identifier };
  const pending = q.match(/^(.+?)\s+ka\s+kitna\s+payment\s+pending\s+hai/i) || q.match(/^(.+?)\s+(?:pending payment|payment pending)/i);
  if (pending) return { entity: "invoice", operation: "search", status: "unpaid", customer: pending[1].trim() };
  const entity = /\binvoices?\b/i.test(q) ? "invoice" : /\bcustomers?\b/i.test(q) ? "customer" : /\bquotes?\b/i.test(q) ? "quote" : /\bsales orders?\b/i.test(q) ? "sales_order" : /\bproducts?\b/i.test(q) ? "product" : null;
  if (/\brevenue\b/i.test(q)) {
    const days = Number(q.match(/last\s+(\d+)\s+days/i)?.[1] ?? 30);
    if (days < 1 || days > 3660) return null;
    return { entity: "invoice", operation: "sum", status: "issued", dateFrom: new Date(now.getTime() - days * 86400000).toISOString(), dateTo: now.toISOString() };
  }
  if (!entity) return null;
  const query: Partial<ErpQuery> = { entity, operation: /\b(?:how many|count|number of)\b/i.test(q) ? "count" : "search" };
  if (entity === "invoice") {
    if (/\boverdue\b/i.test(q)) query.status = "overdue";
    else if (/\b(?:unpaid|pending)\b/i.test(q)) query.status = "unpaid";
    else if (/\bpaid\b/i.test(q)) query.status = "paid";
    if (/\b(?:biggest|largest|highest)\b/i.test(q)) Object.assign(query, { status: "issued", sort: "amount_desc", limit: 1 });
    if (/\b(?:smallest|lowest)\b/i.test(q)) Object.assign(query, { status: "issued", sort: "amount_asc", limit: 1 });
  }
  const forCustomer = q.match(/\bfor\s+(.+?)[?.!]?$/i)?.[1];
  if (forCustomer && ["invoice", "quote", "sales_order"].includes(entity)) query.customer = forCustomer.trim();
  if (entity === "customer" && query.operation === "search") {
    const name = q.match(/\bcustomer\s+(.+?)[?.!]?$/i)?.[1];
    if (name) query.name = name.trim();
  }
  // A bare casual mention must not become an unrequested record dump.
  if (!/\b(?:show|list|find|get|search|how many|count|biggest|largest|highest|smallest|lowest|status|number of)\b/i.test(q)) return null;
  return query;
}
