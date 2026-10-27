import { normalizeIndianState } from "@/lib/constants/indianStates";
import { DEFAULT_SAAS_GST_RATE, DEFAULT_SELLER_STATE } from "@/lib/billing/proration";

export function calculateRenewalTax(taxableAmount: number, customerState?: string) {
  if (!Number.isFinite(taxableAmount) || taxableAmount <= 0) throw new Error("Renewal price must be positive.");
  const normalizedCustomer = normalizeIndianState(customerState || DEFAULT_SELLER_STATE);
  const interState = normalizedCustomer !== normalizeIndianState(DEFAULT_SELLER_STATE);
  const totalTax = Math.round((taxableAmount * DEFAULT_SAAS_GST_RATE + Number.EPSILON)) / 100;
  const halfTax = Math.round(totalTax * 50) / 100;
  const cgst = interState ? 0 : halfTax;
  const sgst = interState ? 0 : halfTax;
  const igst = interState ? totalTax : 0;
  return {
    taxableAmount,
    cgst,
    sgst,
    igst,
    totalTax: cgst + sgst + igst,
    isInterState: interState,
    totalAmount: Math.round((taxableAmount + cgst + sgst + igst + Number.EPSILON) * 100) / 100,
  };
}
