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

import type { AiWindowPolicy } from "@/lib/ai/usagePolicy";
import { getWindowUsage, incrementWindowUsage } from "@/lib/ai/windowUsage";
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
// The multilingual layer is imported LAZILY (only when a caller passes `language`), so every existing
// caller — and every test that imports this module — pays nothing for it. Types are erased at build.
import type { LanguageOptions } from "@/lib/ai/language/tenantBridge";
import type { LanguageTrace, ProviderCall } from "@/lib/ai/language/types";
const loadLanguageBridge = () => import("@/lib/ai/language/tenantBridge");
import { resolveAtLimitDecision, checkAiUsageThresholdCrossing } from "@/lib/platform/ai/limitBehavior";
import { reserveAiCredits, settleAiCredits } from "@/lib/platform/ai/credits";
import { randomUUID } from "crypto";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TenantAiSettings {
  usagePolicy?: AiWindowPolicy;
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
      code: "AI_DISABLED" | "AI_LIMIT_REACHED" | "AI_GLOBAL_LIMIT_REACHED" | "AI_CREDITS_EXHAUSTED";
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
  opts: ClaudeCallOptions & { history?: ChatTurn[]; feature?: string; language?: LanguageOptions; idempotencyKey?: string; countUsage?: boolean; estimatedToolCalls?: number; toolCalls?: number } = {}
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

  const admittedAt = new Date();
  const period = getAiPeriod(admittedAt);

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

  if (aiSettings.usagePolicy) {
    const windows = await getWindowUsage(tenantId, aiSettings.usagePolicy, admittedAt);
    if (Object.values(windows).some(metric => metric.status === "unavailable")) {
      console.error("[ai-usage] invalid workspace window policy", { tenantId });
      return { gated: true, code: "AI_DISABLED", error: "Workspace AI quota configuration is unavailable. Contact your administrator." };
    }
    const exhausted = Object.entries(windows).find(([, metric]) => metric.status === "exhausted");
    if (exhausted) return { gated: true, code: "AI_LIMIT_REACHED", error: `${exhausted[0] === "session" ? "Session" : "Weekly"} workspace AI call limit reached. Resets at ${exhausted[1].resetsAt}.`, currentTier: tier, requiredAction: "wait_for_reset" };
  }

  // (c)+(d) Resolve model and token limit.
  // Tenant settings take priority; caller opts are the fallback; defaults are last resort.
  const { history, feature, language, idempotencyKey, countUsage = true, estimatedToolCalls, toolCalls = 0, ...restOpts } = opts;
  const resolvedOpts: ClaudeCallOptions = {
    model:        aiSettings.model           ?? restOpts.model     ?? CLAUDE_DEFAULT_MODEL,
    maxTokens:    aiSettings.maxTokensPerCall ?? restOpts.maxTokens ?? CLAUDE_DEFAULT_MAX_TOKENS,
    systemPrompt: restOpts.systemPrompt,  // always caller-controlled
    imageDataUrl: restOpts.imageDataUrl,  // vision attachment, caller-controlled
    imageDataUrls: restOpts.imageDataUrls,  // multiple vision attachments
  };

  const requestId = idempotencyKey || randomUUID();
  const estimatedInputTokens = Math.ceil((userMessage.length + (resolvedOpts.systemPrompt?.length ?? 0) + (history ?? []).reduce((n, turn) => n + turn.content.length, 0)) / 4) + ((resolvedOpts.imageDataUrls?.length ?? 0) + (resolvedOpts.imageDataUrl ? 1 : 0)) * 1000;
  const creditReservation = await reserveAiCredits({ tenantId, period, requestId, modelName: resolvedOpts.model ?? CLAUDE_DEFAULT_MODEL, feature: feature ?? "chat", estimatedInputTokens, estimatedOutputTokens: resolvedOpts.maxTokens ?? CLAUDE_DEFAULT_MAX_TOKENS, estimatedToolCalls, admittedAt });
  if ("reason" in creditReservation) return { gated: true, code: "AI_CREDITS_EXHAUSTED", error: creditReservation.reason === "exhausted" ? `${creditReservation.window === "session" ? "Session" : creditReservation.window === "weekly" ? "Weekly" : "Monthly"} AI credits are exhausted. Check the usage indicator for the next reset time.` : creditReservation.reason === "duplicate" ? "This AI request is already being processed or has already completed. Please wait for its response." : "AI usage pricing is not configured for this model. Please contact your administrator." };

  // Call Azure OpenAI — throws on API failure so increment is skipped on
  // error (usage metering still records the failed attempt, at 0 tokens,
  // for the platform dashboard's "failed requests" figure — Phase 4).
  // Multilingual layer (additive): only when the caller passed the user's raw text. Runs AFTER
  // every gate above, so a tenant that is disabled or at its limit never triggers a Sarvam call.
  let langTrace: LanguageTrace | undefined;
  let effectiveMessage = userMessage;
  if (language) {
    try {
      const bridge = await loadLanguageBridge();
      ({ message: effectiveMessage, trace: langTrace } = await bridge.applyLanguageInput(tenantId, aiSettings, userMessage, language));
      if (langTrace.kind !== "english" && langTrace.kind !== "none") {
        const script = langTrace.script === "Latn" ? "the same Latin/Roman script the user typed in" : "the same native script the user typed in";
        const style = langTrace.kind === "mixed"
          ? "Keep the user's natural code-switching between languages; do not make the reply artificially formal or translate familiar product names."
          : "Use natural, conversational phrasing at the same level of formality as the user.";
        resolvedOpts.systemPrompt = `${resolvedOpts.systemPrompt ?? ""}\n\nRESPONSE LANGUAGE AND STYLE: Answer the user's actual request in ${langTrace.detectedLanguage}, using ${script}. ${style} Do not begin by translating or restating the question, do not add an interpretation preamble, and do not force a heading or bullet summary when a direct conversational answer is more suitable. Explicit language or format requests in the latest user message take precedence.`;
      }
    } catch (err) {
      await settleAiCredits({ tenantId, period, requestId, modelName: resolvedOpts.model ?? CLAUDE_DEFAULT_MODEL, feature: feature ?? "chat", inputTokens: 0, outputTokens: 0, success: false });
      throw err;
    }
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
    await settleAiCredits({ tenantId, period, requestId, modelName: resolvedOpts.model ?? CLAUDE_DEFAULT_MODEL, feature: feature ?? "chat", inputTokens: 0, outputTokens: 0, success: false });
    if (language && langTrace) await (await loadLanguageBridge()).finaliseLanguage(tenantId, feature ?? "chat", langTrace, [], language.userId);
    await recordAiUsage({
      requestId,
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
  if (countUsage) {
    await incrementAiUsage(tenantId, period);
    await incrementGlobalAiUsage(period);
    await checkAiUsageThresholdCrossing(tenantId, currentCount, currentCount + 1, cap);
  }
  await recordAiUsage({
    requestId,
    tenantId,
    feature: feature ?? "chat",
    model: resolvedOpts.model ?? CLAUDE_DEFAULT_MODEL,
    inputTokens: usage.promptTokens,
    outputTokens: usage.completionTokens,
    latencyMs: Date.now() - startedAt,
    status: "success",
  });
  await settleAiCredits({ tenantId, period, requestId, modelName: resolvedOpts.model ?? CLAUDE_DEFAULT_MODEL, feature: feature ?? "chat", inputTokens: usage.promptTokens, outputTokens: usage.completionTokens, success: true, toolCalls });
  if (countUsage) await incrementWindowUsage(tenantId, aiSettings.usagePolicy, admittedAt);

  if (language && langTrace) {
    let extra: ProviderCall[] = [];
    const bridge = await loadLanguageBridge();
    const r = await bridge.applyLanguageReply(text, langTrace, language);
    text = r.text;
    extra = r.calls;
    await bridge.finaliseLanguage(tenantId, feature ?? "chat", langTrace, extra, language.userId);
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
  | { gated: true; code: "AI_DISABLED" | "AI_LIMIT_REACHED" | "AI_GLOBAL_LIMIT_REACHED" | "AI_CREDITS_EXHAUSTED"; error: string; currentTier?: string; requiredAction?: string }
  | { gated: false; stream: AsyncGenerator<string, void, unknown> };

export async function callClaudeForTenantStream(
  tenantId: string,
  tier: string,
  aiSettings: TenantAiSettings,
  userMessage: string,
  opts: ClaudeCallOptions & { history?: ChatTurn[]; feature?: string; language?: LanguageOptions; idempotencyKey?: string; estimatedToolCalls?: number; toolCalls?: number } = {}
): Promise<TenantAiStreamResult> {
  if (aiSettings.disabled === true) {
    return { gated: true, code: "AI_DISABLED", error: "AI features are disabled for this workspace. Contact your workspace admin to re-enable them." };
  }

  const admittedAt = new Date();
  const period = getAiPeriod(admittedAt);

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

  if (aiSettings.usagePolicy) {
    const windows = await getWindowUsage(tenantId, aiSettings.usagePolicy, admittedAt);
    if (Object.values(windows).some(metric => metric.status === "unavailable")) {
      console.error("[ai-usage] invalid workspace window policy", { tenantId });
      return { gated: true, code: "AI_DISABLED", error: "Workspace AI quota configuration is unavailable. Contact your administrator." };
    }
    const exhausted = Object.entries(windows).find(([, metric]) => metric.status === "exhausted");
    if (exhausted) return { gated: true, code: "AI_LIMIT_REACHED", error: `${exhausted[0] === "session" ? "Session" : "Weekly"} workspace AI call limit reached. Resets at ${exhausted[1].resetsAt}.`, currentTier: tier, requiredAction: "wait_for_reset" };
  }

  const { history, feature, language, idempotencyKey, estimatedToolCalls, toolCalls = 0, ...restOpts } = opts;
  const resolvedOpts: ClaudeCallOptions = {
    model: aiSettings.model ?? restOpts.model ?? CLAUDE_DEFAULT_MODEL,
    maxTokens: aiSettings.maxTokensPerCall ?? restOpts.maxTokens ?? CLAUDE_DEFAULT_MAX_TOKENS,
    systemPrompt: restOpts.systemPrompt,
    imageDataUrl: restOpts.imageDataUrl,
    imageDataUrls: restOpts.imageDataUrls,
  };

  const requestId = idempotencyKey || randomUUID();
  const estimatedInputTokens = Math.ceil((userMessage.length + (resolvedOpts.systemPrompt?.length ?? 0) + (history ?? []).reduce((n, turn) => n + turn.content.length, 0)) / 4) + ((resolvedOpts.imageDataUrls?.length ?? 0) + (resolvedOpts.imageDataUrl ? 1 : 0)) * 1000;
  const creditReservation = await reserveAiCredits({ tenantId, period, requestId, modelName: resolvedOpts.model ?? CLAUDE_DEFAULT_MODEL, feature: feature ?? "chat", estimatedInputTokens, estimatedOutputTokens: resolvedOpts.maxTokens ?? CLAUDE_DEFAULT_MAX_TOKENS, estimatedToolCalls, admittedAt });
  if ("reason" in creditReservation) return { gated: true, code: "AI_CREDITS_EXHAUSTED", error: creditReservation.reason === "exhausted" ? `${creditReservation.window === "session" ? "Session" : creditReservation.window === "weekly" ? "Weekly" : "Monthly"} AI credits are exhausted. Check the usage indicator for the next reset time.` : creditReservation.reason === "duplicate" ? "This AI request is already being processed or has already completed. Please wait for its response." : "AI usage pricing is not configured for this model. Please contact your administrator." };

  // Wrap the raw stream so usage is incremented exactly once, after a clean
  // finish, and the run is metered (Phase 4) with the usage totals the inner
  // generator's own return value carries.
  // Translate input before the model call. For successfully translated regional-language
  // requests, buffer the model answer and translate it as a whole before yielding: translating
  // arbitrary token fragments breaks sentence meaning and can corrupt names/markdown. English
  // and degraded/fallback requests remain genuinely token-streamed.
  let langTrace: LanguageTrace | undefined;
  let effectiveMessage = userMessage;
  if (language) {
    ({ message: effectiveMessage, trace: langTrace } = await (await loadLanguageBridge()).applyLanguageInput(tenantId, aiSettings, userMessage, language));
    if (langTrace.kind !== "english" && langTrace.kind !== "none") {
      const script = langTrace.script === "Latn" ? "the same Latin/Roman script the user typed in" : "the same native script the user typed in";
      const style = langTrace.kind === "mixed"
        ? "Keep the user's natural code-switching between languages; do not make the reply artificially formal or translate familiar product names."
        : "Use natural, conversational phrasing at the same level of formality as the user.";
      resolvedOpts.systemPrompt = `${resolvedOpts.systemPrompt ?? ""}\n\nRESPONSE LANGUAGE AND STYLE: Answer the user's actual request in ${langTrace.detectedLanguage}, using ${script}. ${style} Do not begin by translating or restating the question, do not add an interpretation preamble, and do not force a heading or bullet summary when a direct conversational answer is more suitable. Explicit language or format requests in the latest user message take precedence.`;
    }
  }

  const startedAt = Date.now();
  async function* gatedStream(): AsyncGenerator<string, void, unknown> {
    let usage: { promptTokens: number; completionTokens: number; totalTokens: number };
    let providerCompleted = false;
    let extraLanguageCalls: ProviderCall[] = [];
    try {
      const regionalTranslation = Boolean(language && langTrace && !langTrace.degraded && langTrace.kind !== "english" && langTrace.kind !== "none" && language.replyInUserLanguage !== false);
      const modelStream = callClaudeStreamWithUsage(history ?? [], effectiveMessage, resolvedOpts);
      let translatedAnswer = "";
      while (true) {
        const part = await modelStream.next();
        if (part.done) {
          usage = part.value;
          break;
        }
        if (regionalTranslation) translatedAnswer += part.value;
        else yield part.value;
      }
      providerCompleted = true;
      if (regionalTranslation && language && langTrace) {
        const r = await (await loadLanguageBridge()).applyLanguageReply(translatedAnswer, langTrace, language);
        extraLanguageCalls = r.calls;
        if (r.text) yield r.text;
      }
    } catch (err) {
      throw err;
    } finally {
      if (!providerCompleted) await settleAiCredits({ tenantId, period, requestId, modelName: resolvedOpts.model ?? CLAUDE_DEFAULT_MODEL, feature: feature ?? "chat", inputTokens: 0, outputTokens: 0, success: false });
      if (language && langTrace) await (await loadLanguageBridge()).finaliseLanguage(tenantId, feature ?? "chat", langTrace, extraLanguageCalls, language.userId);
    }
    await incrementAiUsage(tenantId, period);
    await incrementGlobalAiUsage(period);
    await checkAiUsageThresholdCrossing(tenantId, currentCount, currentCount + 1, cap);
    await recordAiUsage({
      requestId,
      tenantId,
      feature: feature ?? "chat",
      model: resolvedOpts.model ?? CLAUDE_DEFAULT_MODEL,
      inputTokens: usage.promptTokens,
      outputTokens: usage.completionTokens,
      latencyMs: Date.now() - startedAt,
      status: "success",
    });
    await settleAiCredits({ tenantId, period, requestId, modelName: resolvedOpts.model ?? CLAUDE_DEFAULT_MODEL, feature: feature ?? "chat", inputTokens: usage.promptTokens, outputTokens: usage.completionTokens, success: true, toolCalls });
    await incrementWindowUsage(tenantId, aiSettings.usagePolicy, admittedAt);
  }

  return { gated: false, stream: gatedStream() };
}
