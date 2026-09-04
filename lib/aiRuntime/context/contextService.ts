import connectDB from "@/lib/db";
import AiWorkflowPolicy from "@/models/ai/AiWorkflowPolicy";

/**
 * The context assembly service (Part 2.2) — the one place every workflow gets
 * its entity/subject/history/policy/period bundle from. Entity-scoped and
 * permission-scoped at the source: every lookup here takes `tenantId`
 * explicitly and filters by it, exactly like every existing route in this
 * codebase (see docs/_context/CONVENTIONS.md) — a workflow is structurally
 * unable to read another tenant's data because this function never lets it.
 *
 * The bundle is serialisable and gets stored on the run's AiDecisionTrace
 * (`contextSnapshotRef`) for replay/audit — callers should treat it as a
 * frozen snapshot for the duration of one run, not a live handle.
 */

export interface ContextBundle {
  tenantId: string;
  entityId: string;
  subjectRef?: { model: string; id: string };
  policy: {
    workflowId: string;
    maxAutonomyLevel: string;
    killSwitchEnabled: boolean;
    confidenceThreshold: number;
    materialityThreshold?: number;
    historicalStabilityThreshold: number;
    /** docs/ai/BRIEF-03-BATCH-B.md A.3 — narrowly scoped to mechanical schedule postings. */
    autoPostSchedules: boolean;
  };
  /** History of similar records for this subject — Part 2.2 calls this "the highest-value
   *  signal in the whole system." Empty for workflows with no natural "similar record" concept
   *  (e.g. AI-00-SMOKE); populated by the workflow-owning chunk once a real subject exists. */
  history: unknown[];
  evidence: unknown[];
  builtAt: string;
}

export async function buildContext(
  tenantId: string,
  workflowId: string,
  entityId: string,
  subjectRef?: { model: string; id: string },
): Promise<ContextBundle> {
  await connectDB();

  const policyDoc = await AiWorkflowPolicy.findOne({ tenantId, workflowId }).lean();

  return {
    tenantId,
    entityId,
    subjectRef,
    policy: {
      workflowId,
      maxAutonomyLevel: policyDoc?.maxAutonomyLevel ?? "recommend",
      killSwitchEnabled: policyDoc?.killSwitchEnabled ?? false,
      confidenceThreshold: policyDoc?.confidenceThreshold ?? 0.85,
      materialityThreshold: policyDoc?.materialityThreshold,
      historicalStabilityThreshold: policyDoc?.historicalStabilityThreshold ?? 0.9,
      autoPostSchedules: policyDoc?.autoPostSchedules ?? false,
    },
    history: [],
    evidence: [],
    builtAt: new Date().toISOString(),
  };
}
