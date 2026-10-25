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
  lastErpQuery?: Partial<ErpQuery> | Record<string, any>;
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
  | {
      type: "profit_loss";
      period?: any;
      startDate?: Date;
      endDate?: Date;
      dateFrom?: string;
      dateTo?: string;
      wantsDetails?: boolean;
      wantsCogs?: boolean;
      wantsRevenue?: boolean;
      wantsExpenses?: boolean;
      wantsCrossModule?: boolean;
      wantsDateRange?: boolean;
      basis?: string;
    }
  | { type: "role_change"; userName: string; role: string; fromRole?: string }
  | { type: "employee_lookup"; name?: string; department?: string; employeeCode?: string }
  | null;

const MONTH_NAMES = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];
const MONTH_ABBRS = [
  "jan", "feb", "mar", "apr", "may", "jun",
  "jul", "aug", "sep", "sept", "oct", "nov", "dec",
];

function getMonthIndex(name: string): number {
  const lower = name.toLowerCase().trim();
  const fullIdx = MONTH_NAMES.indexOf(lower);
  if (fullIdx !== -1) return fullIdx;
  const abbrIdx = MONTH_ABBRS.indexOf(lower);
  if (abbrIdx !== -1) {
    return abbrIdx === 9 ? 8 : abbrIdx > 9 ? abbrIdx - 1 : abbrIdx;
  }
  return -1;
}

function getDaysInMonth(year: number, monthIdx: number): number {
  return new Date(Date.UTC(year, monthIdx + 1, 0)).getUTCDate();
}

