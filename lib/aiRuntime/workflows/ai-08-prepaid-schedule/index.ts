import connectDB from "@/lib/db";
import Invoice from "@/models/finance/Invoice";
import Account from "@/models/finance/Account";
import AiSchedule, { AI_SCHEDULE_PERIOD_STATUS } from "@/models/ai/AiSchedule";
import { AI_AUTONOMY_LEVEL, AI_FINDING_TYPE, AI_FINDING_SEVERITY } from "@/lib/constants/statuses";
import { scheduleBelongsTo } from "@/lib/aiRuntime/schedules/ownership";
import type {
  WorkflowDefinition,
  ObservedResult,
  ReasonResult,
  ActResult,
  VerifyResult,
} from "@/lib/aiRuntime/workflows/types";

/**
 * AI-08 — Prepaid / deferred schedule intelligence (docs/ai/BRIEF-03-BATCH-B.md). Fully new —
 * nothing existed; sits directly on the Task 0 schedule engine (`models/ai/AiSchedule.ts`,
 * `lib/aiRuntime/schedules/scheduleMath.ts`), so the workflow itself is thin.
 *
 * Two structurally different runs live in one workflow, distinguished by trigger:
 * `bill.created`/`invoice.created` → **detect** whether a new schedule should exist;
 * `schedule.due` → **execute** the next (or several overdue) periods of an existing one.
 * `workflow.defaultAutonomy` is the ceiling (CONTROLLED_AUTONOMOUS, per A.3's "schedule firing"
 * row); each `act()` tool call still explicitly requests the *lower*, action-appropriate level
 * (DRAFT for creating a new schedule) — the tool registry's own `max_autonomy_level` per tool is
 * what actually enforces the finer-grained ceiling, exactly like AI-01/02/03 already do.
 *
 * **Candidate detection is deliberately conservative** (the false-positive test matters most
 * here): a bare keyword like "rent" is never sufficient on its own — only an explicit stated
 * multi-period date range, or a *strong* multi-period keyword (annual/subscription/insurance/
 * AMC/warranty/licence/retainer/yearly), creates a candidate. A one-month rent bill produces
 * neither and is correctly never spread.
 */

const STRONG_INFERENCE_KEYWORDS = ["annual", "subscription", "insurance", "amc", "warranty", "licence", "license", "retainer", "yearly"];
const DATE_RANGE_REGEX = /(\d{1,2}\s*(months?|years?))/i;

interface Ai08Raw {
  mode: "detect" | "execute";
  recordId?: string;
  scheduleId?: string;
  actingUserId?: string;
}

interface Ai08DetectExtracted {
  mode: "detect";
  actingUserId?: string;
  invoiceId: string;
  moveType: string;
  description: string;
  amount: number;
  invoiceDate: Date;
  currency: string;
  prepaidAccountId: string | null;
  expenseOrRevenueAccountId: string | null;
}

interface Ai08ExecuteExtracted {
  mode: "execute";
  actingUserId?: string;
  scheduleId: string;
  sourceInvoiceState: string | null;
  duePeriods: { periodKey: string; dueDate: Date; amount: number }[];
  schedule: { debitAccountId: string; creditAccountId: string; scheduleType: string };
}

type Ai08Extracted = Ai08DetectExtracted | Ai08ExecuteExtracted;

interface Ai08Proposal {
  mode: "detect" | "execute";
  candidate?: {
    start: Date;
    end: Date;
    basis: "stated" | "inferred";
    debitAccountId: string;
    creditAccountId: string;
  };
  periodsToRun?: { periodKey: string; dueDate: Date; amount: number }[];
}

function detectServicePeriod(description: string, invoiceDate: Date): { start: Date; end: Date; basis: "stated" | "inferred" } | null {
  const lower = description.toLowerCase();
  const rangeMatch = lower.match(DATE_RANGE_REGEX);
  if (rangeMatch) {
    const n = parseInt(rangeMatch[1], 10);
    const isYears = /year/.test(rangeMatch[2]);
    const months = isYears ? n * 12 : n;
    if (months > 1) {
      const end = new Date(Date.UTC(invoiceDate.getUTCFullYear(), invoiceDate.getUTCMonth() + months, invoiceDate.getUTCDate() - 1));
      return { start: invoiceDate, end, basis: "stated" };
    }
    return null; // an explicit "1 month" is not a cross-period span
  }
  if (STRONG_INFERENCE_KEYWORDS.some((k) => lower.includes(k))) {
    const end = new Date(Date.UTC(invoiceDate.getUTCFullYear() + 1, invoiceDate.getUTCMonth(), invoiceDate.getUTCDate() - 1));
    return { start: invoiceDate, end, basis: "inferred" };
  }
  return null;
}

