/**
 * Tenant-aware AI wrapper (Phase 2 Step 7; Azure OpenAI migration Phase 0).
 *
 * Every AI route should call callClaudeForTenant() instead of callClaude() /
 * callClaudeWithHistory() (lib/ai/claude.ts — now Azure OpenAI-backed, see
 * that file's naming note) for the main user-visible response. Internal
 * classification calls (e.g. intent analysis, data extraction) may still use
 * callClaude() directly to avoid counting internal bookkeeping against the
 * user's quota.
 *
 * What callClaudeForTenant() adds vs the bare callClaude():
 *   (a) Workspace AI kill-switch  → AI_DISABLED gated result
 *   (b) Monthly cap enforcement   → AI_LIMIT_REACHED gated result
 *   (c) Tenant model preference   → uses org.settings.ai.model (an Azure OpenAI
 *                                   deployment name) as primary model
 *   (d) Tenant token limit        → uses org.settings.ai.maxTokensPerCall as primary
 *   (e) Usage increment on success → via lib/ai/usage.ts incrementAiUsage()
 *
 * Gated results are plain values (not exceptions), so callers can switch on
 * result.gated without a try/catch. Azure OpenAI call failures still throw —
 * let the route's existing fallback logic handle them.
 */

import connectDB from "@/lib/db";
import Organization from "@/models/admin/Organization";
import { getTierLimits } from "@/lib/constants/tiers";
import {
  callClaude,
  callClaudeWithHistory,
  callClaudeStream,
  CLAUDE_DEFAULT_MODEL,
  CLAUDE_DEFAULT_MAX_TOKENS,
  type ClaudeCallOptions,
  type ChatTurn,
} from "@/lib/ai/claude";
import {
  getAiPeriod,
  getAiUsageCount,
  incrementAiUsage,
  getGlobalMonthlyCap,
  getGlobalAiUsageCount,
  incrementGlobalAiUsage,
} from "@/lib/ai/usage";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TenantAiSettings {
  model?: string;
  maxTokensPerCall?: number;
  disabled?: boolean;
}

/**
 * Discriminated union returned by callClaudeForTenant.
 *
 * Pattern:
 *   const result = await callClaudeForTenant(...);
 *   if (result.gated) {
 *     return NextResponse.json({ error: result.error, code: result.code, ... }, { status: 403 });
 *   }
 *   const responseText = result.text;
 */
export type TenantAiResult =
  | { gated: false; text: string }
  | {
      gated: true;
      code: "AI_DISABLED" | "AI_LIMIT_REACHED" | "AI_GLOBAL_LIMIT_REACHED";
      error: string;
      currentTier?: string;
      requiredAction?: string;
    };

// ── DB helper ─────────────────────────────────────────────────────────────────

/**
 * Fetches the tenant org's tier and AI settings in one lean query.
 * Call once at the top of each route handler, before any Claude calls.
 */
export async function resolveTenantAiSettings(tenantId: string): Promise<{
  tier: string;
  aiSettings: TenantAiSettings;
}> {
  await connectDB();
  const org = await Organization.findOne(
    { subdomain: tenantId },
    { tier: 1, "settings.ai": 1 }
  ).lean<{ tier?: string; settings?: { ai?: TenantAiSettings } }>();

  const aiSettings: TenantAiSettings = { ...(org?.settings?.ai ?? {}) };

  // Defensive: some orgs created before the Azure migration still have a
  // stale Anthropic model name (e.g. "claude-sonnet-4-6") persisted in
  // settings.ai.model. Passing that as an Azure deployment name 400s every
  // AI call for that tenant. Ignore any non-Azure (claude-*) override so it
  // falls back to CLAUDE_DEFAULT_MODEL (the real Azure deployment). A one-off
  // migration (scripts/migrate-clear-stale-ai-model.ts) also clears these
  // from the DB, but this guard prevents recurrence and protects any missed.
  if (typeof aiSettings.model === "string" && /^claude/i.test(aiSettings.model)) {
    delete aiSettings.model;
  }

  return {
    tier: org?.tier ?? "starter",
    aiSettings,
  };
}

// ── Main wrapper ──────────────────────────────────────────────────────────────

/**
 * Drop-in wrapper for callClaude / callClaudeWithHistory that enforces
 * workspace preferences and the monthly AI call cap.
 *
 * @param opts.history  Prior conversation turns — if non-empty, delegates to
 *                      callClaudeWithHistory (same multi-turn behaviour as before).
 * @param opts.model    Caller's preferred model — used only when tenant has not
 *                      configured one (aiSettings.model takes priority).
 * @param opts.maxTokens Caller's maxTokens — used only when aiSettings.maxTokensPerCall
 *                      is absent.
 * @param opts.systemPrompt Always passed through unchanged (tenant does not override).
 *
 * Throws when the Azure OpenAI call fails — usage is NOT incremented in that case.
 * Gated states are returned as values, not exceptions.
 */
