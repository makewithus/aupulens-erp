import levenshtein from "js-levenshtein";

/**
 * The single, shared "which create-form does this message mean?" router.
 *
 * Used by BOTH the global AI assistant panel (components/dashboard/AiSidebar)
 * and every per-module AI Assistant page (app/*\/ai-assistant) so a create
 * request behaves identically no matter which assistant surface the user
 * typed it into — including redirecting to a DIFFERENT module's form when
 * that's what the message actually asks for.
 *
 * To add a new entity: add one entry to CREATE_TARGETS with its route + a
 * regex/keywords, and give it a matching entry in app/api/ai/prefill/route.ts.
 */
export interface CreateTargetDef {
  rx: RegExp;
  target: string;
  route: string;
  label: string;
  keywords: string[];
}

// Verb-led messages ("create a customer…", "add a lead and a task…") signal a
// create request at all — checked before we bother running the target matcher.
// "mark" covers the very common attendance phrasing "mark X absent/present" —
// it isn't a create verb per se, but the intent (produce/update a record from
// what's said) is the same as the rest of this list.
export const CREATE_VERB_RX = /\b(create|add|new|make|generate|draft|capture|log|prepare|register|enter|mark)\b/i;

// `keywords` power a typo-tolerant fallback (fuzzy match) so misspellings like
// "procelists" / "invoce" still route to the right create form.
export const CREATE_TARGETS: CreateTargetDef[] = [
  { rx: /\blead\b/i, target: "lead", route: "/crm/leads", label: "lead", keywords: ["lead"] },
  { rx: /\b(customer|client)\b/i, target: "customer", route: "/sales/customers/new", label: "customer", keywords: ["customer", "client"] },
  { rx: /\binvoice\b/i, target: "invoice", route: "/sales/invoices/new", label: "invoice", keywords: ["invoice"] },
  // Sales module — must be BEFORE the generic entries so "sales order" isn't
  // mis-matched. "price list"/"pricelist" checked before "product".
  { rx: /\b(sales?[\s-]?order)\b/i, target: "sales_order", route: "/sales/sales-orders/new", label: "sales order", keywords: ["salesorder"] },
  { rx: /\b(price[\s-]?list)\b/i, target: "pricelist", route: "/sales/pricelist", label: "pricelist", keywords: ["pricelist"] },
  { rx: /\bproduct\b/i, target: "product", route: "/sales/products", label: "product", keywords: ["product"] },
  { rx: /\b(subscription|recurring)\b/i, target: "subscription", route: "/sales/subscriptions/new", label: "subscription", keywords: ["subscription"] },
  { rx: /\bpayment\b/i, target: "payment", route: "/sales/payments/new", label: "payment", keywords: ["payment"] },
  // "delivery challan" → the SALES challan; a plain "delivery" → the Inventory
  // delivery operation (checked below). So challan keeps only its own keyword.
  { rx: /\b(delivery[\s-]?challan|challan|delivery[\s-]?note)\b/i, target: "delivery_challan", route: "/sales/delivery-challans", label: "delivery challan", keywords: ["challan"] },
  // Inventory module.
  { rx: /\b(batch|lot)\b/i, target: "batch", route: "/inventory/batch", label: "batch", keywords: ["batch"] },
  { rx: /\bwarehouse\b/i, target: "warehouse", route: "/inventory/warehouse", label: "warehouse", keywords: ["warehouse"] },
  { rx: /\b(goods[\s-]?receipt|grn|receipt|receiving)\b/i, target: "receipt", route: "/inventory/operations/receipts", label: "goods receipt", keywords: ["receipt", "receiving"] },
  // A manufacturing ITEM/PRODUCT (the catalogue record) — must be BEFORE the
  // manufacturing ORDER entry (which matches "manufacturing" alone) so
  // "manufacturing item/product" isn't swallowed by the order.
  { rx: /\b(bill[\s-]?of[\s-]?materials?|bom)\b/i, target: "bom", route: "/manufacturing/bom", label: "bill of materials", keywords: ["bom"] },
  // "fright" is a very common typo for "freight" — tolerate it directly in the
  // regex (a Levenshtein fuzzy pass alone won't catch it: "air"+"fright" never
  // recombines into the single token "airfreight" the fuzzy matcher expects).
  { rx: /\b(air[\s-]?freight|air[\s-]?fright|air[\s-]?cargo|air[\s-]?shipment|flight[\s-]?booking)\b/i, target: "air_freight", route: "/manufacturing/air-freight", label: "air freight", keywords: ["airfreight", "airfright"] },
  { rx: /\b(hs[\s-]?code|harmonized[\s-]?system[\s-]?code|hsn[\s-]?code)\b/i, target: "hs_code", route: "/manufacturing/hs-codes", label: "HS code", keywords: ["hscode"] },
  { rx: /\b(shipment|consignment|air[\s-]?waybill)\b/i, target: "shipment", route: "/manufacturing/shipments", label: "shipment", keywords: ["shipment", "consignment"] },
  { rx: /\b(manufacturing[\s-]?(item|product)|manufactured[\s-]?(item|product)|factory[\s-]?item)\b/i, target: "manufacturing_item", route: "/manufacturing/items", label: "manufacturing item", keywords: [] },
  // "order"/"run" is REQUIRED, not optional — bare "manufacturing"/"production"
  // are ordinary English words that show up constantly in UNRELATED text (a
  // job title "Production Engineer", a performance-review note about
  // "production output", a department field) and must not hijack the match.
  { rx: /\b(manufacturing|production)[\s-]?(order|run)\b/i, target: "manufacturing_order", route: "/inventory/operations/manufacturing", label: "manufacturing order", keywords: ["manufacturing", "production"] },
  { rx: /\b(delivery|dispatch|shipment)\b/i, target: "inventory_delivery", route: "/inventory/operations/deliveries", label: "delivery", keywords: ["delivery", "dispatch", "shipment"] },
  { rx: /\breturn\b/i, target: "inventory_return", route: "/inventory/operations/returns", label: "return", keywords: ["return"] },
  { rx: /\b(stock[\s-]?move|stock[\s-]?transfer|internal[\s-]?transfer)\b/i, target: "stock_move", route: "/inventory/stock-moves", label: "stock move", keywords: ["stockmove", "transfer"] },
  { rx: /\b(inventory[\s-]?order|stock[\s-]?order|purchase[\s-]?order)\b/i, target: "inventory_order", route: "/inventory/orders", label: "inventory order", keywords: [] },
  { rx: /\b(report|stock report|movement report|aging report|compliance report)\b/i, target: "inventory_report", route: "/inventory/reports", label: "inventory report", keywords: ["report"] },
  // Finance module. "ledger account"/"chart of accounts" → finance ledger
  // account (a plain "account" stays the CRM account, below). Finance entries
  // sit here so they resolve before the generic CRM matches.
  { rx: /\b(expense|reimbursement|expenditure)\b/i, target: "expense", route: "/finance/expenses", label: "expense", keywords: ["expense", "reimbursement"] },
  // "vendor bill"/"bill" → the finance vendor bill. Checked before "journal"
  // and before the generic entries.
  { rx: /\b(vendor[\s-]?bill|supplier[\s-]?bill|purchase[\s-]?bill|bill)\b/i, target: "bill", route: "/finance/bills", label: "vendor bill", keywords: ["bill"] },
  // The Transactions/Vouchers page's quick actions — "receive payment" /
  // "make payment" / "manual journal" (the exact card labels) route here, not
  // to the sales payment form. Note "make payment" ≠ "make A payment" (the
  // latter, natural phrasing, falls through to the sales payment target).
  { rx: /\b(voucher|receive[\s-]?payment|make[\s-]?payment|payment[\s-]?voucher|receipt[\s-]?voucher|manual[\s-]?journal)\b/i, target: "voucher", route: "/finance/accounting/vouchers", label: "voucher", keywords: ["voucher"] },
  { rx: /\b(journal[\s-]?entry|journal)\b/i, target: "journal_entry", route: "/finance/accounting/journal-entries", label: "journal entry", keywords: ["journal"] },
  { rx: /\b(fixed[\s-]?asset|depreciat\w*|asset)\b/i, target: "fixed_asset", route: "/finance/accounting/fixed-assets", label: "fixed asset", keywords: ["asset", "depreciation"] },
  { rx: /\b(ledger[\s-]?account|chart[\s-]?of[\s-]?accounts|gl[\s-]?account|nominal[\s-]?account)\b/i, target: "finance_account", route: "/finance/accounting/chart-of-accounts", label: "ledger account", keywords: [] },
  { rx: /\b(bank[\s-]?statement|bank[\s-]?reconciliation|reconcile[\s-]?bank|import[\s-]?statement)\b/i, target: "bank_statement", route: "/finance/accounting/bank-reconciliation", label: "bank statement", keywords: ["reconciliation", "statement"] },
  { rx: /\b(employee|staff)\b/i, target: "employee", route: "/hr/employees", label: "employee", keywords: ["employee"] },
  { rx: /\bdepartment\b/i, target: "department", route: "/hr/departments", label: "department", keywords: ["department"] },
  // Deliberately NOT a bare "\buser\b" — that word is far too common in
  // ordinary sentences ("the user wants…", "check if the user exists…") and
  // would misfire constantly. Only these explicit phrasings for a system
  // login account are matched.
  { rx: /\b(user[\s-]?account|system[\s-]?user|login[\s-]?(user|account)|portal[\s-]?access)\b/i, target: "admin_user", route: "/admin/users", label: "system user", keywords: [] },
  { rx: /\bleave\b/i, target: "leave_request", route: "/hr/leave", label: "leave request", keywords: ["leave"] },
  // Covers the natural phrasing "mark <name> absent/present/on leave", not
  // just the literal word "attendance".
  { rx: /\b(attendance|mark(?:ed)?\s+(?:\S+\s+){0,4}(present|absent|on[\s-]?leave))\b/i, target: "attendance", route: "/hr/attendance", label: "attendance record", keywords: ["attendance"] },
  { rx: /\b(exit[\s-]?(clearance|details|process)|offboarding|full[\s-]and[\s-]final|f\s?&\s?f|resignation)\b/i, target: "hr_exit", route: "/hr/exit", label: "exit & clearance", keywords: ["offboarding", "resignation"] },
  { rx: /\b(performance[\s-]?review|appraisal|performance[\s-]?appraisal)\b/i, target: "performance_review", route: "/hr/performance", label: "performance review", keywords: ["appraisal"] },
  { rx: /\b(payroll|salary[\s-]?run|pay[\s-]?run)\b/i, target: "payroll_run", route: "/hr/payroll", label: "payroll run", keywords: ["payroll"] },
  // "sales quote" → the Sales-module quote; a plain "quote"/"quotation" → CRM quote.
  { rx: /\b(sales?[\s-]?(quote|quotation))\b/i, target: "sales_quote", route: "/sales/quotes/new", label: "sales quote", keywords: ["salesquote"] },
  { rx: /\b(quote|quotation)\b/i, target: "quote", route: "/crm/quotes/new", label: "quote", keywords: ["quote", "quotation"] },
  { rx: /\b(opportunity|deal)\b/i, target: "opportunity", route: "/crm/opportunities", label: "opportunity", keywords: ["opportunity"] },
  { rx: /\bcontact\b/i, target: "contact", route: "/crm/contacts", label: "contact", keywords: ["contact"] },
  { rx: /\b(account|company)\b/i, target: "account", route: "/crm/accounts", label: "account", keywords: ["account", "company"] },
  { rx: /\bcase\b/i, target: "case", route: "/crm/cases", label: "case", keywords: ["case"] },
  { rx: /\bcampaign\b/i, target: "campaign", route: "/crm/campaigns", label: "campaign", keywords: ["campaign"] },
  { rx: /\btask\b/i, target: "task", route: "/crm/tasks", label: "task", keywords: ["task"] },
  { rx: /\bproject\b/i, target: "project", route: "/projects", label: "project", keywords: ["project"] },
];

