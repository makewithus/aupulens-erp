import connectDB from "@/lib/db";
import AiMetricSnapshot from "@/models/ai/AiMetricSnapshot";
import AiWorkflowRun from "@/models/ai/AiWorkflowRun";
import { createAttentionItem } from "@/lib/aiRuntime/attention/attentionEngine";
import { AI_ATTENTION_PRIORITY } from "@/lib/constants/statuses";

/**
 * C.4's drift check (docs/ai/BRIEF-08b-FINAL.md) — compares today's `AiMetricSnapshot` against
 * the trailing baseline (`BASELINE_DAYS` ago) for the same workflow and raises a NAMED attention
 * item when override_rate rises or automation_coverage falls past a real threshold.
 *
 * **Honest scope limit**: true per-segment drift ("scanned PDFs from provider X") needs
 * `AiLearningRecord.contextRef` populated at the call site — today neither of the two workflows
 * that call `record_learning_outcome` (AI-05, AI-07) sets it, so there is no segment dimension in
 * the real data to slice by yet. This compares per-WORKFLOW, the finest real segment that exists
 * today; the segment name in the attention item is the workflow id for that reason, not a
 * placeholder for a finer one that doesn't exist. Wiring `contextRef` at those two call sites is
 * a real, precise next step (`docs/ai/AUTONOMY_RUNBOOK.md`).
 */

const BASELINE_DAYS = 7;
const OVERRIDE_RATE_DRIFT_THRESHOLD = 0.15; // 15 percentage points worse
const AUTOMATION_COVERAGE_DRIFT_THRESHOLD = 0.15;
const MIN_SAMPLE_FOR_DRIFT = 5;

export interface DriftFinding {
  workflowId: string;
  metric: "override_rate" | "automation_coverage";
  from: number;
  to: number;
  detail: string;
}

export async function checkDrift(tenantId: string, workflowId: string, now = new Date()): Promise<DriftFinding[]> {
  await connectDB();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const baselineDate = new Date(today.getTime() - BASELINE_DAYS * 24 * 60 * 60 * 1000);

  const [current, baseline] = await Promise.all([
    AiMetricSnapshot.findOne({ tenantId, workflowId, snapshotDate: today }).lean(),
    AiMetricSnapshot.findOne({ tenantId, workflowId, snapshotDate: { $lte: baselineDate } }).sort({ snapshotDate: -1 }).lean(),
  ]);
  if (!current || !baseline) return [];

  const findings: DriftFinding[] = [];

  if (
    current.metrics.overrideSampleSize >= MIN_SAMPLE_FOR_DRIFT &&
    baseline.metrics.overrideSampleSize >= MIN_SAMPLE_FOR_DRIFT &&
    current.metrics.overrideRate !== null &&
    baseline.metrics.overrideRate !== null &&
    current.metrics.overrideRate - baseline.metrics.overrideRate >= OVERRIDE_RATE_DRIFT_THRESHOLD
  ) {
    findings.push({
      workflowId,
      metric: "override_rate",
      from: baseline.metrics.overrideRate,
      to: current.metrics.overrideRate,
      detail: `${workflowId}'s override rate rose from ${Math.round(baseline.metrics.overrideRate * 100)}% to ${Math.round(current.metrics.overrideRate * 100)}% over ${BASELINE_DAYS} days (sample ${current.metrics.overrideSampleSize})`,
    });
  }

  if (
    current.metrics.runCount >= MIN_SAMPLE_FOR_DRIFT &&
    baseline.metrics.runCount >= MIN_SAMPLE_FOR_DRIFT &&
    current.metrics.automationCoverage !== null &&
    baseline.metrics.automationCoverage !== null &&
    baseline.metrics.automationCoverage - current.metrics.automationCoverage >= AUTOMATION_COVERAGE_DRIFT_THRESHOLD
  ) {
    findings.push({
      workflowId,
      metric: "automation_coverage",
      from: baseline.metrics.automationCoverage,
      to: current.metrics.automationCoverage,
      detail: `${workflowId}'s automation coverage fell from ${Math.round(baseline.metrics.automationCoverage * 100)}% to ${Math.round(current.metrics.automationCoverage * 100)}% over ${BASELINE_DAYS} days (${current.metrics.runCount} runs)`,
    });
  }

  if (findings.length > 0) {
    const latestRun = await AiWorkflowRun.findOne({ tenantId, workflowId }).sort({ createdAt: -1 }).select("_id").lean();
    if (latestRun) {
      for (const f of findings) {
        await createAttentionItem({
          tenantId,
          workflowId: f.workflowId,
          runId: String(latestRun._id),
          priority: AI_ATTENTION_PRIORITY.MEDIUM,
          what: `${f.metric} drift on ${f.workflowId}`,
          why: f.detail,
          evidence: [],
          dedupeKey: `${workflowId}:drift:${f.metric}:${today.toISOString().slice(0, 10)}`,
        });
      }
    }
  }

  return findings;
}
