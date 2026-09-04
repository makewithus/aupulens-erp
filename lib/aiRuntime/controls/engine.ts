import type { ControlDefinition, ControlRunResult } from "@/lib/aiRuntime/controls/types";

/**
 * AI-29's engine entry point — the one place a `ControlDefinition` actually gets run. A
 * `not_implemented`/`partial`-with-no-`population` control never has its population evaluated;
 * `overall_control_health` (computed by the caller) must exclude these — the false-completion
 * vector the brief calls out — so this function reports `status` on every result specifically so
 * the caller can filter on it, rather than silently omitting limited controls.
 */
export async function runControlDefinition<TItem>(tenantId: string, definition: ControlDefinition<TItem>, periodStart: Date, periodEnd: Date): Promise<ControlRunResult> {
  if (!definition.population || !definition.test) {
    return {
      controlId: definition.id,
      description: definition.description,
      status: definition.status,
      reasonIfLimited: definition.reasonIfLimited,
      populationSize: 0,
      tested: 0,
      passed: 0,
      failed: 0,
      failureRate: 0,
      exceptions: [],
    };
  }

  const population = await definition.population(tenantId, periodStart, periodEnd);
  const exceptions: ControlRunResult["exceptions"] = [];
  let passed = 0;

  for (const item of population) {
    const result = await definition.test(item);
    if (result.passed) {
      passed += 1;
    } else {
      exceptions.push({
        ref: definition.refOf(item),
        detail: result.detail,
        severity: definition.severity,
        evidence: result.evidence.length > 0 ? result.evidence : [{ kind: "record", ref: definition.refOf(item), label: definition.labelOf(item) }],
        owner: definition.remediationOwner,
        status: "open",
      });
    }
  }

  const failed = population.length - passed;
  return {
    controlId: definition.id,
    description: definition.description,
    status: definition.status,
    reasonIfLimited: definition.reasonIfLimited,
    populationSize: population.length,
    tested: population.length,
    passed,
    failed,
    failureRate: population.length > 0 ? failed / population.length : 0,
    exceptions,
  };
}

export async function runAllControlDefinitions(tenantId: string, definitions: ControlDefinition<unknown>[], periodStart: Date, periodEnd: Date): Promise<ControlRunResult[]> {
  const results: ControlRunResult[] = [];
  for (const definition of definitions) {
    results.push(await runControlDefinition(tenantId, definition, periodStart, periodEnd));
  }
  return results;
}
