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

  if (partial.status === "not_applicable") {
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

export async function runAllReconciliationDefinitions(tenantId: string, periodEnd: Date, period: string): Promise<ReconciliationResult[]> {
  const results: ReconciliationResult[] = [];
  for (const definition of RECONCILIATION_DEFINITIONS) {
    results.push(await runReconciliationDefinition(tenantId, definition, periodEnd, period));
  }
  return results;
}

export { RECONCILIATION_DEFINITIONS };
