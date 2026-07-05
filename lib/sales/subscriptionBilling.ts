// Pure date math for subscription billing cycles — no DB access, unit-testable.
import { addDays, addWeeks, addMonths } from "date-fns";
import { SUBSCRIPTION_BILLING_FREQUENCY, type SubscriptionBillingFrequency } from "@/lib/constants/statuses";

/** Advances `date` by `n` billing periods of the given frequency. */
export function addBillingPeriods(date: Date, frequency: SubscriptionBillingFrequency, n = 1): Date {
  switch (frequency) {
    case SUBSCRIPTION_BILLING_FREQUENCY.WEEKLY:
      return addWeeks(date, n);
    case SUBSCRIPTION_BILLING_FREQUENCY.QUARTERLY:
      return addMonths(date, 3 * n);
    case SUBSCRIPTION_BILLING_FREQUENCY.HALF_YEARLY:
      return addMonths(date, 6 * n);
    case SUBSCRIPTION_BILLING_FREQUENCY.YEARLY:
      return addMonths(date, 12 * n);
    case SUBSCRIPTION_BILLING_FREQUENCY.MONTHLY:
    default:
      return addMonths(date, n);
  }
}

export interface SubscriptionScheduleInput {
  startDate: Date;
  trialDays: number;
  billingFrequency: SubscriptionBillingFrequency;
  neverExpires: boolean;
  expiresAfterCycles?: number;
}

export interface SubscriptionSchedule {
  trialEndsAt?: Date;
  activatedOn?: Date; // set immediately unless there's a trial period
  nextBillingOn: Date;
  expiresOn?: Date;
}

/** Computes the initial lifecycle dates for a brand-new subscription. */
export function computeInitialSchedule(input: SubscriptionScheduleInput): SubscriptionSchedule {
  const { startDate, trialDays, billingFrequency, neverExpires, expiresAfterCycles } = input;
  const trialEndsAt = trialDays > 0 ? addDays(startDate, trialDays) : undefined;
  const billingBase = trialEndsAt || startDate;
  const nextBillingOn = trialEndsAt ? trialEndsAt : addBillingPeriods(startDate, billingFrequency, 1);
  const expiresOn =
    !neverExpires && expiresAfterCycles
      ? addBillingPeriods(billingBase, billingFrequency, expiresAfterCycles)
      : undefined;

  return {
    trialEndsAt,
    activatedOn: trialEndsAt ? undefined : startDate,
    nextBillingOn,
    expiresOn,
  };
}
