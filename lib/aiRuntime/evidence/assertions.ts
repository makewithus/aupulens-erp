import { computeCloseReadiness } from "@/lib/aiRuntime/closeReadiness/compute";
import { CLOSE_ASSERTIONS, deriveAssertions, type AssertionEvaluation } from "@/lib/aiRuntime/evidence/deriveAssertions";

/**
 * AI-24's machine-verifiable close-item assertions (docs/ai/BRIEF-04-BATCH-C.md, AI-24 algorithm
 * step 1) — pure predicates over the SAME live computation AI-13 already produces
 * (`lib/aiRuntime/closeReadiness/compute.ts`), never a parallel re-derivation. "For every close
 * item, does the actual ERP state prove it's done — not 'did someone tick a box'."
 *
 * The actual derivation logic lives in `deriveAssertions.ts` (pure, no DB, no dependency on this
 * file or `compute.ts`) — this file is the DB-aware entry point: it runs a fresh
 * `computeCloseReadiness()` and adds `completenessPct`/`unsupportedMaterialBalances` on top.
 * `compute.ts` itself calls `deriveAssertions()` directly (not this function) to derive its own
 * `evidence` domain, which is what breaks what would otherwise be a circular call
 * (`compute.ts` → this file → `compute.ts` → ...) — see `deriveAssertions.ts`'s own doc comment.
 */

export type { AssertionEvaluation };
export { CLOSE_ASSERTIONS };

export interface EvidenceEvaluationResult {
  period: string;
  assertions: AssertionEvaluation[];
  completenessPct: number;
  unsupportedMaterialBalances: { domain: string; blockerId: string; title: string; amount?: number }[];
}

export async function evaluateCloseAssertions(tenantId: string, period: string, periodEnd: Date): Promise<EvidenceEvaluationResult> {
  const computation = await computeCloseReadiness(tenantId, period, periodEnd);
  const assertions = deriveAssertions(computation.domains, computation.periodClosingStatus);

  const applicable = assertions.filter((a) => {
    const domain = computation.domains.find((d) => d.domain === CLOSE_ASSERTIONS.find((c) => c.item === a.item)?.domain);
    return domain?.status !== "not_applicable";
  });
  const verifiedCount = applicable.filter((a) => a.verified).length;
  const completenessPct = applicable.length > 0 ? Math.round((verifiedCount / applicable.length) * 100) : 100;

  const unsupportedMaterialBalances = computation.domains.flatMap((d) =>
    d.blockers
      .filter((b) => (b.severity === "hard_blocker" || b.severity === "material_exception") && b.evidence.length === 0)
      .map((b) => ({ domain: d.domain, blockerId: b.id, title: b.title, amount: b.amount })),
  );

  return { period, assertions, completenessPct, unsupportedMaterialBalances };
}
