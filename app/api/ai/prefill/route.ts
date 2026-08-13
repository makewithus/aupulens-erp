import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { resolveTenantAiSettings, callClaudeForTenant } from "@/lib/ai/tenantAi";
import { extractAttachment } from "@/lib/ai/extractFile";
import connectDB from "@/lib/db";
import Customer from "@/models/Customer";
import CrmAccount from "@/models/crm/Account";
import CrmOpportunity from "@/models/crm/Opportunity";
import Product from "@/models/Product";
import Account from "@/models/Account";
import AccountType from "@/models/AccountType";

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * AI form pre-fill extractor.
 *
 * Given a natural-language instruction and/or attached image(s), extract the
 * fields needed to pre-fill a real create form, plus short data-quality
 * suggestions. This does NOT write anything — the client stashes the result and
 * navigates to the actual form, where the user reviews and clicks Create.
 *
 * To add a new entity: add an entry to TARGETS with its route + field spec, and
 * make that page consume the prefill (lib/ai/aiPrefill.ts `consumePrefill`).
 */
const TARGETS: Record<string, { route: string; label: string; spec: string }> = {
  lead: {
    route: "/crm/leads",
    label: "CRM lead",
    spec: `Fields (JSON keys): lead_name (the person's name — REQUIRED), company_name, email, phone, source, priority, industry, location, notes, next_followup_date.
- "source" MUST be exactly one of: Organic Search, Paid Ads, Referral, Event, Social Media, Direct Website, Outbound Calling, Partner Channel, Repeat Customer, Website Form, WhatsApp, Email Import, CSV Import, Chatbot, Manual Entry, Other. If the source isn't clear, use "Manual Entry".
- "priority" MUST be exactly one of: Low, Medium, High. Default to "Medium".
- "next_followup_date" as YYYY-MM-DD (convert any date format you see).`,
  },
  customer: {
    route: "/sales/customers/new",
    label: "customer",
    spec: `Fields (JSON keys): name (the customer or company name — REQUIRED), is_company (boolean: true for a business, false for an individual), salutation, companyName, firstName, lastName, email, phone, mobile, gstin, pan, currency.
- If it's clearly a company, set is_company=true and put the company name in both "name" and "companyName". If it's an individual, set is_company=false and fill firstName/lastName.
- "gstin" is a 15-character Indian GST number (uppercase). "pan" is a 10-character Indian PAN (uppercase).
- "currency" defaults to "INR" if not stated.`,
  },
  employee: {
    route: "/hr/employees",
    label: "employee",
    spec: `Fields (JSON keys): firstName (REQUIRED), lastName (REQUIRED), email (REQUIRED), phone (REQUIRED), employeeCode, designation, gender, dateOfJoining, employmentType.
- "gender" MUST be one of: male, female, other (lowercase) — or "".
- "employmentType" MUST be one of: full-time, part-time, contract, intern. Default "full-time".
- "dateOfJoining" as YYYY-MM-DD.`,
  },
  invoice: {
    route: "/sales/invoices/new",
    label: "invoice",
    spec: `Fields (JSON keys): customerName (the bill-to customer/company name — REQUIRED), reference, invoiceDate, dueDate, notes, lineItems.
- "lineItems" is an ARRAY of objects: { name (item name/description — REQUIRED), qty (number, default 1), unitPrice (number, no currency symbol), taxRate (GST percent as a plain number, e.g. 18), hsn }.
- Extract every line item you can find in the document/instruction. Dates as YYYY-MM-DD.`,
  },
  contact: {
    route: "/crm/contacts",
    label: "CRM contact",
    spec: `Fields (JSON keys): first_name (REQUIRED), last_name, email, mobile, designation, department, role_in_buying, preferred_communication.
- Split a full name into first_name + last_name. Keep phone/mobile with country code.
- "role_in_buying" MUST be exactly one of: Decision Maker, Influencer, Finance Contact, Technical Contact, Procurement, Support Contact, Executive Sponsor, End User — or "" if unclear.
- "preferred_communication" MUST be exactly one of: Email, Phone, WhatsApp, Meeting — or "" if unclear. Never guess.`,
  },
  account: {
    route: "/crm/accounts",
    label: "CRM account (company)",
    spec: `Fields (JSON keys): company_name (REQUIRED), website, industry.`,
  },
  case: {
    route: "/crm/cases",
    label: "support case",
    spec: `Fields (JSON keys): title (REQUIRED), description, category, subcategory, severity, status.
- "severity" one of: Low, Medium, High (default Low). "status" default "New".`,
  },
  project: {
    route: "/projects",
    label: "project",
    spec: `Fields (JSON keys): name (REQUIRED), description, status, priority, dueDate.
- "priority" one of: Low, Medium, High (default Medium). "dueDate" as YYYY-MM-DD.`,
  },
  opportunity: {
    route: "/crm/opportunities",
    label: "sales opportunity/deal",
    spec: `Fields (JSON keys): deal_name (REQUIRED), amount, expected_close_date, stage, priority, forecast_category, source, product_service_line, next_action.
- "amount" as a plain number. "expected_close_date" as YYYY-MM-DD. "priority" one of Low/Medium/High.
- "stage" MUST be exactly one of: Prospecting, Discovery, Requirement Gathering, Solution Fit, Proposal Sent, Negotiation, Approval, Closed Won, Closed Lost. Map any similar phrase to the closest of these (e.g. a "proposal"/"price quote" stage → "Proposal Sent"). If unclear, use "Prospecting".
- "forecast_category" MUST be exactly one of: Omitted, Pipeline, Best Case, Commit, Closed — or "" if unclear.`,
  },
  quote: {
    route: "/crm/quotes/new",
    label: "sales quote",
    spec: `Fields (JSON keys): quote_number, account_name (the customer/company the quote is FOR), opportunity_name (the deal/opportunity it relates to, if any), validity_date, notes, terms_and_conditions, line_items.
- "line_items" is an ARRAY of objects: { item_name (REQUIRED), description, quantity (number, default 1), unit_price (number, no currency symbol), discount_percent (number 0-100, default 0), tax_percent (GST percent as a plain number, e.g. 18, default 18) }.
- Extract EVERY line item you can find in the document/instruction, in order. "validity_date" as YYYY-MM-DD. Amounts and percents as plain numbers (no ₹, %, or commas).`,
  },
  sales_quote: {
    route: "/sales/quotes/new",
    label: "sales quote",
    spec: `Fields (JSON keys): customer_name (the customer/company the quote is FOR — REQUIRED), reference, quote_date, expiry_date, subject, notes, terms, line_items.
- "line_items" is an ARRAY of objects: { name (REQUIRED), qty (number, default 1), unit_price (number, no symbol), tax_rate (GST percent as a plain number, e.g. 18) }.
- Extract EVERY line item you find. Dates as YYYY-MM-DD. Amounts/percents as plain numbers.`,
  },
  sales_order: {
    route: "/sales/sales-orders/new",
    label: "sales order",
    spec: `Fields (JSON keys): customer_name (the customer/company the order is FOR — REQUIRED), reference_number, order_date, expected_shipment_date, payment_terms, notes, terms, line_items.
- "line_items" is an ARRAY of objects: { name (REQUIRED), qty (number, default 1), unit_price (number, no currency symbol), tax_rate (GST percent as a plain number, e.g. 18), hsn }.
- Extract EVERY line item you find. Dates as YYYY-MM-DD. Amounts/percents as plain numbers.`,
  },
  subscription: {
    route: "/sales/subscriptions/new",
    label: "subscription",
    spec: `Fields (JSON keys): customer_name (the customer/company — REQUIRED), plan_name, reference, start_date, trial_days (number), billing_frequency, notes, terms, line_items.
- "billing_frequency" MUST be one of: Daily, Weekly, Monthly, Quarterly, Yearly — default "Monthly".
- "line_items" is an ARRAY: { name (REQUIRED), qty (number, default 1), unit_price (number, no symbol), tax_rate (GST percent number, e.g. 18) }.
- Dates as YYYY-MM-DD. Amounts/percents as plain numbers.`,
  },
  payment: {
    route: "/sales/payments/new",
    label: "payment",
    spec: `Fields (JSON keys): customer_name (the customer who paid — REQUIRED), amount_received (number), bank_charges (number), payment_date, payment_mode, reference.
- "payment_mode" e.g. Cash, Bank Transfer, UPI, Cheque, Card. Dates as YYYY-MM-DD. Amounts as plain numbers.`,
  },
  delivery_challan: {
    route: "/sales/delivery-challans",
    label: "delivery challan",
    spec: `Fields (JSON keys): customer_name (REQUIRED), customer_email, delivery_address, vehicle_number, driver_name, delivery_date, notes, items.
- "items" is an ARRAY: { description (REQUIRED), quantity (number, default 1), unit (e.g. pcs, kg, box) }.
- Dates as YYYY-MM-DD.`,
  },
  batch: {
    route: "/inventory/batch",
    label: "inventory batch/lot",
    spec: `Fields (JSON keys): batch_number (REQUIRED), lot_number, item_code, item_name, quantity (number), warehouse (warehouse name), location, manufacture_date, expiry_date, status, bonded_warehouse (boolean), customs_status.
- "status" one of: active, inactive, expired (default active). "customs_status" one of: cleared, pending, in_bond (default cleared). Dates as YYYY-MM-DD.`,
  },
  warehouse: {
    route: "/inventory/warehouse",
    label: "warehouse",
    spec: `Fields (JSON keys): name (REQUIRED), warehouse_code (short code, REQUIRED), type, location, address, capacity (number), manager, email.
- "type" one of: standard, bonded, cold-storage, transit (default standard). Capacity as a plain number.`,
  },
  receipt: {
    route: "/inventory/operations/receipts",
    label: "goods receipt",
    spec: `Fields (JSON keys): partner_name (the supplier/partner the goods are received FROM), reference, scheduled_date, source_document, note, items.
- "items" is an ARRAY: { name (REQUIRED), qty (number, default 1) }. Dates as YYYY-MM-DD.`,
  },
  inventory_delivery: {
    route: "/inventory/operations/deliveries",
    label: "delivery",
    spec: `Fields (JSON keys): partner_name (the customer/partner goods are delivered TO), reference, scheduled_date, source_document, note, items.
- "items" is an ARRAY: { name (REQUIRED), qty (number, default 1) }. Dates as YYYY-MM-DD.`,
  },
  inventory_return: {
    route: "/inventory/operations/returns",
    label: "return",
    spec: `Fields (JSON keys): partner_name (the customer/partner the goods are returned to/from), reference, scheduled_date, source_document, note, items.
- "items" is an ARRAY: { name (REQUIRED), qty (number, default 1) }. Dates as YYYY-MM-DD.`,
  },
  inventory_report: {
    route: "/inventory/reports",
    label: "inventory report",
    spec: `Fields (JSON keys): report_type, date_range.
- "report_type" MUST be one of: stock (stock summary/valuation), movement (stock movements in/out), aging (batch age / slow-moving), compliance (bonded warehouse/customs/expiry). Default "stock".
- "date_range" MUST be one of: all, last_7_days, last_30_days, this_month, last_month, this_year. Default "last_30_days".`,
  },
  stock_move: {
    route: "/inventory/stock-moves",
    label: "stock move",
    spec: `Fields (JSON keys): move_type, scheduled_date, source_warehouse, destination_warehouse, source_document, notes, items.
- "move_type" one of: internal, inbound, outbound (default internal). "items" is an ARRAY: { name (REQUIRED), qty (number, default 1) }. Dates as YYYY-MM-DD.`,
  },
  inventory_order: {
    route: "/inventory/orders",
    label: "inventory order",
    spec: `Fields (JSON keys): customer_name (REQUIRED), customer_email, warehouse, order_date, expected_delivery, shipping_address, tracking_number, items.
- "items" is an ARRAY: { item_name (REQUIRED), item_code, quantity (number, default 1), unit_price (number) }. Dates as YYYY-MM-DD. Amounts as plain numbers.`,
  },
  manufacturing_order: {
    route: "/inventory/operations/manufacturing",
    label: "manufacturing order",
    spec: `Fields (JSON keys): product_name (the product to produce — REQUIRED), quantity (number), scheduled_date, responsible, note, components.
- "components" is an ARRAY of raw materials to consume: { name (REQUIRED), qty (number, default 1) }. Dates as YYYY-MM-DD. Quantities as plain numbers.`,
  },
  product: {
    route: "/sales/products",
    label: "product",
    spec: `Fields (JSON keys): name (REQUIRED), sales_price (number), cost (number), internal_reference, product_type, invoice_policy, can_be_sold (boolean), can_be_purchased (boolean), description.
- "product_type" MUST be one of: consu (Consumable/Goods), service (Service), combo (Bundle) — default "consu". Map "Consumable"/"Stockable"/"Goods" → consu, "Service" → service.
- "invoice_policy" MUST be one of: order (Ordered quantities), delivery (Delivered quantities) — default "order".
- Amounts as plain numbers (no ₹ or commas).`,
  },
  pricelist: {
    route: "/sales/pricelist",
    label: "pricelist",
    spec: `Fields (JSON keys): name (REQUIRED), currency (e.g. INR), fixed_price (number), min_qty (number), start_date, end_date.
- Dates as YYYY-MM-DD. Amounts as plain numbers.`,
  },
  // ── Finance ────────────────────────────────────────────────────────────────
  expense: {
    route: "/finance/expenses",
    label: "employee expense",
    spec: `Fields (JSON keys): description (what the expense is for — REQUIRED), category, total (number, the amount), taxAmount (number), isTaxIncluded (boolean), paidBy, expenseDate, notes, account_name (the expense ledger account to book it against, if named).
- "category" MUST be exactly one of: communication, meals, travel, supplies, others. Map any similar phrase to the closest (e.g. "food"/"lunch" → meals, "cab"/"flight"/"hotel" → travel, "stationery" → supplies, "phone"/"internet" → communication). Default "others".
- "paidBy" MUST be one of: employee, company. Default "employee".
- "total" is the expense amount as a plain number (no ₹ or commas). "expenseDate" as YYYY-MM-DD.`,
  },
  finance_account: {
    route: "/finance/accounting/chart-of-accounts",
    label: "chart-of-accounts ledger account",
    spec: `Fields (JSON keys): accountName (the account name — REQUIRED), accountCode (the account number/code, e.g. 5200), description, account_type_name (the kind of account, e.g. "Expenses", "Current Assets", "Income", "Bank"), watchlist (boolean).
- "accountCode" as a plain string of digits if given.
- "account_type_name" is the human name of the account type/category; leave "" if not clearly stated.
- "watchlist" MUST be true if the user wants this account flagged / added to the watchlist / marked as favourite / monitored; otherwise omit it.`,
  },
  fixed_asset: {
    route: "/finance/accounting/fixed-assets",
    label: "fixed asset",
    spec: `Fields (JSON keys): name (the asset name — REQUIRED), originalValue (number, purchase/gross value), salvageValue (number, residual value at end of life), purchaseDate, method, durationYears (number, useful life in years), asset_account_name (the fixed-asset ledger account), depreciation_account_name (the depreciation-expense ledger account).
- "method" MUST be one of: linear (straight-line), degressive (declining-balance). Map "straight line"/"SLM" → linear, "WDV"/"reducing balance"/"declining" → degressive. Default "linear".
- Amounts as plain numbers (no ₹ or commas). "purchaseDate" as YYYY-MM-DD. "durationYears" as a plain number.`,
  },
  journal_entry: {
    route: "/finance/accounting/journal-entries",
    label: "accounting journal entry",
    spec: `Fields (JSON keys): name (a reference/label for the entry, optional), ref (external reference/document no.), date, journalType, lines.
- "journalType" MUST be one of: general, sales, purchase, bank, cash. Default "general".
- "lines" is an ARRAY of postings, at least two, that MUST balance (total debit = total credit): { account_name (the ledger account name — REQUIRED), label (narration for this line), debit (number, 0 if none), credit (number, 0 if none) }.
- Every line must have EITHER a debit OR a credit (not both). Amounts as plain numbers (no ₹ or commas). "date" as YYYY-MM-DD.`,
  },
  bank_statement: {
    route: "/finance/accounting/bank-reconciliation",
    label: "bank statement",
    spec: `Fields (JSON keys): name (a label for the statement, e.g. "BNK1/2026/01"), statement_date, balance_start (number, opening balance), balance_end_real (number, closing balance), lines.
- "lines" is an ARRAY of statement transactions: { date, payment_ref (the narration/reference), partner_name (the other party, if named), amount (number — POSITIVE for money received/credit, NEGATIVE for money paid/debit) }.
- Extract EVERY transaction line you can find. Dates as YYYY-MM-DD. Amounts as plain numbers (no ₹ or commas); use a leading minus for debits/withdrawals.`,
  },
  finance_purchase_order: {
    route: "/finance/purchase-orders",
    label: "purchase order",
    spec: `Fields (JSON keys): vendor_name (the supplier/vendor to order FROM — REQUIRED), dateOrder, lines.
- "lines" is an ARRAY of items to purchase: { name (item/description — REQUIRED), productQty (number, default 1), priceUnit (number, unit price, no currency symbol) }.
- Extract EVERY line you can find. Dates as YYYY-MM-DD. Amounts as plain numbers (no ₹ or commas).`,
  },
  bill: {
    route: "/finance/bills",
    label: "vendor bill",
    spec: `Fields (JSON keys): vendor_name (the supplier/vendor being billed — REQUIRED), invoiceDate, dueDate, payment_reference, lines.
- "lines" is an ARRAY of the billed items: { name (item/description — REQUIRED), quantity (number, default 1), priceUnit (number, unit price, no currency symbol) }.
- Extract EVERY line you can find. Dates as YYYY-MM-DD. Amounts as plain numbers (no ₹ or commas).`,
  },
  voucher: {
    route: "/finance/accounting/vouchers",
    label: "accounting voucher",
    spec: `Fields (JSON keys): voucher_kind, name (a reference/label, optional), ref (external reference/document no.), date, journalType, lines.
- "voucher_kind" MUST be exactly one of: Record Expense, Receive Payment, Make Payment, Manual Journal. Map any similar phrase (e.g. "payment voucher"/"pay a vendor" → Make Payment, "receipt voucher"/"money received" → Receive Payment, "expense voucher" → Record Expense, "journal voucher" → Manual Journal). Default "Manual Journal".
- "journalType" MUST be one of: general, sales, purchase, bank, cash. Default "general".
- "lines" is an ARRAY of postings, at least two, that MUST balance (total debit = total credit): { account_name (the ledger account name — REQUIRED), label (narration), debit (number, 0 if none), credit (number, 0 if none) }.
- Every line must have EITHER a debit OR a credit (not both). Amounts as plain numbers. "date" as YYYY-MM-DD.`,
  },
};

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    const tenantId = (session?.user as any)?.tenantId as string | undefined;
    if (!session || !tenantId) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const target: string = body.target;
    const message: string = body.message || "";
    const def = TARGETS[target];
    if (!def) return NextResponse.json({ success: false, message: `Unsupported target: ${target}` }, { status: 400 });

    const rawAtts: any[] = Array.isArray(body.attachments) ? body.attachments : (body.attachment ? [body.attachment] : []);
    const imageUrls: string[] = [];
    const docTexts: string[] = [];
    for (const a of rawAtts.slice(0, 8)) {
      if (!a?.dataUrl || !a?.type) continue;
      if (String(a.type).startsWith("image/")) {
        imageUrls.push(a.dataUrl);
        continue;
      }
      // PDF / DOCX / TXT / CSV → extract the text so the AI can read the document
      // (previously only images were read, so a document attachment yielded a
      // blank form). Best-effort — a failed read just contributes no text.
      try {
        const base64 = a.dataUrl.includes(",") ? a.dataUrl.split(",")[1] : a.dataUrl;
        const buffer = Buffer.from(base64, "base64");
        const extracted = await extractAttachment(buffer, a.type, a.name || "");
        if (extracted.kind === "text" && (extracted as any).text) {
          docTexts.push(`=== ${a.name || "document"} ===\n${(extracted as any).text}`);
        } else if (extracted.kind === "image" && (extracted as any).imageDataUrl) {
          imageUrls.push((extracted as any).imageDataUrl);
        }
      } catch { /* unreadable file — skip, others may still have data */ }
    }
    const imageSlice = imageUrls.slice(0, 6);

    // Recent conversation — lets us reuse details already given/analysed earlier
    // (e.g. "create the lead with those details" after an attachment was read).
    const history: { role: string; content: string }[] = Array.isArray(body.history) ? body.history.slice(-8) : [];
    const historyBlock = history.length
      ? `\n\nRecent conversation (use any relevant details from here too):\n${history.map((h) => `${h.role === "user" ? "User" : "Assistant"}: ${h.content}`).join("\n").slice(0, 4000)}`
      : "";

    const docsBlock = docTexts.length
      ? `\n\nAttached document content (extract the fields from here):\n${docTexts.join("\n\n").slice(0, 12000)}`
      : "";

    const prompt = `You are extracting fields to pre-fill a ${def.label} form in an ERP. Read the user's instruction, any attached image(s), the attached document text, AND the recent conversation, then return ONLY JSON (no markdown, no prose) in this exact shape:
{"data": { ...fields... }, "suggestions": ["short tip", ...]}

${def.spec}

Rules:
- Fill only fields you can determine from the instruction, images, or document. Leave the rest as "".
- Do NOT invent values that aren't present in the inputs.
- SMART PARSING — split/normalise composite values into the correct fields:
  • Names with a title: put the title (Mr, Mrs, Ms, Miss, Dr, Prof, etc.) in "salutation" if that field exists, the given name in "firstName", and the family name in "lastName". Keep the full readable name in "name"/"lead_name" too.
  • Phone/mobile numbers: keep them EXACTLY as given INCLUDING any country code (e.g. "+91 98765 43210") — never drop the country code.
  • Dates → YYYY-MM-DD. Amounts → plain numbers (no currency symbols or commas). GSTIN/PAN → uppercase.
  • BOOLEAN / toggle fields (checkboxes, switches): a field is not only text. If the user asks to enable/turn on/mark/flag/include something ("yes", "enable", "turn it on", "mark it", "add it to the watchlist", "tax is included", "can be sold"), set that boolean field to true. If they say to disable/turn off/exclude it, set it false. Use a real JSON boolean (true/false), never the strings "yes"/"no". Only set a boolean when the intent is clear; otherwise omit it so the form default applies.
  • ENUM / dropdown fields: map the user's phrasing to EXACTLY one of the allowed values listed for that field — never invent a new value.
- "suggestions" = 0-4 SHORT, genuinely useful data-quality checks for the user to verify before saving — e.g. "Phone number looks too short", "Company name usually ends with 'Pvt Ltd'", "Email domain doesn't match the company name". Only include real issues you actually notice; use [] if there are none.

User instruction: "${message}"${docsBlock}${historyBlock}`;

    const { tier, aiSettings } = await resolveTenantAiSettings(tenantId);
    const result = await callClaudeForTenant(tenantId, tier, aiSettings, prompt, {
      maxTokens: 700,
      imageDataUrls: imageSlice.length ? imageSlice : undefined,
    });

    // strictNullChecks off — narrow on "text" in result.
    if (!("text" in result)) {
      return NextResponse.json({ success: false, message: result.error, code: result.code }, { status: 403 });
    }

    let parsed: any;
    try {
      const m = result.text.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(m ? m[0] : result.text);
    } catch {
      return NextResponse.json({ success: false, message: "I couldn't read those details clearly. Please add a bit more detail and try again." }, { status: 422 });
    }

    const data = parsed?.data && typeof parsed.data === "object" ? parsed.data : {};
    const suggestions = Array.isArray(parsed?.suggestions)
      ? parsed.suggestions.filter((s: any) => typeof s === "string" && s.trim()).slice(0, 4)
      : [];

    // ── Cross-entity dependency resolution ───────────────────────────────────
    // An invoice needs a customer. Resolve the named customer to a real id; if
    // there's no match, flag it so the UI can tell the user to create the
    // customer first (the invoice form has an inline "+ customer" for this).
    let missingDependency: { type: string; name: string } | undefined;
    if (target === "invoice") {
      const nameQ = String(data.customerName || "").trim();
      if (nameQ) {
        await connectDB();
        const rx = new RegExp(`^${escapeRegex(nameQ)}$`, "i");
        const cust: any = await Customer.findOne(
          { tenantId, $or: [{ "header.name": rx }, { "header.displayName": rx }, { "header.companyName": rx }] },
          "_id",
        ).lean();
        if (cust) {
          data.customerId = String(cust._id);
        } else {
          missingDependency = { type: "customer", name: nameQ };
          suggestions.unshift(`No customer named "${nameQ}" exists yet — create them first (use the "+" on the customer field), then select them.`);
        }
      }
    }

    // These forms need a customer picked by id — resolve the named customer so
    // the Customer select is pre-picked; flag it if not found.
    if (target === "sales_order" || target === "sales_quote" || target === "subscription" || target === "payment") {
      const nameQ = String(data.customer_name || "").trim();
      if (nameQ) {
        await connectDB();
        const rx = new RegExp(`^${escapeRegex(nameQ)}$`, "i");
        const cust: any = await Customer.findOne(
          { tenantId, $or: [{ "header.name": rx }, { "header.displayName": rx }, { "header.companyName": rx }] },
          "_id",
        ).lean();
        if (cust) {
          data.customerId = String(cust._id);
        } else {
          missingDependency = { type: "customer", name: nameQ };
          suggestions.unshift(`No customer named "${nameQ}" exists yet — create them first (Sales → Customers, or the "+ Create Customer"), then select them.`);
        }
      }
    }

    // A quote needs an Account (and usually an Opportunity). Resolve the named
    // account/opportunity to real ids so the form's selects are pre-picked; if a
    // name was given but not found, flag it so the user knows to create/select it.
    if (target === "quote") {
      await connectDB();
      const accQ = String(data.account_name || "").trim();
      if (accQ) {
        const rx = new RegExp(`^${escapeRegex(accQ)}$`, "i");
        const acc: any = await CrmAccount.findOne({ tenantId, company_name: rx }, "_id").lean();
        if (acc) data.account_id = String(acc._id);
        else {
          missingDependency = { type: "account", name: accQ };
          suggestions.unshift(`No account named "${accQ}" exists yet — create it (CRM → Accounts) or pick a different account, then select it here.`);
        }
      }
      const oppQ = String(data.opportunity_name || "").trim();
      if (oppQ) {
        const rx = new RegExp(`^${escapeRegex(oppQ)}$`, "i");
        const opp: any = await CrmOpportunity.findOne({ tenantId, deal_name: rx }, "_id").lean();
        if (opp) data.opportunity_id = String(opp._id);
        else suggestions.unshift(`No opportunity named "${oppQ}" was found — pick the right one in the Opportunity field.`);
      }
    }

    // ── Inventory operations: resolve partner + product names to real ids so
    // the form's partner select and product line-items are actually populated
    // (not just review hints). Unresolved names are kept with an empty id + a
    // suggestion so the user can pick/create them.
    if (target === "receipt" || target === "inventory_delivery" || target === "inventory_return") {
      await connectDB();
      const partnerQ = String(data.partner_name || "").trim();
      if (partnerQ) {
        const rx = new RegExp(`^${escapeRegex(partnerQ)}$`, "i");
        const cust: any = await Customer.findOne(
          { tenantId, $or: [{ "header.name": rx }, { "header.displayName": rx }, { "header.companyName": rx }] },
          "_id",
        ).lean();
        if (cust) data.partnerId = String(cust._id);
        else suggestions.unshift(`No partner named "${partnerQ}" was found — pick or create one in the form.`);
      }
      if (Array.isArray(data.items) && data.items.length) {
        const resolved: any[] = [];
        const missing: string[] = [];
        for (const it of data.items) {
          const name = String(it?.name || "").trim();
          if (!name) continue;
          const rx = new RegExp(`^${escapeRegex(name)}$`, "i");
          const prod: any = await Product.findOne({ tenantId, "header.name": rx }, "_id").lean();
          const qty = Number(it?.qty) > 0 ? Number(it.qty) : 1;
          resolved.push({ productId: prod ? String(prod._id) : "", name, qty });
          if (!prod) missing.push(name);
        }
        data.items = resolved;
        if (missing.length) suggestions.push(`Not in catalogue yet (pick/create): ${missing.join(", ")}.`);
      }
    }
    if (target === "manufacturing_order") {
      await connectDB();
      const prodQ = String(data.product_name || "").trim();
      if (prodQ) {
        const rx = new RegExp(`^${escapeRegex(prodQ)}$`, "i");
        const prod: any = await Product.findOne({ tenantId, "header.name": rx }, "_id").lean();
        if (prod) data.productId = String(prod._id);
        else suggestions.unshift(`Product "${prodQ}" not found — pick or create it as the product to produce.`);
      }
      if (Array.isArray(data.components) && data.components.length) {
        const resolved: any[] = [];
        for (const c of data.components) {
          const name = String(c?.name || "").trim();
          if (!name) continue;
          const rx = new RegExp(`^${escapeRegex(name)}$`, "i");
          const prod: any = await Product.findOne({ tenantId, "header.name": rx }, "_id").lean();
          resolved.push({ productId: prod ? String(prod._id) : "", name, qty: Number(c?.qty) > 0 ? Number(c.qty) : 1 });
        }
        data.components = resolved;
      }
    }

    // ── Finance: resolve ledger-account names to real Account ids so the
    // account selects are pre-picked. A named-but-unmatched account is left with
    // an empty id + a suggestion so the user can pick/create it in the form.
    const resolveAccountId = async (nameQ: string): Promise<string | null> => {
      const q = String(nameQ || "").trim();
      if (!q) return null;
      const rx = new RegExp(`^${escapeRegex(q)}$`, "i");
      const acc: any = await Account.findOne(
        { tenantId, $or: [{ accountName: rx }, { name: rx }, { accountCode: q }, { code: q }] },
        "_id",
      ).lean();
      return acc ? String(acc._id) : null;
    };

    if (target === "expense") {
      const nameQ = String(data.account_name || "").trim();
      if (nameQ) {
        await connectDB();
        const id = await resolveAccountId(nameQ);
        if (id) data.accountId = id;
        else suggestions.unshift(`No ledger account named "${nameQ}" was found — pick the expense account in the form before saving.`);
      }
    }

    if (target === "finance_account") {
      const typeQ = String(data.account_type_name || "").trim();
      if (typeQ) {
        await connectDB();
        const rx = new RegExp(escapeRegex(typeQ), "i");
        const at: any = await AccountType.findOne(
          { tenantId, status: "active", $or: [{ name: rx }, { segment: rx }] },
          "_id",
        ).lean();
        if (at) data.accountType = String(at._id);
        else suggestions.unshift(`Account type "${typeQ}" wasn't matched — choose the account type in the form.`);
      }
    }

    if (target === "fixed_asset") {
      await connectDB();
      const assetQ = String(data.asset_account_name || "").trim();
      const deprQ = String(data.depreciation_account_name || "").trim();
      data.accounts = data.accounts && typeof data.accounts === "object" ? data.accounts : {};
      if (assetQ) {
        const id = await resolveAccountId(assetQ);
        if (id) data.accounts.assetAccountId = id;
        else suggestions.unshift(`Asset account "${assetQ}" wasn't found — pick it in the form.`);
      }
      if (deprQ) {
        const id = await resolveAccountId(deprQ);
        if (id) data.accounts.depreciationAccountId = id;
        else suggestions.unshift(`Depreciation account "${deprQ}" wasn't found — pick it in the form.`);
      }
    }

    // Journal entries AND vouchers share the same balanced-posting shape — each
    // line's named account is resolved to a real id.
    if ((target === "journal_entry" || target === "voucher") && Array.isArray(data.lines) && data.lines.length) {
      await connectDB();
      const missing: string[] = [];
      const resolved: any[] = [];
      for (const ln of data.lines) {
        const name = String(ln?.account_name || "").trim();
        const id = name ? await resolveAccountId(name) : null;
        if (name && !id) missing.push(name);
        resolved.push({
          accountId: id || "",
          accountName: name,
          partnerId: "",
          label: String(ln?.label || "").trim(),
          debit: Number(ln?.debit) > 0 ? Number(ln.debit) : 0,
          credit: Number(ln?.credit) > 0 ? Number(ln.credit) : 0,
        });
      }
      data.lines = resolved;
      if (missing.length) suggestions.push(`Accounts not found (pick them in the form): ${[...new Set(missing)].join(", ")}.`);
    }

    // A vendor bill needs a vendor (a res.partner / Customer doc) resolved to an
    // id so the Vendor select is pre-picked; unmatched → flagged.
    if (target === "bill") {
      const nameQ = String(data.vendor_name || "").trim();
      if (nameQ) {
        await connectDB();
        const rx = new RegExp(`^${escapeRegex(nameQ)}$`, "i");
        const vendor: any = await Customer.findOne(
          { tenantId, $or: [{ "header.name": rx }, { "header.displayName": rx }, { "header.companyName": rx }] },
          "_id",
        ).lean();
        if (vendor) data.partnerId = String(vendor._id);
        else {
          missingDependency = { type: "vendor", name: nameQ };
          suggestions.unshift(`No vendor named "${nameQ}" exists yet — pick or create the vendor in the form before posting.`);
        }
      }
    }

    // A bank statement's lines can name a partner — resolve each to an id so the
    // Partner select on the line is pre-picked; unmatched names are kept (empty
    // id) with a suggestion. The bank account/journal is left for the user.
    if (target === "bank_statement" && Array.isArray(data.lines) && data.lines.length) {
      await connectDB();
      const missing: string[] = [];
      const resolved: any[] = [];
      for (const ln of data.lines) {
        const partnerName = String(ln?.partner_name || "").trim();
        let partnerId = "";
        if (partnerName) {
          const rx = new RegExp(`^${escapeRegex(partnerName)}$`, "i");
          const partner: any = await Customer.findOne(
            { tenantId, $or: [{ "header.name": rx }, { "header.displayName": rx }, { "header.companyName": rx }] },
            "_id",
          ).lean();
          if (partner) partnerId = String(partner._id);
          else missing.push(partnerName);
        }
        resolved.push({
          date: ln?.date || "",
          payment_ref: String(ln?.payment_ref || "").trim(),
          partnerId,
          partnerName,
          amount: Number(ln?.amount) || 0,
          isReconciled: false,
        });
      }
      data.lines = resolved;
      if (missing.length) suggestions.push(`Partner(s) not found (pick/create on the line): ${[...new Set(missing)].join(", ")}.`);
    }

    // A finance purchase order needs a vendor + product lines resolved to ids so
    // the Vendor select and order lines are actually populated (not just hints).
    if (target === "finance_purchase_order") {
      await connectDB();
      const nameQ = String(data.vendor_name || "").trim();
      if (nameQ) {
        const rx = new RegExp(`^${escapeRegex(nameQ)}$`, "i");
        const vendor: any = await Customer.findOne(
          { tenantId, $or: [{ "header.name": rx }, { "header.displayName": rx }, { "header.companyName": rx }] },
          "_id",
        ).lean();
        if (vendor) data.partnerId = String(vendor._id);
        else {
          missingDependency = { type: "vendor", name: nameQ };
          suggestions.unshift(`No vendor named "${nameQ}" exists yet — pick or create the vendor in the form before posting.`);
        }
      }
      if (Array.isArray(data.lines) && data.lines.length) {
        const missing: string[] = [];
        const resolved: any[] = [];
        for (const ln of data.lines) {
          const name = String(ln?.name || "").trim();
          if (!name) continue;
          const rx = new RegExp(`^${escapeRegex(name)}$`, "i");
          const prod: any = await Product.findOne({ tenantId, "header.name": rx }, "_id").lean();
          if (!prod) missing.push(name);
          const productQty = Number(ln?.productQty) > 0 ? Number(ln.productQty) : 1;
          resolved.push({ productId: prod ? String(prod._id) : null, name, productQty, priceUnit: Number(ln?.priceUnit) || 0 });
        }
        data.lines = resolved;
        if (missing.length) suggestions.push(`Not in the catalogue yet (pick/create): ${[...new Set(missing)].join(", ")}.`);
      }
    }

    return NextResponse.json({ success: true, target, route: def.route, data, suggestions, missingDependency });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
