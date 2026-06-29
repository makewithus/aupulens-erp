import mongoose, { Schema, Document, Model } from "mongoose";
import {
  SUBSCRIPTION_EVENT_TYPE,
  SUBSCRIPTION_EVENT_TYPE_VALUES,
  type SubscriptionEventType,
  ORGANIZATION_TIER_VALUES,
  type OrganizationTier,
} from "@/lib/constants/statuses";

export interface ISubscriptionEvent extends Document {
  tenantId: string;
  type: SubscriptionEventType;
  tier: OrganizationTier;
  amount: number;
  currency: string;
  occurredAt: Date;
  externalEventId?: string;
  meta?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const SubscriptionEventSchema: Schema<ISubscriptionEvent> = new Schema(
  {
    tenantId: { type: String, required: true, index: true },
    type: {
      type: String,
      enum: SUBSCRIPTION_EVENT_TYPE_VALUES,
      required: true,
    },
    tier: {
      type: String,
      enum: ORGANIZATION_TIER_VALUES,
      required: true,
    },
    amount: { type: Number, default: 0 },
    currency: { type: String, default: "USD", uppercase: true, trim: true },
    occurredAt: { type: Date, default: Date.now },
    externalEventId: { type: String, sparse: true },
    meta: { type: Schema.Types.Mixed },
  },
  { timestamps: true },
);

// Idempotency — deduplicates webhook/event replays.
// Partial filter: constraint only applies when externalEventId is present;
// events without externalEventId (e.g. manual entries) are unconstrained.
SubscriptionEventSchema.index(
  { tenantId: 1, externalEventId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      externalEventId: { $exists: true, $type: "string" },
    },
  },
);

// Efficient tenant-scoped newest-first queries.
SubscriptionEventSchema.index({ tenantId: 1, occurredAt: -1 });

// Append-only by design — no update or delete routes expose this model.
// Write path: internal helper appendSubscriptionEvent() or future payment-provider
// webhook handler (deferred — no Stripe/Razorpay integration in Phase 2).

const SubscriptionEvent: Model<ISubscriptionEvent> =
  (mongoose.models.SubscriptionEvent as Model<ISubscriptionEvent>) ||
  mongoose.model<ISubscriptionEvent>("SubscriptionEvent", SubscriptionEventSchema);

export default SubscriptionEvent;