export const ai08PrepaidSchedule: WorkflowDefinition<Ai08Raw, Ai08Extracted, Ai08Proposal> = {
  id: "AI-08",
  version: "1.0.0",
  eventKeys: ["bill.created", "invoice.created", "schedule.due"],
  actionClass: "prepaid_schedule",
  defaultAutonomy: AI_AUTONOMY_LEVEL.CONTROLLED_AUTONOMOUS,

  // `bill.created`/`invoice.created` are fan-out (shared with AI-02/07/10) — always accepted.
  // `schedule.due` is real ownership: AI-08 creates both "prepaid" and "deferred_revenue"
  // schedules itself (sourceRef.model: "Invoice") — AI-09 also uses "deferred_revenue" but
  // sourced from SaleOrder, so the model, not just the type, is what disambiguates
  // (docs/ai/BRIEF-04-BATCH-C.md Part 0.2).
  async subscriptionFilter(event): Promise<boolean> {
    if (event.eventKey !== "schedule.due") return true;
    const scheduleId = event.payload.scheduleId ? String(event.payload.scheduleId) : "";
    if (!scheduleId) return false;
    return scheduleBelongsTo(event.tenantId, scheduleId, ["prepaid", "deferred_revenue"], "Invoice");
  },

  async observe(event): Promise<ObservedResult<Ai08Raw>> {
    const actingUserId = event.payload.actingUserId ? String(event.payload.actingUserId) : undefined;
    if (event.eventKey === "schedule.due") {
      const scheduleId = String(event.payload.scheduleId);
      return { entityId: scheduleId, subjectRef: { model: "AiSchedule", id: scheduleId }, raw: { mode: "execute", scheduleId, actingUserId } };
    }
    const recordId = String(event.payload.invoiceId);
    return { entityId: recordId, subjectRef: { model: "Invoice", id: recordId }, raw: { mode: "detect", recordId, actingUserId } };
  },

  async extract(observed, ctx): Promise<Ai08Extracted> {
    await connectDB();

    if (observed.raw.mode === "execute") {
      const schedule = await AiSchedule.findById(observed.raw.scheduleId).lean();
      if (!schedule) throw new Error(`AiSchedule ${observed.raw.scheduleId} not found`);

      // `schedule.due` fans out to every workflow registered on this eventKey (AI-08/AI-09/AI-10
      // all are). AI-08 only owns schedules it created — sourceRef.model "Invoice" — so it must
      // no-op cleanly on anyone else's schedule rather than race them for the same period.
      const owned = schedule.sourceRef.model === "Invoice";
      let sourceInvoiceState: string | null = null;
      if (owned) {
        const src = await Invoice.findById(schedule.sourceRef.id).lean();
        sourceInvoiceState = src?.state ?? null;
      }

      const today = new Date();
      const duePeriods = owned
        ? (schedule.periods ?? [])
            .filter((p) => p.status === AI_SCHEDULE_PERIOD_STATUS.PENDING && p.dueDate.getTime() <= today.getTime())
            .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime())
            .map((p) => ({ periodKey: p.periodKey, dueDate: p.dueDate, amount: p.amount }))
        : [];

      return {
        mode: "execute",
        actingUserId: observed.raw.actingUserId,
        scheduleId: observed.raw.scheduleId!,
        sourceInvoiceState,
        duePeriods,
        schedule: { debitAccountId: String(schedule.debitAccountId), creditAccountId: String(schedule.creditAccountId), scheduleType: schedule.scheduleType },
      };
    }

    const invoice = await Invoice.findById(observed.raw.recordId).lean();
    if (!invoice) throw new Error(`Invoice ${observed.raw.recordId} not found`);
    const line = (invoice as { invoiceLines?: { name?: string; priceSubtotal?: number; accountId?: unknown }[] }).invoiceLines?.[0];
    const isBill = (invoice as { moveType?: string }).moveType === "in_invoice";

    const prepaidAccount = await Account.findOne({ tenantId: ctx.tenantId, account_type: isBill ? "asset_prepayments" : "liability_current", isActive: { $ne: false } }).lean();
    const offsetAccountId = line?.accountId ? String(line.accountId) : null;

    return {
      mode: "detect",
      actingUserId: observed.raw.actingUserId,
      invoiceId: observed.raw.recordId!,
      moveType: (invoice as { moveType?: string }).moveType ?? "",
      description: line?.name ?? "",
      amount: line?.priceSubtotal ?? 0,
      invoiceDate: (invoice as { invoiceDate?: Date }).invoiceDate ?? new Date(),
      currency: (invoice as { currencyId?: string }).currencyId ?? "INR",
      prepaidAccountId: prepaidAccount ? String(prepaidAccount._id) : null,
      expenseOrRevenueAccountId: offsetAccountId,
    };
  },

  async reason(extracted): Promise<ReasonResult<Ai08Proposal>> {
    if (extracted.mode === "execute") {
      const reasonChain = [`schedule ${extracted.scheduleId}: ${extracted.duePeriods.length} period(s) due`];
      if (extracted.sourceInvoiceState === "cancelled") {
        reasonChain.push("source document cancelled — suspending schedule instead of running it");
        return {
          proposal: { mode: "execute", periodsToRun: [] },
          confidence: 1,
          findings: [
            {
              id: `ai08-cancel-${extracted.scheduleId}`,
              type: AI_FINDING_TYPE.EXCEPTION,
              severity: AI_FINDING_SEVERITY.HIGH,
              title: "Schedule source document cancelled",
              detail: `AiSchedule ${extracted.scheduleId}'s source was cancelled — remaining balance needs a reversal decision`,
              confidence: 1,
              subjectRefs: [{ model: "AiSchedule", id: extracted.scheduleId }],
              evidence: [],
              reasonChain: [],
            },
          ],
          reasonChain,
        };
      }
      return {
        proposal: { mode: "execute", periodsToRun: extracted.duePeriods },
        confidence: extracted.duePeriods.length > 0 ? 1 : 0,
        findings: [],
        reasonChain,
        gateOverrides: { periodOpen: true, permissionOk: Boolean(extracted.actingUserId) },
      };
    }

    const reasonChain: string[] = [];
    if (extracted.moveType !== "in_invoice" && extracted.moveType !== "out_invoice") {
      return { proposal: { mode: "detect" }, confidence: 0, findings: [], reasonChain: ["not a bill or customer invoice"] };
    }

    // INR only this batch (A.1) — never convert, never assume 1:1. Exactly AI-01's pattern.
    if (extracted.currency.toUpperCase() !== "INR") {
      return {
        proposal: { mode: "detect" },
        confidence: 0,
        findings: [
          {
            id: `ai08-fx-${extracted.invoiceId}`,
            type: AI_FINDING_TYPE.EXCEPTION,
            severity: AI_FINDING_SEVERITY.MEDIUM,
            title: "Non-INR document — fx_unsupported",
            detail: `Currency "${extracted.currency}" — Batch B is INR-only (A.1), no rate source exists, deferred to Chunk 4's FX work`,
            confidence: 0,
            subjectRefs: [{ model: "Invoice", id: extracted.invoiceId }],
            evidence: [],
            reasonChain: [],
          },
        ],
        reasonChain: ["fx_unsupported — non-INR currency"],
      };
    }

    const period = detectServicePeriod(extracted.description, extracted.invoiceDate);
    if (!period) {
      reasonChain.push(`no cross-period signal in "${extracted.description}" — not a schedule candidate`);
      return { proposal: { mode: "detect" }, confidence: 0, findings: [], reasonChain };
    }

    if (!extracted.prepaidAccountId) {
      reasonChain.push("no prepaid/deferred account configured for this tenant — cannot draft a schedule");
      return {
        proposal: { mode: "detect" },
        confidence: 0,
        findings: [
          {
            id: `ai08-noaccount-${extracted.invoiceId}`,
            type: AI_FINDING_TYPE.EXCEPTION,
            severity: AI_FINDING_SEVERITY.MEDIUM,
            title: "No prepaid/deferred account configured",
            detail: `Detected a spreadable document but no matching account exists to hold the balance`,
            confidence: 0,
            subjectRefs: [{ model: "Invoice", id: extracted.invoiceId }],
            evidence: [],
            reasonChain: [],
          },
        ],
        reasonChain,
      };
    }

    reasonChain.push(`detected a ${period.basis} service period ${period.start.toISOString().slice(0, 10)} – ${period.end.toISOString().slice(0, 10)}`);
    const confidence = period.basis === "stated" ? 0.95 : 0.4; // inferred is always RECOMMEND (see gate below)

    return {
      proposal: {
        mode: "detect",
        candidate: {
          start: period.start,
          end: period.end,
          basis: period.basis,
          debitAccountId: extracted.moveType === "in_invoice" ? extracted.prepaidAccountId : (extracted.expenseOrRevenueAccountId ?? extracted.prepaidAccountId),
          creditAccountId: extracted.moveType === "in_invoice" ? (extracted.expenseOrRevenueAccountId ?? extracted.prepaidAccountId) : extracted.prepaidAccountId,
        },
      },
      confidence,
      confidenceComponents: { basis: period.basis === "stated" ? 1 : 0.4 },
      findings: [
        {
          id: `ai08-candidate-${extracted.invoiceId}`,
          type: AI_FINDING_TYPE.PROPOSAL,
          severity: AI_FINDING_SEVERITY.INFO,
          title: `Prepaid/deferred schedule candidate (${period.basis})`,
          detail: `"${extracted.description}" spans ${period.start.toISOString().slice(0, 10)} to ${period.end.toISOString().slice(0, 10)}`,
          amount: extracted.amount,
          confidence,
          subjectRefs: [{ model: "Invoice", id: extracted.invoiceId }],
          evidence: [],
          reasonChain: [],
        },
      ],
      reasonChain,
      gateOverrides: {
        amount: extracted.amount,
        // Inferred schedules are always RECOMMEND, never auto-drafted — enforced here by
        // forcing historicalStability below threshold rather than only via confidence, so it
        // holds even if a future confidence tuning pass changes the threshold.
        historicalStability: period.basis === "inferred" ? 0 : 1,
        periodOpen: true,
        permissionOk: Boolean(extracted.actingUserId),
      },
    };
  },

  async validate(): Promise<{ valid: boolean; vetoReason?: string }> {
    return { valid: true };
  },

  async act(reasoned, ctx, decision, rt, extracted): Promise<ActResult> {
    if (extracted.mode === "execute") {
      // decision.autonomyApplied is the run-level gate's verdict against this workflow's
      // ceiling (CONTROLLED_AUTONOMOUS) — callTool()'s own maxAutonomyLevel check is a
      // structural floor on each TOOL, not a substitute for this: without this check a
      // failed gate (kill switch off, no acting user, etc.) would still let draft_journal/
      // post_journal go through, since callTool() never itself consults the gate's decision.
      if (decision.autonomyApplied === AI_AUTONOMY_LEVEL.RECOMMEND) {
        return { findings: [], actionsTaken: [] };
      }
      const periods = reasoned.proposal.periodsToRun ?? [];
      const actionsTaken: ActResult["actionsTaken"] = [];
      const overrideReasons: string[] = [];
      for (const period of periods) {
        const lineIds = [
          { accountId: extracted.schedule.debitAccountId, label: `${extracted.schedule.scheduleType} ${period.periodKey}`, debit: period.amount, credit: 0 },
          { accountId: extracted.schedule.creditAccountId, label: `${extracted.schedule.scheduleType} ${period.periodKey}`, debit: 0, credit: period.amount },
        ];
        const header = { journalType: "general" as const, date: period.dueDate };
        // Amortising a prepaid/deferred balance is, by nature, an expense/income leg offset
        // against an asset/liability drawdown — not against Cash, Bank or a Liability the way
        // smart-rules.ts's semantic check expects a bare expense/income entry to be. That check
        // is still authoritative (Hard Rule 3) — allowNonStandard converts its veto into a
        // non-blocking, audited warning (JournalEntry.semanticOverride) rather than bypassing it
        // silently. Found via this workflow's own test suite, not assumed.
        const overrideReason = `AI-08 ${extracted.schedule.scheduleType} amortisation for period ${period.periodKey} — expense/income offset against the schedule's asset/liability account by design.`;
        try {
          if (ctx.policy.autoPostSchedules) {
            await rt.callTool(
              "post_journal",
              { tenantId: ctx.tenantId, createdBy: extracted.actingUserId, scheduleId: extracted.scheduleId, periodKey: period.periodKey, header, lineIds, allowNonStandard: true, overrideReason },
              { requestedAutonomy: AI_AUTONOMY_LEVEL.CONTROLLED_AUTONOMOUS, idempotencyKey: `${extracted.scheduleId}:${period.periodKey}` },
            );
            actionsTaken.push({ tool: "post_journal", args: { scheduleId: extracted.scheduleId, periodKey: period.periodKey }, reversible: false });
          } else {
            const drafted = await rt.callTool<{ journalEntryId: string }>(
              "draft_journal",
              { tenantId: ctx.tenantId, createdBy: extracted.actingUserId, header, lineIds, allowNonStandard: true, overrideReason },
              { requestedAutonomy: AI_AUTONOMY_LEVEL.DRAFT, idempotencyKey: `ai-08-draft:${extracted.scheduleId}:${period.periodKey}` },
            );
            await rt.callTool(
              "link_schedule_draft",
              { tenantId: ctx.tenantId, scheduleId: extracted.scheduleId, periodKey: period.periodKey, journalEntryId: drafted.journalEntryId },
              { requestedAutonomy: AI_AUTONOMY_LEVEL.CONTROLLED_AUTONOMOUS },
            );
            actionsTaken.push({ tool: "draft_journal", args: { scheduleId: extracted.scheduleId, periodKey: period.periodKey }, reversible: true });
          }
          // Part 0.3 — every allowNonStandard use is named in the run's reason chain, not just
          // passed silently to the tool call; metrics.policy_overrides makes the rate visible.
          overrideReasons.push(overrideReason);
        } catch {
          // Locked period, no acting user, or already handled — leave pending, not skipped.
          // The next sweep will pick it up (docs/ai/BRIEF-03-BATCH-B.md B.2).
        }
      }
      return {
        findings: [],
        actionsTaken,
        metrics: { scanned: periods.length, autoActioned: actionsTaken.length, policy_overrides: overrideReasons.length },
        reasonChain: overrideReasons,
      };
    }

    if (!reasoned.proposal.candidate || decision.autonomyApplied === AI_AUTONOMY_LEVEL.RECOMMEND) {
      return { findings: [], actionsTaken: [] };
    }

    const c = reasoned.proposal.candidate;
    try {
      const result = await rt.callTool<{ scheduleId: string }>(
        "draft_prepaid_schedule",
        {
          tenantId: ctx.tenantId,
          createdByWorkflow: "AI-08",
          scheduleType: extracted.mode === "detect" && extracted.moveType === "in_invoice" ? "prepaid" : "deferred_revenue",
          sourceRef: { model: "Invoice", id: extracted.mode === "detect" ? extracted.invoiceId : "" },
          startDate: c.start,
          endDate: c.end,
          frequency: "monthly",
          totalAmount: extracted.mode === "detect" ? extracted.amount : 0,
          debitAccountId: c.debitAccountId,
          creditAccountId: c.creditAccountId,
          basis: c.basis,
        },
        { requestedAutonomy: AI_AUTONOMY_LEVEL.DRAFT, idempotencyKey: `ai-08-schedule:${extracted.mode === "detect" ? extracted.invoiceId : ""}` },
      );
      return { findings: [], actionsTaken: [{ tool: "draft_prepaid_schedule", args: { scheduleId: result.scheduleId }, reversible: true }], metrics: { scanned: 1, autoActioned: 1 } };
    } catch {
      return { findings: [], actionsTaken: [] };
    }
  },

  async verify(): Promise<VerifyResult> {
    return { ok: true };
  },
};
