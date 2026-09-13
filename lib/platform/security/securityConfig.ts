import connectDB from "@/lib/db";
import PlatformAlertConfig from "@/models/platform/PlatformAlertConfig";
import PlatformSecurityConfig from "@/models/platform/PlatformSecurityConfig";
import RetentionPolicy from "@/models/platform/RetentionPolicy";
import { getAlertConfig } from "@/lib/platform/alerts/conditions";
import {
  ADMIN_CAPABILITY,
  PLATFORM_EVENT_CATEGORY,
  PLATFORM_EVENT_TYPE,
  PLATFORM_SEVERITY,
} from "@/lib/constants/statuses";
import { AdminActor } from "@/lib/platform/auth/types";
import { requireCapability } from "@/lib/platform/auth/adminRbac";
import { emitPlatformAuditEvent } from "@/lib/platform/audit/emit";

export class SecurityConfigError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "SecurityConfigError";
  }
}

/**
 * Phase 11 Part 1.6 (user decision, this session): "scoped to what exists —
 * PlatformAlertConfig thresholds, retention policies (extend the existing
 * UI rather than a second one), session timeout, and the kill-switch/
 * autonomy settings if they belong here. Not an open-ended 'security
 * settings' page; a concrete editor over the real configuration objects."
 *
 * Retention policies are deliberately NOT re-editable from here — the
 * existing /platform/settings/retention page already owns that, and this
 * read only surfaces a summary/link so an operator isn't left wondering
 * where retention lives, per "extend, don't duplicate."
 *
 * Kill-switch/autonomy (AiWorkflowPolicy.killSwitchEnabled/maxAutonomyLevel)
 * is deliberately NOT surfaced as an editable control here: it is per-
 * tenant, per-workflow (30 workflows × every tenant), not a single global
 * setting — the "singleton config" shape this page and its two backing
 * models use does not fit it, and building a fake global toggle would
 * misrepresent the real architecture (a workflow's kill switch is validated
 * per organisation, by design — docs/ai/AUTONOMY_RUNBOOK.md). Reported here
 * as an explained absence, not a built control, matching "a concrete editor
 * over the real configuration objects" rather than an open-ended page.
 */
export async function getSecurityConfiguration(actor: AdminActor, reason: string) {
  await requireCapability(actor, ADMIN_CAPABILITY.VIEW_SECURITY_LOGS);
  await connectDB();

  const [alertConfig, securityConfigDoc, retentionPolicyCount] = await Promise.all([
    getAlertConfig(),
    PlatformSecurityConfig.findOne({ singleton: true }).lean(),
    RetentionPolicy.countDocuments({}),
  ]);

  await emitPlatformAuditEvent({
    actor,
    eventCategory: PLATFORM_EVENT_CATEGORY.SECURITY,
    eventType: PLATFORM_EVENT_TYPE.CROSS_TENANT_READ,
    severity: PLATFORM_SEVERITY.INFO,
    entityType: "PlatformSecurityConfig",
    metadata: { reason },
  });

  return {
    alerts: {
      failedLoginThreshold: alertConfig.failedLoginThreshold,
      permissionFailureThreshold: alertConfig.permissionFailureThreshold,
      permissionFailureWindowMinutes: alertConfig.permissionFailureWindowMinutes,
      largeDowngradeTierDrop: alertConfig.largeDowngradeTierDrop,
      aiCostSpikeMultiplier: alertConfig.aiCostSpikeMultiplier,
      aiCostSpikeTrailingDays: alertConfig.aiCostSpikeTrailingDays,
      massExportRecordThreshold: alertConfig.massExportRecordThreshold,
    },
    sessionTimeoutHours: securityConfigDoc?.sessionTimeoutHours ?? 8,
    retention: {
      policyCount: retentionPolicyCount,
      manageUrl: "/platform/settings/retention",
    },
    autonomyGovernance: {
      available: false,
      reason:
        "Kill-switch/autonomy policy (AiWorkflowPolicy) is per-tenant, per-workflow — not a single global setting this page's singleton-config shape can represent. See docs/ai/AUTONOMY_RUNBOOK.md.",
    },
  };
}

export interface SecurityConfigurationUpdate {
  alerts?: Partial<{
    failedLoginThreshold: number;
    permissionFailureThreshold: number;
    permissionFailureWindowMinutes: number;
    largeDowngradeTierDrop: number;
    aiCostSpikeMultiplier: number;
    aiCostSpikeTrailingDays: number;
    massExportRecordThreshold: number;
  }>;
  sessionTimeoutHours?: number;
}

export async function updateSecurityConfiguration(
  actor: AdminActor,
  update: SecurityConfigurationUpdate,
  reason: string,
): Promise<void> {
  await requireCapability(actor, ADMIN_CAPABILITY.MANAGE_SECURITY_CONFIG);
  if (!reason || !reason.trim()) {
    throw new SecurityConfigError("A reason is required for every security configuration change.", 400);
  }
  if (!update.alerts && update.sessionTimeoutHours === undefined) {
    throw new SecurityConfigError("No fields were supplied to update.", 400);
  }
  if (update.sessionTimeoutHours !== undefined && (update.sessionTimeoutHours < 1 || update.sessionTimeoutHours > 24 * 7)) {
    throw new SecurityConfigError("Session timeout must be between 1 and 168 hours.", 400);
  }

  await connectDB();
  const before = await getAlertConfig();
  const beforeSecurity = await PlatformSecurityConfig.findOne({ singleton: true }).lean();

  if (update.alerts) {
    await PlatformAlertConfig.findOneAndUpdate(
      { singleton: true },
      { $set: { singleton: true, ...update.alerts } },
      { upsert: true },
    );
  }
  if (update.sessionTimeoutHours !== undefined) {
    await PlatformSecurityConfig.findOneAndUpdate(
      { singleton: true },
      { $set: { singleton: true, sessionTimeoutHours: update.sessionTimeoutHours } },
      { upsert: true },
    );
  }

  await emitPlatformAuditEvent({
    actor,
    eventCategory: PLATFORM_EVENT_CATEGORY.SECURITY,
    eventType: PLATFORM_EVENT_TYPE.SECURITY_CONFIG_UPDATED,
    severity: PLATFORM_SEVERITY.WARNING,
    entityType: "PlatformSecurityConfig",
    oldValue: { alerts: before, sessionTimeoutHours: beforeSecurity?.sessionTimeoutHours ?? 8 },
    newValue: update,
    metadata: { reason },
  });
}
