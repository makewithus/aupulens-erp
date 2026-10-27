import { requireWorkspaceModuleAccess } from "./commandAccess";
import { createHash } from "crypto";
import Product from "@/models/inventory/Product";
import SalesQuotation from "@/models/sales/SalesQuotation";
import AiCommandProposal from "@/models/ai/AiCommandProposal";
import { resolveCustomer, ErpToolError, escapeRegex, flexibleNameRegex, customerName, currency, requireSalesAccess } from "./erpQuery";
import { normalizeErpText } from "./erpIntent";
import { computeInvoiceTotals } from "@/lib/sales/invoiceMath";
import Customer from "@/models/sales/Customer";
import { validateQuoteInput } from "@/lib/sales/quoteValidation";
import { createSalesQuote } from "@/lib/sales/createQuote";
import { AI_ACTION_STATUS as A } from "@/lib/constants/statuses";

type Scope = { tenantId: string; userId: string; role: string; conversationId: string };
function productLine(product: any, qty: number) {
  const g = (product.tab_general_information || {}) as {
    unit?: string;
    uom?: string;
    list_price?: number;
    gstRate?: number;
    hsnSacCode?: string;
    gstTreatment?: any;
    [k: string]: any;
  };
  const unit = g.unit || g.uom || "unit";
  const parsedGst = typeof g.customer_taxes === "string" ? parseFloat(g.customer_taxes.match(/(\d+(?:\.\d+)?)/)?.[1] || "0") : 0;
  const taxRate = g.gstRate !== undefined ? g.gstRate : parsedGst;
  return { itemId: String(product._id), name: product.header.name, qty, unit, unitPrice: g.list_price, discount: 0, discountMode: "percent" as const, taxRate, hsn: g.hsnSacCode, gstTreatment: g.gstTreatment };
}
function draftSummary(name: string, line: ReturnType<typeof productLine>) {
  const qty = line.qty;
  const totals = computeInvoiceTotals({ lineItems: [line] });
  const unitSuffix = line.unit ? ` ${line.unit}${qty === 1 ? "" : "s"}` : "";
  return `Quote draft — not saved:\n\nCustomer: ${name}\nItem: ${line.name}\nQuantity: ${qty}${unitSuffix}\nUnit price: ${currency(line.unitPrice)}${line.unit ? ` per ${line.unit}` : ""}\nSubtotal: ${currency(totals.subtotal)}\nDiscount: ${currency(totals.totalDiscount)}\nTax: ${currency(totals.totalTax)}\nTotal: ${currency(totals.totalAmount)}\n\nConfirm quote to save, or cancel quote.`;
}

