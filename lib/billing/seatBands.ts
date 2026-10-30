/** Fixed customer-facing seat bands and incremental rates for paid plans. */
export const PLAN_SEAT_BANDS = {
  starter: {
    displayName: "Starter",
    description: "For freelancers, creators, agencies and very small teams.",
    note: "Freemium option available for 1 user",
    baseMonthly: 2999,
    baseYearly: 35988,
    minimum: 5,
    maximum: 5,
    extraMonthly: 0,
    extraYearly: 0,
  },
  growth: {
    displayName: "Growth",
    description: "For growing SMBs with operational and finance complexity.",
    note: "Customisable within tier features",
    baseMonthly: 12000,
    baseYearly: 144000,
    minimum: 10,
    maximum: 50,
    extraMonthly: 150,
    extraYearly: 1800,
  },
  pro: {
    displayName: "Scale",
    description: "For larger, operationally complex businesses.",
    note: "For operationally complex businesses",
    baseMonthly: 35000,
    baseYearly: 420000,
    minimum: 50,
    maximum: 500,
    extraMonthly: 88.88,
    extraYearly: 1066.56,
  },
} as const;

export type SeatBandPlanKey = keyof typeof PLAN_SEAT_BANDS;

/** Scale seats are sold in blocks of ten, starting with the included 50 seats. */
export function normalizePlanUserCount(planKey: string, requested: number) {
  const band = PLAN_SEAT_BANDS[planKey as SeatBandPlanKey];
  if (!band) return Math.max(1, Math.floor(requested));
  const bounded = Math.min(band.maximum, Math.max(band.minimum, Math.floor(requested)));
  if (planKey !== "pro") return bounded;
  return Math.min(band.maximum, band.minimum + Math.round((bounded - band.minimum) / 10) * 10);
}
