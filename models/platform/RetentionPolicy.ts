import mongoose, { Schema, Document, Model } from "mongoose";
import {
  PLATFORM_EVENT_CATEGORY_VALUES,
  PLATFORM_EVENT_TYPE_VALUES,
  ORGANIZATION_TYPE_VALUES,
  PlatformEventCategory,
  PlatformEventType,
  OrganizationTypeKey,
} from "@/lib/constants/statuses";

/**
 * Source doc §27: configurable retention periods varying by organisation
 * type, country, event type, and subscription. A row with no filters
 * (organizationType/country/eventCategory/eventType all absent) is the
 * platform default. lib/platform/audit/retention.ts::resolveRetentionDays()
 * picks the MOST SPECIFIC matching row — never averages or stacks policies.
 */
export interface IRetentionPolicy extends Document {
  organizationType?: OrganizationTypeKey;
  country?: string;
  eventCategory?: PlatformEventCategory;
  eventType?: PlatformEventType;
  retentionDays: number;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const RetentionPolicySchema = new Schema<IRetentionPolicy>(
  {
    organizationType: { type: String, enum: ORGANIZATION_TYPE_VALUES },
    country: { type: String },
    eventCategory: { type: String, enum: PLATFORM_EVENT_CATEGORY_VALUES },
    eventType: { type: String, enum: PLATFORM_EVENT_TYPE_VALUES },
    retentionDays: { type: Number, required: true, min: 1 },
    isDefault: { type: Boolean, required: true, default: false },
  },
  { timestamps: true },
);

export default (mongoose.models.RetentionPolicy as Model<IRetentionPolicy>) ||
  mongoose.model<IRetentionPolicy>("RetentionPolicy", RetentionPolicySchema);
