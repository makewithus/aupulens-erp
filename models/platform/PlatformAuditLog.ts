import mongoose, { Schema, Document, Model } from "mongoose";
import {
  PLATFORM_EVENT_CATEGORY_VALUES,
  PLATFORM_EVENT_TYPE_VALUES,
  PLATFORM_SEVERITY_VALUES,
  PlatformEventCategory,
  PlatformEventType,
  PlatformSeverity,
} from "@/lib/constants/statuses";

/**
 * Source doc §31's exact field list. This is the structured, immutable audit
 * store the platform currently lacks — a materially different thing from
 * models/admin/ActivityLog.ts (free text, "what happened", left untouched)
 * and models/crm/CrmAuditLog.ts (structured but CRM-scoped only). Every
 * privileged Global Admin action, INCLUDING read-only cross-tenant access,
 * writes exactly one of these via lib/platform/audit/emit.ts — never written
 * any other way. Append-only: enforced below via Mongoose middleware (same
 * pattern as CrmAuditLog) AND checked by a source-grep test
 * (tests/platform/sourceGrep.test.ts) asserting no code path calls
 * update/delete on this model.
 */
export interface IPlatformAuditLog extends Document {
  tenantId?: string;
  actorId: string;
  actorType: "admin" | "system" | "tenant_user";
  actorRole: string;
  eventCategory: PlatformEventCategory;
  eventType: PlatformEventType;
  severity: PlatformSeverity;
  entityType?: string;
  entityId?: string;
  oldValue?: unknown;
  newValue?: unknown;
  ipAddress?: string;
  userAgent?: string;
  sessionId?: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

const PlatformAuditLogSchema = new Schema<IPlatformAuditLog>(
  {
    tenantId: { type: String },
    actorId: { type: String, required: true },
    actorType: {
      type: String,
      required: true,
      enum: ["admin", "system", "tenant_user"],
    },
    actorRole: { type: String, required: true },
    eventCategory: {
      type: String,
      required: true,
      enum: PLATFORM_EVENT_CATEGORY_VALUES,
    },
    eventType: {
      type: String,
      required: true,
      enum: PLATFORM_EVENT_TYPE_VALUES,
    },
    severity: {
      type: String,
      required: true,
      enum: PLATFORM_SEVERITY_VALUES,
    },
    entityType: { type: String },
    entityId: { type: String },
    // Structured JSON, never text (source doc §31). No sensitive payloads
    // (prompt/response bodies, credentials, bank details) — Hard Rule 9.
    oldValue: { type: Schema.Types.Mixed },
    newValue: { type: Schema.Types.Mixed },
    ipAddress: { type: String },
    userAgent: { type: String },
    sessionId: { type: String },
    metadata: { type: Schema.Types.Mixed },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

PlatformAuditLogSchema.index({ createdAt: -1 });
PlatformAuditLogSchema.index({ tenantId: 1, createdAt: -1 });
PlatformAuditLogSchema.index({ actorId: 1, createdAt: -1 });
PlatformAuditLogSchema.index({ eventCategory: 1, createdAt: -1 });
PlatformAuditLogSchema.index({ eventType: 1, createdAt: -1 });
PlatformAuditLogSchema.index({ severity: 1, createdAt: -1 });
PlatformAuditLogSchema.index({ entityType: 1, entityId: 1, createdAt: -1 });

const IMMUTABLE_ERROR = "PlatformAuditLog records are append-only and cannot be modified or deleted.";

// Document-level guard: Model.create()/new Doc().save() (isNew === true) must
// keep working — that's the only sanctioned write path (lib/platform/audit/
// emit.ts). Re-saving an already-persisted document (isNew === false) does
// NOT go through the query-level updateOne/findOneAndUpdate middleware below
// (Mongoose's .save() uses its own hook chain) and would otherwise be a real
// immutability hole.
PlatformAuditLogSchema.pre("save", function (next) {
  if (!this.isNew) {
    next(new Error(IMMUTABLE_ERROR));
    return;
  }
  next();
});

PlatformAuditLogSchema.pre("updateOne", function (next) {
  next(new Error(IMMUTABLE_ERROR));
});
PlatformAuditLogSchema.pre("findOneAndUpdate", function (next) {
  next(new Error(IMMUTABLE_ERROR));
});
PlatformAuditLogSchema.pre("updateMany", function (next) {
  next(new Error(IMMUTABLE_ERROR));
});
PlatformAuditLogSchema.pre("deleteOne", function (next) {
  next(new Error(IMMUTABLE_ERROR));
});
PlatformAuditLogSchema.pre("findOneAndDelete", function (next) {
  next(new Error(IMMUTABLE_ERROR));
});
PlatformAuditLogSchema.pre("deleteMany", { document: false, query: true }, function (next) {
  // Retention jobs are the ONE sanctioned deleter of this collection (Phase 5,
  // source doc §27) and must go through lib/platform/audit/retention.ts, which
  // sets this flag explicitly and itself writes a RETENTION_DELETION_EXECUTED
  // audit event before deleting — deletion by retention is itself audited.
  const allowRetention = (this.getOptions() as { allowRetentionDelete?: boolean })
    .allowRetentionDelete;
  if (!allowRetention) {
    next(new Error(IMMUTABLE_ERROR));
    return;
  }
  next();
});

export default (mongoose.models.PlatformAuditLog as Model<IPlatformAuditLog>) ||
  mongoose.model<IPlatformAuditLog>("PlatformAuditLog", PlatformAuditLogSchema);