export async function prepareQuoteDraft(scope: Scope, text: string, requestId: string) {
  requireSalesAccess(scope.role);
  let q = normalizeErpText(text).trim().replace(/[.!]$/, "");
  // Extract explicit percentage clauses before splitting customer/product slots.
  // Retain out-of-range values so shared server validation can reject them.
  const discounts: number[] = [];
  q = q.replace(/(?:,\s*|\s+)(?:(?:with|and|at)\s+)?(?:a\s+)?(?:([+-]?(?:\d+(?:\.\d+)?|\.\d+))\s*(?:%|percent(?:age)?)\s*discount\b|discount\s*(?:of\s+)?([+-]?(?:\d+(?:\.\d+)?|\.\d+))\s*(?:%|percent(?:age)?)?\b)(?=\s*(?:$|to\b|,))/gi, (_, before, after) => {
    discounts.push(Number(before ?? after));
    return "";
  });
  // Replace word numbers with digits (English & Hindi)
  const wordNumbers: Record<string, string> = {
    one: "1", two: "2", three: "3", four: "4", five: "5",
    six: "6", seven: "7", eight: "8", nine: "9", ten: "10",
    ek: "1", do: "2", teen: "3", chaar: "4", paanch: "5",
  };
  q = q.replace(/\b(one|two|three|four|five|six|seven|eight|nine|ten|ek|do|teen|chaar|paanch)\b/gi, (w) => wordNumbers[w.toLowerCase()] || w);

  // Common Hinglish order: "2 unit <product> ka quote banao <customer> ke liye".
  // Convert it to the canonical parser form before generic phrase cleanup.
  const hindiQuantityFirst = q.match(/^([+-]?(?:\d+(?:\.\d+)?|\.\d+))\s+(?:units?|pcs|pieces?|nos)\s+(.+?)\s+(?:ka\s+)?quote\s+(?:banao|banayein|karo|taiyar|banana)\s+(.+?)\s+(?:ke\s+liye|ko)$/i);
  if (hindiQuantityFirst) {
    q = `quote for ${hindiQuantityFirst[1]} units ${hindiQuantityFirst[2]} for ${hindiQuantityFirst[3]}`;
  }

  // Normalise Hindi phrasing to English structure for quote extraction
  q = q.replace(/(?:ke\s+liye|ko)\s+/gi, "for ")
       .replace(/(?:ka\s+)?quote\s+(?:banao|banayein|karo|taiyar|banana)/gi, "quote")
       .replace(/quote\s+(?:banao|banayein|karo|taiyar|banana)(?:\s+for)?/gi, "quote for");

  // Supported patterns:
  // 1. quote for <customer>, <qty> <product>
  // 2. quote for <qty> <product> to/for <customer>
  // 3. quote for <customer> for/with <qty> <product>
  // 4. quote for <customer> of <qty> <product>
  const full = q.match(/quote\s+for\s+(.+?),\s*([+-]?(?:\d+(?:\.\d+)?|\.\d+))\s+(.+)$/i);
  const implicitTestProduct = q.match(/(?:create|make|prepare|draft)\s+(?:a\s+)?quote\s+for\s+(?:the\s+)?(.+?)\s+and\s+(?:the\s+)?product$/i);
  const short = q.match(/quote\s+for\s+([+-]?(?:\d+(?:\.\d+)?|\.\d+))\s+(.+?)\s+(?:to|for)\s+(.+)$/i);
  const customerFirst = q.match(/quote\s+for\s+(.+?)\s+(?:with|for|of)\s+([+-]?(?:\d+(?:\.\d+)?|\.\d+))\s+(.+)$/i);
  const general = q.match(/(?:create\s+)?quote\s+(?:for\s+)?(?:([+-]?(?:\d+(?:\.\d+)?|\.\d+))\s+(?:units?\s+(?:of\s+)?)?(.+?)\s+(?:for|to)\s+(.+)|(.+?)\s+(?:for|with)\s+([+-]?(?:\d+(?:\.\d+)?|\.\d+))\s+(?:units?\s+(?:of\s+)?)?(.+))$/i);

  let customerText = implicitTestProduct?.[1] || full?.[1] || short?.[3] || customerFirst?.[1] || general?.[3] || general?.[4] || q.match(/quote\s+for\s+([^,]+)(?:,|$)/i)?.[1];
  if (customerText) {
    customerText = customerText.replace(/^(?:the\s+)?customer\s+/i, "").trim();
  }
  let rawQty = implicitTestProduct ? "1" : full?.[2] || short?.[1] || customerFirst?.[2] || general?.[1] || general?.[5];
  let rawProduct = implicitTestProduct
    ? `${implicitTestProduct[1].replace(/^the\s+/i, "").replace(/\s+customer$/i, "").trim()} product`
    : full?.[3] || short?.[2] || customerFirst?.[3] || general?.[2] || general?.[6];

  if (!customerText || /^\d/.test(customerText.trim())) {
    throw new ErpToolError("MISSING_FIELD", "Which customer should this quote be for?");
  }
  if (!rawQty && !rawProduct) {
    throw new ErpToolError("MISSING_FIELD", "Which product should I include?");
  }
  if (!rawQty) {
    throw new ErpToolError("MISSING_FIELD", "What quantity do you need?");
  }

  const qty = Number(rawQty);
  if (!Number.isFinite(qty) || qty <= 0) throw new ErpToolError("BUSINESS_RULE", "Quantity must be greater than zero.");

  let productText = (rawProduct || "").trim()
    .replace(/^,\s*|,\s*$/g, "")
    .replace(/^(?:units?|pieces?|pcs|nos)\s+(?:of\s+)?/i, "")
    .replace(/^of\s+/i, "")
    .replace(/chairs$/i, "chair");

  productText = productText.replace(/(?:,\s*|\s+)(?:(?:with|and|at)\s+)?(?:a\s+)?(?:([+-]?(?:\d+(?:\.\d+)?|\.\d+))\s*(?:%|percent(?:age)?)\s*discount\b|discount\s*(?:of\s+)?([+-]?(?:\d+(?:\.\d+)?|\.\d+))\s*(?:%|percent(?:age)?)?\b).*/gi, (m, b, a) => {
    if (!discounts.length) discounts.push(Number(b ?? a));
    return "";
  }).trim().replace(/^,\s*|,\s*$/g, "");

  if (!productText) {
    throw new ErpToolError("MISSING_FIELD", "Which product should I include?");
  }

  if (discounts.length > 1 || /\bdiscount\b/i.test(productText)) throw new ErpToolError("BUSINESS_RULE", "Specify one percentage discount from 0–100%, for example, with a 10% discount.");
  if (discounts.length > 0 && (discounts[0] < 0 || discounts[0] > 100)) {
    throw new ErpToolError("BUSINESS_RULE", `A ${discounts[0]}% discount is not allowed; the range is 0–100%.`);
  }
  const customer = await resolveCustomer(scope.tenantId, customerText.trim());
  const tenantFilter = scope.tenantId === "default" || scope.tenantId === "default-tenant"
    ? { $in: ["default", "default-tenant"] }
    : scope.tenantId;
  let products = await Product.find({
    tenantId: tenantFilter,
    "header.sale_ok": { $ne: false },
    $or: [
      { "header.name": flexibleNameRegex(productText) },
      { "tab_general_information.default_code": flexibleNameRegex(productText) },
    ],
  }).select("header tab_general_information").limit(6).maxTimeMS(5000).lean();
  // A user may give the identifying words without every catalog word, such
  // as “ergonomic chair” for “Ergonomic Office Chair”. Fetch a small,
  // tenant-scoped candidate set containing every query word, then let the
  // deterministic scorer below resolve ambiguity.
  if (!products.length) {
    const words = productText.split(/\s+/).filter(Boolean);
    if (words.length > 1) {
      products = await Product.find({
        tenantId: tenantFilter,
        "header.sale_ok": { $ne: false },
        $and: words.map((word) => ({
          $or: [
            { "header.name": { $regex: escapeRegex(word), $options: "i" } },
            { "tab_general_information.default_code": { $regex: escapeRegex(word), $options: "i" } },
          ],
        })),
      }).select("header tab_general_information").limit(6).maxTimeMS(5000).lean();
    }
  }
  const exact = products.filter(p =>
    p.header.name.toLowerCase() === productText.toLowerCase() ||
    p.tab_general_information?.default_code?.toLowerCase() === productText.toLowerCase()
  );
  let matches = exact.length ? exact : [];
  if (!matches.length && products.length > 0) {
    const queryLower = productText.toLowerCase().trim();
    const queryWords = queryLower.split(/\s+/).filter(Boolean);

    // 1. Full phrase prefix (e.g. name starts with "ergonomic chair")
    const fullPrefix = products.filter(p => p.header.name.toLowerCase().startsWith(queryLower));
    if (fullPrefix.length === 1) {
      matches = fullPrefix;
    } else {
      // 2. Starts with first search word (e.g. "Ergonomic Office Chair" starts with "ergonomic", whereas "Office Ergonomic Chair" starts with "office")
      const startsWithFirst = products.filter(p => queryWords.length > 0 && p.header.name.toLowerCase().startsWith(queryWords[0]));
      if (startsWithFirst.length === 1) {
        matches = startsWithFirst;
      } else {
        // 3. Smart scoring & ranking
        const candidates = startsWithFirst.length ? startsWithFirst : products;
        const scored = candidates.map(p => {
          const name = p.header.name.toLowerCase();
          let score = 0;
          if (name === queryLower) score += 1000;
          if (name.startsWith(queryLower)) score += 500;
          if (queryWords.length > 0 && name.startsWith(queryWords[0])) score += 200;
          
          let lastIdx = -1;
          let inOrder = true;
          for (const w of queryWords) {
            const idx = name.indexOf(w);
            if (idx === -1 || idx < lastIdx) { inOrder = false; break; }
            lastIdx = idx;
          }
          if (inOrder) {
            score += 100 - Math.min(80, name.indexOf(queryWords[0]));
          }
          score -= Math.abs(name.length - queryLower.length);
          return { product: p, score };
        }).sort((a, b) => b.score - a.score);

        if (scored.length > 0 && (scored.length === 1 || scored[0].score > scored[1].score + 40)) {
          matches = [scored[0].product];
        } else {
          matches = scored.map(s => s.product);
        }
      }
    }
  }
  if (!matches.length) throw new ErpToolError("NOT_FOUND", `No product matching “${productText}” was found.`, 404);
  if (matches.length !== 1) throw new ErpToolError("AMBIGUOUS_MATCH", "I found multiple matching products. Please give the exact product name.", 409);
  const matchedProduct = matches[0];
  const line = { ...productLine(matchedProduct, qty), discount: discounts[0] ?? 0 };
  validateDraftLine(matchedProduct, line);
  const summary = draftSummary(customerName(customer), line);
  // Stable proposal identity makes concurrent retries produce a single inert draft.
  const id = createHash("sha256").update(`${scope.tenantId}:${scope.userId}:${scope.conversationId}:${requestId}`).digest("hex").slice(0, 24);
  const fields = { tenantId: scope.tenantId, userId: scope.userId, module: "sales", actionType: "create_quote", destructive: false,
    params: { conversationId: scope.conversationId, customerId: String(customer._id), line, revision: 0 }, preview: { total: computeInvoiceTotals({ lineItems: [line] }).totalAmount }, summary, status: A.PROPOSED, expiresAt: new Date(Date.now() + 15 * 60000) };
  try { await AiCommandProposal.updateOne({ _id: id, tenantId: scope.tenantId, userId: scope.userId }, { $setOnInsert: fields }, { upsert: true }); }
  catch (e: any) { if (e?.code !== 11000) throw e; }
  return {
    proposalId: id,
    message: summary,
    customerName: customerName(customer),
    line,
    totals: computeInvoiceTotals({ lineItems: [line] }),
  };
}
export async function confirmQuoteDraft(scope: Scope, proposalId: string) {
  requireSalesAccess(scope.role);
  await requireWorkspaceModuleAccess("sales", scope.tenantId);
  const filter = { _id: proposalId, tenantId: scope.tenantId, userId: scope.userId, actionType: "create_quote", "params.conversationId": scope.conversationId };
  const proposal = await AiCommandProposal.findOne(filter);
  if (!proposal) throw new ErpToolError("NOT_FOUND", "Quote draft was not found in this conversation.", 404);
  const existing = await SalesQuotation.findOne({ tenantId: scope.tenantId, sourceAiProposalId: proposal._id });
  if (existing) return existing;
  if (proposal.status !== A.PROPOSED || proposal.expiresAt.getTime() <= Date.now()) throw new ErpToolError("CONFIRMATION_EXPIRED", "This draft is no longer available. Please request a new quote.", 409);
  // Claim first so validation and execution read the same revision. Edits cannot
  // change the line after confirmation has acquired this claim.
  const claimed = await AiCommandProposal.findOneAndUpdate({ ...filter, status: A.PROPOSED, expiresAt: { $gt: new Date() }, "params.executing": { $ne: true } }, { $set: { "params.executing": true } }, { new: true });
  if (!claimed) throw new ErpToolError("REQUEST_IN_PROGRESS", "This quote confirmation is already being processed. Please check again shortly.", 409);
  const params: any = claimed.params;
  try {
    const product = await Product.findOne({ tenantId: scope.tenantId, _id: params.line.itemId, "header.sale_ok": { $ne: false } }).lean();
    if (!product) throw new ErpToolError("NOT_FOUND", "The product is no longer available.", 404);
    validateDraftLine(product, params.line);
    const currentLine = { ...productLine(product, params.line.qty), discount: params.line.discount, discountMode: params.line.discountMode };
    const changed = Object.keys(currentLine).filter(key => (currentLine[key] ?? null) !== (params.line[key] ?? null));
    if (changed.length) throw new ErpToolError("PRICE_CHANGED", "Product details or pricing changed. Please request a new draft and review the updated total.", 409);
    const quote = await createSalesQuote(scope.tenantId, scope.userId, { customerId: params.customerId, lineItems: [params.line], status: "draft" }, proposalId);
    await AiCommandProposal.updateOne(filter, { $set: { status: A.EXECUTED, resultRef: String(quote._id), executedAt: new Date() } });
    return quote;
  } catch (error) {
    // Releasing the claim is safe: a persisted quote is discovered first on retry and the unique index prevents duplication.
    await AiCommandProposal.updateOne(filter, { $unset: { "params.executing": "" } });
    throw error;
  }
}

