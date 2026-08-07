/**
 * AI prioritisation/explanation of calendar conflicts (6.5).
 *
 * Detection is deterministic (detectConflicts). This layer asks the model to
 * PRIORITISE the flagged conflicts and suggest what to reschedule — a
 * lightweight classification task, so it uses the small `suggestion` token cap,
 * not a chat budget. Falls back to a deterministic ordering (by severity) when
 * AI is gated/unavailable, so the feature always returns a useful answer.
 */
import { resolveTenantAiSettings, callClaudeForTenant } from "@/lib/ai/tenantAi";
import { AI_MAX_TOKENS } from "@/lib/ai/featureLimits";
import type { CalendarConflict } from "@/lib/calendar/aggregateEvents";

export interface ConflictInsight {
  summary: string;
  aiUsed: boolean;
  conflicts: CalendarConflict[];
}

const severityRank = { high: 0, medium: 1, low: 2 } as const;

export async function prioritizeConflicts(tenantId: string, conflicts: CalendarConflict[]): Promise<ConflictInsight> {
  const ordered = [...conflicts].sort((a, b) => severityRank[a.severity] - severityRank[b.severity] || a.date.localeCompare(b.date));

  if (ordered.length === 0) return { summary: "No scheduling conflicts detected in this range.", aiUsed: false, conflicts: ordered };

  const deterministicSummary = ordered.map((c) => `• [${c.severity}] ${c.date}: ${c.reason}`).join("\n");

  const { tier, aiSettings } = await resolveTenantAiSettings(tenantId);
  try {
    const result = await callClaudeForTenant(
      tenantId,
      tier,
      aiSettings,
      `These calendar conflicts were detected for a team. Briefly prioritise them (most urgent first) and suggest, in one line each, what to reschedule. Use ONLY the conflicts listed — do not invent dates.\n\n${JSON.stringify(ordered)}`,
      { systemPrompt: "You are a concise scheduling assistant. Plain text, one short line per conflict.", maxTokens: AI_MAX_TOKENS.suggestion },
    );
    if (!("text" in result)) return { summary: deterministicSummary, aiUsed: false, conflicts: ordered };
    return { summary: result.text, aiUsed: true, conflicts: ordered };
  } catch {
    return { summary: deterministicSummary, aiUsed: false, conflicts: ordered };
  }
}