// Module hints let an explicit "under finance" / "in inventory" override a
// target that exists in more than one module (e.g. a purchase order lives in
// BOTH Finance and Inventory). We respect what the user actually said.
const FINANCE_HINT_RX = /\b(finance|financial|accounting|account[s]?[\s-]?payable|payables?|voucher|ledger)\b/i;
const INVENTORY_HINT_RX = /\b(inventory|stock|warehouse|godown)\b/i;
const FINANCE_PO: CreateTargetDef = {
  rx: /\b(purchase[\s-]?order|p\.?o\.?)\b/i, target: "finance_purchase_order",
  route: "/finance/purchase-orders", label: "purchase order", keywords: [],
};
const CUSTOMS_CLEARANCE: CreateTargetDef = {
  rx: /clearance/i, target: "customs_clearance",
  route: "/manufacturing/customs-clearance", label: "customs clearance", keywords: [],
};

// Typo-tolerant check for "clearance" — a misspelling like "cleareance" must
// still trip the decisive override below (an exact \bclearance\b match alone
// let a typo fall through to whatever exact keyword happened to be nearby).
const looksLikeClearance = (text: string): boolean => {
  if (/\bclearance\b/i.test(text)) return true;
  const tokens: string[] = text.toLowerCase().match(/[a-z]+/g) || [];
  return tokens.some((tok) => tok.length >= 7 && tok[0] === "c" && levenshtein(tok, "clearance") <= 2);
};

