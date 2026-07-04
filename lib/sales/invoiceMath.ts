// Pure functions — invoice line/tax/total math. No DB access, fully unit-testable.

export interface InvoiceLineInput {
  qty: number;
  unitPrice: number;
  discount: number;
  discountMode: "percent" | "amount";
  taxRate: number;
  hsn?: string;
  name?: string;
}

export interface ComputedLine extends InvoiceLineInput {
  gross: number;
  lineDiscountAmount: number;
  taxableValue: number;
  taxAmount: number;
  lineTotal: number;
}

export function computeLine(item: InvoiceLineInput, itemLevelDiscountPercent = 0): ComputedLine {
  const qty = Number(item.qty) || 0;
  const unitPrice = Number(item.unitPrice) || 0;
  const gross = qty * unitPrice;
  const discount = Number(item.discount) || 0;
  const lineDiscountAmount =
    item.discountMode === "percent" ? (gross * discount) / 100 : Math.min(discount, gross);
  const afterLineDiscount = gross - lineDiscountAmount;
  const globalDiscountAmount = itemLevelDiscountPercent
    ? (afterLineDiscount * itemLevelDiscountPercent) / 100
    : 0;
  const taxableValue = Math.max(0, afterLineDiscount - globalDiscountAmount);
  const taxRate = Number(item.taxRate) || 0;
  const taxAmount = (taxableValue * taxRate) / 100;
  const lineTotal = taxableValue + taxAmount;

  return {
    ...item,
    gross,
    lineDiscountAmount: lineDiscountAmount + globalDiscountAmount,
    taxableValue,
    taxAmount,
    lineTotal,
  };
}

export interface AdditionalCharge {
  name: string;
  amount: number;
  isTaxable: boolean;
}

export interface InvoiceTotalsInput {
  lineItems: InvoiceLineInput[];
  itemLevelDiscountPercent?: number;
  additionalCharges?: AdditionalCharge[];
  extraDiscount?: number;
  extraDiscountMode?: "percent" | "amount";
  roundOff?: boolean;
  sellerState?: string;
  placeOfSupply?: string;
  tdsRate?: number;
  tcsRate?: number;
}

export interface InvoiceTotalsResult {
  computedLines: ComputedLine[];
  subtotal: number;
  totalDiscount: number;
  additionalChargesTotal: number;
  extraDiscountAmount: number;
  taxableAmount: number;
  isInterState: boolean;
  cgst: number;
  sgst: number;
  igst: number;
  totalTax: number;
  tdsAmount: number;
  tcsAmount: number;
  roundOffAmount: number;
  totalAmount: number;
  gstBreakup: { label: string; amount: number }[];
}

function normalizeState(s?: string) {
  return (s || "").trim().toLowerCase();
}

export function computeInvoiceTotals(input: InvoiceTotalsInput): InvoiceTotalsResult {
  const {
    lineItems,
    itemLevelDiscountPercent = 0,
    additionalCharges = [],
    extraDiscount = 0,
    extraDiscountMode = "amount",
    roundOff = false,
    sellerState,
    placeOfSupply,
    tdsRate = 0,
    tcsRate = 0,
  } = input;

  const computedLines = lineItems.map((li) => computeLine(li, itemLevelDiscountPercent));

  const subtotal = computedLines.reduce((acc, l) => acc + l.gross, 0);
  const lineDiscountTotal = computedLines.reduce((acc, l) => acc + l.lineDiscountAmount, 0);
  const sumTaxableBeforeExtra = computedLines.reduce((acc, l) => acc + l.taxableValue, 0);
  const sumLineTax = computedLines.reduce((acc, l) => acc + l.taxAmount, 0);

  const extraDiscountAmount =
    extraDiscountMode === "percent" ? (sumTaxableBeforeExtra * extraDiscount) / 100 : extraDiscount;

  const additionalChargesTotal = additionalCharges.reduce((acc, c) => acc + (Number(c.amount) || 0), 0);
  const taxableAdditionalCharges = additionalCharges
    .filter((c) => c.isTaxable)
    .reduce((acc, c) => acc + (Number(c.amount) || 0), 0);

  const netTaxableBase = Math.max(0, sumTaxableBeforeExtra - extraDiscountAmount);
  const taxableAmount = netTaxableBase + additionalChargesTotal;

  // Weighted-average effective tax rate carried over proportionally after
  // extra discount is applied, then charged on the taxable portion of
  // additional charges too.
  const effectiveTaxRateAvg = sumTaxableBeforeExtra > 0 ? sumLineTax / sumTaxableBeforeExtra : 0;
  const totalTax = netTaxableBase * effectiveTaxRateAvg + taxableAdditionalCharges * effectiveTaxRateAvg;

  const isInterState =
    !!sellerState && !!placeOfSupply && normalizeState(sellerState) !== normalizeState(placeOfSupply);

  const cgst = isInterState ? 0 : totalTax / 2;
  const sgst = isInterState ? 0 : totalTax / 2;
  const igst = isInterState ? totalTax : 0;

  const tdsAmount = tdsRate ? (taxableAmount * tdsRate) / 100 : 0;
  const tcsAmount = tcsRate ? ((taxableAmount + totalTax) * tcsRate) / 100 : 0;

  const totalBeforeRound = taxableAmount + totalTax + tcsAmount - tdsAmount;
  const roundOffAmount = roundOff ? Math.round(totalBeforeRound) - totalBeforeRound : 0;
  const totalAmount = totalBeforeRound + roundOffAmount;

  const gstBreakup: { label: string; amount: number }[] = [];
  if (isInterState) {
    if (igst) gstBreakup.push({ label: "IGST", amount: round2(igst) });
  } else {
    if (cgst) gstBreakup.push({ label: "CGST", amount: round2(cgst) });
    if (sgst) gstBreakup.push({ label: "SGST", amount: round2(sgst) });
  }
  if (tdsAmount) gstBreakup.push({ label: "TDS", amount: -round2(tdsAmount) });
  if (tcsAmount) gstBreakup.push({ label: "TCS", amount: round2(tcsAmount) });

  return {
    computedLines,
    subtotal: round2(subtotal),
    totalDiscount: round2(lineDiscountTotal + extraDiscountAmount),
    additionalChargesTotal: round2(additionalChargesTotal),
    extraDiscountAmount: round2(extraDiscountAmount),
    taxableAmount: round2(taxableAmount),
    isInterState,
    cgst: round2(cgst),
    sgst: round2(sgst),
    igst: round2(igst),
    totalTax: round2(totalTax),
    tdsAmount: round2(tdsAmount),
    tcsAmount: round2(tcsAmount),
    roundOffAmount: round2(roundOffAmount),
    totalAmount: round2(totalAmount),
    gstBreakup,
  };
}

