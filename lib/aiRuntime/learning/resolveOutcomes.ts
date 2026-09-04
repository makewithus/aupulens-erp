import connectDB from "@/lib/db";
import AiLearningRecord from "@/models/ai/AiLearningRecord";
import AiWorkflowRun from "@/models/ai/AiWorkflowRun";
import Invoice from "@/models/finance/Invoice";
import JournalEntry from "@/models/finance/JournalEntry";
import Expense from "@/models/finance/Expense";
import { AI_LEARNING_OUTCOME, DOCUMENT_STATUS } from "@/lib/constants/statuses";
import { recordOutcome } from "@/lib/aiRuntime/learning/learningStore";

/**
 * The learning loop's generic resolution sweep (docs/ai/BRIEF-09-VERIFICATION.md 0.1). A
 * `pending` `AiLearningRecord` resolves on one of two real, checkable signals here — never a
 * third, per-workflow implementation:
 *
 * 1. **Downstream survival via subjectRef status** — every finding on a run carries
 *    `subjectRefs: {model, id}[]` (the real records the finding was about). For the handful of
 *    models that share `lib/constants/statuses.ts`'s `DOCUMENT_STATUS` state machine (`Invoice`,
 *    `JournalEntry`, `Expense`), a subject that has since reached `POSTED`/`APPROVED` is a real
 *    "the human let this stand" signal (`ACCEPTED`); one that reached `REJECTED`/`CANCELLED`, or
 *    no longer exists at all, is a real "the human overrode this" signal (`REJECTED`). A subject
 *    still `DRAFT`/`PENDING_APPROVAL` — or a model this resolver doesn't know how to interpret
 *    (an `Ai*` model, `Employee`, `BankAccount`, ...) — is left `pending`, not guessed.
 * 2. **Proposal confirm/reject** — handled directly by the confirm routes that already exist
 *    (`app/api/ai/command/actions/[id]/confirm`, `app/api/finance/accounting/ai-actions/[id]/
 *    confirm`) via `resolveLearningRecordForRun()`, called at the point of confirm/reject —
 *    not a separate sweep, since the signal is available immediately, not on a delay.
 *
 * The brief's third signal, a `user.corrected_ai_output` event, has no real emitter anywhere in
 * this codebase (no UI flow today publishes "the human edited what the AI proposed" as a
 * distinct event — confirmed by search) — declared honestly rather than invented; the nearest
 * real substitute is `ActResult.learningOutcome`, which a workflow can set immediately in `act()`
 * when it already knows the answer (AI-07's accrual-accuracy check is the one real example today).
 *
 * A record neither signal reaches within `RESOLUTION_WINDOW_DAYS` ages to `OUTCOME_UNKNOWN` —
 * never `ACCEPTED`. Silence is not agreement (docs/ai/BRIEF-09-VERIFICATION.md 0.1).
 */

export const RESOLUTION_WINDOW_DAYS = 14;
const RESOLUTION_GRACE_HOURS = 24; // don't even attempt resolution until a subject has had time to move

interface StatusInterpretation {
  find: (id: string, tenantId: string) => Promise<{ status: string } | null>;
  accepted: readonly string[];
  rejected: readonly string[];
}

const STATUS_INTERPRETATIONS: Record<string, StatusInterpretation> = {
  Invoice: {
    find: async (id, tenantId) => Invoice.findOne({ _id: id, tenantId }).select("state").lean().then((d) => (d ? { status: (d as { state: string }).state } : null)),
    accepted: [DOCUMENT_STATUS.POSTED, DOCUMENT_STATUS.APPROVED, DOCUMENT_STATUS.CLOSED],
    rejected: [DOCUMENT_STATUS.REJECTED, DOCUMENT_STATUS.CANCELLED],
  },
  JournalEntry: {
    find: async (id, tenantId) => JournalEntry.findOne({ _id: id, tenantId }).select("status").lean().then((d) => (d ? { status: (d as { status: string }).status } : null)),
    accepted: [DOCUMENT_STATUS.POSTED, DOCUMENT_STATUS.APPROVED, DOCUMENT_STATUS.CLOSED],
    rejected: [DOCUMENT_STATUS.REJECTED, DOCUMENT_STATUS.CANCELLED],
  },
  Expense: {
    find: async (id, tenantId) => Expense.findOne({ _id: id, tenantId }).select("status").lean().then((d) => (d ? { status: (d as { status: string }).status } : null)),
    accepted: [DOCUMENT_STATUS.POSTED, DOCUMENT_STATUS.APPROVED, DOCUMENT_STATUS.CLOSED],
    rejected: [DOCUMENT_STATUS.REJECTED, DOCUMENT_STATUS.CANCELLED],
  },
};

