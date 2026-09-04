import mongoose, { Schema, Document, Model } from "mongoose";

/**
 * The recurring schedule engine (docs/ai/BRIEF-03-BATCH-B.md Part B) — the one mechanism every
 * Batch B workflow that "must happen every period, automatically, exactly once" builds on.
 * Deliberately NOT bolted onto `models/finance/JournalTemplate.ts` (a static line template with
 * no frequency/nextRunDate — extending its semantics would violate Hard Rule 1); a schedule may
 * *reference* one for line shape, nothing more.
 *
 * **Exactly-once posting**: enforced by `models/ai/AiToolCall.ts`'s real compound unique index
 * on `{tenantId, toolName, idempotencyKey}}`, with `idempotencyKey = "{scheduleId}:{periodKey}"`
 * for every `post_journal` call (see `lib/aiRuntime/tools/scheduleTools.ts`) — not by
 * application logic. Additionally, `periods[].status` transitions to `"posted"` only via an
 * atomic `findOneAndUpdate` filtered on the period's *current* status (a compare-and-swap), so a
 * race between two concurrent sweep invocations cannot double-transition the same period either.
 */

export const AI_SCHEDULE_TYPE = {
  PREPAID: "prepaid",
  DEFERRED_REVENUE: "deferred_revenue",
  DEPRECIATION: "depreciation",
  ACCRUAL_REVERSAL: "accrual_reversal",
} as const;
export type AiScheduleType = (typeof AI_SCHEDULE_TYPE)[keyof typeof AI_SCHEDULE_TYPE];

export const AI_SCHEDULE_STATUS = {
  DRAFT: "draft",
  APPROVED: "approved",
  SUSPENDED: "suspended",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
} as const;
export type AiScheduleStatus = (typeof AI_SCHEDULE_STATUS)[keyof typeof AI_SCHEDULE_STATUS];

export const AI_SCHEDULE_PERIOD_STATUS = {
  PENDING: "pending",
  DRAFTED: "drafted",
  POSTED: "posted",
  SKIPPED: "skipped",
} as const;
export type AiSchedulePeriodStatus = (typeof AI_SCHEDULE_PERIOD_STATUS)[keyof typeof AI_SCHEDULE_PERIOD_STATUS];

export const AI_SCHEDULE_FREQUENCY = {
  MONTHLY: "monthly",
  QUARTERLY: "quarterly",
  ANNUAL: "annual",
} as const;
export type AiScheduleFrequency = (typeof AI_SCHEDULE_FREQUENCY)[keyof typeof AI_SCHEDULE_FREQUENCY];

export interface IAiSchedulePeriod {
  periodKey: string; // e.g. "2026-04"
  dueDate: Date;
  amount: number;
  status: AiSchedulePeriodStatus;
  journalEntryId?: mongoose.Types.ObjectId;
  runId?: mongoose.Types.ObjectId;
}

export interface IAiSchedule extends Document {
  tenantId: string;
  scheduleType: AiScheduleType;
  sourceRef: { model: string; id: string };
  status: AiScheduleStatus;
  approvedBy?: mongoose.Types.ObjectId;
  approvedAt?: Date;
  startDate: Date;
  endDate: Date;
  frequency: AiScheduleFrequency;
  totalAmount: number;
  currency: string;
  debitAccountId: mongoose.Types.ObjectId;
  creditAccountId: mongoose.Types.ObjectId;
  basis: "stated" | "inferred";
  periods: IAiSchedulePeriod[];
  recognisedToDate: number;
  remaining: number;
  nextRunDate?: Date;
  createdByWorkflow: string;
  createdAt: Date;
  updatedAt: Date;
}

const AiSchedulePeriodSchema = new Schema<IAiSchedulePeriod>(
  {
    periodKey: { type: String, required: true },
    dueDate: { type: Date, required: true },
    amount: { type: Number, required: true },
    status: { type: String, enum: Object.values(AI_SCHEDULE_PERIOD_STATUS), default: AI_SCHEDULE_PERIOD_STATUS.PENDING },
    journalEntryId: { type: Schema.Types.ObjectId, ref: "JournalEntry" },
    runId: { type: Schema.Types.ObjectId, ref: "AiWorkflowRun" },
  },
  { _id: false },
);

const AiScheduleSchema: Schema<IAiSchedule> = new Schema(
  {
    tenantId: { type: String, required: true, index: true },
    scheduleType: { type: String, enum: Object.values(AI_SCHEDULE_TYPE), required: true },
    sourceRef: { model: { type: String, required: true }, id: { type: String, required: true } },
    status: { type: String, enum: Object.values(AI_SCHEDULE_STATUS), default: AI_SCHEDULE_STATUS.DRAFT },
    approvedBy: { type: Schema.Types.ObjectId, ref: "User" },
    approvedAt: { type: Date },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    frequency: { type: String, enum: Object.values(AI_SCHEDULE_FREQUENCY), required: true },
    totalAmount: { type: Number, required: true },
    currency: { type: String, default: "INR" },
    debitAccountId: { type: Schema.Types.ObjectId, ref: "Account", required: true },
    creditAccountId: { type: Schema.Types.ObjectId, ref: "Account", required: true },
    basis: { type: String, enum: ["stated", "inferred"], required: true },
    periods: { type: [AiSchedulePeriodSchema], default: [] },
    recognisedToDate: { type: Number, default: 0 },
    remaining: { type: Number, default: 0 },
    nextRunDate: { type: Date },
    createdByWorkflow: { type: String, required: true },
  },
  { timestamps: true },
);

AiScheduleSchema.index({ tenantId: 1, status: 1, nextRunDate: 1 });
AiScheduleSchema.index({ tenantId: 1, "sourceRef.model": 1, "sourceRef.id": 1 });

const AiSchedule: Model<IAiSchedule> =
  (mongoose.models.AiSchedule as Model<IAiSchedule>) ||
  mongoose.model<IAiSchedule>("AiSchedule", AiScheduleSchema);

export default AiSchedule;
