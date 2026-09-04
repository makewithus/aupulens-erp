import connectDB from "@/lib/db";
import AiLearningRecord from "@/models/ai/AiLearningRecord";
import AiWorkflowRun from "@/models/ai/AiWorkflowRun";
import AiAttentionItem from "@/models/ai/AiAttentionItem";
import AiDetectorHealth from "@/models/ai/AiDetectorHealth";
import AiMetricSnapshot, { type IAiMetricSnapshot } from "@/models/ai/AiMetricSnapshot";
import { listWorkflows } from "@/lib/aiRuntime/runtime/registry";
import { AI_LEARNING_OUTCOME } from "@/lib/constants/statuses";

/**
 * The real, nightly metric computation (docs/ai/BRIEF-08b-FINAL.md C.1) — every number here comes
 * from a model this system already writes to in the normal course of running workflows.
 * `detector_health` (AI-15) and `metrics.policy_overrides` (Chunk 4) are folded in directly, never
 * recomputed a second way, per C.1's explicit instruction.
 *
 * Metrics NOT computed here, and why (not invented, not guessed):
 * - extraction/classification accuracy beyond override_rate: `AiLearningRecord.editedValue` IS
 *   the human's corrected value when outcome="edited", so override_rate doubles as a real
 *   field-correctness proxy for any workflow that calls `record_learning_outcome` — today only
 *   AI-05 and AI-07 do. Every other workflow shows `overrideSampleSize: 0`.
 * - hours_saved: no time-per-manual-task baseline exists anywhere in this codebase to multiply
 *   automation_coverage by — inventing one would be a guess presented as a measurement.
 * - downstream_reconciliation survival: would require tracing a specific automated entry through
 *   to its own reconciliation/close outcome, a real but not-yet-built join across AiWorkflowRun →
 *   the entries it created → AI-22/AI-13's own later results. Not built this chunk.
 */

const WINDOW_DAYS = 30;

export interface WorkflowMetrics {
  workflowId: string;
  metrics: IAiMetricSnapshot["metrics"];
  notComputable: { what: string; reason: string }[];
}

