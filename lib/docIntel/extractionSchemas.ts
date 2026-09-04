/**
 * Document Intelligence (vNext Expansion Module 12) — extraction schemas.
 *
 * Pure (no AI/DB): defines what fields each supported document type extracts,
 * builds the extraction prompt, and coerces the model's raw JSON into a clean,
 * typed structure. Keeping coercion here (not inside the LLM caller) makes the
 * parsing logic unit-testable without any network.
 *
 * v1 focuses on the headline AP use case — Vendor Bills — because it is the
 * highest-volume manual-entry document. New document types (PO, expense,
 * contract) slot in by adding a schema + a create handler.
 */

export const DOC_INTEL_STATUS = {
  EXTRACTED: "extracted", // parsed, awaiting human review
  CONFIRMED: "confirmed", // a record was created from it
  REJECTED: "rejected",
} as const;

export type DocIntelStatus = (typeof DOC_INTEL_STATUS)[keyof typeof DOC_INTEL_STATUS];

export const DOC_INTEL_TYPE = {
  VENDOR_BILL: "vendor_bill",
  // Additive (docs/ai/BRIEF-02-BATCH-A.md AI-04) — schema/prompt/coerce only in this batch.
  // Wiring lib/docIntel/extractor.ts's typed extractDocument() to accept this type (so it
  // flows through the same upload pipeline as vendor_bill) is a deliberate follow-up, not
  // done here — see docs/ai/OPEN_QUESTIONS.md. AI-04 reacts to `expense.submitted` (an
  // already-created Expense) in this chunk, not to a receipt upload event.
  RECEIPT: "receipt",
} as const;

export type DocIntelType = (typeof DOC_INTEL_TYPE)[keyof typeof DOC_INTEL_TYPE];

export const DOC_INTEL_TYPE_VALUES = Object.values(DOC_INTEL_TYPE);

export interface ExtractedLineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
}

export interface VendorBillExtraction {
  vendorName: string;
  vendorGstin: string;
  billNumber: string;
  billDate: string; // ISO yyyy-mm-dd if the model could resolve it
  dueDate: string;
  currency: string;
  poReference: string;
  lineItems: ExtractedLineItem[];
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  /** 0-100 self-reported extraction confidence. */
  confidence: number;
}

export interface ReceiptExtraction {
  merchantName: string;
  receiptDate: string;
  currency: string;
  paymentMethod: string;
  category: string;
  lineItems: ExtractedLineItem[];
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  /** 0-100 self-reported extraction confidence. */
  confidence: number;
}

