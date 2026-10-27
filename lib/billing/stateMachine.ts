import {
  SAAS_SUBSCRIPTION_STATUS,
  SaaSSubscriptionStatus,
} from "@/models/billing/SaaSSubscription";

/**
 * Valid subscription state transitions.
 *
 * State Definitions:
 * - TRIAL: Workspace is in introductory trial period.
 * - ACTIVE: Valid paid subscription in good standing.
 * - PENDING_PAYMENT: A payment has been initiated or invoice issued, awaiting confirmation.
 * - PAST_DUE: A recurring renewal charge failed; currently inside the 3-day grace period.
 * - SUSPENDED: Grace period expired with unpaid charges or admin intervention; write access blocked.
 * - CANCELLED: Customer requested cancellation; access maintained until paidThroughDate.
 * - EXPIRED: Subscription period ended without renewal; access blocked.
 */
export const ALLOWED_SUBSCRIPTION_TRANSITIONS: Record<
  SaaSSubscriptionStatus,
  SaaSSubscriptionStatus[]
> = {
  [SAAS_SUBSCRIPTION_STATUS.TRIAL]: [
    SAAS_SUBSCRIPTION_STATUS.ACTIVE,
    SAAS_SUBSCRIPTION_STATUS.PENDING_PAYMENT,
    SAAS_SUBSCRIPTION_STATUS.EXPIRED,
    SAAS_SUBSCRIPTION_STATUS.CANCELLED,
    SAAS_SUBSCRIPTION_STATUS.SUSPENDED,
  ],
  [SAAS_SUBSCRIPTION_STATUS.ACTIVE]: [
    SAAS_SUBSCRIPTION_STATUS.ACTIVE, // Plan upgrade/downgrade/renewal keeps active
    SAAS_SUBSCRIPTION_STATUS.PENDING_PAYMENT,
    SAAS_SUBSCRIPTION_STATUS.PAST_DUE,
    SAAS_SUBSCRIPTION_STATUS.CANCELLED,
    SAAS_SUBSCRIPTION_STATUS.EXPIRED,
    SAAS_SUBSCRIPTION_STATUS.SUSPENDED,
  ],
  [SAAS_SUBSCRIPTION_STATUS.PENDING_PAYMENT]: [
    SAAS_SUBSCRIPTION_STATUS.ACTIVE,
    SAAS_SUBSCRIPTION_STATUS.PAST_DUE,
    SAAS_SUBSCRIPTION_STATUS.CANCELLED,
    SAAS_SUBSCRIPTION_STATUS.SUSPENDED,
  ],
  [SAAS_SUBSCRIPTION_STATUS.PAST_DUE]: [
    SAAS_SUBSCRIPTION_STATUS.ACTIVE, // Successful retry/recovery
    SAAS_SUBSCRIPTION_STATUS.SUSPENDED, // Grace period expired without recovery
    SAAS_SUBSCRIPTION_STATUS.CANCELLED,
    SAAS_SUBSCRIPTION_STATUS.EXPIRED,
  ],
  [SAAS_SUBSCRIPTION_STATUS.CANCELLED]: [
    SAAS_SUBSCRIPTION_STATUS.ACTIVE, // Reactivation before paidThroughDate
    SAAS_SUBSCRIPTION_STATUS.EXPIRED, // End of paidThroughDate reached
    SAAS_SUBSCRIPTION_STATUS.SUSPENDED,
  ],
  [SAAS_SUBSCRIPTION_STATUS.EXPIRED]: [
    SAAS_SUBSCRIPTION_STATUS.ACTIVE, // Resubscribed with verified payment
    SAAS_SUBSCRIPTION_STATUS.PENDING_PAYMENT,
  ],
  [SAAS_SUBSCRIPTION_STATUS.SUSPENDED]: [
    SAAS_SUBSCRIPTION_STATUS.ACTIVE, // Payment recovered or admin restored
    SAAS_SUBSCRIPTION_STATUS.PENDING_PAYMENT,
    SAAS_SUBSCRIPTION_STATUS.CANCELLED,
    SAAS_SUBSCRIPTION_STATUS.EXPIRED,
  ],
};

export function isValidSubscriptionTransition(
  from: SaaSSubscriptionStatus,
  to: SaaSSubscriptionStatus
): boolean {
  if (from === to) return true;
  const allowed = ALLOWED_SUBSCRIPTION_TRANSITIONS[from];
  return allowed ? allowed.includes(to) : false;
}

export class SubscriptionStateTransitionError extends Error {
  constructor(
    public fromStatus: SaaSSubscriptionStatus,
    public toStatus: SaaSSubscriptionStatus,
    message?: string
  ) {
    super(
      message ||
        `Illegal subscription state transition from "${fromStatus}" to "${toStatus}"`
    );
    this.name = "SubscriptionStateTransitionError";
  }
}

export function validateSubscriptionTransition(
  from: SaaSSubscriptionStatus,
  to: SaaSSubscriptionStatus
): void {
  if (!isValidSubscriptionTransition(from, to)) {
    throw new SubscriptionStateTransitionError(from, to);
  }
}