export interface HsnSummaryRow {
  hsn: string;
  taxableValue: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  totalTax: number;
  total: number;
}

export function computeHsnSummary(computedLines: ComputedLine[], isInterState: boolean): HsnSummaryRow[] {
  const map = new Map<string, HsnSummaryRow>();
  for (const line of computedLines) {
    const hsn = line.hsn || "-";
    const row =
      map.get(hsn) ||
      ({ hsn, taxableValue: 0, cgstAmount: 0, sgstAmount: 0, igstAmount: 0, totalTax: 0, total: 0 } as HsnSummaryRow);
    row.taxableValue += line.taxableValue;
    if (isInterState) {
      row.igstAmount += line.taxAmount;
    } else {
      row.cgstAmount += line.taxAmount / 2;
      row.sgstAmount += line.taxAmount / 2;
    }
    row.totalTax += line.taxAmount;
    row.total += line.lineTotal;
    map.set(hsn, row);
  }
  return Array.from(map.values()).map((r) => ({
    ...r,
    taxableValue: round2(r.taxableValue),
    cgstAmount: round2(r.cgstAmount),
    sgstAmount: round2(r.sgstAmount),
    igstAmount: round2(r.igstAmount),
    totalTax: round2(r.totalTax),
    total: round2(r.total),
  }));
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

const ONES = [
  "",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
  "Eleven",
  "Twelve",
  "Thirteen",
  "Fourteen",
  "Fifteen",
  "Sixteen",
  "Seventeen",
  "Eighteen",
  "Nineteen",
];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function twoDigits(n: number): string {
  if (n < 20) return ONES[n];
  const t = Math.floor(n / 10);
  const o = n % 10;
  return `${TENS[t]}${o ? " " + ONES[o] : ""}`;
}

function threeDigits(n: number): string {
  const h = Math.floor(n / 100);
  const rest = n % 100;
  return `${h ? ONES[h] + " Hundred" + (rest ? " " : "") : ""}${rest ? twoDigits(rest) : ""}`;
}

/** Indian numbering system (Crore/Lakh/Thousand) → words. */
export function numberToWords(amount: number): string {
  const rounded = Math.round((amount + Number.EPSILON) * 100) / 100;
  const rupees = Math.floor(Math.abs(rounded));
  const paise = Math.round((Math.abs(rounded) - rupees) * 100);

  if (rupees === 0 && paise === 0) return "Zero Rupees Only";

  let n = rupees;
  const crore = Math.floor(n / 10000000);
  n %= 10000000;
  const lakh = Math.floor(n / 100000);
  n %= 100000;
  const thousand = Math.floor(n / 1000);
  n %= 1000;
  const hundred = n;

  const parts: string[] = [];
  if (crore) parts.push(`${threeDigits(crore)} Crore`);
  if (lakh) parts.push(`${threeDigits(lakh)} Lakh`);
  if (thousand) parts.push(`${threeDigits(thousand)} Thousand`);
  if (hundred) parts.push(threeDigits(hundred));

  let words = (rounded < 0 ? "Minus " : "") + parts.join(" ") + " Rupees";
  if (paise) {
    words += ` and ${twoDigits(paise)} Paise`;
  }
  return `${words} Only`;
}
