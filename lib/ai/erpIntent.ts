import type { ErpQuery } from "./erpQuery";
import { extractCustomerFields } from "./customerDraft";

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

export interface ErpIntentContext {
  activeEntity?: string;
  lastErpQuery?: Partial<ErpQuery>;
  pendingQuoteProposalId?: string;
  pendingCustomerProposalId?: string;
  pendingRoleProposalId?: string;
}

export type ErpIntent =
  | Partial<ErpQuery>
  | "plan"
  | "organization_info"
  | "total"
  | "refuse"
  | "quote_draft"
  | "quote_confirm"
  | "quote_cancel"
  | "customer_draft"
  | "customer_confirm"
  | "customer_cancel"
  | "customer_update"
  | "role_confirm"
  | "role_cancel"
  | "validate_values"
  | { type: "plan"; feature?: string }
  | { type: "organization_info" }
  | { type: "profit_loss"; period?: string; dateFrom?: string; dateTo?: string }
  | { type: "role_change"; userName: string; role: string }
  | null;

function extractRoleChange(q: string): { userName: string; role: string } | null {
  // Pattern 1: "in user kishore, change the sales manager role to admin"
  const m1 = q.match(/(?:in|for)\s+user\s+([^,]+?)[,\s]+change(?:\s+the)?(?:\s+[a-z\s-]+)?\s+role\s+to\s+([a-z\s-]+)[.!]?$/i);
  if (m1) {
    return { userName: m1[1].trim(), role: m1[2].trim() };
  }
  // Pattern 2: "change role of [user] to [role]"
  const m2 = q.match(/change(?:\s+the)?\s+role\s+of\s+([^,]+?)\s+to\s+([a-z\s-]+)[.!]?$/i);
  if (m2) {
    return { userName: m2[1].trim(), role: m2[2].trim() };
  }
  // Pattern 3: "change [user]'s role to [role]"
  const m3 = q.match(/change\s+([^,]+?)'s\s+role\s+to\s+([a-z\s-]+)[.!]?$/i);
  if (m3) {
    return { userName: m3[1].trim(), role: m3[2].trim() };
  }
  // Pattern 4: "make [user] an [role]" or "make [user] [role]"
  const m4 = q.match(/make\s+(?:user\s+)?([^,]+?)\s+(?:an?\s+)?([a-z\s-]+)[.!]?$/i);
  if (m4 && !/^(?:it|this|that|them)$/i.test(m4[1].trim())) {
    return { userName: m4[1].trim(), role: m4[2].trim() };
  }
  // Pattern 5: "update user [user] role to [role]" or "update [user] role to [role]"
  const m5 = q.match(/update\s+(?:user\s+)?([^,]+?)\s+role\s+to\s+([a-z\s-]+)[.!]?$/i);
  if (m5) {
    return { userName: m5[1].trim(), role: m5[2].trim() };
  }
  return null;
}

export function parseErpIntent(text: string, now = new Date(), context?: ErpIntentContext): ErpIntent {
  const q = normalizeErpText(text).trim();

  // Safety refusals
  if (/\b(?:delete|remove|erase)\b.*\b(?:invoices?|quotes?|customers?|orders?|ledgers?|users?)\b/i.test(q)) return "refuse";

  // Financial values validation
  if (/\b(?:quantity|qty|discount)\b/i.test(q) && !/\b(?:invoice|create|prepare|draft|for)\b/i.test(q)) return "validate_values";

  // Quote workflow controls
  if (/^cancel(?: the)? quote[.!]?$/i.test(q)) return "quote_cancel";
  if (/^(?:yes[, ]*)?(?:confirm|save)(?: the)? quote[.!]?$/i.test(q)) return "quote_confirm";
  if (/\bquote\b/i.test(q) && /\b(?:create|make|draft|prepare|for)\b/i.test(q)) return "quote_draft";

  // Customer workflow controls
  if (/\b(?:cancel(?: the)? customer(?: draft)?|discard(?: the)? customer)\b/i.test(q)) return "customer_cancel";
  if (/^(?:yes[, ]*)?(?:confirm|save)(?: the)? customer(?: draft)?[.!]?$/i.test(q)) return "customer_confirm";
  if (/\bcustomer\b/i.test(q) && /\b(?:create|make|new|draft|prepare|add|register)\b/i.test(q)) return "customer_draft";

  // Role change controls
  if (/\b(?:cancel(?: the)? role(?: change)?|discard(?: the)? role)\b/i.test(q)) return "role_cancel";
  if (/^(?:yes[, ]*)?(?:confirm|save|approve|execute)(?: the)? role(?: change)?[.!]?$/i.test(q)) return "role_confirm";
  const roleChangeParsed = extractRoleChange(q);
  if (roleChangeParsed) {
    return { type: "role_change", userName: roleChangeParsed.userName, role: roleChangeParsed.role };
  }

  // Bare confirmations/cancellations disambiguated by context
  if (/^(?:yes[, ]*)?(?:confirm|save)[.!]?$/i.test(q)) {
    if (context?.pendingCustomerProposalId) return "customer_confirm";
    if (context?.pendingRoleProposalId) return "role_confirm";
    if (context?.pendingQuoteProposalId) return "quote_confirm";
  }
  if (/^(?:no[, ]*)?(?:cancel|discard)[.!]?$/i.test(q)) {
    if (context?.pendingCustomerProposalId) return "customer_cancel";
    if (context?.pendingRoleProposalId) return "role_cancel";
    if (context?.pendingQuoteProposalId) return "quote_cancel";
  }

  // Customer draft ongoing multi-turn inputs
  if (context?.pendingCustomerProposalId) {
    const extractedFields = extractCustomerFields(q);
    if (
      extractedFields.name ||
      extractedFields.is_company !== undefined ||
      extractedFields.phone ||
      extractedFields.email ||
      extractedFields.gstin ||
      extractedFields.pan
    ) {
      return "customer_update";
    }
    // Also if the user gave a short phrase (like a name or contact) during a pending customer draft
    if (/^[A-Za-z0-9\s.+@_-]{2,80}$/.test(q) && !/^(?:show|list|find|get|how many|count|status)$/i.test(q)) {
      return "customer_update";
    }
  }

  // Organization identity
  if (
    /\b(?:what(?:'s| is) (?:my|our|this) (?:organization|company|workspace|tenant)(?:'s)? name|what is the (?:organization|company) name|organization name|company name)\b/i.test(q) ||
    /^(?:my )?(?:organization|company) name[?.!]?$/i.test(q)
  ) {
    return { type: "organization_info" };
  }

  // Plan / Entitlements
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

  // Profit / Loss / P&L (BUG-002)
  if (
    /\b(?:profit|loss|p&l|profit\s+(?:and|&|\/)\s*loss|income\s+statement)\b/i.test(q) ||
    /\b(?:in\s+profit\s+or\s+loss|making\s+(?:a\s+)?profit|profitable|loss\s+making)\b/i.test(q) ||
    (/\b(?:analyse|analyze)\b/i.test(q) && /\b(?:profit|loss)\b/i.test(q))
  ) {
    return { type: "profit_loss" };
  }

  // Pure sum / total amount
  if (/^(?:what(?:'s| is)|show(?: me)?)?\s*(?:the )?(?:total|sum)(?: amount)?[?.!]?$/i.test(q)) return "total";

  // Identifiers
  const identifier = q.match(/\b(?:INV|SO|QUO)-\d+\b/i)?.[0];
  if (identifier) return { entity: /^SO/i.test(identifier) ? "sales_order" : /^QUO/i.test(identifier) ? "quote" : "invoice", operation: "lookup", identifier };

  // Pending payments by customer
  const pending = q.match(/^(.+?)\s+ka\s+kitna\s+payment\s+pending\s+hai/i) || q.match(/^(.+?)\s+(?:pending payment|payment pending)/i);
  if (pending) return { entity: "invoice", operation: "search", status: "unpaid", customer: pending[1].trim() };

  // Explicit entity detection
  const explicitEntity = /\binvoices?\b/i.test(q)
    ? "invoice"
    : /\bcustomers?\b/i.test(q)
    ? "customer"
    : /\bquotes?\b/i.test(q)
    ? "quote"
    : /\bsales orders?\b/i.test(q)
    ? "sales_order"
    : /\b(?:products?|inventory|items?|stock)\b/i.test(q)
    ? "product"
    : null;

  // Contextual entity inheritance (BUG-001)
  let entity: "quote" | "invoice" | "customer" | "sales_order" | "product" | null = explicitEntity;
  const hasPriorQuery = Boolean(context?.lastErpQuery?.entity);

  if (!entity && hasPriorQuery) {
    const priorEntity = context!.lastErpQuery!.entity!;
    // Follow-up: "total how many we have?", "how many in total?", "total how many do we have?", "total how many?"
    if (/\b(?:total\s+how\s+many|how\s+many(?:\s+do\s+we\s+have)?\s+in\s+total|how\s+many\s+total|total\s+count)\b/i.test(q) || /^(?:total\s+how\s+many\s+we\s+have|total\s+how\s+many\s+do\s+we\s+have|total\s+how\s+many)[?.!]?$/i.test(q)) {
      return { entity: priorEntity, operation: "count" };
    }
    // Follow-up status counts: "how many are paid?", "how many are overdue?", "what about paid ones?"
    if (/\b(?:how many|count|number of)\b/i.test(q) || /\b(?:what about)\b/i.test(q)) {
      if (/\boverdue\b/i.test(q)) return { entity: priorEntity, operation: "count", status: "overdue" };
      if (/\bpaid\b/i.test(q)) return { entity: priorEntity, operation: "count", status: "paid" };
      if (/\b(?:unpaid|pending)\b/i.test(q)) return { entity: priorEntity, operation: "count", status: "unpaid" };
      if (/\b(?:draft|drafts)\b/i.test(q)) return { entity: priorEntity, operation: "count", status: "draft" };
      if (/\b(?:issued)\b/i.test(q)) return { entity: priorEntity, operation: "count", status: "issued" };
      // Generic "how many do we have?" -> total count
      return { entity: priorEntity, operation: "count" };
    }
    // Follow-up: "show those", "show me those", "show them", "list them", "show their details"
    if (/\b(?:show\s+(?:me\s+)?those|show\s+them|list\s+those|list\s+them|show\s+their\s+details)\b/i.test(q)) {
      return { ...context!.lastErpQuery, operation: "search", offset: 0, limit: 10 };
    }
    // If user says "what's the total?" or "total"
    if (/^(?:what(?:'s| is)\s+)?(?:the\s+)?total[?.!]?$/i.test(q)) {
      return "total";
    }
  }

  // Revenue queries
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
    else if (/\b(?:draft|drafts)\b/i.test(q)) query.status = "draft";
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
  if (!/\b(?:show|list|find|get|search|how many|count|biggest|largest|highest|smallest|lowest|status|number of|total)\b/i.test(q)) return null;
  return query;
}

