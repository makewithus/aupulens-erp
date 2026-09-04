import mongoose, { Schema, Document, Model } from "mongoose";

/**
 * AI-13's persisted readiness snapshot (docs/ai/BRIEF-04-BATCH-C.md A.2) — a **parallel** state
 * to `PeriodClosing`, never a mutation of it. `PeriodClosing` is a real, human-advanced state
 * machine (Hard Rule 4: the AI cannot close or lock a period); this model is what lets a read of
 * "if we closed right now, what would stop us" be a single lookup, recomputed on
 * `period.horizon.reached`/the hourly sweep/material events rather than calculated live on every
 * request. `contradictions[]` is where a human-advanced `PeriodClosing.status` that the computed
 * data disagrees with gets recorded — as a CRITICAL finding, never as a status change.
 */

export const AI_CLOSE_DOMAIN_STATUS = {
  READY: "ready",
  BLOCKED: "blocked",
  AT_RISK: "at_risk",
  NOT_APPLICABLE: "not_applicable",
  NOT_CHECKED: "not_checked",
} as const;
export type AiCloseDomainStatus = (typeof AI_CLOSE_DOMAIN_STATUS)[keyof typeof AI_CLOSE_DOMAIN_STATUS];

export const AI_CLOSE_READINESS_STATUS = {
  BLOCKED: "blocked",
  AT_RISK: "at_risk",
  READY: "ready",
  INDETERMINATE: "indeterminate",
} as const;
export type AiCloseReadinessStatus = (typeof AI_CLOSE_READINESS_STATUS)[keyof typeof AI_CLOSE_READINESS_STATUS];

export const AI_CLOSE_BLOCKER_SEVERITY = {
  HARD_BLOCKER: "hard_blocker",
  MATERIAL_EXCEPTION: "material_exception",
  MINOR_EXCEPTION: "minor_exception",
  STALE: "stale",
  /** A.4 — no materiality policy configured for this action class, so severity genuinely
   *  cannot be classified. Never silently treated as MINOR_EXCEPTION: "we don't know" and
   *  "we checked and it's small" are different findings. */
  UNCLASSIFIED: "unclassified",
} as const;
export type AiCloseBlockerSeverity = (typeof AI_CLOSE_BLOCKER_SEVERITY)[keyof typeof AI_CLOSE_BLOCKER_SEVERITY];

export interface IAiCloseBlocker {
  id: string;
  severity: AiCloseBlockerSeverity;
  title: string;
  detail: string;
  amount?: number;
  owner?: string;
  evidence: { kind: "record" | "document" | "calculation"; ref: string; label: string }[];
  recommendedAction: string;
  ageDays: number;
  autoResolvable: boolean;
  sourceWorkflow?: string;
}

export interface IAiCloseDomain {
  domain: string;
  status: AiCloseDomainStatus;
  reasonIfNotChecked?: string;
  blockers: IAiCloseBlocker[];
}

export interface IAiCloseContradiction {
  domain: string;
  detail: string;
  periodClosingStatus: string;
  machineEvidence: string;
}

export interface IAiCloseState extends Document {
  tenantId: string;
  period: string; // "YYYY-MM"
  readiness: {
    status: AiCloseReadinessStatus;
    score: number;
    hardBlockers: number;
    materialExceptions: number;
    minorExceptions: number;
    staleItems: number;
    domainsNotChecked: number;
  };
  domains: IAiCloseDomain[];
  autoResolvedThisRun: { domain: string; blockerId: string; sourceWorkflow: string }[];
  periodClosingStatus?: string;
  contradictions: IAiCloseContradiction[];
  computedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const AiCloseBlockerSchema = new Schema<IAiCloseBlocker>(
  {
    id: { type: String, required: true },
    severity: { type: String, enum: Object.values(AI_CLOSE_BLOCKER_SEVERITY), required: true },
    title: { type: String, required: true },
    detail: { type: String, required: true },
    amount: { type: Number },
    owner: { type: String },
    evidence: [{ kind: String, ref: String, label: String }],
    recommendedAction: { type: String, required: true },
    ageDays: { type: Number, default: 0 },
    autoResolvable: { type: Boolean, default: false },
    sourceWorkflow: { type: String },
  },
  { _id: false },
);

const AiCloseStateSchema: Schema<IAiCloseState> = new Schema(
  {
    tenantId: { type: String, required: true, index: true },
    period: { type: String, required: true },
    readiness: {
      status: { type: String, enum: Object.values(AI_CLOSE_READINESS_STATUS), required: true },
      score: { type: Number, default: 0 },
      hardBlockers: { type: Number, default: 0 },
      materialExceptions: { type: Number, default: 0 },
      minorExceptions: { type: Number, default: 0 },
      staleItems: { type: Number, default: 0 },
      domainsNotChecked: { type: Number, default: 0 },
    },
    domains: [
      {
        domain: { type: String, required: true },
        status: { type: String, enum: Object.values(AI_CLOSE_DOMAIN_STATUS), required: true },
        reasonIfNotChecked: { type: String },
        blockers: { type: [AiCloseBlockerSchema], default: [] },
      },
    ],
    autoResolvedThisRun: [{ domain: String, blockerId: String, sourceWorkflow: String }],
    periodClosingStatus: { type: String },
    contradictions: [{ domain: String, detail: String, periodClosingStatus: String, machineEvidence: String }],
    computedAt: { type: Date, required: true },
  },
  { timestamps: true },
);

AiCloseStateSchema.index({ tenantId: 1, period: 1 }, { unique: true });

const AiCloseState: Model<IAiCloseState> =
  (mongoose.models.AiCloseState as Model<IAiCloseState>) || mongoose.model<IAiCloseState>("AiCloseState", AiCloseStateSchema);

export default AiCloseState;
