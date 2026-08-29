/**
 * Stale / invalid model-override health check.
 *
 * A tenant can pin a specific Azure chat deployment via
 * Organization.settings.ai.model. If that value doesn't name a *currently
 * deployed* Azure model (e.g. a leftover Anthropic "claude-*" name from before
 * the Azure migration, a typo, or a deployment that was deleted/renamed), every
 * AI call for that tenant 400s with "DeploymentNotFound" — a silent, per-call
 * failure that only shows up as a broken feature.
 *
 * This module surfaces that condition LOUDLY instead: a deploy-time script
 * (scripts/check-model-health.ts) and an admin-visible panel in AI Studio both
 * call checkTenantModelOverrides() and flag any override that won't resolve.
 *
 * resolveTenantAiSettings() also defensively strips "claude-*" overrides at
 * call time so a stale value degrades to the default deployment rather than
 * erroring — but that hides the misconfiguration. The health check is how an
 * operator finds and fixes the root cause.
 */

import connectDB from "@/lib/db";
import Organization from "@/models/Organization";

/**
 * The set of Azure deployment names this app is configured to use. These are
 * the only valid values for a tenant's settings.ai.model override. Sourced
 * from env (the deployment contract for THIS deployment of the app):
 *   - AZURE_OPENAI_CHAT_DEPLOYMENT       (chat/reasoning — what overrides target)
 *   - AZURE_OPENAI_EXTRA_CHAT_DEPLOYMENTS (optional CSV, for multi-deployment setups)
 *
 * The embedding deployment is deliberately NOT a valid chat override, so
 * pointing a tenant's chat model at the embedding deployment is flagged too.
 */
export function getDeployedChatModelNames(): string[] {
  const primary = process.env.AZURE_OPENAI_CHAT_DEPLOYMENT?.trim();
  const extra = (process.env.AZURE_OPENAI_EXTRA_CHAT_DEPLOYMENTS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return [...new Set([primary, ...extra].filter((s): s is string => !!s))];
}

export interface TenantModelOverrideStatus {
  subdomain: string;
  name?: string;
  model: string;
  valid: boolean;
  reason?: string;
}

export interface ModelHealthReport {
  /** True when the app's own chat deployment env var is set. */
  configured: boolean;
  deployedChatModels: string[];
  /** Only tenants that actually set a model override are included. */
  overrides: TenantModelOverrideStatus[];
  /** Convenience: the subset of `overrides` that are invalid/stale. */
  stale: TenantModelOverrideStatus[];
}

/**
 * Classify a single override string against the deployed model set.
 * Pure/synchronous so it's trivially unit-testable without a DB.
 */
export function classifyModelOverride(
  model: string,
  deployedChatModels: string[]
): { valid: boolean; reason?: string } {
  if (deployedChatModels.includes(model)) return { valid: true };
  if (/^claude/i.test(model)) {
    return { valid: false, reason: "Stale Anthropic model name (pre-Azure migration) — not a deployed Azure deployment." };
  }
  if (/embed/i.test(model)) {
    return { valid: false, reason: "Points at an embedding deployment, not a chat deployment." };
  }
  return { valid: false, reason: `Not a currently-deployed Azure chat deployment (deployed: ${deployedChatModels.join(", ") || "none"}).` };
}

/**
 * Scan tenants with a model override and classify each against the
 * currently-deployed Azure chat deployment(s). Pass `scopeSubdomain` to
 * restrict the scan to a single tenant (used for a workspace admin's own
 * AI Studio view, which only needs its own override status) — omit it for a
 * platform-wide scan (master-admin view, scripts/check-model-health.ts).
 */
export async function checkTenantModelOverrides(scopeSubdomain?: string): Promise<ModelHealthReport> {
  await connectDB();
  const deployedChatModels = getDeployedChatModelNames();

  const filter: Record<string, unknown> = { "settings.ai.model": { $exists: true, $nin: [null, ""] } };
  if (scopeSubdomain) filter.subdomain = scopeSubdomain;

  const orgs = await Organization.find(
    filter,
    { subdomain: 1, name: 1, "settings.ai.model": 1 }
  ).lean<{ subdomain: string; name?: string; settings?: { ai?: { model?: string } } }[]>();

  const overrides: TenantModelOverrideStatus[] = orgs
    .map((o): TenantModelOverrideStatus | null => {
      const model = o.settings?.ai?.model;
      if (typeof model !== "string" || !model) return null;
      const { valid, reason } = classifyModelOverride(model, deployedChatModels);
      return { subdomain: o.subdomain, name: o.name, model, valid, reason };
    })
    .filter((x): x is TenantModelOverrideStatus => x !== null);

  return {
    configured: deployedChatModels.length > 0,
    deployedChatModels,
    overrides,
    stale: overrides.filter((o) => !o.valid),
  };
}