function toNum(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v === "string") {
    const n = Number(v.replace(/[^0-9.-]/g, ""));
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function toStr(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

/** Coerce arbitrary parsed JSON into a clean VendorBillExtraction. */
export function coerceVendorBill(parsed: Record<string, unknown>): VendorBillExtraction {
  const rawLines = Array.isArray(parsed.lineItems) ? parsed.lineItems : [];
  const lineItems: ExtractedLineItem[] = rawLines
    .map((l) => {
      const li = (l ?? {}) as Record<string, unknown>;
      const quantity = toNum(li.quantity) || 1;
      const unitPrice = toNum(li.unitPrice ?? li.rate ?? li.price);
      const amount = toNum(li.amount ?? li.total) || quantity * unitPrice;
      return { description: toStr(li.description ?? li.item ?? li.name), quantity, unitPrice, amount };
    })
    .filter((l) => l.description || l.amount > 0);

  const subtotal = toNum(parsed.subtotal ?? parsed.amountUntaxed);
  const taxAmount = toNum(parsed.taxAmount ?? parsed.tax ?? parsed.gst);
  const linesSum = lineItems.reduce((s, l) => s + l.amount, 0);
  const totalAmount = toNum(parsed.totalAmount ?? parsed.total ?? parsed.grandTotal) || subtotal + taxAmount || linesSum;

  const confidence = Math.max(0, Math.min(100, toNum(parsed.confidence)));

  return {
    vendorName: toStr(parsed.vendorName ?? parsed.vendor ?? parsed.supplier),
    vendorGstin: toStr(parsed.vendorGstin ?? parsed.gstin ?? parsed.gst).toUpperCase(),
    billNumber: toStr(parsed.billNumber ?? parsed.invoiceNumber ?? parsed.number),
    billDate: toStr(parsed.billDate ?? parsed.invoiceDate ?? parsed.date),
    dueDate: toStr(parsed.dueDate),
    currency: toStr(parsed.currency) || "INR",
    poReference: toStr(parsed.poReference ?? parsed.poNumber ?? parsed.po),
    lineItems,
    subtotal: subtotal || Math.max(0, totalAmount - taxAmount),
    taxAmount,
    totalAmount,
    confidence,
  };
}

/** Coerce arbitrary parsed JSON into a clean ReceiptExtraction — same pattern as
 *  coerceVendorBill, additive (docs/ai/BRIEF-02-BATCH-A.md AI-04). */
export function coerceReceipt(parsed: Record<string, unknown>): ReceiptExtraction {
  const rawLines = Array.isArray(parsed.lineItems) ? parsed.lineItems : [];
  const lineItems: ExtractedLineItem[] = rawLines
    .map((l) => {
      const li = (l ?? {}) as Record<string, unknown>;
      const quantity = toNum(li.quantity) || 1;
      const unitPrice = toNum(li.unitPrice ?? li.rate ?? li.price);
      const amount = toNum(li.amount ?? li.total) || quantity * unitPrice;
      return { description: toStr(li.description ?? li.item ?? li.name), quantity, unitPrice, amount };
    })
    .filter((l) => l.description || l.amount > 0);

  const subtotal = toNum(parsed.subtotal ?? parsed.amountUntaxed);
  const taxAmount = toNum(parsed.taxAmount ?? parsed.tax ?? parsed.gst);
  const linesSum = lineItems.reduce((s, l) => s + l.amount, 0);
  const totalAmount = toNum(parsed.totalAmount ?? parsed.total ?? parsed.grandTotal) || subtotal + taxAmount || linesSum;
  const confidence = Math.max(0, Math.min(100, toNum(parsed.confidence)));

  return {
    merchantName: toStr(parsed.merchantName ?? parsed.merchant ?? parsed.vendor),
    receiptDate: toStr(parsed.receiptDate ?? parsed.date),
    currency: toStr(parsed.currency) || "INR",
    paymentMethod: toStr(parsed.paymentMethod ?? parsed.payment_method),
    category: toStr(parsed.category),
    lineItems,
    subtotal: subtotal || Math.max(0, totalAmount - taxAmount),
    taxAmount,
    totalAmount,
    confidence,
  };
}

const RECEIPT_PROMPT = `You are extracting structured data from an EXPENSE RECEIPT.
Return ONLY a JSON object — no markdown fences, no prose — in exactly this shape:
{
  "merchantName": "<merchant/store name>",
  "receiptDate": "<yyyy-mm-dd if resolvable, else the date text>",
  "currency": "<ISO code, default INR>",
  "paymentMethod": "<cash|card|upi|other, best guess or empty>",
  "category": "<a short expense category guess, e.g. travel, meals, supplies>",
  "lineItems": [{ "description": "", "quantity": 0, "unitPrice": 0, "amount": 0 }],
  "subtotal": <number>,
  "taxAmount": <number>,
  "totalAmount": <number, amount actually paid>,
  "confidence": <0-100, how confident you are given the document quality>
}
Extract only what is actually present. Never invent a merchant, date, or amount that is not in the document. If a field is missing, use an empty string or 0.`;

const VENDOR_BILL_PROMPT = `You are extracting structured data from a VENDOR BILL / PURCHASE INVOICE.
Return ONLY a JSON object — no markdown fences, no prose — in exactly this shape:
{
  "vendorName": "<supplier's legal/company name>",
  "vendorGstin": "<supplier GSTIN if present, else empty>",
  "billNumber": "<the supplier's own invoice/bill number>",
  "billDate": "<yyyy-mm-dd if resolvable, else the date text>",
  "dueDate": "<yyyy-mm-dd or empty>",
  "currency": "<ISO code, default INR>",
  "poReference": "<purchase order number if referenced, else empty>",
  "lineItems": [{ "description": "", "quantity": 0, "unitPrice": 0, "amount": 0 }],
  "subtotal": <number>,
  "taxAmount": <number, total GST/VAT>,
  "totalAmount": <number, grand total payable>,
  "confidence": <0-100, how confident you are given the document quality>
}
Extract only what is actually present. Never invent a vendor, number, or amount that is not in the document. If a field is missing, use an empty string or 0.`;

export function buildExtractionPrompt(type: DocIntelType): string {
  switch (type) {
    case DOC_INTEL_TYPE.RECEIPT:
      return RECEIPT_PROMPT;
    case DOC_INTEL_TYPE.VENDOR_BILL:
      return VENDOR_BILL_PROMPT;
    default:
      return VENDOR_BILL_PROMPT;
  }
}

/** Parse the model's raw text response into a coerced VendorBillExtraction, or throw.
 *  Kept to its original signature/behavior (additive-only) — see parseReceiptExtraction
 *  below for the parallel receipt path. */
export function parseExtraction(type: DocIntelType, rawText: string): VendorBillExtraction {
  const match = rawText.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("Model did not return parseable JSON");
  const parsed = JSON.parse(match[0]) as Record<string, unknown>;
  return coerceVendorBill(parsed);
}

/** Parse the model's raw text response into a coerced ReceiptExtraction, or throw. */
export function parseReceiptExtraction(rawText: string): ReceiptExtraction {
  const match = rawText.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("Model did not return parseable JSON");
  const parsed = JSON.parse(match[0]) as Record<string, unknown>;
  return coerceReceipt(parsed);
}
