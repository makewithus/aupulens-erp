import connectDB from "@/lib/db";
import Organization from "@/models/admin/Organization";
import AiLanguageInteraction from "@/models/ai/AiLanguageInteraction";
import { getSarvamConfig } from "@/lib/ai/language/config";
import { ADMIN_CAPABILITY, PLATFORM_EVENT_CATEGORY, PLATFORM_EVENT_TYPE, PLATFORM_SEVERITY } from "@/lib/constants/statuses";
import type { AdminActor } from "@/lib/platform/auth/types";
import { requireCapability } from "@/lib/platform/auth/adminRbac";
import { emitPlatformAuditEvent } from "@/lib/platform/audit/emit";

export interface MultilingualStatus {
  /** SARVAM_ENABLED (global kill switch) */
  globalEnabled: boolean;
  /** a key is present — the key itself is NEVER returned */
  keyConfigured: boolean;
  /** per-tenant switch (settings.ai.multilingualDisabled inverted) */
  tenantEnabled: boolean;
  /** effective: every layer allows translation for this tenant */
  active: boolean;
  languagesUsed: { language: string; interactions: number; degraded: number; lastUsedAt: string }[];
}

export async function getMultilingualStatus(tenantId: string): Promise<MultilingualStatus> {
  await connectDB();
  const cfg = getSarvamConfig();
  const [org, langs] = await Promise.all([
    Organization.findOne({ subdomain: tenantId }, { "settings.ai": 1 }).lean<{ settings?: { ai?: { multilingualDisabled?: boolean } } }>(),
    AiLanguageInteraction.aggregate([
      { $match: { tenantId } },
      { $group: { _id: "$detectedLanguage", interactions: { $sum: 1 }, degraded: { $sum: { $cond: ["$degraded", 1, 0] } }, lastUsedAt: { $max: "$createdAt" } } },
      { $sort: { interactions: -1 } },
    ]),
  ]);
  const tenantEnabled = org?.settings?.ai?.multilingualDisabled !== true;
  const keyConfigured = cfg.apiKey.length > 0;
  return {
    globalEnabled: cfg.enabled,
    keyConfigured,
    tenantEnabled,
    active: cfg.enabled && keyConfigured && tenantEnabled,
    languagesUsed: langs.map((l) => ({ language: l._id as string, interactions: l.interactions, degraded: l.degraded, lastUsedAt: new Date(l.lastUsedAt).toISOString() })),
  };
}

export class MultilingualError extends Error {
  constructor(message: string, public status: number) { super(message); this.name = "MultilingualError"; }
}

/** Per-tenant switch. Same audit + capability discipline as every other Configuration write. */
export async function setTenantMultilingual(actor: AdminActor, subdomain: string, enabled: boolean, reason: string): Promise<void> {
  await requireCapability(actor, ADMIN_CAPABILITY.MANAGE_ORGANIZATIONS);
  if (!reason || !reason.trim()) throw new MultilingualError("A reason is required for every configuration change.", 400);
  await connectDB();
  const org = await Organization.findOneAndUpdate(
    { subdomain },
    { $set: { "settings.ai.multilingualDisabled": !enabled } },
    { new: false },
  );
  if (!org) throw new MultilingualError("Organisation not found.", 404);
  await emitPlatformAuditEvent({
    actor, tenantId: subdomain,
    eventCategory: PLATFORM_EVENT_CATEGORY.ORGANISATION,
    eventType: PLATFORM_EVENT_TYPE.ORGANIZATION_UPDATED,
    severity: PLATFORM_SEVERITY.INFO,
    entityType: "Organization", entityId: String(org._id),
    oldValue: { multilingualEnabled: org.settings?.ai?.multilingualDisabled !== true },
    newValue: { multilingualEnabled: enabled },
    ipAddress: actor.ip, userAgent: actor.userAgent,
    metadata: { reason, fieldsChanged: ["settings.ai.multilingualDisabled"] },
  });
}
