import connectDB from "@/lib/db";
import AiAnomaly, { AI_ANOMALY_STATUS } from "@/models/ai/AiAnomaly";
import AiDetectorHealth from "@/models/ai/AiDetectorHealth";
import AiAnomalySuppression from "@/models/ai/AiAnomalySuppression";
import { createAttentionItem } from "@/lib/aiRuntime/attention/attentionEngine";
import { AI_TOOL_SIDE_EFFECT, AI_AUTONOMY_LEVEL } from "@/lib/constants/statuses";
import { registerTool } from "@/lib/aiRuntime/tools/registry";

/**
 * AI-15's write tools (docs/ai/BRIEF-05-BATCH-D.md A.5) — all `internal_state`, all writing only
 * `models/ai/**`. No tool here (or anywhere in the registry) can propose a correction or
 * reversal — these tools only ever create/update an investigation record, never touch a
 * financial document.
 */

export const AI15_MIN_SAMPLE = 20;
export const AI15_PRECISION_FLOOR = 0.5;

// ── record_anomaly ──────────────────────────────────────────────────────────

export interface RecordAnomalyArgs {
  tenantId: string;
  detectorId: string;
  runId: string;
  severity: "critical" | "high" | "medium" | "low" | "info";
  subjectRefs: { model: string; id: string }[];
  observed: string;
  expectedRange: string;
  deviation: string;
  historicalBasis: string;
  evidence: { kind: string; ref: string; label: string }[];
  suggestedChecks: string[];
  suppressionKey: string;
  silent: boolean;
}

async function recordAnomalyHandler(args: RecordAnomalyArgs) {
  await connectDB();
  const anomaly = await AiAnomaly.create({
    tenantId: args.tenantId,
    detectorId: args.detectorId,
    runId: args.runId,
    severity: args.severity,
    subjectRefs: args.subjectRefs,
    observed: args.observed,
    expectedRange: args.expectedRange,
    deviation: args.deviation,
    historicalBasis: args.historicalBasis,
    evidence: args.evidence,
    suggestedChecks: args.suggestedChecks,
    suppressionKey: args.suppressionKey,
    silent: args.silent,
    status: AI_ANOMALY_STATUS.OPEN,
  });
  await AiDetectorHealth.findOneAndUpdate(
    { tenantId: args.tenantId, detectorId: args.detectorId },
    { $inc: { raised: 1 } },
    { upsert: true, new: true },
  );
  return { anomalyId: String(anomaly._id) };
}

// ── confirm_anomaly / dismiss_anomaly ───────────────────────────────────────

export interface ReviewAnomalyArgs {
  tenantId: string;
  anomalyId: string;
}

async function reviewAnomaly(args: ReviewAnomalyArgs, outcome: "confirmed" | "dismissed") {
  await connectDB();
  const anomaly = await AiAnomaly.findOneAndUpdate(
    { _id: args.anomalyId, tenantId: args.tenantId, status: AI_ANOMALY_STATUS.OPEN },
    { $set: { status: outcome === "confirmed" ? AI_ANOMALY_STATUS.CONFIRMED : AI_ANOMALY_STATUS.DISMISSED } },
    { new: true },
  );
  if (!anomaly) throw new Error(`Anomaly ${args.anomalyId} not found or already reviewed`);

  const inc = outcome === "confirmed" ? { confirmed: 1 } : { dismissed: 1 };
  const health = await AiDetectorHealth.findOneAndUpdate(
    { tenantId: args.tenantId, detectorId: anomaly.detectorId },
    { $inc: inc },
    { upsert: true, new: true },
  );
  const sampleSize = health.confirmed + health.dismissed;
  const precision = sampleSize > 0 ? health.confirmed / sampleSize : null;
  const autoDisabled = health.autoDisabled || (sampleSize >= AI15_MIN_SAMPLE && (precision ?? 1) < AI15_PRECISION_FLOOR);
  const justAutoDisabled = autoDisabled && !health.autoDisabled;

  await AiDetectorHealth.updateOne(
    { _id: health._id },
    { $set: { sampleSize, precision, autoDisabled, ...(justAutoDisabled ? { autoDisabledAt: new Date() } : {}) } },
  );

  // A.5 — "auto-disables itself and raises a single INFO item saying so." This transition (not
  // yet-disabled -> disabled) only ever happens here, at the exact moment sampleSize/precision
  // change, so this is the only correct place to raise it — never inside the sweep's own act().
  if (justAutoDisabled) {
    await createAttentionItem({
      tenantId: args.tenantId,
      workflowId: "AI-15",
      runId: String(anomaly.runId),
      priority: "info",
      what: `Detector "${anomaly.detectorId}" auto-disabled`,
      why: `Precision fell to ${precision !== null ? Math.round(precision * 100) : 0}% over ${sampleSize} reviewed anomalies, below the ${Math.round(AI15_PRECISION_FLOOR * 100)}% floor — this detector will not raise further anomalies until re-enabled`,
      dedupeKey: `ai15-auto-disabled:${args.tenantId}:${anomaly.detectorId}`,
    });
  }

  return { anomalyId: String(anomaly._id), detectorId: anomaly.detectorId, sampleSize, precision, autoDisabled, justAutoDisabled };
}

async function confirmAnomalyHandler(args: ReviewAnomalyArgs) {
  return reviewAnomaly(args, "confirmed");
}
async function dismissAnomalyHandler(args: ReviewAnomalyArgs) {
  return reviewAnomaly(args, "dismissed");
}

// ── suppress_anomaly ────────────────────────────────────────────────────────

