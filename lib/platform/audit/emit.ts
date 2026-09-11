import connectDB from "@/lib/db";
import PlatformAuditLog from "@/models/platform/PlatformAuditLog";
import {
  PlatformEventCategory,
  PlatformEventType,
  PlatformSeverity,
} from "@/lib/constants/statuses";
export interface EmitPlatformAuditEventInput {
  // Loosely typed on purpose: audit events fire for events that happen
  // BEFORE a full session exists (a failed login, an MFA challenge for an
  // unknown email) — sessionId and role are not always available yet.
  actor: { id: string; role: string; sessionId?: string };
  actorType?: "admin" | "system" | "tenant_user";
  tenantId?: string;
  eventCategory: PlatformEventCategory;
  eventType: PlatformEventType;
  severity: PlatformSeverity;
  entityType?: string;
  entityId?: string;
  oldValue?: unknown;
  newValue?: unknown;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
}

/**
 * The single writer for models/platform/PlatformAuditLog.ts. Every privileged
 * admin action — including read-only cross-tenant access via
 * lib/platform/tenancy/crossTenant.ts — must call this before returning.
 * Deliberately never throws back into the caller (same defensive shape as
 * lib/ai/tenantAi.ts's own instrumentation: a logging failure must never
 * break the feature it's observing) — a failure here is itself logged to
 * the server console so it isn't silently swallowed.
 *
 * Hard Rule 9: never pass prompt/response bodies, credentials, or full
 * financial records in `metadata`/`oldValue`/`newValue` — IDs, labels and
 * structured metadata only. This function does not scrub input; callers are
 * responsible, same as every other audit-writing call site in this repo.
 */
export async function emitPlatformAuditEvent(
  input: EmitPlatformAuditEventInput,
): Promise<void> {
  try {
    await connectDB();
    await PlatformAuditLog.create({
      tenantId: input.tenantId,
      actorId: input.actor.id,
      actorType: input.actorType ?? (input.actor.id === "system" ? "system" : "admin"),
      actorRole: input.actor.role,
      eventCategory: input.eventCategory,
      eventType: input.eventType,
      severity: input.severity,
      entityType: input.entityType,
      entityId: input.entityId,
      oldValue: input.oldValue,
      newValue: input.newValue,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
      sessionId: input.actor.sessionId,
      metadata: input.metadata,
    });
  } catch (err) {
    console.error("[platform-audit] failed to write PlatformAuditLog entry", {
      eventType: input.eventType,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
