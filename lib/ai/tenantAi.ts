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
  callClaudeWithUsage,
  callClaudeWithHistoryAndUsage,
  callClaudeStreamWithUsage,
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
// Global Admin control plane (docs/admin/BRIEF-GLOBAL-ADMIN.md Phase 4) — AI
// usage metering and the 4 at-limit behaviours. Both fail toward the
// pre-Phase-4 behaviour on their own error (never blocks, never throws back
// into this function) so a metering/limit-config bug can never break an AI
// call that would otherwise have succeeded.
import { recordAiUsage } from "@/lib/platform/ai/instrumentation";
import { applyLanguageInput, applyLanguageReply, finaliseLanguage, type LanguageOptions } from "@/lib/ai/language/tenantBridge";
import { interpretationLine } from "@/lib/ai/language/respond";
import type { LanguageTrace, ProviderCall } from "@/lib/ai/language/types";
import { resolveAtLimitDecision, checkAiUsageThresholdCrossing } from "@/lib/platform/ai/limitBehavior";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TenantAiSettings {
  model?: string;
  maxTokensPerCall?: number;
  disabled?: boolean;
  /** Multilingual layer per-tenant switch (same shape as `disabled`). */
  multilingualDisabled?: boolean;
  /** Execute-and-redirect for AI create flows. Default false; read by the create flow, not here. */
  autoCreateEnabled?: boolean;
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
  | { gated: false; text: string; language?: LanguageTrace }
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
  // `feature` is additive and optional (Global Admin AI metering, Phase 4) —
  // an AiFeature key (lib/ai/featureLimits.ts) identifying which usage
  // bucket this call meters against. Every existing call site that omits it
  // keeps working unchanged; it defaults to "chat" for metering purposes.
  opts: ClaudeCallOptions & { history?: ChatTurn[]; feature?: string; language?: LanguageOptions } = {}
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
  let throttleDelayMs: number | undefined;
  if (currentCount >= cap) {
    // Global Admin control plane (Phase 4, source doc §15): the 4 at-limit
    // behaviours. resolveAtLimitDecision defaults to "block" when no AiLimit
    // row exists for this tenant — byte-identical to pre-Phase-4 behaviour.
    const decision = await resolveAtLimitDecision(tenantId);
    if (decision.action === "block") {
      return {
        gated: true,
        code: "AI_LIMIT_REACHED",
        error: `Monthly AI call limit reached (${currentCount} / ${cap} calls used this month).`,
        currentTier: tier,
        requiredAction: "upgrade",
      };
    }
    throttleDelayMs = decision.delayMs;
  }
  if (throttleDelayMs) {
    await new Promise((resolve) => setTimeout(resolve, throttleDelayMs));
  }

  // (c)+(d) Resolve model and token limit.
  // Tenant settings take priority; caller opts are the fallback; defaults are last resort.
  const { history, feature, language, ...restOpts } = opts;
  const resolvedOpts: ClaudeCallOptions = {
    model:        aiSettings.model           ?? restOpts.model     ?? CLAUDE_DEFAULT_MODEL,
    maxTokens:    aiSettings.maxTokensPerCall ?? restOpts.maxTokens ?? CLAUDE_DEFAULT_MAX_TOKENS,
    systemPrompt: restOpts.systemPrompt,  // always caller-controlled
    imageDataUrl: restOpts.imageDataUrl,  // vision attachment, caller-controlled
    imageDataUrls: restOpts.imageDataUrls,  // multiple vision attachments
  };

  // Call Azure OpenAI — throws on API failure so increment is skipped on
  // error (usage metering still records the failed attempt, at 0 tokens,
  // for the platform dashboard's "failed requests" figure — Phase 4).
  // Multilingual layer (additive): only when the caller passed the user's raw text. Runs AFTER
  // every gate above, so a tenant that is disabled or at its limit never triggers a Sarvam call.
  let langTrace: LanguageTrace | undefined;
  let effectiveMessage = userMessage;
  if (language) {
    ({ message: effectiveMessage, trace: langTrace } = await applyLanguageInput(tenantId, aiSettings, userMessage, language));
  }

  const startedAt = Date.now();
  let text: string;
  let usage: { promptTokens: number; completionTokens: number; totalTokens: number };
  try {
    if (history && history.length > 0) {
      ({ text, usage } = await callClaudeWithHistoryAndUsage(history, effectiveMessage, resolvedOpts));
    } else {
      ({ text, usage } = await callClaudeWithUsage(effectiveMessage, resolvedOpts));
    }
  } catch (err) {
    if (language && langTrace) await finaliseLanguage(tenantId, feature ?? "chat", langTrace, [], language.userId);
    await recordAiUsage({
      tenantId,
      feature: feature ?? "chat",
      model: resolvedOpts.model ?? CLAUDE_DEFAULT_MODEL,
      inputTokens: 0,
      outputTokens: 0,
      latencyMs: Date.now() - startedAt,
      status: "error",
    });
    throw err;
  }

  // (e) Increment ONLY after a successful response — both the per-tenant
  // counter and the platform-wide counter that backs the global ceiling.
  await incrementAiUsage(tenantId, period);
  await incrementGlobalAiUsage(period);
  await checkAiUsageThresholdCrossing(tenantId, currentCount, currentCount + 1, cap);
  await recordAiUsage({
    tenantId,
    feature: feature ?? "chat",
    model: resolvedOpts.model ?? CLAUDE_DEFAULT_MODEL,
    inputTokens: usage.promptTokens,
    outputTokens: usage.completionTokens,
    latencyMs: Date.now() - startedAt,
    status: "success",
  });

  if (language && langTrace) {
    let extra: ProviderCall[] = [];
    const r = await applyLanguageReply(text, langTrace, language);
    text = r.text;
    extra = r.calls;
    await finaliseLanguage(tenantId, feature ?? "chat", langTrace, extra, language.userId);
    return { gated: false, text, language: langTrace };
  }

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
  opts: ClaudeCallOptions & { history?: ChatTurn[]; feature?: string; language?: LanguageOptions } = {}
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
  let throttleDelayMs: number | undefined;
  if (currentCount >= cap) {
    const decision = await resolveAtLimitDecision(tenantId);
    if (decision.action === "block") {
      return { gated: true, code: "AI_LIMIT_REACHED", error: `Monthly AI call limit reached (${currentCount} / ${cap} calls used this month).`, currentTier: tier, requiredAction: "upgrade" };
    }
    throttleDelayMs = decision.delayMs;
  }
  if (throttleDelayMs) {
    await new Promise((resolve) => setTimeout(resolve, throttleDelayMs));
  }

  const { history, feature, language, ...restOpts } = opts;
  const resolvedOpts: ClaudeCallOptions = {
    model: aiSettings.model ?? restOpts.model ?? CLAUDE_DEFAULT_MODEL,
    maxTokens: aiSettings.maxTokensPerCall ?? restOpts.maxTokens ?? CLAUDE_DEFAULT_MAX_TOKENS,
    systemPrompt: restOpts.systemPrompt,
    imageDataUrl: restOpts.imageDataUrl,
    imageDataUrls: restOpts.imageDataUrls,
  };

  // Wrap the raw stream so usage is incremented exactly once, after a clean
  // finish, and the run is metered (Phase 4) with the usage totals the inner
  // generator's own return value carries.
  // Multilingual layer, input side only: the raw text is translated BEFORE the stream starts.
  // The reply streams in English (a reply cannot be translated mid-stream) — see
  // docs/sarvam/LIVE_VERIFICATION.md §streaming. The "I understood this as" line is streamed first.
  let langTrace: LanguageTrace | undefined;
  let effectiveMessage = userMessage;
  if (language) {
    ({ message: effectiveMessage, trace: langTrace } = await applyLanguageInput(tenantId, aiSettings, userMessage, language));
  }

  const startedAt = Date.now();
  async function* gatedStream(): AsyncGenerator<string, void, unknown> {
    if (langTrace && language?.showInterpretation !== false) {
      const line = interpretationLine(langTrace);
      if (line) yield line;
    }
    let usage: { promptTokens: number; completionTokens: number; totalTokens: number };
    try {
      usage = yield* callClaudeStreamWithUsage(history ?? [], effectiveMessage, resolvedOpts);
    } finally {
      if (language && langTrace) await finaliseLanguage(tenantId, feature ?? "chat", langTrace, [], language.userId);
    }
    await incrementAiUsage(tenantId, period);
    await incrementGlobalAiUsage(period);
    await checkAiUsageThresholdCrossing(tenantId, currentCount, currentCount + 1, cap);
    await recordAiUsage({
      tenantId,
      feature: feature ?? "chat",
      model: resolvedOpts.model ?? CLAUDE_DEFAULT_MODEL,
      inputTokens: usage.promptTokens,
      outputTokens: usage.completionTokens,
      latencyMs: Date.now() - startedAt,
      status: "success",
    });
  }

  return { gated: false, stream: gatedStream() };
}