function padZero(n: number): string {
  return String(n).padStart(2, "0");
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

export function parseFinancialPeriod(q: string, now = new Date(), context?: ErpIntentContext): {
  period?: string;
  dateFrom?: string;
  dateTo?: string;
  wantsDetails?: boolean;
  wantsCogs?: boolean;
  wantsRevenue?: boolean;
  wantsExpenses?: boolean;
  wantsCrossModule?: boolean;
  wantsDateRange?: boolean;
  basis?: string;
} {
  const wantsDateRange = /\b(?:date\s+range|what\s+(?:are\s+the\s+|is\s+the\s+)?dates|which\s+dates|dates|period|reporting\s+period)\b/i.test(q);
  const wantsDetails = /\b(?:calculation\s+details?|details?|break\s*down|how\s+much\s+of|formula|breakdown|explain|calculation|account-level|account\s+name|posted-entry|contributing|account\s+breakdown)\b/i.test(q);
  const wantsCogs = /\b(?:cogs|cost\s+of\s+goods(?:\s+sold)?|direct\s+costs?)\b/i.test(q);
  const wantsRevenue = /\b(?:revenue|income|sales)\b/i.test(q);
  const wantsExpenses = /\b(?:expenses?|operating\s+expenses?|opex)\b/i.test(q);
  const wantsCrossModule = /\b(?:cross[- ]module|other\s+enabled|other\s+modules?|financial\s+modules?|general\s+ledger|ledger|represented|sources?)\b/i.test(q);
  const basis = /\bposted\b/i.test(q) ? "posted_journal_entries" : undefined;

  let period: string | undefined;
  let dateFrom: string | undefined;
  let dateTo: string | undefined;

  // 1. Explicit date range: "between 1 October 2026 and 31 October 2026" or "from 1 Oct 2026 to 31 Oct 2026"
  const rangeMatch = q.match(/\b(?:between|from|dated\s+between)\s+(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)(?:\s+(\d{4}))?\s+(?:and|to|-)\s+(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)\s+(\d{4})\b/i) ||
    q.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)\s+(\d{4})\s+(?:to|-)\s+(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)\s+(\d{4})\b/i);

  if (rangeMatch) {
    const day1 = Number(rangeMatch[1]);
    const m1 = getMonthIndex(rangeMatch[2]);
    const year1 = Number(rangeMatch[3] || rangeMatch[6] || rangeMatch[5]);
    const day2 = Number(rangeMatch[4]);
    const m2 = getMonthIndex(rangeMatch[5] || rangeMatch[2]);
    const year2 = Number(rangeMatch[6] || rangeMatch[5] || rangeMatch[3]);

    if (m1 !== -1 && m2 !== -1 && !isNaN(year1) && !isNaN(year2)) {
      dateFrom = `${year1}-${padZero(m1 + 1)}-${padZero(day1)}`;
      dateTo = `${year2}-${padZero(m2 + 1)}-${padZero(day2)}`;
      if (m1 === m2 && year1 === year2 && day1 === 1 && day2 === getDaysInMonth(year1, m1)) {
        period = `${capitalize(MONTH_NAMES[m1])} ${year1}`;
      } else {
        period = `${day1} ${capitalize(MONTH_NAMES[m1].slice(0, 3))} ${year1} to ${day2} ${capitalize(MONTH_NAMES[m2].slice(0, 3))} ${year2}`;
      }
    }
  }

  // 2. ISO date range: YYYY-MM-DD to YYYY-MM-DD
  if (!dateFrom) {
    const isoRange = q.match(/\b(\d{4}-\d{2}-\d{2})\s*(?:to|and|-)\s*(\d{4}-\d{2}-\d{2})\b/);
    if (isoRange) {
      dateFrom = isoRange[1];
      dateTo = isoRange[2];
      period = `${dateFrom} to ${dateTo}`;
    }
  }

  // 3. Month + Year: "October 2026", "Oct 2026", "for October 2026"
  if (!dateFrom) {
    const monYear = q.match(/\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\s+(\d{4})\b/i) ||
      q.match(/\b(\d{4})\s+(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\b/i);

    if (monYear) {
      const monStr = isNaN(Number(monYear[1])) ? monYear[1] : monYear[2];
      const yrStr = isNaN(Number(monYear[1])) ? monYear[2] : monYear[1];
      const mIdx = getMonthIndex(monStr);
      const year = Number(yrStr);
      if (mIdx !== -1 && !isNaN(year)) {
        const days = getDaysInMonth(year, mIdx);
        dateFrom = `${year}-${padZero(mIdx + 1)}-01`;
        dateTo = `${year}-${padZero(mIdx + 1)}-${padZero(days)}`;
        period = `${capitalize(MONTH_NAMES[mIdx])} ${year}`;
      }
    }
  }

  // 4. Relative periods: "this month", "last month", "current month"
  if (!dateFrom) {
    if (/\blast\s+month\b/i.test(q)) {
      const prev = new Date(Date.UTC(now.getFullYear(), now.getMonth() - 1, 1));
      const mIdx = prev.getUTCMonth();
      const year = prev.getUTCFullYear();
      const days = getDaysInMonth(year, mIdx);
      dateFrom = `${year}-${padZero(mIdx + 1)}-01`;
      dateTo = `${year}-${padZero(mIdx + 1)}-${padZero(days)}`;
      period = `${capitalize(MONTH_NAMES[mIdx])} ${year}`;
    } else if (/\b(?:this\s+month|current\s+month)\b/i.test(q)) {
      const mIdx = now.getMonth();
      const year = now.getFullYear();
      const days = getDaysInMonth(year, mIdx);
      dateFrom = `${year}-${padZero(mIdx + 1)}-01`;
      dateTo = `${year}-${padZero(mIdx + 1)}-${padZero(days)}`;
      period = `${capitalize(MONTH_NAMES[mIdx])} ${year}`;
    }
  }

  // 5. Bare month: "What about September?", "for September", "in September"
  if (!dateFrom) {
    const bareMon = q.match(/\b(?:what\s+about|for|in|of|about)\s+(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\b/i) ||
      q.match(/^(?:what\s+about\s+)?(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)[?.!]?$/i);

    if (bareMon) {
      const mIdx = getMonthIndex(bareMon[1]);
      if (mIdx !== -1) {
        const priorDate = (context?.lastErpQuery as any)?.dateFrom || (context?.lastErpQuery as any)?.dateTo;
        let year = now.getFullYear();
        if (typeof priorDate === "string" && /^\d{4}/.test(priorDate)) {
          year = Number(priorDate.slice(0, 4));
        }
        const days = getDaysInMonth(year, mIdx);
        dateFrom = `${year}-${padZero(mIdx + 1)}-01`;
        dateTo = `${year}-${padZero(mIdx + 1)}-${padZero(days)}`;
        period = `${capitalize(MONTH_NAMES[mIdx])} ${year}`;
      }
    }
  }

  // 6. All time
  if (!dateFrom && /\b(?:all\s+time|lifetime|overall|entire\s+ledger|all\s+posted)\b/i.test(q)) {
    period = "All Time";
  }

  // 7. Inherit prior period if this is a follow-up query and no new date was given
  const lastQuery = context?.lastErpQuery as any;
  if (!dateFrom && lastQuery && (lastQuery.type === "profit_loss" || lastQuery.reportType === "profit_loss")) {
    if (lastQuery.dateFrom) dateFrom = lastQuery.dateFrom;
    if (lastQuery.dateTo) dateTo = lastQuery.dateTo;
    if (lastQuery.period) period = typeof lastQuery.period === "string" ? lastQuery.period : lastQuery.period.label;
  }

  return { period, dateFrom, dateTo, wantsDetails, wantsCogs, wantsRevenue, wantsExpenses, wantsCrossModule, wantsDateRange, basis };
}

function cleanName(raw: string): string {
  let cleaned = raw.trim();
  cleaned = cleaned.replace(/^(?:existing\s+)?(?:employee|user|staff|member)\s+/i, "");
  cleaned = cleaned.replace(/'s$/i, "");
  return cleaned.trim();
}

function cleanRole(raw: string): string {
  let cleaned = raw.trim();
  // Strip trailing punctuation or sentences like ". Identify the exact employee...", " and check..."
  const cutMatch = cleaned.match(/^([a-zA-Z\s-]+?)(?:[.,;!?]|\s+(?:and|identify|check|prepare|please|do\s+not|with|for\s+confirmation)\b|$)/i);
  if (cutMatch && cutMatch[1].trim()) {
    cleaned = cutMatch[1].trim();
  }
  return cleaned;
}

function extractRoleChange(q: string): { userName: string; role: string; fromRole?: string } | null {
  // Pattern 1: "in/for user/employee kishore, change (the) (sales manager) role to admin..."
  const m1 = q.match(/(?:in|for)\s+(?:existing\s+)?(?:user|employee|staff)?\s*([a-zA-Z0-9_.\s'-]+?)[,\s]+change(?:\s+the)?(?:\s+([a-zA-Z\s-]+?))?\s+role\s+to\s+([a-zA-Z\s-]+)/i);
  if (m1) {
    const userName = cleanName(m1[1]);
    const fromRole = m1[2] ? cleanRole(m1[2]) : undefined;
    const role = cleanRole(m1[3]);
    if (userName && role) return { userName, role, fromRole };
  }

  // Pattern 2: "change (existing) (employee/user) Kishore's role (from Sales Manager) to Admin..."
  const m2 = q.match(/(?:change|update|set|modify|switch)\s+(?:the\s+)?(?:role\s+of\s+)?(?:existing\s+)?(?:employee|user|staff)?\s*([a-zA-Z0-9_.\s'-]+?)(?:'s)?\s+role\s+(?:from\s+([a-zA-Z\s-]+?)\s+)?to\s+([a-zA-Z\s-]+)/i);
  if (m2) {
    const userName = cleanName(m2[1]);
    const fromRole = m2[2] ? cleanRole(m2[2]) : undefined;
    const role = cleanRole(m2[3]);
    if (userName && role) return { userName, role, fromRole };
  }

  // Pattern 3: "change role of (employee/user) Kishore (from Sales Manager) to Admin..."
  const m3 = q.match(/change(?:\s+the)?\s+role\s+of\s+(?:existing\s+)?(?:employee|user|staff)?\s*([a-zA-Z0-9_.\s'-]+?)\s+(?:from\s+([a-zA-Z\s-]+?)\s+)?to\s+([a-zA-Z\s-]+)/i);
  if (m3) {
    const userName = cleanName(m3[1]);
    const fromRole = m3[2] ? cleanRole(m3[2]) : undefined;
    const role = cleanRole(m3[3]);
    if (userName && role) return { userName, role, fromRole };
  }

  // Pattern 4: "make (employee/user) Kishore an Admin..."
  const m4 = q.match(/make\s+(?:existing\s+)?(?:user|employee|staff)?\s*([a-zA-Z0-9_.\s'-]+?)\s+(?:an?\s+)?([a-zA-Z\s-]+)/i);
  if (m4 && !/^(?:it|this|that|them|a|an)$/i.test(m4[1].trim())) {
    const userName = cleanName(m4[1]);
    const role = cleanRole(m4[2]);
    if (userName && role) return { userName, role };
  }

  // Pattern 5: "update (user/employee) Kishore role to Admin..."
  const m5 = q.match(/update\s+(?:existing\s+)?(?:user|employee|staff)?\s*([a-zA-Z0-9_.\s'-]+?)\s+role\s+to\s+([a-zA-Z\s-]+)/i);
  if (m5) {
    const userName = cleanName(m5[1]);
    const role = cleanRole(m5[2]);
    if (userName && role) return { userName, role };
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

  // Explicit update of customer draft
  if (
    /\b(?:update|modify|edit|change)\b.*\b(?:draft|customer)\b/i.test(q) ||
    /\b(?:existing\s+customer\s+draft|existing\s+draft)\b/i.test(q) ||
    /\b(?:leave|keep|set)?\s*(?:the\s+)?(?:phone|mobile|contact)(?:\s+number)?\s*(?:is\s+|to\s+|as\s+)?(?:empty|blank|none|clear|null)\b/i.test(q)
  ) {
    return "customer_update";
  }

  // Active pending customer draft in this conversation
  if (context?.pendingCustomerProposalId) {
    // Check if user explicitly wants to start a completely new customer from scratch
    const wantsExplicitNew = /\b(?:create|start|prepare|make)\s+(?:an?\s+)?(?:new|another|fresh)\s+customer\b/i.test(q) && !/\b(?:existing|update|do not|don't)\b/i.test(q);
    if (!wantsExplicitNew) {
      return "customer_update";
    }
  }

  if (/\bcustomer\b/i.test(q) && /\b(?:create|make|new|draft|prepare|add|register)\b/i.test(q) && !/\bdo\s+not\s+(?:create|save)\b/i.test(q)) return "customer_draft";

  // Role change controls
  if (/\b(?:cancel(?: the)? role(?: change)?|discard(?: the)? role)\b/i.test(q)) return "role_cancel";
  if (/^(?:yes[, ]*)?(?:confirm|save|approve|execute)(?: the)? role(?: change)?[.!]?$/i.test(q)) return "role_confirm";
  const roleChangeParsed = extractRoleChange(q);
  if (roleChangeParsed) {
    return { type: "role_change", userName: roleChangeParsed.userName, role: roleChangeParsed.role, fromRole: roleChangeParsed.fromRole };
  }

  // Employee lookup controls (read-only, distinct from employee creation)
  const isLookupVerb = /\b(?:find|search|lookup|look\s+up|list|show|fetch|get|who\s+is|who\s+are)\b/i.test(q);
  const hasEmployeeKeyword = /\b(?:employees?|staff|team\s+members?)\b/i.test(q);
  const isNotCreation = !/\b(?:create|new|add|onboard|draft|register)\s+(?:an?\s+)?(?:new\s+)?(?:employee|staff)\b/i.test(q)
    || /\b(?:do\s+not|don'?t|never)\s+(?:create|modify|add)\b/i.test(q);

  if (isLookupVerb && hasEmployeeKeyword && isNotCreation) {
    let name: string | undefined;
    const nameNamedMatch = q.match(/\b(?:employees?|staff)\s+(?:named|called|with\s+name)\s+([a-zA-Z0-9_.\s'-]+?)(?:[.,;!?]|\s+in\b|\s+with\b|\s+return\b|\s+do\s+not\b|$)/i);
    if (nameNamedMatch) {
      name = nameNamedMatch[1].trim();
    } else {
      const directNameMatch = q.match(/\b(?:find|search(?:\s+for)?|lookup|look\s+up|show|who\s+is)\s+(?:existing\s+)?(?:employees?|staff)\s+([a-zA-Z0-9_.\s'-]+?)(?:[.,;!?]|\s+in\b|\s+with\b|\s+return\b|\s+do\s+not\b|$)/i);
      if (directNameMatch && !/^(?:all|the|list|in|our|my|records?)$/i.test(directNameMatch[1].trim())) {
        name = directNameMatch[1].trim();
      }
    }
    return { type: "employee_lookup", name: name ? cleanName(name) : undefined };
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
      extractedFields.pan ||
      extractedFields.clearPhone
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

  // Explicit plan switch check: user explicitly commands to see the account/subscription plan
  const isExplicitPlanSwitch =
    /\b(?:account\s+plan|workspace\s+plan|billing\s+plan|subscription\s+plan|show\s+(?:me\s+)?(?:the\s+)?(?:account\s+)?plan|what\s+is\s+(?:our|the)\s+plan)\b/i.test(q) &&
    !/\b(?:account-level|account\s+name|revenue\s+account|cogs\s+account|expense\s+account|accounts?\s+included)\b/i.test(q);

  // Financial domain terms
  const isFinancialTerms =
    /\b(?:profit|loss|p&l|revenue|cogs|cost\s+of\s+goods|operating\s+expenses?|expenses?|net\s+result|net\s+profit|net\s+loss|general\s+ledger|ledger|journal\s+entries|posted\s+entries|posted-entry|account-level|account\s+name|accounts?|trial\s+balance|income\s+statement|direct\s+costs?|chart\s+of\s+accounts)\b/i.test(q);

  // Profit / Loss / P&L (BUG-002 and follow-ups)
  const isExplicitPL =
    /\b(?:profit|loss|p&l|profit\s+(?:and|&|\/)\s*loss|income\s+statement)\b/i.test(q) ||
    /\b(?:in\s+profit\s+or\s+loss|making\s+(?:a\s+)?profit|profitable|loss\s+making)\b/i.test(q) ||
    (/\b(?:analyse|analyze)\b/i.test(q) && /\b(?:financial|financials?|financial\s+position|profit|loss|revenue|cogs)\b/i.test(q));

  const lastQuery = context?.lastErpQuery as any;
  const isPriorPL = lastQuery?.type === "profit_loss" || lastQuery?.reportType === "profit_loss";
  const isOtherEntityTopic =
    !isExplicitPlanSwitch &&
    !isFinancialTerms &&
    /\b(?:invoices?|customers?|quotes?|sales\s+orders?|products?|items?|stock|users?)\b/i.test(q);

  const isPLFollowUp =
    isPriorPL &&
    !isExplicitPlanSwitch &&
    !isOtherEntityTopic &&
    (isFinancialTerms ||
      /\b(?:date\s+range|dates|period|reporting\s+period|calculation\s+details?|details?|break\s*down|what\s+about|recalculate|posted\s+entries\s+only|explain|how\s+much\s+of|cross[- ]module|sources?|coverage|represented)\b/i.test(q) ||
      /^(?:what\s+about\s+)?(?:january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)[?.!]?$/i.test(q));

  if (isExplicitPL || isPLFollowUp) {
    const financialPeriod = parseFinancialPeriod(q, now, context);
    const startDate = financialPeriod.dateFrom ? new Date(`${financialPeriod.dateFrom}T00:00:00Z`) : undefined;
    const endDate = financialPeriod.dateTo ? new Date(`${financialPeriod.dateTo}T23:59:59.999Z`) : undefined;
    const rawPeriod = financialPeriod.period as any;
    const periodLabel = (typeof rawPeriod === "string" ? rawPeriod : rawPeriod?.label) || (startDate && endDate ? `${financialPeriod.dateFrom} to ${financialPeriod.dateTo}` : "All Time");
    return {
      type: "profit_loss",
      period: {
        type: periodLabel === "All Time" ? "all_time" : "month",
        label: periodLabel,
        startDate,
        endDate,
      },
      startDate,
      endDate,
      dateFrom: financialPeriod.dateFrom,
      dateTo: financialPeriod.dateTo,
      wantsDetails: financialPeriod.wantsDetails,
      wantsCogs: financialPeriod.wantsCogs,
      wantsRevenue: financialPeriod.wantsRevenue,
      wantsExpenses: financialPeriod.wantsExpenses,
      wantsCrossModule: financialPeriod.wantsCrossModule,
      wantsDateRange: financialPeriod.wantsDateRange,
      basis: financialPeriod.basis,
    };
  }

  // Plan / Entitlements (strictly requiring explicit plan keywords or plan inclusion phrasing)
  if (
    isExplicitPlanSwitch ||
    ((/\b(?:plan|subscription)\b/i.test(q) && /\b(?:account|organization|org|which|what|free|paid|tier|status|current|features?|entitlements?|included|have|has|owns?|uses?|limits?|credits?)\b/i.test(q)) ||
     (/\b(?:features?|entitlements?|modules?)\b/i.test(q) && /\b(?:in\s+our\s+plan|in\s+our\s+subscription|in\s+the\s+plan|in\s+the\s+subscription|included\s+in\s+our\s+plan|included\s+in\s+our\s+subscription|do\s+we\s+have\s+in\s+(?:our|the)\s+plan)\b/i.test(q)))
  ) {
    const featureMatch = q.match(/\b(?:is|do we have)\s+([a-z0-9_-]+)\s+(?:included|available)\s+(?:in|under)\s+(?:our|the)\s+(?:plan|subscription)/i) ||
      q.match(/\b(?:is|do we have)\s+([a-z0-9_-]+)\s+(?:included|available|in\b)/i);
    const feature = featureMatch && !/^(?:the|our|this|a|an|in|features?|entitlements?|modules?)$/i.test(featureMatch[1])
      ? featureMatch[1].toLowerCase()
      : undefined;
    return { type: "plan", feature };
  }

  // Pure sum / total amount
  if (/^(?:what(?:'s| is)|show(?: me)?)?\s*(?:the )?(?:total|sum)(?: amount)?[?.!]?$/i.test(q)) return "total";

  // Identifiers
  const identifier = q.match(/\b(?:INV|SO|QUO)-[A-Za-z0-9_-]+\b/i)?.[0];
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