/**
 * Resolve a natural-language create request to the right form target.
 *
 * Exact regex first (earliest match AFTER the command verb, since pasted data
 * routinely contains unrelated keywords); then typo tolerance on the same
 * span; then an exact match nearest the verb when the object comes BEFORE it;
 * then typo tolerance anywhere, as the last resort. See inline comments for
 * the reasoning behind each step — this function has been hardened against
 * several real misroutes (return→product, employee→manufacturing_order,
 * HS-code→goods-receipt) each caused by an earlier, simpler heuristic.
 */
export function findCreateTarget(q: string): CreateTargetDef | undefined {
  // Decisive override: the word "clearance" belongs to EXACTLY one feature —
  // Customs Clearance. No other target in this app uses that word, so it must
  // win even when the phrase also contains "customer" (a very easy typo/near-
  // miss for "customs" — e.g. "create a customer clearance"). EXCEPTION: HR's
  // "exit clearance" also uses the word but means something else entirely.
  if (looksLikeClearance(q) && !/\b(exit|resignation|offboarding|f\s?&\s?f)\b/i.test(q)) {
    return CUSTOMS_CLEARANCE;
  }
  // Cross-module override: "purchase order" defaults to Inventory, but if the
  // user named Finance/Payables (and not Inventory), send them to the Finance
  // purchase order instead. This honours "create a PO under finance".
  if (/\b(purchase[\s-]?order|p\.?o\.?)\b/i.test(q) && FINANCE_HINT_RX.test(q) && !INVENTORY_HINT_RX.test(q)) {
    return FINANCE_PO;
  }

  const STRONG_CREATE_RX = /\b(creat\w*|generat\w*|make|prepar\w*|register)\b/i;
  const strongMatch = STRONG_CREATE_RX.exec(q);
  const verbMatch = CREATE_VERB_RX.exec(q);
  const anchorIdx = strongMatch ? strongMatch.index : (verbMatch ? verbMatch.index : 0);
  type Cand = { t: CreateTargetDef; idx: number; order: number };
  const better = (a: Cand, b?: Cand) => !b || a.idx < b.idx || (a.idx === b.idx && a.order < b.order);
  const earliestIn = (text: string, offset: number): Cand | undefined => {
    let best: Cand | undefined;
    CREATE_TARGETS.forEach((t, order) => {
      const m = t.rx.exec(text);
      if (!m) return;
      const cand: Cand = { t, idx: m.index + offset, order };
      if (better(cand, best)) best = cand;
    });
    return best;
  };
  const MAX_BEFORE_GAP = 300;
  const nearestBefore = (text: string, anchor: number): Cand | undefined => {
    let best: Cand | undefined;
    CREATE_TARGETS.forEach((t, order) => {
      const re = new RegExp(t.rx.source, t.rx.flags.includes("g") ? t.rx.flags : `${t.rx.flags}g`);
      let m: RegExpExecArray | null;
      let lastBefore: RegExpExecArray | null = null;
      while ((m = re.exec(text)) !== null) {
        if (m.index >= anchor) break;
        lastBefore = m;
        if (re.lastIndex === m.index) re.lastIndex++;
      }
      if (!lastBefore || anchor - lastBefore.index > MAX_BEFORE_GAP) return;
      const cand: Cand = { t, idx: lastBefore.index, order };
      if (!best || cand.idx > best.idx || (cand.idx === best.idx && order < best.order)) best = cand;
    });
    return best;
  };
  const fuzzyIn = (text: string): CreateTargetDef | undefined => {
    const allWords: string[] = text.toLowerCase().match(/[a-z]+/g) || [];
    const words = allWords.filter((w) => w.length >= 4);
    let best: { t: CreateTargetDef; dist: number } | undefined;
    for (const t of CREATE_TARGETS) {
      for (const kw of t.keywords) {
        if (kw.length < 5) continue;
        const maxD = kw.length >= 7 ? 2 : 1;
        for (const tok of words) {
          if (tok[0] !== kw[0]) continue;
          const d = levenshtein(tok, kw);
          if (d <= maxD && (!best || d < best.dist)) best = { t, dist: d };
        }
      }
    }
    return best?.t;
  };

  const tail = q.slice(anchorIdx);
  const afterExact = earliestIn(tail, anchorIdx);
  if (afterExact) return afterExact.t;
  const afterTypo = fuzzyIn(tail);
  if (afterTypo) return afterTypo;
  const beforeExact = nearestBefore(q, anchorIdx);
  if (beforeExact) return beforeExact.t;
  return fuzzyIn(q);
}
