import connectDB from "@/lib/db";
import AiMaterialityPolicy, { findThreshold } from "@/models/ai/AiMaterialityPolicy";
import { RECONCILIATION_DEFINITIONS } from "@/lib/aiRuntime/reconciliation/definitions";
import { classifyReconciliationStatus } from "@/lib/aiRuntime/reconciliation/classify";
import type { ReconciliationDefinition, ReconciliationResult } from "@/lib/aiRuntime/reconciliation/types";

/**
 * AI-22's engine entry point — the one place `RECONCILIATION_DEFINITIONS` gets iterated and the
 * pure `classifyReconciliationStatus()` gets applied, so no definition's own `run()` can talk
 * itself into `"reconciled"` (docs/ai/BRIEF-04-BATCH-C.md, AI-22 algorithm step 6).
 */

async function materialityTolerance(tenantId: string, definitionId: string, fallback: number): Promise<{ tolerance: number; configured: boolean }> {
  await connectDB();
  const policy = await AiMaterialityPolicy.findOne({ tenantId }).lean();
  const threshold = findThreshold(policy as unknown as import("@/models/ai/AiMaterialityPolicy").IAiMaterialityPolicy | null, definitionId);
  if (threshold?.absoluteAmount !== undefined) return { tolerance: threshold.absoluteAmount, configured: true };
  return { tolerance: fallback, configured: false };
}

export async function runReconciliationDefinition(tenantId: string, definition: ReconciliationDefinition, periodEnd: Date, period: string): Promise<ReconciliationResult> {
  if (!definition.run) {
    return {
      definitionId: definition.id,
      name: definition.name,
      period,
      status: "not_implemented",
      leftTotal: 0,
      rightTotal: 0,
      difference: 0,
      tolerance: 0,
      matchedCount: 0,
      unmatchedLeft: [],
      unmatchedRight: [],
      differences: [],
      oldestOpenItemDays: 0,
      materialityConfigured: false,
      owner: definition.owner,
      notImplementedReason: definition.notImplementedReason,
    };
  }

  const { tolerance, configured } = await materialityTolerance(tenantId, definition.id, definition.defaultTolerance);
  const partial = await definition.run(tenantId, periodEnd, tolerance, configured);

  // "not_applicable" and P0.5's "not_supported_for_closed_periods" (BRIEF-10-PRE-QA.md) are both
  // final, definition-decided statuses — classifyReconciliationStatus() must never see them, or a
  // difference of 0 with no differences[] (the closed-period short-circuit's honest "we didn't
  // check" shape) would be reclassified back into a confident-looking "reconciled".
  if (partial.status === "not_applicable" || partial.status === "not_supported_for_closed_periods") {
    return {
      definitionId: definition.id,
      name: definition.name,
      period,
      tolerance,
      materialityConfigured: configured,
      owner: definition.owner,
      ...partial,
    };
  }

  const status = classifyReconciliationStatus(partial.difference, tolerance, partial.differences);

  return {
    definitionId: definition.id,
    name: definition.name,
    period,
    tolerance,
    materialityConfigured: configured,
    owner: definition.owner,
    ...partial,
    status,
  };
}

// Chunk 10a (docs/ai/BRIEF-10-PRE-QA.md B.3) — the same sequential-to-concurrent fix as
// closeReadiness/compute.ts's own domain checks: each definition here is an independent
// reconciliation over its own account type, none reads another definition's result, so running
// them one at a time only ever pays for it in added wall-clock latency, never in correctness.
// Contributed ~3s of annotateStatement()'s ~14s total on the AI demo tenant (<5s budget).
export async function runAllReconciliationDefinitions(tenantId: string, periodEnd: Date, period: string): Promise<ReconciliationResult[]> {
  return Promise.all(RECONCILIATION_DEFINITIONS.map((definition) => runReconciliationDefinition(tenantId, definition, periodEnd, period)));
}

export { RECONCILIATION_DEFINITIONS };
