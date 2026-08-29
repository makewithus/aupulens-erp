import mongoose, { Schema, Document, Model } from "mongoose";

/**
 * Smart Enterprise Calendar (6.5).
 *
 * User-created calendar entries (meetings, reminders, deadlines). The unified
 * calendar (lib/calendar/aggregateEvents.ts) MERGES these with derived events
 * pulled live from other modules (CRM tasks, HR leave/attendance, finance
 * payments, payroll) so one view shows everything — without duplicating that
 * data here.
 */
export type CalendarEventType = "meeting" | "reminder" | "deadline" | "other";

export interface ICalendarEvent extends Document {
  tenantId: string;
  title: string;
  description?: string;
  type: CalendarEventType;
  start: Date;
  end?: Date;
  allDay: boolean;
  ownerId: mongoose.Types.ObjectId;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const CalendarEventSchema = new Schema<ICalendarEvent>(
  {
    tenantId: { type: String, required: true, index: true },
    title: { type: String, required: true },
    description: { type: String },
    type: { type: String, enum: ["meeting", "reminder", "deadline", "other"], default: "meeting" },
    start: { type: Date, required: true },
    end: { type: Date },
    allDay: { type: Boolean, default: false },
    ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true },
);

CalendarEventSchema.index({ tenantId: 1, start: 1 });

export default (mongoose.models.CalendarEvent as Model<ICalendarEvent>) ||
  mongoose.model<ICalendarEvent>("CalendarEvent", CalendarEventSchema);
