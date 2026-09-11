import mongoose, { Schema, Document, Model } from "mongoose";
import { ORGANIZATION_TYPE_VALUES, OrganizationTypeKey } from "@/lib/constants/statuses";

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
    },
  },
  { timestamps: true },
);

export default (mongoose.models.OrganizationType as Model<IOrganizationType>) ||
  mongoose.model<IOrganizationType>("OrganizationType", OrganizationTypeSchema);
