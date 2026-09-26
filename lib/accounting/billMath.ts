import { gstRound } from "./gst";
export function computeBillTotals(lines: any[]) {
  const computed = lines.map((line) => {
    const quantity = Number(line.quantity ?? 1), priceUnit = Number(line.priceUnit ?? 0), taxRate = Number(line.taxRate ?? 0), discount = Number(line.discount ?? 0);
    if (![quantity, priceUnit, taxRate, discount].every(Number.isFinite) || quantity <= 0 || priceUnit < 0 || taxRate < 0 || taxRate > 100 || discount < 0 || discount > 100) throw new Error("Enter valid bill quantities, prices, discounts and GST rates.");
    const priceSubtotal = gstRound(quantity * priceUnit * (1 - discount / 100));
    return { ...line, quantity, priceUnit, taxRate, discount, priceSubtotal };
  });
  const amountUntaxed = gstRound(computed.reduce((sum, l) => sum + l.priceSubtotal, 0));
  const amountTax = gstRound(computed.reduce((sum, l) => sum + gstRound(l.priceSubtotal * l.taxRate / 100), 0));
  return { invoiceLines: computed, amountUntaxed, amountTax, amountTotal: gstRound(amountUntaxed + amountTax) };
}