export interface ResolutionSweepResult {
  resolved: number;
  agedToUnknown: number;
  stillPending: number;
}

/** Attempts real resolution for every PENDING record older than the grace window, for one
 *  tenant. Ages anything past RESOLUTION_WINDOW_DAYS with no resolution to OUTCOME_UNKNOWN. */
export async function runResolutionSweep(tenantId: string, now = new Date()): Promise<ResolutionSweepResult> {
  await connectDB();
  const graceThreshold = new Date(now.getTime() - RESOLUTION_GRACE_HOURS * 60 * 60 * 1000);
  const ageThreshold = new Date(now.getTime() - RESOLUTION_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const pending = await AiLearningRecord.find({ tenantId, outcome: AI_LEARNING_OUTCOME.PENDING, createdAt: { $lte: graceThreshold } })
    .select("runId createdAt")
    .lean();

  let resolved = 0;
  let agedToUnknown = 0;
  let stillPending = 0;

  for (const record of pending) {
    const run = await AiWorkflowRun.findById(record.runId).select("findings").lean();
    const subjectRefs = (run?.findings ?? []).flatMap((f) => f.subjectRefs ?? []);

    let outcome: "accepted" | "rejected" | null = null;
    for (const ref of subjectRefs) {
      const interpretation = STATUS_INTERPRETATIONS[ref.model];
      if (!interpretation) continue;
      const subject = await interpretation.find(ref.id, tenantId);
      if (!subject) {
        outcome = "rejected"; // the record this finding was about no longer exists — a real override signal
        break;
      }
      if (interpretation.rejected.includes(subject.status)) {
        outcome = "rejected";
        break;
      }
      if (interpretation.accepted.includes(subject.status)) {
        outcome = "accepted"; // keep scanning — a later ref rejecting still wins
      }
    }

    if (outcome) {
      await recordOutcome({ learningRecordId: String(record._id), outcome: outcome === "accepted" ? AI_LEARNING_OUTCOME.ACCEPTED : AI_LEARNING_OUTCOME.REJECTED, downstreamResult: `resolved via subjectRef status sweep` });
      resolved++;
    } else if (new Date(record.createdAt) <= ageThreshold) {
      await recordOutcome({ learningRecordId: String(record._id), outcome: AI_LEARNING_OUTCOME.OUTCOME_UNKNOWN, downstreamResult: `no resolution signal within ${RESOLUTION_WINDOW_DAYS} days` });
      agedToUnknown++;
    } else {
      stillPending++;
    }
  }

  return { resolved, agedToUnknown, stillPending };
}

/** Called directly from a proposal confirm/reject route (the second resolution signal) — resolves
 *  the AiLearningRecord for the run that produced this proposal, if one exists and is still
 *  pending. A no-op (not an error) when the run never produced a learning record, or already
 *  resolved one itself via ActResult.learningOutcome. */
export async function resolveLearningRecordForRun(runId: string, outcome: "accepted" | "rejected" | "edited", downstreamResult?: string): Promise<boolean> {
  await connectDB();
  const record = await AiLearningRecord.findOne({ runId, outcome: AI_LEARNING_OUTCOME.PENDING }).select("_id").lean();
  if (!record) return false;
  await recordOutcome({
    learningRecordId: String(record._id),
    outcome: outcome === "accepted" ? AI_LEARNING_OUTCOME.ACCEPTED : outcome === "edited" ? AI_LEARNING_OUTCOME.EDITED : AI_LEARNING_OUTCOME.REJECTED,
    downstreamResult,
  });
  return true;
}
