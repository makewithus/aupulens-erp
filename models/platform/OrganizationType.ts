import mongoose, { Schema, Document, Model } from "mongoose";
import {
  ORGANIZATION_TYPE_VALUES,
  OrganizationTypeKey,
  PLATFORM_EVENT_CATEGORY_VALUES,
  PlatformEventCategory,
} from "@/lib/constants/statuses";

/**
 * Source doc §4: organisation type drives default modules/config/AI limits —
 * "implement as a configurable record, editable from platform configuration,
 * not as a hard-coded enum with behaviour scattered through the app." The
 * enum in lib/constants/statuses.ts is only the fixed set of keys a record
 * can exist under; this model is where each type's actual default payload
 * lives, editable without a code change.
 */
export interface IOrganizationType extends Document {
  type: OrganizationTypeKey;
  label: string;
  description: string;
  defaultConfig: {
    enabledModules: string[];
    maxUsers: number;
    aiCallsPerMonth: number;
    // Global Admin control plane (Phase 5, source doc §20) — which event
    // categories this org type's audit view surfaces BY DEFAULT. A display
    // filter only, never a restriction on what's actually logged (Hard Rule
    // 5 requires every privileged action audited regardless of org type) —
    // an operator can always switch to "show all categories."
    logProfile?: { eventCategories: PlatformEventCategory[] };
  };
  createdAt: Date;
  updatedAt: Date;
}

const OrganizationTypeSchema = new Schema<IOrganizationType>(
  {
    type: { type: String, required: true, unique: true, enum: ORGANIZATION_TYPE_VALUES },
    label: { type: String, required: true },
    description: { type: String, default: "" },
    defaultConfig: {
      enabledModules: { type: [String], default: [] },
      maxUsers: { type: Number, default: 5 },
      aiCallsPerMonth: { type: Number, default: 100 },
      logProfile: {
        eventCategories: { type: [String], enum: PLATFORM_EVENT_CATEGORY_VALUES, default: [] },
      },
    },
  },
  { timestamps: true },
);

export default (mongoose.models.OrganizationType as Model<IOrganizationType>) ||
  mongoose.model<IOrganizationType>("OrganizationType", OrganizationTypeSchema);
