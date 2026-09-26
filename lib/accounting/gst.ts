import { normalizeIndianState, INDIAN_STATES } from "@/lib/constants/indianStates";
/** GST credit utilisation: IGST first; CGST and SGST cannot offset each other. */
export type GstBalances = { igst: number; cgst: number; sgst: number };
export const GST_INPUT_CODES = { cgst: "1221", sgst: "1222", igst: "1223" } as const;
export const GST_OUTPUT_CODES = { cgst: "2161", sgst: "2162", igst: "2163" } as const;
export const gstRound = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
export function calculateGstSetoff(input: GstBalances, output: GstBalances) {
  const credit = { ...input }, payable = { ...output };
  for (const value of [...Object.values(credit), ...Object.values(payable)]) {
    if (!Number.isFinite(value) || value < 0) throw new Error("GST balances must be finite and non-negative.");
  }
  const allocations: { from: keyof GstBalances; to: keyof GstBalances; amount: number }[] = [];
  const applyCredit = (from: keyof GstBalances, to: keyof GstBalances) => {
    const amount = gstRound(Math.min(credit[from], payable[to]));
    if (amount <= 0) return;
    credit[from] = gstRound(credit[from] - amount);
    payable[to] = gstRound(payable[to] - amount);
    allocations.push({ from, to, amount });
  };
  applyCredit("igst", "igst");
  // Prefer liabilities that own-head credit cannot cover, avoiding needless cash tax.
  const first = payable.cgst - credit.cgst >= payable.sgst - credit.sgst ? "cgst" : "sgst";
  const second = first === "cgst" ? "sgst" : "cgst";
  for (const head of [first, second] as const) {
    const deficit = Math.max(0, gstRound(payable[head] - credit[head]));
    const amount = Math.min(credit.igst, deficit);
    if (amount > 0) {
      credit.igst = gstRound(credit.igst - amount); payable[head] = gstRound(payable[head] - amount);
      allocations.push({ from: "igst", to: head, amount });
    }
  }
  applyCredit("igst", "cgst"); applyCredit("igst", "sgst");
  applyCredit("cgst", "cgst"); applyCredit("sgst", "sgst");
  applyCredit("cgst", "igst"); applyCredit("sgst", "igst");
  return { allocations, remainingCredit: credit, cashPayable: payable,
    totalCreditUsed: gstRound(allocations.reduce((sum, a) => sum + a.amount, 0)),
    totalCashPayable: gstRound(Object.values(payable).reduce((sum, n) => sum + n, 0)) };
}
export function splitGst(amount: number, supplierState: string, placeOfSupply: string): GstBalances {
  if (!supplierState?.trim() || !placeOfSupply?.trim()) throw new Error("Supplier state and place of supply are required for GST.");
  const states = new Set(INDIAN_STATES.map(normalizeIndianState));
  if (!states.has(normalizeIndianState(supplierState)) || !states.has(normalizeIndianState(placeOfSupply))) throw new Error("Choose valid Indian states for supplier and place of supply.");
  if (!Number.isFinite(amount) || amount < 0) throw new Error("GST amount must be non-negative.");
  const total = gstRound(amount);
  if (normalizeIndianState(supplierState) !== normalizeIndianState(placeOfSupply)) return { igst: total, cgst: 0, sgst: 0 };
  const cgst = gstRound(total / 2);
  return { cgst, sgst: gstRound(total - cgst), igst: 0 };
}
