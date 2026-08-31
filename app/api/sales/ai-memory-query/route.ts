import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import Customer from "@/models/sales/Customer";
import Product from "@/models/inventory/Product";
import { SalesInvoice } from "@/models/sales/SalesInvoice";
import SalesQuotation from "@/models/sales/SalesQuotation";
import SaleOrder from "@/models/sales/SaleOrder";
import Payment from "@/models/sales/Payment";
import Subscription from "@/models/sales/Subscription";
import DeliveryChallan from "@/models/sales/DeliveryChallan";
import FinanceInvoice from "@/models/finance/Invoice";
import Expense from "@/models/finance/Expense";
import PurchaseOrder from "@/models/finance/PurchaseOrder";
import StockTransfer from "@/models/inventory/StockTransfer";
import ManufacturingOrder from "@/models/manufacturing/ManufacturingOrder";
import Batch from "@/models/inventory/Batch";
import CrmLead from "@/models/crm/Lead";
import CrmOpportunity from "@/models/crm/Opportunity";
import CrmCase from "@/models/crm/Case";
import CrmCampaign from "@/models/crm/Campaign";
import CrmContract from "@/models/crm/Contract";
import CrmAccount from "@/models/crm/Account";
import AdminUser from "@/models/auth/User";
import AdminTask from "@/models/admin/Task";
import AdminActivityLog from "@/models/admin/ActivityLog";
import { resolveTenantAiSettings, callClaudeForTenant } from "@/lib/ai/tenantAi";
import {
  SALES_INVOICE_STATUS,
  SALES_INVOICE_STATUS_VALUES,
  QUOTE_STATUS_VALUES,
  SALES_ORDER_STATUS_VALUES,
  PAYMENT_STATUS_VALUES,
  SALES_SUBSCRIPTION_STATUS_VALUES,
  DOCUMENT_STATUS_VALUES,
  PAYMENT_STATE,
  PAYMENT_STATE_VALUES,
  PRODUCTION_STATUS_VALUES,
  BATCH_STATUS_VALUES,
  PRODUCT_STATUS_VALUES,
} from "@/lib/constants/statuses";

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function formatCurrency(n: number): string {
  return "₹" + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

function formatDate(d: any): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function customerDisplayName(c: any): string {
  return c?.header?.displayName || c?.header?.companyName || c?.header?.name || "Unnamed customer";
}

/** Case-insensitive match against an entity's real status/stage values.
 * `extracted.status` is normalized to lowercase during extraction below, but
 * several entities (CRM leads/opportunities/cases/campaigns/contracts) use
 * Title-Case vocabularies ("Closed", "New", "Prospecting") — a raw equality
 * or `.includes()` check against those arrays would never match a lowercase
 * value, silently breaking status filtering for the whole entity. Returns
 * the correctly-cased canonical value (safe to assign to the query or
 * redirect), or undefined if nothing matches. */
function matchStatus(raw: string, values: readonly string[]): string | undefined {
  if (!raw) return undefined;
  return values.find((v) => v.toLowerCase() === raw.toLowerCase());
}

/** Shared $gte/$lte range builder for a Date-typed field — end date is
 * inclusive through 23:59:59.999 so "up to 31 Aug" includes all of the 31st. */
function dateRangeFilter(fromValid: string, toValid: string): Record<string, Date> | undefined {
  if (!fromValid && !toValid) return undefined;
  const range: Record<string, Date> = {};
  if (fromValid) range.$gte = new Date(fromValid);
  if (toValid) {
    const end = new Date(toValid);
    end.setHours(23, 59, 59, 999);
    range.$lte = end;
  }
  return range;
}

/** Shared $gte/$lte range builder for a numeric amount field. */
function amountRangeFilter(min: number | null, max: number | null): Record<string, number> | undefined {
  if (min == null && max == null) return undefined;
  const range: Record<string, number> = {};
  if (min != null) range.$gte = min;
  if (max != null) range.$lte = max;
  return range;
}

type MemoryEntity = "customer" | "product" | "invoice" | "quote" | "sales_order" | "payment" | "subscription" | "delivery_challan" | "vendor_bill" | "expense" | "purchase_order" | "inventory_delivery" | "inventory_receipt" | "manufacturing_order" | "batch" | "crm_lead" | "crm_opportunity" | "crm_case" | "crm_campaign" | "crm_contract" | "admin_user" | "admin_task" | "activity_log" | "none";

interface Extracted {
  entity: MemoryEntity;
  wantsToOpen: boolean;
  nameQuery: string;
  dateFrom: string;
  dateTo: string;
  status: string;
  amountMin: number | null;
  amountMax: number | null;
}

/**
 * "AI memory" — real database lookups for factual Sales, Finance, and
 * Inventory questions ("does this customer exist", "was an invoice created
 * in the first week of August", "show me invoices from last month", "unpaid
 * vendor bills from Acme", "purchase orders above 50000", "deliveries
 * scheduled this week", "manufacturing orders in production"), as opposed to
 * /api/sales/ai-assistant's fixed-snapshot analytics chat. Gated behind
 * lib/ai/memoryFlow.ts's cheap regex check on the client, so this route is
 * only hit for messages that plausibly ask about one of the covered records.
 * Kept at its original /api/sales/ path for call-site stability even though
 * it now also covers Finance entities (vendor bills, expenses, purchase
 * orders) and Inventory entities (deliveries, receipts, manufacturing
 * orders, batches).
 *
 * The LLM is used ONLY to extract a structured query (entity/name/date-range/
 * status/browse-intent) from the free-text question — the actual answer shown
 * to the user is built deterministically from real query results, never
 * LLM-generated prose, so it's always complete and never invents data.
 *
 * Always returns 200 with `handled: false` on anything it can't confidently
 * resolve (bad JSON, unrecognized entity, auth/DB error) so the caller can
 * fall through to the normal conversational assistant without ever breaking
 * the chat.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ success: false, handled: false }, { status: 401 });
    }
    // Read-only lookup over the same tenant-scoped data the real
    // /api/sales/customers and /api/sales/invoices routes already serve to
    // any authenticated tenant member (no role restriction there) — this
    // route previously required role === "sales" | "admin", which silently
    // 401'd every other role's global-assistant query about a customer or
    // invoice, even though they could see the same data by visiting the page.
    const tenantId = (session.user as any).tenantId as string | undefined;
    if (!tenantId) {
      return NextResponse.json({ success: false, handled: false }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const message: string = String(body.text || body.message || "").trim();
    if (!message) return NextResponse.json({ success: true, handled: false });

    await connectDB();

    const today = new Date();
    const todayIso = today.toISOString().slice(0, 10);

    // Recent conversation, if the client sent any — lets a bare follow-up
    // ("and quotes?", "now show me all of them") resolve against what was
    // just discussed instead of being extracted in isolation and missing
    // context every message after the first turn used to lose.
    const rawHistory: Array<{ role?: string; content?: string }> = Array.isArray(body.history) ? body.history : [];
    const historyTurns = rawHistory
      .filter((h) => h && (h.role === "user" || h.role === "assistant") && typeof h.content === "string" && h.content.trim())
      .slice(-8);
    const historySection = historyTurns.length
      ? `Recent conversation (oldest first — for resolving a follow-up; the CURRENT question below always wins on anything it states explicitly):\n${historyTurns.map((h) => `${h.role === "user" ? "User" : "Assistant"}: ${String(h.content).slice(0, 500)}`).join("\n")}\n\n`
      : "";

    const prompt = `You are extracting a structured lookup query from a Sales-, Finance-, Inventory-, or CRM-module chat question in an ERP system. Today's date is ${todayIso}.

${historySection}User question: "${message}"

Return ONLY JSON (no markdown, no prose) in this exact shape:
{"entity": "customer" | "product" | "invoice" | "quote" | "sales_order" | "payment" | "subscription" | "delivery_challan" | "vendor_bill" | "expense" | "purchase_order" | "inventory_delivery" | "inventory_receipt" | "manufacturing_order" | "batch" | "crm_lead" | "crm_opportunity" | "crm_case" | "crm_campaign" | "crm_contract" | "admin_user" | "admin_task" | "activity_log" | "none", "wantsToOpen": false, "nameQuery": "", "dateFrom": "", "dateTo": "", "status": "", "amountMin": null, "amountMax": null}

Rules:
- "entity": "customer" for a customer/client, INCLUDING questions about a customer's own receivables/balance/amount-owed (that's a property of the customer record, not a document search). "product" for a product/item/SKU/catalog entry — ONLY when the question explicitly names the "sales" module (e.g. "in the sales module", "sales catalog", "sales product") or is clearly about the sales-facing catalog/pricing (list price, "can be sold", pricelists) rather than warehouse stock levels. A plain, module-unspecified product/stock question ("does this product exist", "show me all products") is Inventory's to answer, not this route's — use "none" for those so the caller's own Inventory lookup handles them; picking "product" here for an unspecified-module question would wrongly short-circuit that. "invoice" for a customer-facing sales invoice (money owed TO us BY a customer). "vendor_bill" for a vendor/supplier bill (money WE owe TO a vendor) — pick this over "invoice" whenever the question mentions a vendor/supplier, or says "bill" without customer context. "quote" for a quote/quotation/estimate. "sales_order" for a sales order/order. "payment" for a customer payment/receipt. "subscription" for a subscription/recurring plan. "delivery_challan" for a delivery challan/DC/delivery note. "expense" for an employee/business expense claim. "purchase_order" for a purchase order/PO placed with a vendor. "inventory_delivery" for a warehouse/stock delivery, outgoing shipment, or dispatch to a customer (a physical stock movement out, NOT a sales invoice). "inventory_receipt" for an incoming warehouse receipt/goods receipt from a vendor (a physical stock movement in, NOT a vendor bill). "manufacturing_order" for a manufacturing/production order/MO/work order. "batch" for an inventory batch/lot record. "crm_lead" for a CRM lead/prospect. "crm_opportunity" for a CRM deal/opportunity/pipeline item. "crm_case" for a CRM support case/ticket. "crm_campaign" for a CRM marketing campaign. "crm_contract" for a CRM customer contract/agreement (NOT a purchase/manufacturing order). "admin_user" for a system user/account/login. "admin_task" for an internal admin to-do/task assignment. "activity_log" for a system activity/audit log entry. "none" if the question isn't actually asking to look up or list a record (a how-to question, or unrelated) — when "none", leave every other field at its empty/null/false default.
- "wantsToOpen": true whenever the user is asking for a LIST or SET of records rather than a single yes/no fact — this includes "show me", "take me to", "open", "go to", "list all", "I want to see/the ...", but ALSO "give me all/the ...", "get me ...", "fetch ...", "pull up ...", "what are all the ...", "all the ...", or any plural request scoped by a filter (a date range, a status, an amount) with no single specific name/number mentioned. false only for a genuine yes/no or single-fact question ("does X exist", "was there an invoice for X", "how many customers this month", "check if X exists", "did we create an invoice for X").
- "nameQuery": a customer/vendor/company/account name mentioned, or a document number mentioned (invoice/quote/order/payment/DC/bill/PO/MO/batch/case/contract number). For "expense", this can also be a description/category keyword. For "batch", this can also be an item code. For "crm_lead"/"crm_opportunity", this can be a lead/deal name or company name. For "admin_user", this can be a user's name or email. For "activity_log", this can be the acting user's name or the activity text. Empty string if none mentioned.
- "dateFrom"/"dateTo": resolve ANY date-range phrasing to real YYYY-MM-DD dates using today (${todayIso}) as the anchor. An explicit date WITH a year (e.g. "15 Aug 2026", "since 15 August 2026", "after 15/08/2026") is absolute — use that exact date, even if it's in the future relative to your training data; today's date above is the only source of truth for "now"/"future". "X till now"/"X to date"/"since X" → dateFrom = X, dateTo empty (an open-ended range needs no upper bound). "first week of August" → the 1st to the 7th of the nearest August not in the future. "last three months" → 3 months before today to today. "this month" → the 1st of the current month to today. "in August" with no year → the nearest August that is not in the future. If there is NO date phrasing at all, leave both empty strings.
- "status": only when the user clearly names a status. Map their words to the closest ONE of these, depending on entity — product: draft, published. invoice: draft, saved, partially_paid, paid, overdue, cancelled, unpaid. quote: draft, sent, accepted, rejected, invoiced. sales_order: draft, pending_approval, approved, confirmed, on_hold, void, closed. payment: draft, paid, void. subscription: draft, trial, active, non_renewing, unpaid, dunning, cancelled, expired. delivery_challan: pending, issued, delivered. vendor_bill: draft, pending_approval, approved, posted, closed, rejected, cancelled, paid, overdue, unpaid. expense: draft, pending_approval, approved, posted, closed, rejected, cancelled. purchase_order: draft, pending_approval, approved, posted, closed, rejected, cancelled. inventory_delivery / inventory_receipt: draft, pending_approval, approved, posted, closed, rejected, cancelled. manufacturing_order: demand_forecast, production_order, material_reserved, material_issued, in_production, qc_pending, qc_passed, qc_failed, rework, finished, cancelled. batch: active, quarantine, expired, released. crm_lead: New, Attempting Contact, Connected, Qualified, Nurture, Disqualified, Converted. crm_opportunity (this maps to the "stage", not a status): Prospecting, Discovery, Requirement Gathering, Solution Fit, Proposal Sent, Negotiation, Approval, Closed Won, Closed Lost. crm_case: New, Open, In Progress, Waiting on Customer, Waiting on Internal Team, Resolved, Closed, Reopened. crm_campaign: Draft, Planned, Active, Paused, Completed, Archived. crm_contract: Draft, Active, Renewal Due, Expiring, Expired, Terminated, Cancelled (use the closest match). admin_user: active, inactive. admin_task: todo, in_progress, review, done. Empty string if no status named.
- "amountMin"/"amountMax" (invoice, quote, sales_order, payment, subscription, vendor_bill, expense, purchase_order, and customer — a plain rupee number, no currency symbol or commas; NOT applicable to any other entity, none of which have a comparable single amount field exposed here): "above/over/more than/at least X" → amountMin = X. "below/under/less than X" → amountMax = X. "between X and Y" → amountMin = X, amountMax = Y. "at most X" → amountMax = X. If no amount phrasing at all, leave both null. For "customer", this filters by the customer's own receivables/balance — a question about a CUSTOMER's outstanding balance/receivables (e.g. "customers with receivables above 10000", "clients who owe more than 5000") is entity "customer" with amountMin/amountMax set, NOT entity "invoice" — only pick "invoice" when the question is actually about invoice documents themselves (e.g. "invoices above 10000").
- USE THE RECENT CONVERSATION ABOVE (if any) to resolve a follow-up that doesn't fully stand on its own — e.g. "and quotes?" after a question about invoices means entity: "quote" with the SAME name/date/status/amount scope the invoice question used; "now show me all of them" after a filtered lookup means the SAME entity with wantsToOpen true and every filter cleared. But the CURRENT question's own explicit words always override anything from history: if the current question names its OWN date range, status, or amount, use that instead of carrying the old one forward, and if the current question says "all time"/"all of them"/"any status"/similarly explicit language that CLEARS a filter, leave that field empty — do NOT keep a filter from an earlier turn once the user has said something that supersedes it. A current question that is already a complete, self-contained request (names its own entity and everything it needs) should be extracted from ITS OWN wording alone — ignore history for anything it doesn't otherwise need.
- Never invent a name, a date, or an amount that isn't implied by the question or the recent conversation above. Output strict JSON, nothing else.`;

    const { tier, aiSettings } = await resolveTenantAiSettings(tenantId);
    // History is embedded as readable text inside `prompt` itself (via
    // historySection above) rather than passed as real multi-turn API
    // messages — this is a single-shot extraction call, so one flat prompt
    // keeps "today's date" / rules / conversation / current question in a
    // single coherent context instead of splitting them across turns.
    const result = await callClaudeForTenant(tenantId, tier, aiSettings, prompt, { maxTokens: 300 });
    if (!("text" in result)) {
      // Gated (AI disabled / cap reached) — fall through silently, let the
      // normal assistant call surface the real gated error to the user.
      return NextResponse.json({ success: true, handled: false });
    }

    const VALID_ENTITIES: MemoryEntity[] = ["customer", "product", "invoice", "quote", "sales_order", "payment", "subscription", "delivery_challan", "vendor_bill", "expense", "purchase_order", "inventory_delivery", "inventory_receipt", "manufacturing_order", "batch", "crm_lead", "crm_opportunity", "crm_case", "crm_campaign", "crm_contract", "admin_user", "admin_task", "activity_log", "none"];
    let extracted: Extracted | undefined;
    try {
      const m = result.text.match(/\{[\s\S]*\}/);
      const parsed = JSON.parse(m ? m[0] : result.text);
      if (parsed && VALID_ENTITIES.includes(parsed.entity)) {
        extracted = {
          entity: parsed.entity,
          wantsToOpen: Boolean(parsed.wantsToOpen),
          nameQuery: String(parsed.nameQuery || "").trim(),
          dateFrom: String(parsed.dateFrom || "").trim(),
          dateTo: String(parsed.dateTo || "").trim(),
          status: String(parsed.status || "").trim().toLowerCase(),
          amountMin: typeof parsed.amountMin === "number" && isFinite(parsed.amountMin) ? parsed.amountMin : null,
          amountMax: typeof parsed.amountMax === "number" && isFinite(parsed.amountMax) ? parsed.amountMax : null,
        };
      }
    } catch {
      // fall through — handled below
    }

    if (!extracted || extracted.entity === "none") {
      return NextResponse.json({ success: true, handled: false });
    }

    const dateFromValid = extracted.dateFrom && !isNaN(Date.parse(extracted.dateFrom)) ? extracted.dateFrom : "";
    const dateToValid = extracted.dateTo && !isNaN(Date.parse(extracted.dateTo)) ? extracted.dateTo : "";

    // Deterministic safety net: a request scoped by a date range, status, or
    // amount range with no single specific name/number is definitionally
    // "browse a filtered set", not a yes/no fact check — redirect regardless
    // of what the model decided for wantsToOpen, since not redirecting here
    // is the failure mode that actually matters (the user is left with only
    // a chat summary and no way to see the real, filtered page).
    if (!extracted.nameQuery && (dateFromValid || dateToValid || extracted.status || extracted.amountMin != null || extracted.amountMax != null)) {
      extracted.wantsToOpen = true;
    }
    const rangeLabel =
      dateFromValid && dateToValid
        ? `${formatDate(dateFromValid)} – ${formatDate(dateToValid)}`
        : dateFromValid
          ? `since ${formatDate(dateFromValid)}`
          : dateToValid
            ? `up to ${formatDate(dateToValid)}`
            : "";
    const amountLabel =
      extracted.amountMin != null && extracted.amountMax != null
        ? `between ${formatCurrency(extracted.amountMin)} and ${formatCurrency(extracted.amountMax)}`
        : extracted.amountMin != null
          ? `above ${formatCurrency(extracted.amountMin)}`
          : extracted.amountMax != null
            ? `below ${formatCurrency(extracted.amountMax)}`
            : "";
    const scopeLabel = [rangeLabel, amountLabel].filter(Boolean).join(", ");

    if (extracted.entity === "customer") {
      const query: any = { tenantId };
      if (extracted.nameQuery) {
        const rx = { $regex: escapeRegex(extracted.nameQuery), $options: "i" };
        query.$or = [
          { "header.name": rx },
          { "header.displayName": rx },
          { "header.companyName": rx },
          { "contact_details.email": rx },
        ];
      }
      if (dateFromValid || dateToValid) {
        query.createdAt = {};
        if (dateFromValid) query.createdAt.$gte = new Date(dateFromValid);
        if (dateToValid) {
          const end = new Date(dateToValid);
          end.setHours(23, 59, 59, 999);
          query.createdAt.$lte = end;
        }
      }
      // "Receivables"/"balance"/"outstanding" on a customer maps to the real
      // openingBalance field shown as the "Receivables" column on
      // /sales/customers — the only amount actually stored per-customer.
      const balanceRange = amountRangeFilter(extracted.amountMin, extracted.amountMax);
      if (balanceRange) query.openingBalance = balanceRange;

      const [total, customers] = await Promise.all([
        Customer.countDocuments(query),
        Customer.find(query).sort({ createdAt: -1 }).limit(10).lean(),
      ]);

      let route: string | undefined;
      if (extracted.wantsToOpen) {
        const params = new URLSearchParams();
        if (extracted.nameQuery) params.set("search", extracted.nameQuery);
        if (dateFromValid) params.set("dateFrom", dateFromValid);
        if (dateToValid) params.set("dateTo", dateToValid);
        if (extracted.amountMin != null) params.set("amountMin", String(extracted.amountMin));
        if (extracted.amountMax != null) params.set("amountMax", String(extracted.amountMax));
        route = `/sales/customers${params.toString() ? `?${params.toString()}` : ""}`;
      }

      let message2: string;
      if (extracted.nameQuery && total > 0 && !extracted.wantsToOpen) {
        // A specific existence check for one name — answer with the real record.
        const c: any = customers[0];
        const bits = [
          c.header?.companyName ? `Company: ${c.header.companyName}` : "",
          c.contact_details?.email ? `Email: ${c.contact_details.email}` : "",
          c.contact_details?.phone || c.contact_details?.mobile
            ? `Phone: ${c.contact_details.phone || c.contact_details.mobile}`
            : "",
          c.gstin ? `GSTIN: ${c.gstin}` : "",
          `Receivables: ${formatCurrency(c.openingBalance || 0)}`,
          `Customer since: ${formatDate(c.createdAt)}`,
        ].filter(Boolean);
        message2 = `Yes — **${customerDisplayName(c)}** exists in the system.\n\n${bits.map((b) => `- ${b}`).join("\n")}`;
      } else if (extracted.nameQuery && total === 0 && !extracted.wantsToOpen) {
        message2 = `No — I couldn't find a customer named **${extracted.nameQuery}** in the system. Say "create a customer named ${extracted.nameQuery}" and I'll open the New Customer form for you.`;
      } else if (total === 0) {
        message2 = `No customers found${scopeLabel ? ` ${scopeLabel}` : extracted.nameQuery ? ` matching "${extracted.nameQuery}"` : ""}.`;
      } else {
        const lines = customers
          .slice(0, 10)
          .map((c: any) => `- ${customerDisplayName(c)}${c.contact_details?.email ? ` — ${c.contact_details.email}` : ""} — receivables ${formatCurrency(c.openingBalance || 0)} — created ${formatDate(c.createdAt)}`);
        const more = total > 10 ? `\n\n…and ${total - 10} more.` : "";
        const openNote = route ? "\n\nOpening the filtered list for you now." : "";
        message2 = `Found **${total}** customer${total === 1 ? "" : "s"}${scopeLabel ? ` ${scopeLabel}` : extracted.nameQuery ? ` matching "${extracted.nameQuery}"` : ""}:\n\n${lines.join("\n")}${more}${openNote}`;
      }

      return NextResponse.json({ success: true, handled: true, message: message2, route });
    }

    if (extracted.entity === "product") {
      // Sales-module product catalog lookup — /sales/products, NOT
      // /inventory/stock. Same underlying Product model as Inventory's own
      // product lookup, but scoped to this route only when the extraction
      // prompt above has already confirmed a "sales module" signal, so this
      // branch never fires for a module-unspecified product question.
      const query: any = { tenantId };
      if (extracted.nameQuery) {
        const rx = { $regex: escapeRegex(extracted.nameQuery), $options: "i" };
        query.$or = [{ "header.name": rx }, { "tab_general_information.default_code": rx }];
      }
      if (extracted.status && (PRODUCT_STATUS_VALUES as readonly string[]).includes(extracted.status)) {
        query.status = extracted.status;
      }

      const [total, products] = await Promise.all([
        Product.countDocuments(query),
        Product.find(query).sort({ createdAt: -1 }).limit(10).lean(),
      ]);

      let route: string | undefined;
      if (extracted.wantsToOpen) {
        const params = new URLSearchParams();
        // The Sales Products page reads its search box from `query`, not
        // `search` (matches /api/sales/products's own param name).
        if (extracted.nameQuery) params.set("query", extracted.nameQuery);
        if (extracted.status && (PRODUCT_STATUS_VALUES as readonly string[]).includes(extracted.status)) params.set("status", extracted.status);
        if (dateFromValid) params.set("dateFrom", dateFromValid);
        if (dateToValid) params.set("dateTo", dateToValid);
        route = `/sales/products${params.toString() ? `?${params.toString()}` : ""}`;
      }

      const forWhom = extracted.nameQuery ? ` matching "${extracted.nameQuery}"` : "";
      let message2: string;
      if (extracted.nameQuery && total > 0 && !extracted.wantsToOpen) {
        const p: any = products[0];
        const bits = [
          p.tab_general_information?.default_code ? `Code: ${p.tab_general_information.default_code}` : "",
          p.tab_general_information?.list_price != null ? `List price: ${formatCurrency(p.tab_general_information.list_price)}` : "",
          `Status: ${String(p.status || "draft").replace(/_/g, " ")}`,
        ].filter(Boolean);
        message2 = `Yes — **${p.header?.name}** exists in the sales catalog.\n\n${bits.map((b) => `- ${b}`).join("\n")}`;
      } else if (extracted.nameQuery && total === 0 && !extracted.wantsToOpen) {
        message2 = `No — I couldn't find a product named **${extracted.nameQuery}** in the sales catalog.`;
      } else if (total === 0) {
        message2 = `No products found${forWhom}.`;
      } else {
        const header = "| Product | Code | Status |\n|---|---|---|";
        const rows = products.slice(0, 10).map((p: any) => `| ${p.header?.name} | ${p.tab_general_information?.default_code || "—"} | ${String(p.status || "draft").replace(/_/g, " ")} |`);
        const more = total > 10 ? `\n\n…and ${total - 10} more.` : "";
        const openNote = route ? "\n\nOpening the filtered list for you now." : "";
        message2 = `Found **${total}** product${total === 1 ? "" : "s"}${forWhom} in the sales catalog:\n\n${header}\n${rows.join("\n")}${more}${openNote}`;
      }

      return NextResponse.json({ success: true, handled: true, message: message2, route });
    }

    if (extracted.entity === "invoice") {
    const query: any = { tenantId };
    let matchedCustomerId: string | undefined;
    let matchedCustomerName: string | undefined;
    if (extracted.nameQuery) {
      const rx = { $regex: escapeRegex(extracted.nameQuery), $options: "i" };
      const cust: any = await Customer.findOne(
        { tenantId, $or: [{ "header.name": rx }, { "header.displayName": rx }, { "header.companyName": rx }] },
        "_id header",
      ).lean();
      if (cust) {
        matchedCustomerId = String(cust._id);
        matchedCustomerName = customerDisplayName(cust);
        // Mongoose's Model.find() auto-casts a string ObjectId when matching
        // a `ref` field, but Model.aggregate()'s $match does NOT — it needs
        // a real ObjectId or the sum comes back as 0 despite find()
        // correctly returning the matching rows. Cast explicitly so both
        // calls agree.
        query.customerId = new mongoose.Types.ObjectId(matchedCustomerId);
      } else {
        // Not a known customer name — try it as an invoice number instead.
        query.number = { $regex: escapeRegex(extracted.nameQuery), $options: "i" };
      }
    }
    if (dateFromValid || dateToValid) {
      query.invoiceDate = {};
      if (dateFromValid) query.invoiceDate.$gte = new Date(dateFromValid);
      if (dateToValid) {
        const end = new Date(dateToValid);
        end.setHours(23, 59, 59, 999);
        query.invoiceDate.$lte = end;
      }
    }
    // Tracks whether `extracted.status` was actually a recognized value applied
    // to the query — the redirect below must only echo it when true, or a
    // status the model invented (not in this entity's real enum) still lands
    // in the URL even though the query itself silently ignored it, leaving
    // the destination page filtering for something that matches zero rows
    // while this very response lists results found WITHOUT that filter.
    let statusApplied = false;
    if (extracted.status) {
      if (extracted.status === "unpaid") {
        query.status = { $in: [SALES_INVOICE_STATUS.SAVED, SALES_INVOICE_STATUS.OVERDUE, SALES_INVOICE_STATUS.PARTIALLY_PAID] };
        statusApplied = true;
      } else if ((SALES_INVOICE_STATUS_VALUES as readonly string[]).includes(extracted.status)) {
        query.status = extracted.status;
        statusApplied = true;
      }
    }
    const invoiceAmountRange = amountRangeFilter(extracted.amountMin, extracted.amountMax);
    if (invoiceAmountRange) query.totalAmount = invoiceAmountRange;

    const [total, invoices] = await Promise.all([
      SalesInvoice.countDocuments(query),
      (SalesInvoice as any)
        .find(query)
        .populate("customerId", "header")
        .sort({ invoiceDate: -1, createdAt: -1 })
        .limit(10)
        .lean(),
    ]);
    const totalAmount = total > 0 ? await SalesInvoice.aggregate([{ $match: query }, { $group: { _id: null, sum: { $sum: "$totalAmount" } } }]) : [];
    const sumAmount = totalAmount[0]?.sum || 0;

    let route: string | undefined;
    if (extracted.wantsToOpen) {
      const params = new URLSearchParams();
      if (matchedCustomerId) params.set("customerId", matchedCustomerId);
      else if (extracted.nameQuery) params.set("search", extracted.nameQuery);
      if (dateFromValid) params.set("dateFrom", dateFromValid);
      if (dateToValid) params.set("dateTo", dateToValid);
      if (statusApplied) params.set("status", extracted.status);
      if (extracted.amountMin != null) params.set("amountMin", String(extracted.amountMin));
      if (extracted.amountMax != null) params.set("amountMax", String(extracted.amountMax));
      route = `/sales/invoices${params.toString() ? `?${params.toString()}` : ""}`;
    }

    const forWhom = matchedCustomerName ? ` for **${matchedCustomerName}**` : extracted.nameQuery ? ` matching "${extracted.nameQuery}"` : "";
    let message2: string;
    if (total === 0) {
      message2 = `No — I couldn't find any invoices${forWhom}${scopeLabel ? ` ${scopeLabel}` : ""}.`;
    } else {
      const lines = invoices.slice(0, 10).map((inv: any) => {
        const custName = inv.customerId ? customerDisplayName(inv.customerId) : "Unknown customer";
        return `- ${inv.number} — ${custName} — ${formatCurrency(inv.totalAmount)} — ${String(inv.status).replace(/_/g, " ")} — ${formatDate(inv.invoiceDate)}`;
      });
      const more = total > 10 ? `\n\n…and ${total - 10} more.` : "";
      const openNote = route ? "\n\nOpening the filtered list for you now." : "";
      message2 = `Yes — found **${total}** invoice${total === 1 ? "" : "s"}${forWhom}${scopeLabel ? ` ${scopeLabel}` : ""}, totaling ${formatCurrency(sumAmount)}:\n\n${lines.join("\n")}${more}${openNote}`;
    }

    return NextResponse.json({ success: true, handled: true, message: message2, route });
    }

    if (extracted.entity === "quote") {
      const query: any = { tenantId };
      let matchedCustomerId: string | undefined;
      let matchedCustomerName: string | undefined;
      if (extracted.nameQuery) {
        const rx = { $regex: escapeRegex(extracted.nameQuery), $options: "i" };
        const cust: any = await Customer.findOne(
          { tenantId, $or: [{ "header.name": rx }, { "header.displayName": rx }, { "header.companyName": rx }] },
          "_id header",
        ).lean();
        if (cust) {
          matchedCustomerId = String(cust._id);
          matchedCustomerName = customerDisplayName(cust);
          // Mongoose's Model.find() auto-casts a string ObjectId when
          // matching a `ref` field, but Model.aggregate()'s $match does NOT
          // — it needs a real ObjectId or the sum comes back as 0 despite
          // find() correctly returning the matching rows. Cast explicitly so
          // both calls agree.
          query.customerId = new mongoose.Types.ObjectId(matchedCustomerId);
        } else {
          query.quoteNumber = { $regex: escapeRegex(extracted.nameQuery), $options: "i" };
        }
      }
      const quoteDateRange = dateRangeFilter(dateFromValid, dateToValid);
      if (quoteDateRange) query.quoteDate = quoteDateRange;
      if (extracted.status && (QUOTE_STATUS_VALUES as readonly string[]).includes(extracted.status)) {
        query.status = extracted.status;
      }
      const quoteAmountRange = amountRangeFilter(extracted.amountMin, extracted.amountMax);
      if (quoteAmountRange) query.totalAmount = quoteAmountRange;

      const [total, quotes] = await Promise.all([
        SalesQuotation.countDocuments(query),
        (SalesQuotation as any).find(query).populate("customerId", "header").sort({ quoteDate: -1, createdAt: -1 }).limit(10).lean(),
      ]);
      const totalAgg = total > 0 ? await SalesQuotation.aggregate([{ $match: query }, { $group: { _id: null, sum: { $sum: "$totalAmount" } } }]) : [];
      const sumAmount = totalAgg[0]?.sum || 0;

      let route: string | undefined;
      if (extracted.wantsToOpen) {
        const params = new URLSearchParams();
        if (matchedCustomerId) params.set("customerId", matchedCustomerId);
        else if (extracted.nameQuery) params.set("search", extracted.nameQuery);
        if (dateFromValid) params.set("dateFrom", dateFromValid);
        if (dateToValid) params.set("dateTo", dateToValid);
        // Only echo a status the query above actually applied — a status the
        // model invented (not in QUOTE_STATUS_VALUES) was silently ignored by
        // the query, so echoing it into the URL would filter the destination
        // page for something that matches nothing, contradicting this same
        // response's own (unfiltered-by-status) results.
        if (extracted.status && (QUOTE_STATUS_VALUES as readonly string[]).includes(extracted.status)) params.set("status", extracted.status);
        if (extracted.amountMin != null) params.set("amountMin", String(extracted.amountMin));
        if (extracted.amountMax != null) params.set("amountMax", String(extracted.amountMax));
        route = `/sales/quotes${params.toString() ? `?${params.toString()}` : ""}`;
      }

      const forWhom = matchedCustomerName ? ` for **${matchedCustomerName}**` : extracted.nameQuery ? ` matching "${extracted.nameQuery}"` : "";
      let message2: string;
      if (total === 0) {
        message2 = `No — I couldn't find any quotes${forWhom}${scopeLabel ? ` ${scopeLabel}` : ""}.`;
      } else {
        const lines = quotes.slice(0, 10).map((q: any) => {
          const custName = q.customerId ? customerDisplayName(q.customerId) : "Unknown customer";
          return `- ${q.quoteNumber} — ${custName} — ${formatCurrency(q.totalAmount)} — ${String(q.status).replace(/_/g, " ")} — ${formatDate(q.quoteDate)}`;
        });
        const more = total > 10 ? `\n\n…and ${total - 10} more.` : "";
        const openNote = route ? "\n\nOpening the filtered list for you now." : "";
        message2 = `Yes — found **${total}** quote${total === 1 ? "" : "s"}${forWhom}${scopeLabel ? ` ${scopeLabel}` : ""}, totaling ${formatCurrency(sumAmount)}:\n\n${lines.join("\n")}${more}${openNote}`;
      }

      return NextResponse.json({ success: true, handled: true, message: message2, route });
    }

    if (extracted.entity === "sales_order") {
      const query: any = { tenantId, salesOrderStatus: { $ne: null } };
      let matchedCustomerId: string | undefined;
      let matchedCustomerName: string | undefined;
      if (extracted.nameQuery) {
        const rx = { $regex: escapeRegex(extracted.nameQuery), $options: "i" };
        const cust: any = await Customer.findOne(
          { tenantId, $or: [{ "header.name": rx }, { "header.displayName": rx }, { "header.companyName": rx }] },
          "_id header",
        ).lean();
        if (cust) {
          matchedCustomerId = String(cust._id);
          matchedCustomerName = customerDisplayName(cust);
          // See the note on the other branches' customerId cast — the same
          // find()-vs-aggregate() casting gap applies to this nested ref.
          query["header.partnerId"] = new mongoose.Types.ObjectId(matchedCustomerId);
        } else {
          query["header.name"] = { $regex: escapeRegex(extracted.nameQuery), $options: "i" };
        }
      }
      const orderDateRange = dateRangeFilter(dateFromValid, dateToValid);
      if (orderDateRange) query["header.dateOrder"] = orderDateRange;
      if (extracted.status && (SALES_ORDER_STATUS_VALUES as readonly string[]).includes(extracted.status)) {
        query.salesOrderStatus = extracted.status;
      }
      const orderAmountRange = amountRangeFilter(extracted.amountMin, extracted.amountMax);
      if (orderAmountRange) query["totals.amountTotal"] = orderAmountRange;

      const [total, orders] = await Promise.all([
        SaleOrder.countDocuments(query),
        (SaleOrder as any).find(query).populate("header.partnerId", "header").sort({ "header.dateOrder": -1, createdAt: -1 }).limit(10).lean(),
      ]);
      const totalAgg = total > 0 ? await SaleOrder.aggregate([{ $match: query }, { $group: { _id: null, sum: { $sum: "$totals.amountTotal" } } }]) : [];
      const sumAmount = totalAgg[0]?.sum || 0;

      let route: string | undefined;
      if (extracted.wantsToOpen) {
        const params = new URLSearchParams();
        if (matchedCustomerId) params.set("customerId", matchedCustomerId);
        else if (extracted.nameQuery) params.set("search", extracted.nameQuery);
        if (dateFromValid) params.set("dateFrom", dateFromValid);
        if (dateToValid) params.set("dateTo", dateToValid);
        // Only echo a status the query above actually applied — see the note
        // on the quote branch above.
        if (extracted.status && (SALES_ORDER_STATUS_VALUES as readonly string[]).includes(extracted.status)) params.set("status", extracted.status);
        if (extracted.amountMin != null) params.set("amountMin", String(extracted.amountMin));
        if (extracted.amountMax != null) params.set("amountMax", String(extracted.amountMax));
        route = `/sales/sales-orders${params.toString() ? `?${params.toString()}` : ""}`;
      }

      const forWhom = matchedCustomerName ? ` for **${matchedCustomerName}**` : extracted.nameQuery ? ` matching "${extracted.nameQuery}"` : "";
      let message2: string;
      if (total === 0) {
        message2 = `No — I couldn't find any sales orders${forWhom}${scopeLabel ? ` ${scopeLabel}` : ""}.`;
      } else {
        const lines = orders.slice(0, 10).map((o: any) => {
          const custName = o.header?.partnerId ? customerDisplayName(o.header.partnerId) : "Unknown customer";
          return `- ${o.header?.name} — ${custName} — ${formatCurrency(o.totals?.amountTotal || 0)} — ${String(o.salesOrderStatus).replace(/_/g, " ")} — ${formatDate(o.header?.dateOrder)}`;
        });
        const more = total > 10 ? `\n\n…and ${total - 10} more.` : "";
        const openNote = route ? "\n\nOpening the filtered list for you now." : "";
        message2 = `Yes — found **${total}** sales order${total === 1 ? "" : "s"}${forWhom}${scopeLabel ? ` ${scopeLabel}` : ""}, totaling ${formatCurrency(sumAmount)}:\n\n${lines.join("\n")}${more}${openNote}`;
      }

      return NextResponse.json({ success: true, handled: true, message: message2, route });
    }

    if (extracted.entity === "payment") {
      const query: any = { tenantId };
      let matchedCustomerId: string | undefined;
      let matchedCustomerName: string | undefined;
      if (extracted.nameQuery) {
        const rx = { $regex: escapeRegex(extracted.nameQuery), $options: "i" };
        const cust: any = await Customer.findOne(
          { tenantId, $or: [{ "header.name": rx }, { "header.displayName": rx }, { "header.companyName": rx }] },
          "_id header",
        ).lean();
        if (cust) {
          matchedCustomerId = String(cust._id);
          matchedCustomerName = customerDisplayName(cust);
          // Mongoose's Model.find() auto-casts a string ObjectId when
          // matching a `ref` field, but Model.aggregate()'s $match does NOT
          // — it needs a real ObjectId or the sum comes back as 0 despite
          // find() correctly returning the matching rows. Cast explicitly so
          // both calls agree.
          query.customerId = new mongoose.Types.ObjectId(matchedCustomerId);
        } else {
          query.paymentNumber = { $regex: escapeRegex(extracted.nameQuery), $options: "i" };
        }
      }
      const paymentDateRange = dateRangeFilter(dateFromValid, dateToValid);
      if (paymentDateRange) query.paymentDate = paymentDateRange;
      if (extracted.status && (PAYMENT_STATUS_VALUES as readonly string[]).includes(extracted.status)) {
        query.status = extracted.status;
      }
      const paymentAmountRange = amountRangeFilter(extracted.amountMin, extracted.amountMax);
      if (paymentAmountRange) query.amountReceived = paymentAmountRange;

      const [total, payments] = await Promise.all([
        Payment.countDocuments(query),
        (Payment as any).find(query).populate("customerId", "header").sort({ paymentDate: -1, createdAt: -1 }).limit(10).lean(),
      ]);
      const totalAgg = total > 0 ? await Payment.aggregate([{ $match: query }, { $group: { _id: null, sum: { $sum: "$amountReceived" } } }]) : [];
      const sumAmount = totalAgg[0]?.sum || 0;

      let route: string | undefined;
      if (extracted.wantsToOpen) {
        const params = new URLSearchParams();
        if (matchedCustomerId) params.set("customerId", matchedCustomerId);
        else if (extracted.nameQuery) params.set("search", extracted.nameQuery);
        if (dateFromValid) params.set("dateFrom", dateFromValid);
        if (dateToValid) params.set("dateTo", dateToValid);
        // Only echo a status the query above actually applied — see the note
        // on the quote branch above.
        if (extracted.status && (PAYMENT_STATUS_VALUES as readonly string[]).includes(extracted.status)) params.set("status", extracted.status);
        if (extracted.amountMin != null) params.set("amountMin", String(extracted.amountMin));
        if (extracted.amountMax != null) params.set("amountMax", String(extracted.amountMax));
        route = `/sales/payments${params.toString() ? `?${params.toString()}` : ""}`;
      }

      const forWhom = matchedCustomerName ? ` for **${matchedCustomerName}**` : extracted.nameQuery ? ` matching "${extracted.nameQuery}"` : "";
      let message2: string;
      if (total === 0) {
        message2 = `No — I couldn't find any payments${forWhom}${scopeLabel ? ` ${scopeLabel}` : ""}.`;
      } else {
        // A real markdown table (not a flat dash-list) so every attribute the
        // user might ask about — including ones with no dedicated URL filter,
        // like payment Mode — is directly visible without manually scanning
        // the destination page's table.
        const header = "| Payment # | Customer | Amount | Mode | Status | Date |\n|---|---|---|---|---|---|";
        const rows = payments.slice(0, 10).map((p: any) => {
          const custName = p.customerId ? customerDisplayName(p.customerId) : "Unknown customer";
          return `| ${p.paymentNumber} | ${custName} | ${formatCurrency(p.amountReceived)} | ${p.mode || "—"} | ${String(p.status).replace(/_/g, " ")} | ${formatDate(p.paymentDate)} |`;
        });
        const more = total > 10 ? `\n\n…and ${total - 10} more.` : "";
        const openNote = route ? "\n\nOpening the filtered list for you now." : "";
        message2 = `Yes — found **${total}** payment${total === 1 ? "" : "s"}${forWhom}${scopeLabel ? ` ${scopeLabel}` : ""}, totaling ${formatCurrency(sumAmount)}:\n\n${header}\n${rows.join("\n")}${more}${openNote}`;
      }

      return NextResponse.json({ success: true, handled: true, message: message2, route });
    }

    if (extracted.entity === "subscription") {
      const query: any = { tenantId };
      let matchedCustomerId: string | undefined;
      let matchedCustomerName: string | undefined;
      if (extracted.nameQuery) {
        const rx = { $regex: escapeRegex(extracted.nameQuery), $options: "i" };
        const cust: any = await Customer.findOne(
          { tenantId, $or: [{ "header.name": rx }, { "header.displayName": rx }, { "header.companyName": rx }] },
          "_id header",
        ).lean();
        if (cust) {
          matchedCustomerId = String(cust._id);
          matchedCustomerName = customerDisplayName(cust);
          // Mongoose's Model.find() auto-casts a string ObjectId when
          // matching a `ref` field, but Model.aggregate()'s $match does NOT
          // — it needs a real ObjectId or the sum comes back as 0 despite
          // find() correctly returning the matching rows. Cast explicitly so
          // both calls agree.
          query.customerId = new mongoose.Types.ObjectId(matchedCustomerId);
        } else {
          query.$or = [{ number: rx }, { profileName: rx }];
        }
      }
      const subDateRange = dateRangeFilter(dateFromValid, dateToValid);
      if (subDateRange) query.startDate = subDateRange;
      if (extracted.status && (SALES_SUBSCRIPTION_STATUS_VALUES as readonly string[]).includes(extracted.status)) {
        query.status = extracted.status;
      }
      const subAmountRange = amountRangeFilter(extracted.amountMin, extracted.amountMax);
      if (subAmountRange) query.totalAmount = subAmountRange;

      const [total, subs] = await Promise.all([
        Subscription.countDocuments(query),
        (Subscription as any).find(query).populate("customerId", "header").sort({ startDate: -1, createdAt: -1 }).limit(10).lean(),
      ]);
      const totalAgg = total > 0 ? await Subscription.aggregate([{ $match: query }, { $group: { _id: null, sum: { $sum: "$totalAmount" } } }]) : [];
      const sumAmount = totalAgg[0]?.sum || 0;

      let route: string | undefined;
      if (extracted.wantsToOpen) {
        const params = new URLSearchParams();
        if (matchedCustomerId) params.set("customerId", matchedCustomerId);
        else if (extracted.nameQuery) params.set("search", extracted.nameQuery);
        if (dateFromValid) params.set("dateFrom", dateFromValid);
        if (dateToValid) params.set("dateTo", dateToValid);
        // Only echo a status the query above actually applied — a status the
        // model invented (not in SALES_SUBSCRIPTION_STATUS_VALUES, e.g. it
        // guessing "inactive" for a plain "not active" ask) was silently
        // ignored by the query, so echoing it into the URL filters the
        // destination page for something that matches zero rows even though
        // this very response lists real, unfiltered-by-status results.
        if (extracted.status && (SALES_SUBSCRIPTION_STATUS_VALUES as readonly string[]).includes(extracted.status)) params.set("status", extracted.status);
        if (extracted.amountMin != null) params.set("amountMin", String(extracted.amountMin));
        if (extracted.amountMax != null) params.set("amountMax", String(extracted.amountMax));
        route = `/sales/subscriptions${params.toString() ? `?${params.toString()}` : ""}`;
      }

      const forWhom = matchedCustomerName ? ` for **${matchedCustomerName}**` : extracted.nameQuery ? ` matching "${extracted.nameQuery}"` : "";
      let message2: string;
      if (total === 0) {
        message2 = `No — I couldn't find any subscriptions${forWhom}${scopeLabel ? ` ${scopeLabel}` : ""}.`;
      } else {
        const header = "| Number | Customer | Amount | Status | Started |\n|---|---|---|---|---|";
        const rows = subs.slice(0, 10).map((s: any) => {
          const custName = s.customerId ? customerDisplayName(s.customerId) : "Unknown customer";
          return `| ${s.number || s.profileName || "Subscription"} | ${custName} | ${formatCurrency(s.totalAmount)} | ${String(s.status).replace(/_/g, " ")} | ${formatDate(s.startDate)} |`;
        });
        const more = total > 10 ? `\n\n…and ${total - 10} more.` : "";
        const openNote = route ? "\n\nOpening the filtered list for you now." : "";
        message2 = `Yes — found **${total}** subscription${total === 1 ? "" : "s"}${forWhom}${scopeLabel ? ` ${scopeLabel}` : ""}, totaling ${formatCurrency(sumAmount)}:\n\n${header}\n${rows.join("\n")}${more}${openNote}`;
      }

      return NextResponse.json({ success: true, handled: true, message: message2, route });
    }

    if (extracted.entity === "delivery_challan") {
      // DeliveryChallan's `customer` is a free-text string, not a Customer
      // ref (unlike every other Sales entity), and it has no amount field —
      // amountMin/amountMax never apply here (the extraction prompt already
      // tells the model not to set them for this entity). Its own
      // `deliveryDate` is stored as a raw string, so date filtering uses the
      // real `createdAt` Date instead.
      const query: any = { tenantId };
      if (extracted.nameQuery) {
        const rx = { $regex: escapeRegex(extracted.nameQuery), $options: "i" };
        query.$or = [{ dcNumber: rx }, { customer: rx }];
      }
      const dcDateRange = dateRangeFilter(dateFromValid, dateToValid);
      if (dcDateRange) query.createdAt = dcDateRange;
      const DC_STATUS_VALUES = ["pending", "issued", "delivered"];
      if (extracted.status && DC_STATUS_VALUES.includes(extracted.status)) {
        query.status = extracted.status;
      }

      const [total, challans] = await Promise.all([
        DeliveryChallan.countDocuments(query),
        DeliveryChallan.find(query).sort({ createdAt: -1 }).limit(10).lean(),
      ]);

      let route: string | undefined;
      if (extracted.wantsToOpen) {
        const params = new URLSearchParams();
        if (extracted.nameQuery) params.set("search", extracted.nameQuery);
        if (dateFromValid) params.set("dateFrom", dateFromValid);
        if (dateToValid) params.set("dateTo", dateToValid);
        // Only echo a status the query above actually applied.
        if (extracted.status && DC_STATUS_VALUES.includes(extracted.status)) params.set("status", extracted.status);
        route = `/sales/delivery-challans${params.toString() ? `?${params.toString()}` : ""}`;
      }

      const forWhom = extracted.nameQuery ? ` matching "${extracted.nameQuery}"` : "";
      let message2: string;
      if (total === 0) {
        message2 = `No — I couldn't find any delivery challans${forWhom}${rangeLabel ? ` ${rangeLabel}` : ""}.`;
      } else {
        const lines = challans.slice(0, 10).map((dc: any) => {
          return `- ${dc.dcNumber} — ${dc.customer || "Unknown customer"} — ${String(dc.status).replace(/_/g, " ")} — created ${formatDate(dc.createdAt)}`;
        });
        const more = total > 10 ? `\n\n…and ${total - 10} more.` : "";
        const openNote = route ? "\n\nOpening the filtered list for you now." : "";
        message2 = `Yes — found **${total}** delivery challan${total === 1 ? "" : "s"}${forWhom}${rangeLabel ? ` ${rangeLabel}` : ""}:\n\n${lines.join("\n")}${more}${openNote}`;
      }

      return NextResponse.json({ success: true, handled: true, message: message2, route });
    }

    if (extracted.entity === "vendor_bill") {
      // FinanceInvoice (models/finance/Invoice.ts) stores both customer
      // invoices and vendor bills, distinguished by moveType — this branch
      // always scopes to moveType: "in_invoice" (bills received FROM a
      // vendor), mirroring /api/finance/bills's own query shape.
      const query: any = { tenantId, moveType: "in_invoice" };
      let matchedVendorId: string | undefined;
      let matchedVendorName: string | undefined;
      if (extracted.nameQuery) {
        const rx = { $regex: escapeRegex(extracted.nameQuery), $options: "i" };
        const vendor: any = await Customer.findOne(
          { tenantId, $or: [{ "header.name": rx }, { "header.displayName": rx }, { "header.companyName": rx }] },
          "_id header",
        ).lean();
        if (vendor) {
          matchedVendorId = String(vendor._id);
          matchedVendorName = customerDisplayName(vendor);
          query.partnerId = new mongoose.Types.ObjectId(matchedVendorId);
        } else {
          query.name = { $regex: escapeRegex(extracted.nameQuery), $options: "i" };
        }
      }
      const billDateRange = dateRangeFilter(dateFromValid, dateToValid);
      if (billDateRange) query.invoiceDate = billDateRange;
      if (extracted.status === "unpaid") {
        query.paymentState = { $ne: PAYMENT_STATE.PAID };
      } else if (extracted.status && (PAYMENT_STATE_VALUES as readonly string[]).includes(extracted.status)) {
        query.paymentState = extracted.status;
      } else if (extracted.status && (DOCUMENT_STATUS_VALUES as readonly string[]).includes(extracted.status)) {
        query.state = extracted.status;
      }
      const billAmountRange = amountRangeFilter(extracted.amountMin, extracted.amountMax);
      if (billAmountRange) query.amountTotal = billAmountRange;

      const [total, bills] = await Promise.all([
        FinanceInvoice.countDocuments(query),
        (FinanceInvoice as any).find(query).populate("partnerId", "header").sort({ invoiceDate: -1, createdAt: -1 }).limit(10).lean(),
      ]);
      const totalAgg = total > 0 ? await FinanceInvoice.aggregate([{ $match: query }, { $group: { _id: null, sum: { $sum: "$amountTotal" } } }]) : [];
      const sumAmount = totalAgg[0]?.sum || 0;

      let route: string | undefined;
      if (extracted.wantsToOpen) {
        const params = new URLSearchParams();
        if (matchedVendorId) params.set("partnerId", matchedVendorId);
        else if (extracted.nameQuery) params.set("search", extracted.nameQuery);
        if (dateFromValid) params.set("dateFrom", dateFromValid);
        if (dateToValid) params.set("dateTo", dateToValid);
        // Only echo a status the query above actually applied (one of the
        // three branches: "unpaid", a PAYMENT_STATE value, or a
        // DOCUMENT_STATUS value) — /api/finance/bills resolves the same
        // three-way check itself, so any of these is safe to send through.
        if (
          extracted.status === "unpaid" ||
          (extracted.status && (PAYMENT_STATE_VALUES as readonly string[]).includes(extracted.status)) ||
          (extracted.status && (DOCUMENT_STATUS_VALUES as readonly string[]).includes(extracted.status))
        ) {
          params.set("status", extracted.status);
        }
        route = `/finance/bills${params.toString() ? `?${params.toString()}` : ""}`;
      }

      const forWhom = matchedVendorName ? ` from **${matchedVendorName}**` : extracted.nameQuery ? ` matching "${extracted.nameQuery}"` : "";
      let message2: string;
      if (total === 0) {
        message2 = `No — I couldn't find any vendor bills${forWhom}${scopeLabel ? ` ${scopeLabel}` : ""}.`;
      } else {
        const lines = bills.slice(0, 10).map((b: any) => {
          const vendorName = b.partnerId ? customerDisplayName(b.partnerId) : "Unknown vendor";
          return `- ${b.name} — ${vendorName} — ${formatCurrency(b.amountTotal)} — ${String(b.state).replace(/_/g, " ")} — ${formatDate(b.invoiceDate)}`;
        });
        const more = total > 10 ? `\n\n…and ${total - 10} more.` : "";
        const openNote = route ? "\n\nOpening the filtered list for you now." : "";
        message2 = `Yes — found **${total}** vendor bill${total === 1 ? "" : "s"}${forWhom}${scopeLabel ? ` ${scopeLabel}` : ""}, totaling ${formatCurrency(sumAmount)}:\n\n${lines.join("\n")}${more}${openNote}`;
      }

      return NextResponse.json({ success: true, handled: true, message: message2, route });
    }

    if (extracted.entity === "expense") {
      const query: any = { tenantId };
      if (extracted.nameQuery) {
        const rx = { $regex: escapeRegex(extracted.nameQuery), $options: "i" };
        query.$or = [{ description: rx }, { category: rx }];
      }
      const expenseDateRange = dateRangeFilter(dateFromValid, dateToValid);
      if (expenseDateRange) query.expenseDate = expenseDateRange;
      if (extracted.status && (DOCUMENT_STATUS_VALUES as readonly string[]).includes(extracted.status)) {
        query.status = extracted.status;
      }
      const expenseAmountRange = amountRangeFilter(extracted.amountMin, extracted.amountMax);
      if (expenseAmountRange) query.total = expenseAmountRange;

      const [total, expenses] = await Promise.all([
        Expense.countDocuments(query),
        (Expense as any).find(query).populate("employeeId", "name").sort({ expenseDate: -1, createdAt: -1 }).limit(10).lean(),
      ]);
      const totalAgg = total > 0 ? await Expense.aggregate([{ $match: query }, { $group: { _id: null, sum: { $sum: "$total" } } }]) : [];
      const sumAmount = totalAgg[0]?.sum || 0;

      let route: string | undefined;
      if (extracted.wantsToOpen) {
        const params = new URLSearchParams();
        if (dateFromValid) params.set("dateFrom", dateFromValid);
        if (dateToValid) params.set("dateTo", dateToValid);
        route = `/finance/expenses${params.toString() ? `?${params.toString()}` : ""}`;
      }

      const forWhom = extracted.nameQuery ? ` matching "${extracted.nameQuery}"` : "";
      let message2: string;
      if (total === 0) {
        message2 = `No — I couldn't find any expenses${forWhom}${scopeLabel ? ` ${scopeLabel}` : ""}.`;
      } else {
        const lines = expenses.slice(0, 10).map((e: any) => {
          const empName = e.employeeId?.name || "Unknown employee";
          return `- ${e.description} — ${empName} — ${formatCurrency(e.total)} — ${String(e.status).replace(/_/g, " ")} — ${formatDate(e.expenseDate)}`;
        });
        const more = total > 10 ? `\n\n…and ${total - 10} more.` : "";
        const openNote = route ? "\n\nOpening the filtered list for you now." : "";
        message2 = `Yes — found **${total}** expense${total === 1 ? "" : "s"}${forWhom}${scopeLabel ? ` ${scopeLabel}` : ""}, totaling ${formatCurrency(sumAmount)}:\n\n${lines.join("\n")}${more}${openNote}`;
      }

      return NextResponse.json({ success: true, handled: true, message: message2, route });
    }

    if (extracted.entity === "purchase_order") {
      const query: any = { tenantId };
      let matchedVendorId: string | undefined;
      let matchedVendorName: string | undefined;
      if (extracted.nameQuery) {
        const rx = { $regex: escapeRegex(extracted.nameQuery), $options: "i" };
        const vendor: any = await Customer.findOne(
          { tenantId, $or: [{ "header.name": rx }, { "header.displayName": rx }, { "header.companyName": rx }] },
          "_id header",
        ).lean();
        if (vendor) {
          matchedVendorId = String(vendor._id);
          matchedVendorName = customerDisplayName(vendor);
          query.partnerId = new mongoose.Types.ObjectId(matchedVendorId);
        } else {
          query.name = { $regex: escapeRegex(extracted.nameQuery), $options: "i" };
        }
      }
      const poDateRange = dateRangeFilter(dateFromValid, dateToValid);
      if (poDateRange) query.dateOrder = poDateRange;
      if (extracted.status && (DOCUMENT_STATUS_VALUES as readonly string[]).includes(extracted.status)) {
        query.status = extracted.status;
      }
      const poAmountRange = amountRangeFilter(extracted.amountMin, extracted.amountMax);
      if (poAmountRange) query["totals.amountTotal"] = poAmountRange;

      const [total, orders] = await Promise.all([
        PurchaseOrder.countDocuments(query),
        (PurchaseOrder as any).find(query).populate("partnerId", "header").sort({ dateOrder: -1, createdAt: -1 }).limit(10).lean(),
      ]);
      const totalAgg = total > 0 ? await PurchaseOrder.aggregate([{ $match: query }, { $group: { _id: null, sum: { $sum: "$totals.amountTotal" } } }]) : [];
      const sumAmount = totalAgg[0]?.sum || 0;

      let route: string | undefined;
      if (extracted.wantsToOpen) {
        const params = new URLSearchParams();
        if (extracted.nameQuery) params.set("search", extracted.nameQuery);
        if (dateFromValid) params.set("dateFrom", dateFromValid);
        if (dateToValid) params.set("dateTo", dateToValid);
        // Only echo a status the query above actually applied.
        if (extracted.status && (DOCUMENT_STATUS_VALUES as readonly string[]).includes(extracted.status)) params.set("status", extracted.status);
        route = `/finance/purchase-orders${params.toString() ? `?${params.toString()}` : ""}`;
      }

      const forWhom = matchedVendorName ? ` from **${matchedVendorName}**` : extracted.nameQuery ? ` matching "${extracted.nameQuery}"` : "";
      let message2: string;
      if (total === 0) {
        message2 = `No — I couldn't find any purchase orders${forWhom}${scopeLabel ? ` ${scopeLabel}` : ""}.`;
      } else {
        const lines = orders.slice(0, 10).map((o: any) => {
          const vendorName = o.partnerId ? customerDisplayName(o.partnerId) : "Unknown vendor";
          return `- ${o.name} — ${vendorName} — ${formatCurrency(o.totals?.amountTotal || 0)} — ${String(o.status).replace(/_/g, " ")} — ${formatDate(o.dateOrder)}`;
        });
        const more = total > 10 ? `\n\n…and ${total - 10} more.` : "";
        const openNote = route ? "\n\nOpening the filtered list for you now." : "";
        message2 = `Yes — found **${total}** purchase order${total === 1 ? "" : "s"}${forWhom}${scopeLabel ? ` ${scopeLabel}` : ""}, totaling ${formatCurrency(sumAmount)}:\n\n${lines.join("\n")}${more}${openNote}`;
      }

      return NextResponse.json({ success: true, handled: true, message: message2, route });
    }

    if (extracted.entity === "inventory_delivery" || extracted.entity === "inventory_receipt") {
      // Both deliveries (outgoing) and receipts (incoming) are StockTransfer
      // documents distinguished only by header.operationType — mirrors
      // /api/inventory/operations/transfers's own ?type= filter.
      const operationType = extracted.entity === "inventory_delivery" ? "outgoing" : "incoming";
      const label = extracted.entity === "inventory_delivery" ? "delivery" : "receipt";
      const routeBase = extracted.entity === "inventory_delivery" ? "/inventory/operations/deliveries" : "/inventory/operations/receipts";
      const query: any = { tenantId, "header.operationType": operationType };
      let matchedPartnerId: string | undefined;
      let matchedPartnerName: string | undefined;
      if (extracted.nameQuery) {
        const rx = { $regex: escapeRegex(extracted.nameQuery), $options: "i" };
        const partner: any = await Customer.findOne(
          { tenantId, $or: [{ "header.name": rx }, { "header.displayName": rx }, { "header.companyName": rx }] },
          "_id header",
        ).lean();
        if (partner) {
          matchedPartnerId = String(partner._id);
          matchedPartnerName = customerDisplayName(partner);
          query["header.partnerId"] = new mongoose.Types.ObjectId(matchedPartnerId);
        } else {
          query["header.name"] = { $regex: escapeRegex(extracted.nameQuery), $options: "i" };
        }
      }
      const transferDateRange = dateRangeFilter(dateFromValid, dateToValid);
      if (transferDateRange) query["header.scheduledDate"] = transferDateRange;
      if (extracted.status && (DOCUMENT_STATUS_VALUES as readonly string[]).includes(extracted.status)) {
        query.status = extracted.status;
      }

      const [total, transfers] = await Promise.all([
        StockTransfer.countDocuments(query),
        (StockTransfer as any).find(query).populate("header.partnerId", "header").sort({ "header.scheduledDate": -1, createdAt: -1 }).limit(10).lean(),
      ]);

      let route: string | undefined;
      if (extracted.wantsToOpen) {
        const params = new URLSearchParams();
        if (extracted.nameQuery) params.set("search", extracted.nameQuery);
        if (dateFromValid) params.set("dateFrom", dateFromValid);
        if (dateToValid) params.set("dateTo", dateToValid);
        // Only echo a status the query above actually applied.
        if (extracted.status && (DOCUMENT_STATUS_VALUES as readonly string[]).includes(extracted.status)) params.set("status", extracted.status);
        route = `${routeBase}${params.toString() ? `?${params.toString()}` : ""}`;
      }

      const forWhom = matchedPartnerName ? ` for **${matchedPartnerName}**` : extracted.nameQuery ? ` matching "${extracted.nameQuery}"` : "";
      let message2: string;
      if (total === 0) {
        message2 = `No — I couldn't find any ${label}s${forWhom}${rangeLabel ? ` ${rangeLabel}` : ""}.`;
      } else {
        const lines = transfers.slice(0, 10).map((t: any) => {
          const partnerName = t.header?.partnerId ? customerDisplayName(t.header.partnerId) : "—";
          return `- ${t.header?.name} — ${partnerName} — ${String(t.status).replace(/_/g, " ")} — scheduled ${formatDate(t.header?.scheduledDate)}`;
        });
        const more = total > 10 ? `\n\n…and ${total - 10} more.` : "";
        const openNote = route ? "\n\nOpening the filtered list for you now." : "";
        message2 = `Yes — found **${total}** ${label}${total === 1 ? "" : "s"}${forWhom}${rangeLabel ? ` ${rangeLabel}` : ""}:\n\n${lines.join("\n")}${more}${openNote}`;
      }

      return NextResponse.json({ success: true, handled: true, message: message2, route });
    }

    if (extracted.entity === "manufacturing_order") {
      const query: any = { tenantId };
      if (extracted.nameQuery) {
        query["header.name"] = { $regex: escapeRegex(extracted.nameQuery), $options: "i" };
      }
      const moDateRange = dateRangeFilter(dateFromValid, dateToValid);
      if (moDateRange) query["header.scheduledDate"] = moDateRange;
      if (extracted.status && (PRODUCTION_STATUS_VALUES as readonly string[]).includes(extracted.status)) {
        query.productionStatus = extracted.status;
      } else if (extracted.status && (DOCUMENT_STATUS_VALUES as readonly string[]).includes(extracted.status)) {
        query.status = extracted.status;
      }

      const [total, orders] = await Promise.all([
        ManufacturingOrder.countDocuments(query),
        (ManufacturingOrder as any).find(query).sort({ "header.scheduledDate": -1, createdAt: -1 }).limit(10).lean(),
      ]);

      let route: string | undefined;
      if (extracted.wantsToOpen) {
        const params = new URLSearchParams();
        if (extracted.nameQuery) params.set("search", extracted.nameQuery);
        if (dateFromValid) params.set("dateFrom", dateFromValid);
        if (dateToValid) params.set("dateTo", dateToValid);
        if (extracted.status && (PRODUCTION_STATUS_VALUES as readonly string[]).includes(extracted.status)) {
          params.set("productionStatus", extracted.status);
        }
        route = `/inventory/operations/manufacturing${params.toString() ? `?${params.toString()}` : ""}`;
      }

      const forWhom = extracted.nameQuery ? ` matching "${extracted.nameQuery}"` : "";
      let message2: string;
      if (total === 0) {
        message2 = `No — I couldn't find any manufacturing orders${forWhom}${rangeLabel ? ` ${rangeLabel}` : ""}.`;
      } else {
        const lines = orders.slice(0, 10).map((o: any) => {
          return `- ${o.header?.name} — qty ${o.header?.quantity ?? "—"} — ${String(o.productionStatus).replace(/_/g, " ")} — scheduled ${formatDate(o.header?.scheduledDate)}`;
        });
        const more = total > 10 ? `\n\n…and ${total - 10} more.` : "";
        const openNote = route ? "\n\nOpening the filtered list for you now." : "";
        message2 = `Yes — found **${total}** manufacturing order${total === 1 ? "" : "s"}${forWhom}${rangeLabel ? ` ${rangeLabel}` : ""}:\n\n${lines.join("\n")}${more}${openNote}`;
      }

      return NextResponse.json({ success: true, handled: true, message: message2, route });
    }

    if (extracted.entity === "batch") {
      const query: any = { tenantId };
      if (extracted.nameQuery) {
        const rx = { $regex: escapeRegex(extracted.nameQuery), $options: "i" };
        query.$or = [{ batchNumber: rx }, { itemCode: rx }];
      }
      const batchDateRange = dateRangeFilter(dateFromValid, dateToValid);
      if (batchDateRange) query.manufactureDate = batchDateRange;
      if (extracted.status && (BATCH_STATUS_VALUES as readonly string[]).includes(extracted.status)) {
        query.status = extracted.status;
      }

      const [total, batches] = await Promise.all([
        Batch.countDocuments(query),
        (Batch as any).find(query).sort({ manufactureDate: -1, createdAt: -1 }).limit(10).lean(),
      ]);

      let route: string | undefined;
      if (extracted.wantsToOpen) {
        const params = new URLSearchParams();
        if (extracted.nameQuery) params.set("search", extracted.nameQuery);
        if (dateFromValid) params.set("dateFrom", dateFromValid);
        if (dateToValid) params.set("dateTo", dateToValid);
        // Only echo a status the query above actually applied.
        if (extracted.status && (BATCH_STATUS_VALUES as readonly string[]).includes(extracted.status)) params.set("status", extracted.status);
        route = `/inventory/batch${params.toString() ? `?${params.toString()}` : ""}`;
      }

      const forWhom = extracted.nameQuery ? ` matching "${extracted.nameQuery}"` : "";
      let message2: string;
      if (total === 0) {
        message2 = `No — I couldn't find any batches${forWhom}${rangeLabel ? ` ${rangeLabel}` : ""}.`;
      } else {
        const lines = batches.slice(0, 10).map((b: any) => {
          return `- ${b.batchNumber} — ${b.itemCode} — ${String(b.status).replace(/_/g, " ")} — manufactured ${formatDate(b.manufactureDate)}`;
        });
        const more = total > 10 ? `\n\n…and ${total - 10} more.` : "";
        const openNote = route ? "\n\nOpening the filtered list for you now." : "";
        message2 = `Yes — found **${total}** batch${total === 1 ? "" : "es"}${forWhom}${rangeLabel ? ` ${rangeLabel}` : ""}:\n\n${lines.join("\n")}${more}${openNote}`;
      }

      return NextResponse.json({ success: true, handled: true, message: message2, route });
    }

    if (extracted.entity === "crm_lead") {
      const query: any = { tenantId };
      if (extracted.nameQuery) {
        const rx = { $regex: escapeRegex(extracted.nameQuery), $options: "i" };
        query.$or = [{ lead_name: rx }, { company_name: rx }, { email: rx }, { phone: rx }];
      }
      const leadDateRange = dateRangeFilter(dateFromValid, dateToValid);
      if (leadDateRange) query.createdAt = leadDateRange;
      const LEAD_STATUS_VALUES = ["New", "Attempting Contact", "Connected", "Qualified", "Nurture", "Disqualified", "Converted"];
      const matchedLeadStatus = matchStatus(extracted.status, LEAD_STATUS_VALUES);
      if (matchedLeadStatus) {
        query.status = matchedLeadStatus;
      }

      const [total, leads] = await Promise.all([
        CrmLead.countDocuments(query),
        (CrmLead as any).find(query).sort({ createdAt: -1 }).limit(10).lean(),
      ]);

      let route: string | undefined;
      if (extracted.wantsToOpen) {
        const params = new URLSearchParams();
        if (extracted.nameQuery) params.set("search", extracted.nameQuery);
        if (dateFromValid) params.set("dateFrom", dateFromValid);
        if (dateToValid) params.set("dateTo", dateToValid);
        route = `/crm/leads${params.toString() ? `?${params.toString()}` : ""}`;
      }

      const forWhom = extracted.nameQuery ? ` matching "${extracted.nameQuery}"` : "";
      let message2: string;
      if (total === 0) {
        message2 = `No — I couldn't find any leads${forWhom}${rangeLabel ? ` ${rangeLabel}` : ""}.`;
      } else {
        const lines = leads.slice(0, 10).map((l: any) => {
          return `- ${l.lead_name}${l.company_name ? ` — ${l.company_name}` : ""} — ${l.status} — created ${formatDate(l.createdAt)}`;
        });
        const more = total > 10 ? `\n\n…and ${total - 10} more.` : "";
        const openNote = route ? "\n\nOpening the filtered list for you now." : "";
        message2 = `Yes — found **${total}** lead${total === 1 ? "" : "s"}${forWhom}${rangeLabel ? ` ${rangeLabel}` : ""}:\n\n${lines.join("\n")}${more}${openNote}`;
      }

      return NextResponse.json({ success: true, handled: true, message: message2, route });
    }

    if (extracted.entity === "crm_opportunity") {
      const query: any = { tenantId };
      let matchedAccountId: string | undefined;
      let matchedAccountName: string | undefined;
      if (extracted.nameQuery) {
        const rx = { $regex: escapeRegex(extracted.nameQuery), $options: "i" };
        const account: any = await CrmAccount.findOne({ tenantId, company_name: rx }, "_id company_name").lean();
        if (account) {
          matchedAccountId = String(account._id);
          matchedAccountName = account.company_name;
          query.account_id = new mongoose.Types.ObjectId(matchedAccountId);
        } else {
          query.$or = [{ name: rx }, { deal_name: rx }];
        }
      }
      const oppDateRange = dateRangeFilter(dateFromValid, dateToValid);
      if (oppDateRange) query.expected_close_date = oppDateRange;
      const STAGE_VALUES = ["Prospecting", "Discovery", "Requirement Gathering", "Solution Fit", "Proposal Sent", "Negotiation", "Approval", "Closed Won", "Closed Lost"];
      const matchedStage = matchStatus(extracted.status, STAGE_VALUES);
      if (matchedStage) {
        query.stage = matchedStage;
      }

      const [total, opportunities] = await Promise.all([
        CrmOpportunity.countDocuments(query),
        (CrmOpportunity as any).find(query).populate("account_id", "company_name").sort({ expected_close_date: -1, createdAt: -1 }).limit(10).lean(),
      ]);

      let route: string | undefined;
      if (extracted.wantsToOpen) {
        const params = new URLSearchParams();
        if (extracted.nameQuery) params.set("search", extracted.nameQuery);
        // Only echo a stage the query above actually applied.
        if (matchedStage) params.set("stage", matchedStage);
        route = `/crm/opportunities${params.toString() ? `?${params.toString()}` : ""}`;
      }

      const forWhom = matchedAccountName ? ` for **${matchedAccountName}**` : extracted.nameQuery ? ` matching "${extracted.nameQuery}"` : "";
      let message2: string;
      if (total === 0) {
        message2 = `No — I couldn't find any opportunities${forWhom}${rangeLabel ? ` ${rangeLabel}` : ""}.`;
      } else {
        const lines = opportunities.slice(0, 10).map((o: any) => {
          const acctName = o.account_id?.company_name || "Unknown account";
          return `- ${o.deal_name || o.name} — ${acctName} — ${o.stage} — closing ${formatDate(o.expected_close_date)}`;
        });
        const more = total > 10 ? `\n\n…and ${total - 10} more.` : "";
        const openNote = route ? "\n\nOpening the filtered list for you now." : "";
        message2 = `Yes — found **${total}** opportunit${total === 1 ? "y" : "ies"}${forWhom}${rangeLabel ? ` ${rangeLabel}` : ""}:\n\n${lines.join("\n")}${more}${openNote}`;
      }

      return NextResponse.json({ success: true, handled: true, message: message2, route });
    }

    if (extracted.entity === "crm_case") {
      const query: any = { tenantId };
      if (extracted.nameQuery) {
        const rx = { $regex: escapeRegex(extracted.nameQuery), $options: "i" };
        query.$or = [{ title: rx }, { case_number: rx }, { description: rx }];
      }
      const caseDateRange = dateRangeFilter(dateFromValid, dateToValid);
      if (caseDateRange) query.createdAt = caseDateRange;
      const CASE_STATUS_VALUES = ["New", "Open", "In Progress", "Waiting on Customer", "Waiting on Internal Team", "Resolved", "Closed", "Reopened"];
      const matchedCaseStatus = matchStatus(extracted.status, CASE_STATUS_VALUES);
      if (matchedCaseStatus) {
        query.status = matchedCaseStatus;
      }

      const [total, cases] = await Promise.all([
        CrmCase.countDocuments(query),
        (CrmCase as any).find(query).populate("account_id", "company_name").sort({ createdAt: -1 }).limit(10).lean(),
      ]);

      let route: string | undefined;
      if (extracted.wantsToOpen) {
        const params = new URLSearchParams();
        if (extracted.nameQuery) params.set("search", extracted.nameQuery);
        if (dateFromValid) params.set("dateFrom", dateFromValid);
        if (dateToValid) params.set("dateTo", dateToValid);
        if (matchedCaseStatus) params.set("status", matchedCaseStatus);
        route = `/crm/cases${params.toString() ? `?${params.toString()}` : ""}`;
      }

      const forWhom = extracted.nameQuery ? ` matching "${extracted.nameQuery}"` : "";
      let message2: string;
      if (total === 0) {
        message2 = `No — I couldn't find any cases${forWhom}${rangeLabel ? ` ${rangeLabel}` : ""}.`;
      } else {
        const lines = cases.slice(0, 10).map((c: any) => {
          const acctName = c.account_id?.company_name || "Unknown account";
          return `- ${c.case_number} — ${c.title} — ${acctName} — ${c.status} — created ${formatDate(c.createdAt)}`;
        });
        const more = total > 10 ? `\n\n…and ${total - 10} more.` : "";
        const openNote = route ? "\n\nOpening the filtered list for you now." : "";
        message2 = `Yes — found **${total}** case${total === 1 ? "" : "s"}${forWhom}${rangeLabel ? ` ${rangeLabel}` : ""}:\n\n${lines.join("\n")}${more}${openNote}`;
      }

      return NextResponse.json({ success: true, handled: true, message: message2, route });
    }

    if (extracted.entity === "crm_campaign") {
      const query: any = { tenantId };
      if (extracted.nameQuery) {
        const rx = { $regex: escapeRegex(extracted.nameQuery), $options: "i" };
        query.$or = [{ campaign_name: rx }, { campaign_code: rx }];
      }
      // A campaign spans [start_date, end_date] — "within this window" means
      // the two ranges overlap, including open-ended campaigns with no
      // end_date set.
      const overlapConditions: any[] = [];
      if (dateFromValid) {
        overlapConditions.push({ $or: [{ end_date: { $gte: new Date(dateFromValid) } }, { end_date: { $exists: false } }] });
      }
      if (dateToValid) {
        const end = new Date(dateToValid);
        end.setHours(23, 59, 59, 999);
        overlapConditions.push({ start_date: { $lte: end } });
      }
      if (overlapConditions.length > 0) query.$and = overlapConditions;
      const CAMPAIGN_STATUS_VALUES = ["Draft", "Planned", "Active", "Paused", "Completed", "Archived"];
      const matchedCampaignStatus = matchStatus(extracted.status, CAMPAIGN_STATUS_VALUES);
      if (matchedCampaignStatus) {
        query.status = matchedCampaignStatus;
      }

      const [total, campaigns] = await Promise.all([
        CrmCampaign.countDocuments(query),
        (CrmCampaign as any).find(query).sort({ createdAt: -1 }).limit(10).lean(),
      ]);

      let route: string | undefined;
      if (extracted.wantsToOpen) {
        const params = new URLSearchParams();
        if (extracted.nameQuery) params.set("search", extracted.nameQuery);
        if (dateFromValid) params.set("dateFrom", dateFromValid);
        if (dateToValid) params.set("dateTo", dateToValid);
        // Only echo a status the query above actually applied.
        if (matchedCampaignStatus) params.set("status", matchedCampaignStatus);
        route = `/crm/campaigns${params.toString() ? `?${params.toString()}` : ""}`;
      }

      const forWhom = extracted.nameQuery ? ` matching "${extracted.nameQuery}"` : "";
      let message2: string;
      if (total === 0) {
        message2 = `No — I couldn't find any campaigns${forWhom}${rangeLabel ? ` ${rangeLabel}` : ""}.`;
      } else {
        const lines = campaigns.slice(0, 10).map((c: any) => {
          return `- ${c.campaign_name} — ${c.status} — ${formatDate(c.start_date)} to ${c.end_date ? formatDate(c.end_date) : "ongoing"}`;
        });
        const more = total > 10 ? `\n\n…and ${total - 10} more.` : "";
        const openNote = route ? "\n\nOpening the filtered list for you now." : "";
        message2 = `Yes — found **${total}** campaign${total === 1 ? "" : "s"}${forWhom}${rangeLabel ? ` ${rangeLabel}` : ""}:\n\n${lines.join("\n")}${more}${openNote}`;
      }

      return NextResponse.json({ success: true, handled: true, message: message2, route });
    }

    if (extracted.entity === "crm_contract") {
      const query: any = { tenantId };
      let matchedAccountId: string | undefined;
      let matchedAccountName: string | undefined;
      if (extracted.nameQuery) {
        const rx = { $regex: escapeRegex(extracted.nameQuery), $options: "i" };
        const account: any = await CrmAccount.findOne({ tenantId, company_name: rx }, "_id company_name").lean();
        if (account) {
          matchedAccountId = String(account._id);
          matchedAccountName = account.company_name;
          query.account_id = new mongoose.Types.ObjectId(matchedAccountId);
        } else {
          query.contract_number = rx;
        }
      }
      // A contract spans [start_date, end_date] — "within this window" means
      // the two ranges overlap.
      if (dateFromValid) query.end_date = { $gte: new Date(dateFromValid) };
      if (dateToValid) {
        const end = new Date(dateToValid);
        end.setHours(23, 59, 59, 999);
        query.start_date = { $lte: end };
      }
      const CONTRACT_STATUS_VALUES = ["Draft", "Active", "Renewal Due", "Expiring", "Expired", "Terminated", "Cancelled"];
      const matchedContractStatus = matchStatus(extracted.status, CONTRACT_STATUS_VALUES);
      if (matchedContractStatus) query.status = matchedContractStatus;

      const [total, contracts] = await Promise.all([
        CrmContract.countDocuments(query),
        (CrmContract as any).find(query).populate("account_id", "company_name").sort({ end_date: 1, createdAt: -1 }).limit(10).lean(),
      ]);

      let route: string | undefined;
      if (extracted.wantsToOpen) {
        const params = new URLSearchParams();
        if (extracted.nameQuery) params.set("search", extracted.nameQuery);
        if (dateFromValid) params.set("dateFrom", dateFromValid);
        if (dateToValid) params.set("dateTo", dateToValid);
        if (matchedContractStatus) params.set("status", matchedContractStatus);
        route = `/crm/contracts${params.toString() ? `?${params.toString()}` : ""}`;
      }

      const forWhom = matchedAccountName ? ` for **${matchedAccountName}**` : extracted.nameQuery ? ` matching "${extracted.nameQuery}"` : "";
      let message2: string;
      if (total === 0) {
        message2 = `No — I couldn't find any contracts${forWhom}${rangeLabel ? ` ${rangeLabel}` : ""}.`;
      } else {
        const lines = contracts.slice(0, 10).map((c: any) => {
          const acctName = c.account_id?.company_name || "Unknown account";
          return `- ${c.contract_number} — ${acctName} — ${c.status} — ${formatDate(c.start_date)} to ${formatDate(c.end_date)}`;
        });
        const more = total > 10 ? `\n\n…and ${total - 10} more.` : "";
        const openNote = route ? "\n\nOpening the filtered list for you now." : "";
        message2 = `Yes — found **${total}** contract${total === 1 ? "" : "s"}${forWhom}${rangeLabel ? ` ${rangeLabel}` : ""}:\n\n${lines.join("\n")}${more}${openNote}`;
      }

      return NextResponse.json({ success: true, handled: true, message: message2, route });
    }

    if (extracted.entity === "admin_user") {
      const query: any = { tenantId };
      if (extracted.nameQuery) {
        const rx = { $regex: escapeRegex(extracted.nameQuery), $options: "i" };
        query.$or = [{ name: rx }, { email: rx }];
      }
      const userDateRange = dateRangeFilter(dateFromValid, dateToValid);
      if (userDateRange) query.createdAt = userDateRange;
      if (extracted.status && ["active", "inactive"].includes(extracted.status)) {
        query.status = extracted.status;
      }

      const [total, users] = await Promise.all([
        AdminUser.countDocuments(query),
        (AdminUser as any).find(query).select("-password").sort({ createdAt: -1 }).limit(10).lean(),
      ]);

      let route: string | undefined;
      if (extracted.wantsToOpen) {
        const params = new URLSearchParams();
        if (extracted.nameQuery) params.set("search", extracted.nameQuery);
        if (dateFromValid) params.set("dateFrom", dateFromValid);
        if (dateToValid) params.set("dateTo", dateToValid);
        // Only echo a status the query above actually applied.
        if (extracted.status && ["active", "inactive"].includes(extracted.status)) params.set("status", extracted.status);
        route = `/admin/users${params.toString() ? `?${params.toString()}` : ""}`;
      }

      const forWhom = extracted.nameQuery ? ` matching "${extracted.nameQuery}"` : "";
      let message2: string;
      if (total === 0) {
        message2 = `No — I couldn't find any users${forWhom}${rangeLabel ? ` ${rangeLabel}` : ""}.`;
      } else {
        const lines = users.slice(0, 10).map((u: any) => {
          return `- ${u.name} — ${u.email} — ${u.role} — ${u.status} — joined ${formatDate(u.createdAt)}`;
        });
        const more = total > 10 ? `\n\n…and ${total - 10} more.` : "";
        const openNote = route ? "\n\nOpening the filtered list for you now." : "";
        message2 = `Yes — found **${total}** user${total === 1 ? "" : "s"}${forWhom}${rangeLabel ? ` ${rangeLabel}` : ""}:\n\n${lines.join("\n")}${more}${openNote}`;
      }

      return NextResponse.json({ success: true, handled: true, message: message2, route });
    }

    if (extracted.entity === "admin_task") {
      const query: any = { tenantId };
      if (extracted.nameQuery) {
        const rx = { $regex: escapeRegex(extracted.nameQuery), $options: "i" };
        query.$or = [{ title: rx }, { description: rx }];
      }
      const taskDateRange = dateRangeFilter(dateFromValid, dateToValid);
      if (taskDateRange) query.dueDate = taskDateRange;
      const TASK_STATUS_VALUES = ["todo", "in_progress", "review", "done"];
      if (extracted.status && TASK_STATUS_VALUES.includes(extracted.status)) {
        query.status = extracted.status;
      }

      const [total, tasks] = await Promise.all([
        AdminTask.countDocuments(query),
        (AdminTask as any).find(query).populate("assignee", "name email").sort({ createdAt: -1 }).limit(10).lean(),
      ]);

      let route: string | undefined;
      if (extracted.wantsToOpen) {
        const params = new URLSearchParams();
        if (extracted.nameQuery) params.set("search", extracted.nameQuery);
        if (dateFromValid) params.set("dateFrom", dateFromValid);
        if (dateToValid) params.set("dateTo", dateToValid);
        route = `/admin/tasks${params.toString() ? `?${params.toString()}` : ""}`;
      }

      const forWhom = extracted.nameQuery ? ` matching "${extracted.nameQuery}"` : "";
      let message2: string;
      if (total === 0) {
        message2 = `No — I couldn't find any tasks${forWhom}${rangeLabel ? ` ${rangeLabel}` : ""}.`;
      } else {
        const lines = tasks.slice(0, 10).map((t: any) => {
          const assigneeName = t.assignee?.name || "Unassigned";
          return `- ${t.title} — ${assigneeName} — ${String(t.status).replace(/_/g, " ")}${t.dueDate ? ` — due ${formatDate(t.dueDate)}` : ""}`;
        });
        const more = total > 10 ? `\n\n…and ${total - 10} more.` : "";
        const openNote = route ? "\n\nOpening the filtered list for you now." : "";
        message2 = `Yes — found **${total}** task${total === 1 ? "" : "s"}${forWhom}${rangeLabel ? ` ${rangeLabel}` : ""}:\n\n${lines.join("\n")}${more}${openNote}`;
      }

      return NextResponse.json({ success: true, handled: true, message: message2, route });
    }

    if (extracted.entity === "activity_log") {
      // The real /api/activity-logs route restricts to admin/master-admin —
      // mirror that here so this lookup never surfaces org-wide activity to
      // a role that couldn't see it by visiting the real page.
      const role = (session.user as any).role;
      if (!["admin", "master-admin"].includes(role)) {
        return NextResponse.json({ success: true, handled: false });
      }

      const query: any = { tenantId };
      if (extracted.nameQuery) {
        const rx = { $regex: escapeRegex(extracted.nameQuery), $options: "i" };
        query.$or = [{ userName: rx }, { userEmail: rx }, { activity: rx }];
      }
      const logDateRange = dateRangeFilter(dateFromValid, dateToValid);
      if (logDateRange) query.timestamp = logDateRange;

      const [total, logs] = await Promise.all([
        AdminActivityLog.countDocuments(query),
        (AdminActivityLog as any).find(query).sort({ timestamp: -1 }).limit(10).lean(),
      ]);

      let route: string | undefined;
      if (extracted.wantsToOpen) {
        const params = new URLSearchParams();
        if (dateFromValid) params.set("dateFrom", dateFromValid);
        if (dateToValid) params.set("dateTo", dateToValid);
        route = `/admin/activity-logs${params.toString() ? `?${params.toString()}` : ""}`;
      }

      const forWhom = extracted.nameQuery ? ` matching "${extracted.nameQuery}"` : "";
      let message2: string;
      if (total === 0) {
        message2 = `No — I couldn't find any activity log entries${forWhom}${rangeLabel ? ` ${rangeLabel}` : ""}.`;
      } else {
        const lines = logs.slice(0, 10).map((l: any) => {
          return `- ${l.userName} — ${l.activity} — ${formatDate(l.timestamp)}`;
        });
        const more = total > 10 ? `\n\n…and ${total - 10} more.` : "";
        const openNote = route ? "\n\nOpening the filtered list for you now." : "";
        message2 = `Yes — found **${total}** activity log entr${total === 1 ? "y" : "ies"}${forWhom}${rangeLabel ? ` ${rangeLabel}` : ""}:\n\n${lines.join("\n")}${more}${openNote}`;
      }

      return NextResponse.json({ success: true, handled: true, message: message2, route });
    }

    return NextResponse.json({ success: true, handled: false });
  } catch (error) {
    console.error("Sales AI memory-query error:", error);
    return NextResponse.json({ success: true, handled: false });
  }
}