export async function callClaudeForTenant(
  tenantId: string,
  tier: string,
  aiSettings: TenantAiSettings,
  userMessage: string,
  opts: ClaudeCallOptions & { history?: ChatTurn[] } = {}
): Promise<TenantAiResult> {
  // (a) Workspace AI kill-switch
  if (aiSettings.disabled === true) {
    return {
      gated: true,
      code: "AI_DISABLED",
      error:
        "AI features are disabled for this workspace. Contact your workspace admin to re-enable them.",
    };
  }

  const period = getAiPeriod();

  // (b0) Global platform ceiling — a hard backstop ABOVE the per-tier caps,
  // sized from the trial budget (see PROGRESS.md). Checked first so no tenant,
  // regardless of tier, can push total platform spend past the trial budget.
  const globalCap = getGlobalMonthlyCap();
  const globalCount = await getGlobalAiUsageCount(period);
  if (globalCount >= globalCap) {
    return {
      gated: true,
      code: "AI_GLOBAL_LIMIT_REACHED",
      error: `Platform-wide monthly AI limit reached (${globalCount} / ${globalCap} calls used across all workspaces this month). This is a trial-budget safeguard — contact the platform administrator.`,
      currentTier: tier,
      requiredAction: "contact_admin",
    };
  }

  // (b) Monthly cap — cap value comes from tier, never hard-coded
  const { aiCallsPerMonth: cap } = getTierLimits(tier);
  const currentCount = await getAiUsageCount(tenantId, period);
  if (currentCount >= cap) {
    return {
      gated: true,
      code: "AI_LIMIT_REACHED",
      error: `Monthly AI call limit reached (${currentCount} / ${cap} calls used this month).`,
      currentTier: tier,
      requiredAction: "upgrade",
    };
  }

  // (c)+(d) Resolve model and token limit.
  // Tenant settings take priority; caller opts are the fallback; defaults are last resort.
  const { history, ...restOpts } = opts;
  const resolvedOpts: ClaudeCallOptions = {
    model:        aiSettings.model           ?? restOpts.model     ?? CLAUDE_DEFAULT_MODEL,
    maxTokens:    aiSettings.maxTokensPerCall ?? restOpts.maxTokens ?? CLAUDE_DEFAULT_MAX_TOKENS,
    systemPrompt: restOpts.systemPrompt,  // always caller-controlled
    imageDataUrl: restOpts.imageDataUrl,  // vision attachment, caller-controlled
    imageDataUrls: restOpts.imageDataUrls,  // multiple vision attachments
  };

  // Call Azure OpenAI — throws on API failure so increment is skipped on error.
  let text: string;
  if (history && history.length > 0) {
    text = await callClaudeWithHistory(history, userMessage, resolvedOpts);
  } else {
    text = await callClaude(userMessage, resolvedOpts);
  }

  // (e) Increment ONLY after a successful response — both the per-tenant
  // counter and the platform-wide counter that backs the global ceiling.
  await incrementAiUsage(tenantId, period);
  await incrementGlobalAiUsage(period);

  return { gated: false, text };
}

/**
 * Streaming counterpart to callClaudeForTenant — same gating (kill-switch,
 * global ceiling, tenant cap) applied UP FRONT; when allowed, returns an async
 * generator of text deltas for the UI to render token-by-token. Usage is
 * incremented once the stream completes successfully (so a stream that never
 * runs — gated — is never counted).
 */
export type TenantAiStreamResult =
  | { gated: true; code: "AI_DISABLED" | "AI_LIMIT_REACHED" | "AI_GLOBAL_LIMIT_REACHED"; error: string; currentTier?: string; requiredAction?: string }
  | { gated: false; stream: AsyncGenerator<string, void, unknown> };

export async function callClaudeForTenantStream(
  tenantId: string,
  tier: string,
  aiSettings: TenantAiSettings,
  userMessage: string,
  opts: ClaudeCallOptions & { history?: ChatTurn[] } = {}
): Promise<TenantAiStreamResult> {
  if (aiSettings.disabled === true) {
    return { gated: true, code: "AI_DISABLED", error: "AI features are disabled for this workspace. Contact your workspace admin to re-enable them." };
  }

  const period = getAiPeriod();

  const globalCap = getGlobalMonthlyCap();
  const globalCount = await getGlobalAiUsageCount(period);
  if (globalCount >= globalCap) {
    return { gated: true, code: "AI_GLOBAL_LIMIT_REACHED", error: `Platform-wide monthly AI limit reached (${globalCount} / ${globalCap}). This is a trial-budget safeguard — contact the platform administrator.`, currentTier: tier, requiredAction: "contact_admin" };
  }

  const { aiCallsPerMonth: cap } = getTierLimits(tier);
  const currentCount = await getAiUsageCount(tenantId, period);
  if (currentCount >= cap) {
    return { gated: true, code: "AI_LIMIT_REACHED", error: `Monthly AI call limit reached (${currentCount} / ${cap} calls used this month).`, currentTier: tier, requiredAction: "upgrade" };
  }

  const { history, ...restOpts } = opts;
  const resolvedOpts: ClaudeCallOptions = {
    model: aiSettings.model ?? restOpts.model ?? CLAUDE_DEFAULT_MODEL,
    maxTokens: aiSettings.maxTokensPerCall ?? restOpts.maxTokens ?? CLAUDE_DEFAULT_MAX_TOKENS,
    systemPrompt: restOpts.systemPrompt,
    imageDataUrl: restOpts.imageDataUrl,
    imageDataUrls: restOpts.imageDataUrls,
  };

  // Wrap the raw stream so usage is incremented exactly once, after a clean finish.
  async function* gatedStream(): AsyncGenerator<string, void, unknown> {
    yield* callClaudeStream(history ?? [], userMessage, resolvedOpts);
    await incrementAiUsage(tenantId, period);
    await incrementGlobalAiUsage(period);
  }

  return { gated: false, stream: gatedStream() };
}
