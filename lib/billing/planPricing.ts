import { PLAN_SEAT_BANDS, normalizePlanUserCount, type SeatBandPlanKey } from "./seatBands";

/** Price a configured plan for a selected seat count. Metered plans add the
 * configured per-seat rate above the included-user baseline; fixed plans keep
 * their configured price and included seat count. */
export function priceForUsers(plan: { key?: string; priceMonthly: number; priceYearly: number; meteredUsers?: boolean; includedUsers?: number; additionalUserPriceMonthly?: number; additionalUserPriceYearly?: number; features: { maxUsers: number } }, cycle: "monthly" | "yearly", requestedUsers?: number) {
  // Fixed seat bands are enforced here so previews, checkout, scheduled
  // changes, and renewals all price the same minimum and maximum.
  const band = plan.key && plan.key in PLAN_SEAT_BANDS
    ? PLAN_SEAT_BANDS[plan.key as SeatBandPlanKey]
    : undefined;
  if (plan.key === "starter") {
    const configuredPrice = cycle === "yearly"
      ? band?.baseYearly ?? plan.priceYearly
      : band?.baseMonthly ?? plan.priceMonthly;
    return { price: configuredPrice, userCount: 5 };
  }

  const configuredUsers = band?.maximum ?? Math.max(1, Math.floor(plan.features.maxUsers || 1));
  const includedUsers = band?.minimum ?? Math.min(configuredUsers, Math.max(1, Math.floor(plan.includedUsers || configuredUsers)));
  const requested = requestedUsers === undefined || !Number.isFinite(Number(requestedUsers))
    ? includedUsers
    : Math.floor(Number(requestedUsers));
  const userMetered = plan.meteredUsers || ["starter", "growth", "pro"].includes(plan.key || "");
  const boundedUserCount = userMetered
    ? Math.min(configuredUsers, Math.max(includedUsers, requested))
    : configuredUsers;
  const userCount = plan.key === "pro"
    ? normalizePlanUserCount(plan.key, boundedUserCount)
    : boundedUserCount;
  const configuredPrice = cycle === "yearly"
    ? band?.baseYearly ?? plan.priceYearly
    : band?.baseMonthly ?? plan.priceMonthly;
  const extraUserPrice = band
    ? cycle === "yearly" ? band.extraYearly : band.extraMonthly
    : cycle === "yearly"
      ? plan.additionalUserPriceYearly || 0
      : plan.additionalUserPriceMonthly || 0;
  const price = userMetered
    ? userCount < includedUsers
      ? Math.round((configuredPrice * userCount) / includedUsers)
      : configuredPrice + (userCount - includedUsers) * extraUserPrice
    : configuredPrice;
  return { price: Math.round(price), userCount };
}

export const PLAN_ADD_ONS: Record<string, Array<{ key: string; label: string; monthlyPerUser: number }>> = {
  starter: [
    { key: "ai_assistant", label: "AI chat assistant", monthlyPerUser: 200 },
    { key: "workflow_assistant", label: "Workflow automations", monthlyPerUser: 100 },
  ],
  growth: [
    { key: "ai_assistant", label: "AI bookkeeping & ops", monthlyPerUser: 200 },
    { key: "workflow_assistant", label: "Compliance workflows", monthlyPerUser: 300 },
  ],
  pro: [
    { key: "ai_assistant", label: "Audit / compliance layers", monthlyPerUser: 100 },
    { key: "workflow_assistant", label: "Multi-entity workflows", monthlyPerUser: 160 },
  ],
};

export function normalizeSelectedAddOns(planKey: string, enabledAddOns: string[] = []) {
  const allowed = new Set((PLAN_ADD_ONS[planKey] || []).map((addOn) => addOn.key));
  return [...new Set(enabledAddOns)].filter((key) => allowed.has(key));
}

export function priceWithAddOns(plan: Parameters<typeof priceForUsers>[0], cycle: "monthly" | "yearly", users: number, enabledAddOns: string[]) {
  const base = priceForUsers(plan, cycle, users);
  const selectedAddOns = normalizeSelectedAddOns(plan.key || "", enabledAddOns);
  const band = plan.key && plan.key in PLAN_SEAT_BANDS
    ? PLAN_SEAT_BANDS[plan.key as SeatBandPlanKey]
    : undefined;
  const addOnSeats = band?.minimum ?? Math.max(1, Math.floor(plan.includedUsers || plan.features.maxUsers || 1));
  const addOnMonthly = (PLAN_ADD_ONS[(plan as any).key] || [])
    .filter((addOn) => selectedAddOns.includes(addOn.key))
    .reduce((sum, addOn) => sum + addOn.monthlyPerUser * addOnSeats, 0);
  return { ...base, selectedAddOns, price: Math.round(base.price + addOnMonthly * (cycle === "yearly" ? 12 : 1)) };
}