export async function computeWorkflowMetrics(tenantId: string, workflowId: string, now = new Date()): Promise<WorkflowMetrics> {
  await connectDB();
  const windowStart = new Date(now.getTime() - WINDOW_DAYS * 24 * 60 * 60 * 1000);

  // Chunk 9 (0.1): OUTCOME_UNKNOWN is excluded from the sample the same as PENDING — a record
  // that aged out with no real signal tells you nothing about correctness either way; counting it
  // as "not overridden" would be as wrong as counting it as overridden.
  const learningRecords = await AiLearningRecord.find({ tenantId, workflowId, createdAt: { $gte: windowStart }, outcome: { $nin: [AI_LEARNING_OUTCOME.PENDING, AI_LEARNING_OUTCOME.OUTCOME_UNKNOWN] } }).select("outcome").lean();
  const overrideSampleSize = learningRecords.length;
  const overridden = learningRecords.filter((r) => r.outcome === AI_LEARNING_OUTCOME.EDITED || r.outcome === AI_LEARNING_OUTCOME.REJECTED).length;
  const overrideRate = overrideSampleSize > 0 ? Math.round((overridden / overrideSampleSize) * 1000) / 1000 : null;

  const runs = await AiWorkflowRun.find({ tenantId, workflowId, createdAt: { $gte: windowStart } }).select("metrics autonomyApplied").lean();
  const runCount = runs.length;
  const totalScanned = runs.reduce((s, r) => s + (r.metrics?.scanned ?? 0), 0);
  const totalAutoActioned = runs.reduce((s, r) => s + (r.metrics?.autoActioned ?? 0), 0);
  const automationCoverage = totalScanned > 0 ? Math.round((totalAutoActioned / totalScanned) * 1000) / 1000 : null;
  const policyOverrideCount = runs.reduce((s, r) => s + (r.metrics?.policy_overrides ?? 0), 0);
  const autonomyCounts = new Map<string, number>();
  for (const r of runs) autonomyCounts.set(r.autonomyApplied, (autonomyCounts.get(r.autonomyApplied) ?? 0) + 1);
  const autonomyApplied = autonomyCounts.size > 0 ? Array.from(autonomyCounts.entries()).sort((a, b) => b[1] - a[1])[0][0] : null;

  const resolvedItems = await AiAttentionItem.find({ tenantId, workflowId, resolvedAt: { $exists: true, $gte: windowStart } }).select("createdAt resolvedAt").lean();
  const exceptionResolutionSampleSize = resolvedItems.length;
  const exceptionResolutionHoursAvg =
    exceptionResolutionSampleSize > 0
      ? Math.round((resolvedItems.reduce((s, i) => s + (new Date(i.resolvedAt!).getTime() - new Date(i.createdAt).getTime()), 0) / exceptionResolutionSampleSize / (60 * 60 * 1000)) * 10) / 10
      : null;

  // AI-15's own detector health doubles as this project's real false-match-rate signal — folded
  // in directly (C.1: "you already have partial machinery for... AI-15's detector_health
  // precision... fold both in rather than recomputing").
  let falseMatchRate: number | null = null;
  let detectorSampleSize = 0;
  if (workflowId === "AI-15" || workflowId === "AI-03" || workflowId === "AI-22") {
    const health = await AiDetectorHealth.find({ tenantId }).select("precision sampleSize").lean();
    const withPrecision = health.filter((h) => h.precision !== null && h.sampleSize > 0);
    detectorSampleSize = withPrecision.reduce((s, h) => s + h.sampleSize, 0);
    if (withPrecision.length > 0 && detectorSampleSize > 0) {
      const weightedPrecision = withPrecision.reduce((s, h) => s + h.precision! * h.sampleSize, 0) / detectorSampleSize;
      falseMatchRate = Math.round((1 - weightedPrecision) * 1000) / 1000;
    }
  }

  const notComputable: { what: string; reason: string }[] = [];
  if (overrideSampleSize === 0) notComputable.push({ what: "override_rate / extraction_accuracy", reason: "this workflow does not call record_learning_outcome (only AI-05/AI-07 do today), or has had zero non-pending proposals in the last 30 days" });
  if (falseMatchRate === null && (workflowId === "AI-15" || workflowId === "AI-03" || workflowId === "AI-22")) notComputable.push({ what: "false_match_rate", reason: "no AiDetectorHealth rows with a reviewed sample yet for this tenant" });
  notComputable.push({ what: "hours_saved", reason: "no manual-effort-per-task baseline exists anywhere in this codebase to multiply automation_coverage by — would be a guess, not a measurement" });
  notComputable.push({ what: "downstream_reconciliation_survival", reason: "requires tracing a specific automated entry through to its own later reconciliation/close outcome — a real join not yet built across AiWorkflowRun and AI-22/AI-13's own results" });

  return {
    workflowId,
    metrics: { overrideRate, overrideSampleSize, automationCoverage, exceptionResolutionHoursAvg, exceptionResolutionSampleSize, policyOverrideCount, falseMatchRate, detectorSampleSize, runCount, autonomyApplied },
    notComputable,
  };
}

export async function computeAndPersistTenantMetrics(tenantId: string, now = new Date()): Promise<WorkflowMetrics[]> {
  await connectDB();
  const workflows = listWorkflows();
  const results: WorkflowMetrics[] = [];
  const snapshotDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  for (const workflow of workflows) {
    const result = await computeWorkflowMetrics(tenantId, workflow.id, now);
    await AiMetricSnapshot.findOneAndUpdate(
      { tenantId, workflowId: workflow.id, snapshotDate },
      { $set: { metrics: result.metrics, notComputable: result.notComputable } },
      { upsert: true },
    );
    results.push(result);
  }
  return results;
}