export interface SuppressAnomalyArgs {
  tenantId: string;
  detectorId: string;
  suppressionKey: string;
  windowDays: number;
  reason?: string;
  createdBy?: string;
}

async function suppressAnomalyHandler(args: SuppressAnomalyArgs) {
  await connectDB();
  const suppressedUntil = new Date(Date.now() + args.windowDays * 24 * 60 * 60 * 1000);
  const suppression = await AiAnomalySuppression.create({
    tenantId: args.tenantId,
    detectorId: args.detectorId,
    suppressionKey: args.suppressionKey,
    suppressedUntil,
    reason: args.reason,
    createdBy: args.createdBy,
  });
  return { suppressionId: String(suppression._id), suppressedUntil: suppressedUntil.toISOString() };
}

// ── record_anomaly_review ───────────────────────────────────────────────────
// docs/ai/BRIEF-06-BATCH-E.md Part 0.3 — the Attention tab's two review actions ("Confirm as
// real" / "Expected — don't flag this again") both go through this one tool, keyed by outcome.
// "Confirmed" is the same effect as confirm_anomaly (kept registered separately as a granular
// primitive — nothing here removes it). "Expected" combines the dismiss half of reviewAnomaly()
// with writing the suppression key AI-15 already emits on the anomaly, atomically, since the
// brief frames "mark expected" as one action with two effects, not two separate ones a caller
// could get half-done.

export interface RecordAnomalyReviewArgs {
  tenantId: string;
  anomalyId: string;
  outcome: "confirmed" | "expected";
  suppressionWindowDays?: number;
  createdBy?: string;
}

const DEFAULT_SUPPRESSION_WINDOW_DAYS = 90;

async function recordAnomalyReviewHandler(args: RecordAnomalyReviewArgs) {
  if (args.outcome === "confirmed") {
    return reviewAnomaly({ tenantId: args.tenantId, anomalyId: args.anomalyId }, "confirmed");
  }

  await connectDB();
  const anomalyBeforeReview = await AiAnomaly.findOne({ _id: args.anomalyId, tenantId: args.tenantId }).lean();
  if (!anomalyBeforeReview) throw new Error(`Anomaly ${args.anomalyId} not found`);

  const reviewResult = await reviewAnomaly({ tenantId: args.tenantId, anomalyId: args.anomalyId }, "dismissed");

  const windowDays = args.suppressionWindowDays ?? DEFAULT_SUPPRESSION_WINDOW_DAYS;
  const suppressedUntil = new Date(Date.now() + windowDays * 24 * 60 * 60 * 1000);
  await AiAnomalySuppression.create({
    tenantId: args.tenantId,
    detectorId: anomalyBeforeReview.detectorId,
    suppressionKey: anomalyBeforeReview.suppressionKey,
    suppressedUntil,
    reason: "marked expected by reviewer",
    createdBy: args.createdBy,
  });

  return { ...reviewResult, suppressedUntil: suppressedUntil.toISOString() };
}

// ── registration ─────────────────────────────────────────────────────────────

export function registerAnomalyTools(): void {
  registerTool<RecordAnomalyArgs>({
    name: "record_anomaly",
    description: "Creates a models/ai/AiAnomaly.ts investigation record and increments the detector's raised count on models/ai/AiDetectorHealth.ts. Never touches a financial document.",
    sideEffect: AI_TOOL_SIDE_EFFECT.EXECUTE,
    reversible: true,
    maxAutonomyLevel: AI_AUTONOMY_LEVEL.EXECUTE,
    category: "internal_state",
    handler: recordAnomalyHandler,
  });

  registerTool<ReviewAnomalyArgs>({
    name: "confirm_anomaly",
    description: "Marks a models/ai/AiAnomaly.ts row confirmed and updates the detector's precision on models/ai/AiDetectorHealth.ts.",
    sideEffect: AI_TOOL_SIDE_EFFECT.EXECUTE,
    reversible: false,
    maxAutonomyLevel: AI_AUTONOMY_LEVEL.EXECUTE,
    category: "internal_state",
    handler: confirmAnomalyHandler,
  });

  registerTool<ReviewAnomalyArgs>({
    name: "dismiss_anomaly",
    description: "Marks a models/ai/AiAnomaly.ts row dismissed and updates the detector's precision on models/ai/AiDetectorHealth.ts.",
    sideEffect: AI_TOOL_SIDE_EFFECT.EXECUTE,
    reversible: false,
    maxAutonomyLevel: AI_AUTONOMY_LEVEL.EXECUTE,
    category: "internal_state",
    handler: dismissAnomalyHandler,
  });

  registerTool<SuppressAnomalyArgs>({
    name: "suppress_anomaly",
    description: "Creates a models/ai/AiAnomalySuppression.ts row — that detector+scope raises nothing further until the window expires.",
    sideEffect: AI_TOOL_SIDE_EFFECT.EXECUTE,
    reversible: true,
    maxAutonomyLevel: AI_AUTONOMY_LEVEL.EXECUTE,
    category: "internal_state",
    handler: suppressAnomalyHandler,
  });

  registerTool<RecordAnomalyReviewArgs>({
    name: "record_anomaly_review",
    description: "The Attention tab's review action — outcome 'confirmed' behaves like confirm_anomaly; 'expected' dismisses the anomaly AND writes a models/ai/AiAnomalySuppression.ts row for its suppression key, atomically.",
    sideEffect: AI_TOOL_SIDE_EFFECT.EXECUTE,
    reversible: false,
    maxAutonomyLevel: AI_AUTONOMY_LEVEL.EXECUTE,
    category: "internal_state",
    handler: recordAnomalyReviewHandler,
  });
}