function validateDraftLine(product: any, line: ReturnType<typeof productLine>) {
  const issues = validateQuoteInput({ lineItems: [line] });
  if (!Number.isInteger(line.qty) && product.tab_general_information?.allowFractional === false) {
    const unit = product.tab_general_information.uom || product.tab_general_information.unit || "unit";
    issues.push(`${product.header.name} is measured in ${unit}s and requires a whole number quantity.`);
  }
  if (issues.length) throw new ErpToolError("BUSINESS_RULE", issues.join(" "));
}

/** Absolute edits are validated together and atomically replace one unclaimed revision. */
export async function updateQuoteDraft(scope: Scope, proposalId: string, text: string, requestId: string) {
  requireSalesAccess(scope.role);
  await requireWorkspaceModuleAccess("sales", scope.tenantId);
  const filter = { _id: proposalId, tenantId: scope.tenantId, userId: scope.userId, actionType: "create_quote", "params.conversationId": scope.conversationId };
  const proposal = await AiCommandProposal.findOne(filter).lean();
  if (!proposal) throw new ErpToolError("NOT_FOUND", "Quote draft was not found in this conversation.", 404);
  const params: any = proposal.params;
  if (proposal.status !== A.PROPOSED || proposal.expiresAt.getTime() <= Date.now()) throw new ErpToolError("CONFIRMATION_EXPIRED", "This draft is no longer editable. Please request a new quote.", 409);
  if (params.executing) throw new ErpToolError("REQUEST_IN_PROGRESS", "This quote is being confirmed and cannot be edited.", 409);
  if (params.lastEditRequestId === requestId) return { proposalId, message: proposal.summary };
  const quantities = [...text.matchAll(/\b(?:quantity|qty)\s*(?:(?:to|at|is)\s*|[=:]\s*)?([+-]?(?:\d+(?:\.\d+)?|\.\d+))(?![\w+-]|\.\d|\.\.)/gi)].map(m => Number(m[1]));
  const discounts = [...text.matchAll(/(?<![\w.+-])(?:([+-]?(?:\d+(?:\.\d+)?|\.\d+))\s*%\s*discount\b|\bdiscount\s*(?:(?:to|at|is|of)\s*|[=:]\s*)?([+-]?(?:\d+(?:\.\d+)?|\.\d+))\s*%)/gi)].map(m => Number(m[1] ?? m[2]));
  const errors = [
    ...quantities.filter(q => !Number.isFinite(q) || q <= 0).map(q => `Quantity ${q} is invalid; quantity must be greater than zero.`),
    ...discounts.filter(d => !Number.isFinite(d) || d < 0 || d > 100).map(d => `A ${d}% discount is not allowed; the range is 0–100%.`),
  ];
  if ((text.match(/\b(?:quantity|qty)\b/gi)?.length ?? 0) !== quantities.length || (text.match(/\bdiscount\b/gi)?.length ?? 0) !== discounts.length) errors.push("Each quantity and discount must have one valid numeric value.");
  if (quantities.length > 1 || discounts.length > 1) errors.push("Please specify one quantity and one discount per edit.");
  if (!quantities.length && !discounts.length) errors.push("Specify a quantity (for example, quantity 2.5) or a percentage discount (for example, discount 10%).");
  if (/\b(?:quantity|qty)\b/i.test(text) && !quantities.length) errors.push("Quantity must be a finite positive number.");
  if (/\bdiscount\b/i.test(text) && !discounts.length) errors.push("Specify the discount as a percentage from 0–100%.");
  if (errors.length) throw new ErpToolError("BUSINESS_RULE", errors.join(" ") + " No draft values were changed.");
  const product = await Product.findOne({ tenantId: scope.tenantId, _id: params.line.itemId, "header.sale_ok": { $ne: false } }).lean();
  if (!product) throw new ErpToolError("NOT_FOUND", "The product is no longer available.", 404);
  const line = { ...params.line, ...(quantities.length ? { qty: quantities[0] } : {}), ...(discounts.length ? { discount: discounts[0], discountMode: "percent" as const } : {}) };
  validateDraftLine(product, line);
  const customer = await Customer.findOne({ tenantId: scope.tenantId, _id: params.customerId }).select("header").lean();
  if (!customer) throw new ErpToolError("NOT_FOUND", "The customer is no longer available.", 404);
  const summary = draftSummary(customerName(customer), line);
  const revision = params.revision;
  const updated = await AiCommandProposal.findOneAndUpdate({ ...filter, status: A.PROPOSED, expiresAt: { $gt: new Date() }, "params.executing": { $ne: true }, "params.revision": revision ?? { $exists: false } }, { $set: { "params.line": line, "params.revision": (revision ?? 0) + 1, "params.lastEditRequestId": requestId, summary, preview: { total: computeInvoiceTotals({ lineItems: [line] }).totalAmount } } }, { new: true });
  if (!updated) throw new ErpToolError("DRAFT_CHANGED", "The draft changed or is being confirmed. Please review it and try again.", 409);
  return {
    proposalId,
    message: summary,
    customerName: customerName(customer),
    line,
    totals: computeInvoiceTotals({ lineItems: [line] }),
  };
}
