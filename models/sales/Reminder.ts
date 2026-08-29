import mongoose, { Schema, Document, Model } from "mongoose";
import {
  REMINDER_SCOPE_VALUES,
  REMINDER_TYPE_VALUES,
  REMINDER_TYPE,
  REMINDER_BASIS_VALUES,
  REMINDER_BASIS,
  REMINDER_DIRECTION_VALUES,
  REMINDER_DIRECTION,
  type ReminderScope,
  type ReminderType,
  type ReminderBasis,
  type ReminderDirection,
} from "@/lib/constants/statuses";

// Settings → Sales → Subscriptions → Reminders (Sales revamp Part 4.8).
// Manual reminders are seeded, non-deletable, and have no schedule — they're
// triggered by hand from an invoice's detail page. Automated reminders are
// evaluated by app/api/cron/sales/reminders-evaluation against real
// invoice/bill due dates.
export interface IReminder extends Document {
  tenantId: string;
  scope: ReminderScope;
  type: ReminderType;
  name: string;
  description?: string;
  groupLabel?: string; // e.g. "Reminders Based on Due Date" — UI grouping only
  basis?: ReminderBasis; // automated only
  offsetDays: number;
  direction: ReminderDirection;
  enabled: boolean;
  isSystem: boolean;
  lastEvaluatedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const ReminderSchema = new Schema<IReminder>(
  {
    tenantId: { type: String, required: true },
    scope: { type: String, enum: REMINDER_SCOPE_VALUES, required: true },
    type: { type: String, enum: REMINDER_TYPE_VALUES, default: REMINDER_TYPE.AUTOMATED },
    name: { type: String, required: true, trim: true },
    description: { type: String },
    groupLabel: { type: String },
    basis: { type: String, enum: REMINDER_BASIS_VALUES, default: REMINDER_BASIS.DUE_DATE },
    offsetDays: { type: Number, default: 0, min: 0 },
    direction: { type: String, enum: REMINDER_DIRECTION_VALUES, default: REMINDER_DIRECTION.AFTER },
    enabled: { type: Boolean, default: false },
    isSystem: { type: Boolean, default: false },
    lastEvaluatedAt: { type: Date },
  },
  { timestamps: true },
);

ReminderSchema.index({ tenantId: 1, scope: 1 });

const Reminder: Model<IReminder> =
  (mongoose.models.Reminder as Model<IReminder>) || mongoose.model<IReminder>("Reminder", ReminderSchema);

export default Reminder;
