import { normalizeIndianState } from "@/lib/constants/indianStates";

export const DEFAULT_SAAS_GST_RATE = 18; // 18% standard GST for SaaS in India (SAC 998313)
export const DEFAULT_SELLER_STATE = "Karnataka";

export interface ProrationInput {
  currentPlanPrice: number;
  targetPlanPrice: number;
  periodStart: Date;
  periodEnd: Date;
  changeDate?: Date;
  sellerState?: string;
  customerState?: string;
  gstRate?: number;
}

export interface ProrationResult {
  daysRemaining: number;
  totalDaysInCycle: number;
  prorationFraction: number;
  unusedCurrentPlanCredit: number;
  newPlanCost: number;
  proratedAmount: number; // Taxable value
  cgst: number;
  sgst: number;
  igst: number;
  totalTax: number;
  totalAmount: number;
  isInterState: boolean;
  gstRate: number;
}

/**
 * Calculates the exact prorated charge for an upgrade during an active billing period,
 * including statutory Indian GST split (CGST+SGST vs IGST).
 */
export function calculateProration(input: ProrationInput): ProrationResult {
  const changeDate = input.changeDate ? new Date(input.changeDate) : new Date();
  const periodStart = new Date(input.periodStart);
  const periodEnd = new Date(input.periodEnd);
  const gstRate = typeof input.gstRate === "number" ? input.gstRate : DEFAULT_SAAS_GST_RATE;
  const sellerState = input.sellerState || DEFAULT_SELLER_STATE;
  const customerState = input.customerState || DEFAULT_SELLER_STATE;

  const totalMs = periodEnd.getTime() - periodStart.getTime();
  const remainingMs = Math.max(0, periodEnd.getTime() - changeDate.getTime());

  const totalDaysInCycle = Math.max(1, Math.round(totalMs / (1000 * 60 * 60 * 24)));
  const daysRemaining = Math.max(0, Math.ceil(remainingMs / (1000 * 60 * 60 * 24)));

  const prorationFraction =
    totalMs > 0 ? Math.min(1, Math.max(0, remainingMs / totalMs)) : 0;

  const unusedCurrentPlanCredit =
    Math.round(input.currentPlanPrice * prorationFraction * 100) / 100;
  const newPlanCost =
    Math.round(input.targetPlanPrice * prorationFraction * 100) / 100;

  // Amount due before tax
  const rawProratedDiff = Math.max(0, newPlanCost - unusedCurrentPlanCredit);
  const proratedAmount = Math.round(rawProratedDiff * 100) / 100;

  // Determine inter-state vs intra-state supply
  const isInterState =
    normalizeIndianState(sellerState) !== normalizeIndianState(customerState);

  let cgst = 0;
  let sgst = 0;
  let igst = 0;

  if (proratedAmount > 0 && gstRate > 0) {
    if (isInterState) {
      igst = Math.round(((proratedAmount * gstRate) / 100) * 100) / 100;
    } else {
      const halfRate = gstRate / 2;
      cgst = Math.round(((proratedAmount * halfRate) / 100) * 100) / 100;
      sgst = cgst;
    }
  }

  const totalTax = Math.round((cgst + sgst + igst) * 100) / 100;
  const totalAmount = Math.round((proratedAmount + totalTax) * 100) / 100;

  return {
    daysRemaining,
    totalDaysInCycle,
    prorationFraction,
    unusedCurrentPlanCredit,
    newPlanCost,
    proratedAmount,
    cgst,
    sgst,
    igst,
    totalTax,
    totalAmount,
    isInterState,
    gstRate,
  };
}
